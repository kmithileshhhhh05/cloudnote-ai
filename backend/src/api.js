// HTTP API. One function: handle(ctx, req) -> { status, body }. Same code on Lambda and the local server.
import { HttpError, bad, notFound } from "./context.js";
import { store, newId, ID_RE, REF_RE, CHUNK_RE, notifId } from "./store.js";
import { parseOrThrow, saveTranscript, seedSamples } from "./pipeline.js";
import { candidatesFor, buildMap, b64ToVec } from "./core/library.js";
import { compareNotes } from "../../shared/nlp.js";
import { askNotes } from "./core/notesask.js";

const trunc = (s, n = 220) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "..." : s);
const mediaExt = (name) => (/\.([a-z0-9]{2,5})$/i.exec(name || "") || [])[1]?.toLowerCase() || "";

function publicVideo(v) {
  const { pk, sk, mediaKey, jobName, ...rest } = v;
  return { ...rest, hasMedia: !!mediaKey };
}
const publicChunk = (c) => ({ id: c.id, idx: c.idx, start: c.start, end: c.end, text: c.text });
const excerptOf = (c, vmap) => ({ chunkId: c.id, videoId: c.videoId, title: (vmap.get(c.videoId) || {}).title || "", start: c.start, text: trunc(c.text, 260) });

async function embedQuery(ctx, text) {
  if (!ctx.embed) return undefined;
  try { return await ctx.embed.embed(text); } catch (e) { console.error("query embedding failed:", e && e.message); return undefined; }
}

export async function handle(ctx, req) {
  try {
    const out = await route(ctx, req);
    return { status: out && out.status ? out.status : 200, body: out && out.status ? out.body : out };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error("API error", req.method, req.path, e);
    return { status: 500, body: { error: "Something went wrong on our side. Please try again." } };
  }
}

