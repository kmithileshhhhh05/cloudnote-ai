// Processing pipeline: transcript chunks -> notes -> embeddings -> references -> pending-reference check.
import { store, notifId, newId, vecToB64 } from "./store.js";
import { parseTranscribeJson, parseTranscript, durationOf } from "./core/parse.js";
import { generateNotes } from "./core/notes.js";
import { buildRefItems, pendingCheck, b64ToVec } from "./core/library.js";
import { CHUNKS as SAMPLE_CHUNKS } from "../../shared/sample-data.js";

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const MAX_CHUNK_WORDS = 110;
const splitLong = (c) => {
  const w = c.text.trim().split(/\s+/);
  if (w.length <= MAX_CHUNK_WORDS) return [c];
  const out = [];
  for (let i = 0; i < w.length; i += 60) out.push({ start: c.start, end: c.end, text: w.slice(i, i + 60).join(" ") });
  return out;
};

/** Turn parsed chunks into stored chunk items for a video. Replaces any earlier chunks of the same video. */
export async function saveTranscript(ctx, userId, video, parsed) {
  const S = store(ctx, userId);
  const max = ctx.config.maxChunksPerVideo;
  const all = parsed.filter((c) => c.text && c.text.trim()).flatMap(splitLong);
  const chunks = all.slice(0, max).map((c, idx) => ({ id: `${video.id}:${idx}`, videoId: video.id, idx, start: c.start, end: c.end, text: c.text.trim() }));
  await S.replaceChunks(video.id, chunks);
  await S.patchVideo(video.id, { truncated: all.length > max });
  return chunks;
}

export async function processVideo(ctx, userId, videoId) {
  const S = store(ctx, userId);
  const video = await S.getVideo(videoId);
  if (!video) return;
  try {
    if (!(await S.patchVideo(videoId, { status: "processing", error: null }))) return; // deleted meanwhile
    const chunks = await S.getChunks(videoId);
    if (!chunks.length) throw new Error("No speech was found in this recording.");

    const notes = await generateNotes(chunks, video.title, ctx.llm);
    await S.putNotes(videoId, notes);

    let embedded = false;
    if (ctx.embed) {
      try {
        const vecs = await mapLimit(chunks, 6, (c) => ctx.embed.embed(c.text));
        await S.putChunks(videoId, chunks.map((c, i) => ({ ...c, emb: vecToB64(vecs[i]) })));
        embedded = true;
      } catch (e) { console.error("embedding failed, continuing with keyword search:", e && e.message); }
    }

    // references: keep decisions the user already made if this is a reprocess
    const existing = new Map((await S.refsOf(videoId)).map((r) => [r.id, r]));
    const fresh = buildRefItems(videoId, chunks).filter((r) => !existing.has(r.id));
    await mapLimit(fresh, 4, async (r) => {
      if (embedded) { try { r.qemb = vecToB64(await ctx.embed.embed(r.query)); } catch { /* ignore */ } }
      await S.putRef(r, { ifNew: true });
    });

    const ok = await S.patchVideo(videoId, { status: "ready", error: null, chunkCount: chunks.length, duration: durationOf(chunks), notesSource: notes.source, notesNote: notes.note || null, embedded }, { ifStatus: ["processing"] });
    if (!ok) { await S.deleteVideoData(videoId); return; } // deleted while we worked: remove what we wrote
    await S.bump();
    await checkPending(ctx, userId, videoId);
  } catch (e) {
    console.error("processVideo failed", videoId, e && e.message);
    await S.patchVideo(videoId, { status: "failed", error: String((e && e.message) || e).slice(0, 300) });
  }
}

/** After a video is ready, see whether it answers any pending reference. One notification per pair, ever. */
export async function checkPending(ctx, userId, newVideoId) {
  const S = store(ctx, userId);
  const refs = (await S.refs()).filter((r) => r.status === "pending");
  if (!refs.length) return [];
  const lib = await S.library();
  const notified = new Set((await S.notifs()).map((n) => `${n.refId}::${n.chunkId}`));
  const found = pendingCheck(lib, refs, newVideoId, notified, (r) => (r.qemb ? b64ToVec(r.qemb) : undefined));
  const made = [];
  for (const f of found) {
    const n = { id: notifId(f.ref.id, f.hit.chunk.id), refId: f.ref.id, chunkId: f.hit.chunk.id, score: f.hit.score, mode: f.hit.mode, status: "new", createdAt: ctx.now() };
    if (await S.putNotif(n, { ifNew: true })) made.push(n);
  }
  return made;
}

/** Called when Amazon Transcribe reports a finished job. Ignores stale or duplicate events. */
export async function onTranscribeDone(ctx, jobName, status) {
  const m = /^cn\.([A-Za-z0-9_-]{1,64})\.([a-z0-9]{6,20})\.(\d+)$/.exec(jobName || "");
  if (!m) return;
  const [, userId, videoId] = m;
  const S = store(ctx, userId);
  const video = await S.getVideo(videoId);
  if (!video || video.status !== "transcribing" || video.jobName !== jobName) return;
  if (status !== "COMPLETED") {
    const info = await ctx.transcribe.result(jobName).catch(() => ({}));
    await S.patchVideo(videoId, { status: "failed", error: (info && info.failure) || "Transcription failed." }, { ifStatus: ["transcribing"] });
    return;
  }
  try {
    const res = await ctx.transcribe.result(jobName);
    const parsed = parseTranscribeJson(res.json);
    await saveTranscript(ctx, userId, video, parsed);
    await processVideo(ctx, userId, videoId);
  } catch (e) {
    await S.patchVideo(videoId, { status: "failed", error: String((e && e.message) || e).slice(0, 300) });
  }
}

/** Parse transcript text. Throws a readable error if there is nothing usable. */
export function parseOrThrow(text) {
  const parsed = parseTranscript(text);
  if (!parsed.length) throw new Error("That transcript has no readable text.");
  return parsed;
}

/** Seed the sample tutorials. 'basic' = Server Setup + Application Setup; 'database' = Database Tutorial. */
export async function seedSamples(ctx, userId, which) {
  const S = store(ctx, userId);
  const sets = {
    basic: [["v1", "Server Setup"], ["v2", "Application Setup Tutorial"]],
    database: [["v3", "Database Tutorial"]],
    monitoring: [["v4", "Monitoring and Alerts"]],
  };
  const out = [];
  for (const [sid, title] of sets[which] || []) {
    const id = newId();
    const video = await S.putVideo({ id, title, kind: "transcript", status: "processing", createdAt: ctx.now(), sample: true });
    const parsed = SAMPLE_CHUNKS.filter((c) => c.videoId === sid).map((c, i, arr) => ({ start: c.start, end: arr[i + 1] ? arr[i + 1].start : c.start + 30, text: c.text }));
    await saveTranscript(ctx, userId, video, parsed);
    await ctx.worker.run({ type: "process", userId, videoId: id });
    out.push(id);
  }
  return out;
}