async function route(ctx, req) {
  const { method, path, query = {}, body, userId } = req;
  if (!userId) throw new HttpError(401, "Please sign in.");
  const S = store(ctx, userId);
  let seg; try { seg = path.replace(/^\/api/, "").split("/").filter(Boolean).map(decodeURIComponent); } catch { throw bad("Bad request path."); }
  const [a, b, c] = seg;
  const M = method.toUpperCase();

  if (M === "GET" && a === "me" && !b) return { userId, limits: { maxVideos: ctx.config.maxVideos, maxMediaMB: Math.round(ctx.config.maxMediaBytes / 1048576), formats: ctx.config.allowedMedia, languages: ctx.config.languages }, capabilities: { transcription: !!ctx.transcribe, notesModel: !!ctx.llm, semanticSearch: !!ctx.embed } };

  // ----- videos -----
  if (a === "videos" && !b) {
    if (M === "GET") return { videos: (await S.listVideos()).map(publicVideo) };
    if (M === "POST") return createVideo(ctx, S, userId, body || {});
  }
  if (a === "videos" && b) {
    const video = await S.requireVideo(b);
    if (!c) {
      if (M === "GET") {
        const notes = await S.getNotes(b);
        const chunks = notes ? await S.getChunks(b) : [];
        return { video: publicVideo(video), notes: notes ? { summary: notes.summary, source: notes.source, note: notes.note, points: withTimes(notes.points, chunks), actions: withTimes(notes.actions, chunks), decisions: withTimes(notes.decisions, chunks) } : null };
      }
      if (M === "DELETE") { await S.deleteVideoData(b); if (video.mediaKey) await ctx.storage.delete(video.mediaKey).catch(() => {}); if (video.mediaKey) await ctx.storage.delete(`transcripts/${userId}/${b}.json`).catch(() => {}); return { ok: true }; }
      if (M === "PATCH") { const t = String((body || {}).title || "").trim().slice(0, 120); if (!t) throw bad("Title cannot be empty."); if (!(await S.patchVideo(b, { title: t }))) throw notFound("Video not found"); return { video: publicVideo(await S.getVideo(b)) }; }
    }
    if (c === "transcript" && M === "GET") return { chunks: (await S.getChunks(b)).map(publicChunk) };
    if (c === "transcript" && M === "POST") {
      const text = String((body || {}).text || "");
      if (text.length > ctx.config.maxTranscriptChars) throw bad("That transcript is too large.");
      let parsed; try { parsed = parseOrThrow(text); } catch (e) { throw bad(e.message); }
      if (!(await S.patchVideo(b, { kind: "transcript", status: "processing", error: null }, { ifStatus: ["awaiting_upload", "failed"] }))) throw bad("This video already has a transcript.");
      await saveTranscript(ctx, userId, video, parsed);
      await ctx.worker.run({ type: "process", userId, videoId: b });
      return { ok: true };
    }
    if (c === "start" && M === "POST") return startTranscription(ctx, S, userId, video, body || {});
    if (c === "reprocess" && M === "POST") {
      const stuck = ctx.now() - (video.updatedAt || 0) > 15 * 60 * 1000;
      const allowed = ["ready", "failed"].concat(stuck ? ["processing"] : []);
      if (!(await S.patchVideo(b, { status: "processing", error: null }, { ifStatus: allowed }))) throw bad(video.status === "transcribing" ? "Still transcribing." : "This video is already being processed.");
      await ctx.worker.run({ type: "process", userId, videoId: b }); return { ok: true };
    }
    if (c === "media" && M === "GET") { if (!video.mediaKey) throw notFound("This video has no media file (it was imported from a transcript)."); return { url: await ctx.storage.presignGet(video.mediaKey), type: video.mediaType || "video/mp4" }; }
    if (c === "references" && M === "GET") return listRefs(ctx, S, b);
    if (c === "mynotes" && M === "GET") { const m = await S.getMyNotes(b); return { text: m ? m.text : "", updatedAt: m ? m.updatedAt : null }; }
    if (c === "mynotes" && M === "PUT") { const t = String((body || {}).text ?? ""); if (t.length > 50000) throw bad("Notes are too long."); await S.putMyNotes(b, t); return { ok: true }; }
    if (c === "compare" && M === "POST") return compare(ctx, S, b, String((body || {}).text || ""));
  }

  // ----- search -----
  if (a === "search" && M === "GET") {
    const q = String(query.q || "").trim().slice(0, 300);
    if (!q) throw bad("Type a question first.");
    const only = query.video ? (ID_RE.test(query.video) ? query.video : null) : undefined;
    if (only === null) throw bad("Bad video id.");
    const lib = await S.library();
    const vmap = new Map((await S.listVideos()).map((v) => [v.id, v]));
    const hits = lib.search(q, { purpose: "ask", k: 6, onlyVideo: only, queryVec: await embedQuery(ctx, q) }).filter((h) => h.passes).slice(0, 5);
    return { query: q, results: hits.map((h) => ({ ...excerptOf(h.chunk, vmap), score: h.score, mode: h.mode })) };
  }

  // ----- references -----
  if (a === "references" && b) {
    const ref = await S.getRef(b);
    if (M === "POST" && c === "accept") {
      const chunkId = String((body || {}).chunkId || "");
      if (!CHUNK_RE.test(chunkId)) throw bad("Pick a source excerpt.");
      const lib = await S.library();
      const ch = lib.byId.get(chunkId);
      if (!ch || ch.videoId === ref.videoId) throw bad("That excerpt cannot be used as a source.");
      await S.putRef({ ...ref, status: "resolved", source: { chunkId, score: Number((body || {}).score) || 0 }, manual: !!(body || {}).manual });
      await S.bump();
      return { ok: true };
    }
    if (M === "POST" && c === "remember") { await S.putRef({ ...ref, status: "pending", source: null }); return { ok: true }; }
    if (M === "POST" && c === "undo") { await S.putRef({ ...ref, status: "open", source: null, manual: false }); await S.bump(); return { ok: true }; }
  }

  // ----- notifications -----
  if (a === "notifications" && !b && M === "GET") {
    const vmap = new Map((await S.listVideos()).map((v) => [v.id, v]));
    const lib = await S.library();
    const refs = new Map((await S.refs()).map((r) => [r.id, r]));
    const items = [];
    for (const n of await S.notifs()) {
      const ref = refs.get(n.refId); const target = lib.byId.get(n.chunkId);
      if (!ref || !target) continue;
      const origin = lib.byId.get(ref.chunkId);
      items.push({ id: n.id, dir: ref.dir || "back", status: n.status, score: n.score, createdAt: n.createdAt, phrase: ref.phrase, refId: ref.id, origin: origin ? excerptOf(origin, vmap) : null, candidate: excerptOf(target, vmap) });
    }
    return { notifications: items, unread: items.filter((i) => i.status === "new").length };
  }
  if (a === "notifications" && b && (c === "accept" || c === "reject") && M === "POST") {
    const n = await S.getNotif(b);
    if (!n) throw notFound("Notification not found");
    if (n.status !== "new") return { ok: true };
    if (c === "accept") {
      const ref = await S.getRef(n.refId);
      await S.putRef({ ...ref, status: "resolved", source: { chunkId: n.chunkId, score: n.score }, manual: false });
      await S.bump();
    }
    await S.putNotif({ ...n, status: c === "accept" ? "accepted" : "rejected" });
    return { ok: true };
  }

  // ----- map -----
  if (a === "map" && M === "GET") {
    const videos = await S.listVideos();
    const lib = await S.library();
    const refs = await S.refs();
    return buildMap(videos, refs, lib.byId, await S.notifs());
  }

  // ----- ask the notes -----
  if (a === "notes" && b === "ask" && M === "POST") {
    const q = String((body || {}).q || "").trim().slice(0, 300);
    if (!q) throw bad("Type a question first.");
    const only = (body || {}).video;
    if (only !== undefined && only !== null && !ID_RE.test(String(only))) throw bad("Bad video id.");
    return askNotes(q, await loadNoteItems(ctx, S, only || null), ctx.llm);
  }

  // ----- all notes -----
  if (a === "notes" && b && b !== "ask" && !c && M === "GET") {
    if (!ID_RE.test(b)) throw bad("Bad video id.");
    const video = await S.requireVideo(b);
    if (video.status !== "ready") throw bad("These notes are not ready yet.");
    return { item: (await loadNoteItems(ctx, S, b))[0] || null };
  }
  if (a === "notes" && !b && M === "GET") return { items: await loadNoteItems(ctx, S) };

  // ----- samples -----
  if (a === "samples" && M === "POST") {
    const which = String((body || {}).which || "basic");
    if (!["basic", "database", "monitoring"].includes(which)) throw bad("Unknown sample set.");
    const existing = await S.listVideos();
    if (existing.length + (which === "basic" ? 2 : 1) > ctx.config.maxVideos) throw bad("Your library is full.");
    if (existing.some((v) => v.sample && v.title === ({ basic: "Server Setup", database: "Database Tutorial", monitoring: "Monitoring and Alerts" })[which])) throw bad("That sample is already in your library.");
    await seedSamples(ctx, userId, which);
    return { ok: true };
  }

  throw notFound("No such endpoint.");
}

async function loadNoteItems(ctx, S, onlyId = null) {
  const vids = (await S.listVideos()).filter((v) => v.status === "ready" && (!onlyId || v.id === onlyId));
  const items = [];
  for (const v of vids) {
    const [notes, mine] = await Promise.all([S.getNotes(v.id), S.getMyNotes(v.id)]);
    const chunks = notes ? await S.getChunks(v.id) : [];
    items.push({ video: publicVideo(v), notes: notes ? { summary: notes.summary, source: notes.source, points: withTimes(notes.points, chunks), actions: withTimes(notes.actions, chunks), decisions: withTimes(notes.decisions, chunks) } : null, mine: mine && mine.text ? { text: mine.text, updatedAt: mine.updatedAt } : null });
  }
  items.sort((x, y) => (y.video.createdAt || 0) - (x.video.createdAt || 0));
  return items;
}

function withTimes(items, chunks) {
  const by = new Map(chunks.map((c) => [c.id, c]));
  return (items || []).map((i) => ({ text: i.text, chunkId: i.chunkId, start: (by.get(i.chunkId) || {}).start ?? null }));
}

async function createVideo(ctx, S, userId, body) {
  const title = String(body.title || "").trim().slice(0, 120);
  if (!title) throw bad("Give the video a title.");
  const videos = await S.listVideos();
  if (videos.length >= ctx.config.maxVideos) throw bad(`You can keep up to ${ctx.config.maxVideos} videos. Delete one first.`);
  const id = newId();
  const kind = body.kind === "transcript" ? "transcript" : "media";
  const video = { id, title, kind, status: "awaiting_upload", createdAt: ctx.now(), language: ctx.config.languages[body.language] ? body.language : "en-US" };
  if (kind === "media") {
    if (!ctx.transcribe) throw bad("Video transcription is not enabled on this server. Import a transcript instead.");
    const ext = mediaExt(body.filename);
    if (!ctx.config.allowedMedia.includes(ext)) throw bad(`Unsupported file type. Use: ${ctx.config.allowedMedia.join(", ")}.`);
    if (Number(body.size) > ctx.config.maxMediaBytes) throw bad(`That file is larger than ${Math.round(ctx.config.maxMediaBytes / 1048576)} MB.`);
    video.mediaKey = `media/${userId}/${id}.${ext}`;
    video.mediaType = ["mp3", "m4a", "wav", "flac", "ogg", "amr"].includes(ext) ? `audio/${ext === "mp3" ? "mpeg" : ext === "m4a" ? "mp4" : ext}` : ext === "webm" ? "video/webm" : "video/mp4";
    video.filename = String(body.filename || "").slice(0, 200);
    await S.putVideo(video);
    const up = await ctx.storage.presignPut(video.mediaKey, video.mediaType);
    return { video: publicVideo(video), upload: up };
  }
  await S.putVideo(video);
  return { video: publicVideo(video) };
}

async function startTranscription(ctx, S, userId, video, body) {
  if (video.kind !== "media" || !video.mediaKey) throw bad("This video has no media to transcribe.");
  const stuck = video.status === "transcribing" && ctx.now() - (video.updatedAt || 0) > 30 * 60 * 1000;
  if (!["awaiting_upload", "failed"].includes(video.status) && !stuck) throw bad("Transcription already started.");
  const head = await ctx.storage.head(video.mediaKey);
  if (!head) throw bad("The upload did not finish. Try uploading again.");
  if (head.size > ctx.config.maxMediaBytes) { await ctx.storage.delete(video.mediaKey).catch(() => {}); throw bad("That file is too large."); }
  const attempt = (video.attempt || 0) + 1;
  const jobName = `cn.${userId}.${video.id}.${attempt}`; // job names are unique per account, so each attempt gets its own
  // reserve first so a double click cannot start two jobs
  if (!(await S.patchVideo(video.id, { status: "transcribing", jobName, attempt, size: head.size, error: null }, { ifStatus: stuck ? ["transcribing"] : ["awaiting_upload", "failed"] }))) throw bad("Transcription already started.");
  try { await ctx.transcribe.start({ jobName, mediaKey: video.mediaKey, outputKey: `transcripts/${userId}/${video.id}.json`, language: video.language }); }
  catch (e) { await S.patchVideo(video.id, { status: "failed", error: "Could not start transcription: " + String((e && e.message) || e).slice(0, 200) }); throw new HttpError(502, "Could not start transcription. Try again in a moment."); }
  return { ok: true };
}

async function listRefs(ctx, S, videoId) {
  const lib = await S.library();
  const vmap = new Map((await S.listVideos()).map((v) => [v.id, v]));
  const refs = await S.refsOf(videoId);
  const out = [];
  for (const r of refs) {
    const here = lib.byId.get(r.chunkId);
    const item = { id: r.id, dir: r.dir || "back", status: r.status, phrase: r.phrase, chunkId: r.chunkId, start: here ? here.start : null, text: here ? here.text : "", manual: !!r.manual, source: null, candidates: [] };
    if (r.status === "resolved" && r.source) { const t = lib.byId.get(r.source.chunkId); if (t) item.source = excerptOf(t, vmap); }
    if (r.status === "open") item.candidates = candidatesFor(lib, r, r.qemb ? b64ToVec(r.qemb) : undefined).map((h) => ({ ...excerptOf(h.chunk, vmap), score: h.score, mode: h.mode }));
    out.push(item);
  }
  // sources the user may pick manually
  const options = lib.chunks.filter((c) => c.videoId !== videoId).map((c) => ({ chunkId: c.id, videoId: c.videoId, title: (vmap.get(c.videoId) || {}).title || "", start: c.start, text: trunc(c.text, 70) }));
  return { references: out, options };
}

async function compare(ctx, S, videoId, text) {
  const notes = await S.getNotes(videoId);
  if (!notes || !notes.points.length) throw bad("This video has no key points to compare with yet.");
  const chunks = await S.getChunks(videoId);
  const byId = Object.fromEntries(chunks.map((c) => [c.id, c]));
  const kps = notes.points.map((p, i) => ({ id: "kp" + (i + 1), text: p.text, chunkId: p.chunkId }));
  const r = compareNotes(text, kps, byId, { coverThreshold: ctx.config.coverThreshold });
  return {
    results: r.results.map((x) => ({ id: x.keypoint.id, text: x.keypoint.text, verdict: x.verdict, bestLine: x.bestLine, detail: x.detail, chunkId: x.chunk.id, start: x.chunk.start, evidence: trunc(x.chunk.text, 160) })),
    extra: r.extraLines,
  };
}
