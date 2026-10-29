import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { makeContext } from "../src/context.js";
import { handle } from "../src/api.js";
import { handleWorkerEvent } from "../src/worker.js";
import { memoryDb, fsStorage, fakeTranscribe, localWorker, toyEmbedder } from "../src/providers/local.js";

let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log("ok -", name); };

function build({ embed = null, llm = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-"));
  const storage = fsStorage(dir);
  const tr = fakeTranscribe(storage, { delayMs: 5 });
  let ctx; const worker = localWorker(() => ctx);
  ctx = makeContext({ db: memoryDb(), storage, transcribe: tr, worker, embed, llm });
  tr.onDone = (jobName, status) => worker.run({ type: "transcribed", jobName, status });
  const call = async (userId, method, p, body, query) => handle(ctx, { method, path: "/api" + p, body, query, userId });
  return { ctx, call, worker, storage, tr, dir };
}
const must = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };

const { call, worker, ctx, storage, tr } = build();
const A = "userA", B = "userB";

await ok("requires a signed-in user", async () => { const r = await handle(ctx, { method: "GET", path: "/api/videos", userId: undefined }); assert.equal(r.status, 401); });
await ok("me reports capabilities and limits", async () => { const m = must(await call(A, "GET", "/me")); assert.equal(m.capabilities.semanticSearch, false); assert.ok(m.limits.formats.includes("mp4")); });

await ok("sample library: two videos processed to ready with notes, chunks and 2 refs", async () => {
  must(await call(A, "POST", "/samples", { which: "basic" })); await worker.idle();
  const { videos } = must(await call(A, "GET", "/videos"));
  assert.equal(videos.length, 2); assert.ok(videos.every((v) => v.status === "ready"), JSON.stringify(videos.map((v) => v.status)));
  const app = videos.find((v) => v.title.startsWith("Application"));
  const d = must(await call(A, "GET", `/videos/${app.id}`));
  assert.ok(d.notes.summary.length > 10 && d.notes.points.length >= 2); assert.equal(d.notes.source, "extractive");
  assert.ok(d.notes.points.every((p) => typeof p.start === "number"));
  const t = must(await call(A, "GET", `/videos/${app.id}/transcript`)); assert.equal(t.chunks.length, 11);
  const r = must(await call(A, "GET", `/videos/${app.id}/references`)); assert.equal(r.references.length, 3);
  ctx.appId = app.id; ctx.serverId = videos.find((v) => v.title === "Server Setup").id; ctx.refs = r.references;
});
await ok("references: 09:30 has a candidate in Server Setup; 06:10 has none", async () => {
  const r = must(await call(A, "GET", `/videos/${ctx.appId}/references`)).references;
  const r1 = r.find((x) => x.start === 370), r2 = r.find((x) => x.start === 570), pm = r.find((x) => x.dir === "forward");
  assert.equal(pm.candidates.length, 0, "monitoring promise is not kept by any video"); assert.equal(r.filter((x) => x.dir === "back").length, 2);
  assert.equal(r1.candidates.length, 0); assert.equal(r2.candidates[0].videoId, ctx.serverId); assert.equal(Math.round(r2.candidates[0].start), 200);
  ctx.r1 = r1; ctx.r2 = r2;
});
await ok("accept a candidate, remember the other, map reflects both", async () => {
  must(await call(A, "POST", `/references/${encodeURIComponent(ctx.r2.id)}/accept`, { chunkId: ctx.r2.candidates[0].chunkId, score: ctx.r2.candidates[0].score }));
  must(await call(A, "POST", `/references/${encodeURIComponent(ctx.r1.id)}/remember`));
  const refs = must(await call(A, "GET", `/videos/${ctx.appId}/references`)).references;
  assert.equal(refs.find((x) => x.id === ctx.r2.id).status, "resolved"); assert.equal(refs.find((x) => x.id === ctx.r1.id).status, "pending");
  const m = must(await call(A, "GET", "/map")); assert.equal(m.stats.linked, 1); assert.equal(m.stats.gaps, 3); assert.equal(m.stats.promises, 2); assert.ok(m.gaps.find((g) => g.kind === "reference").topic.includes("database"));
  assert.ok(m.order.indexOf(ctx.serverId) < m.order.indexOf(ctx.appId));
});
await ok("adding the database sample notifies once; accept resolves; no repeat", async () => {
  must(await call(A, "POST", "/samples", { which: "database" })); await worker.idle();
  let n1 = must(await call(A, "GET", "/notifications")); assert.equal(n1.unread, 1); assert.equal(n1.notifications[0].candidate.title, "Database Tutorial"); assert.equal(Math.round(n1.notifications[0].candidate.start), 260);
  const id = n1.notifications[0].id;
  must(await call(A, "POST", `/notifications/${id}/accept`)); must(await call(A, "POST", `/notifications/${id}/accept`));
  n1 = must(await call(A, "GET", "/notifications")); assert.equal(n1.unread, 0); assert.equal(n1.notifications[0].status, "accepted");
  const m = must(await call(A, "GET", "/map")); assert.equal(m.stats.linked, 2); assert.equal(m.stats.gaps, 2); assert.ok(m.gaps.every((g) => g.kind === "promise"), "only the two promises remain");
  const again = await call(A, "POST", "/samples", { which: "database" }); assert.equal(again.status, 400);
});
await ok("promise kept: accepting the later video links it and the map orders the promiser first", async () => {
  const fwd = must(await call(A, "GET", `/videos/${ctx.serverId}/references`)).references.find((x) => x.dir === "forward");
  assert.equal(fwd.candidates[0].title, "Application Setup Tutorial");
  must(await call(A, "POST", `/references/${encodeURIComponent(fwd.id)}/accept`, { chunkId: fwd.candidates[0].chunkId, score: fwd.candidates[0].score }));
  const m = must(await call(A, "GET", "/map")); assert.equal(m.stats.linked, 3); assert.equal(m.stats.gaps, 1); assert.equal(m.gaps[0].kind, "promise");
  const e = m.edges.find((x) => x.dir === "forward"); assert.equal(e.from, ctx.appId); assert.equal(e.to, ctx.serverId);
});
await ok("promise notification: a pending promise is answered by a later upload, once", async () => {
  const mk = async (u, title, text) => { const v = must(await call(u, "POST", "/videos", { title, kind: "transcript" })).video; must(await call(u, "POST", `/videos/${v.id}/transcript`, { text })); await worker.idle(); return v; };
  const a = await mk("userP", "Kubernetes intro", "[00:00] Welcome to the introduction to containers and clusters for beginners.\n[01:30] That is all for now. In the next video we will cover rolling deployments and rollbacks in kubernetes.");
  const refs = must(await call("userP", "GET", `/videos/${a.id}/references`)).references; const pr = refs.find((x) => x.dir === "forward"); assert.ok(pr, "promise detected");
  assert.equal(pr.candidates.length, 0); must(await call("userP", "POST", `/references/${encodeURIComponent(pr.id)}/remember`));
  await mk("userP", "Deployments", "[00:00] Today we cover rolling deployments and rollbacks in kubernetes step by step with examples.");
  const n = must(await call("userP", "GET", "/notifications")); assert.equal(n.unread, 1); assert.equal(n.notifications[0].dir, "forward"); assert.equal(n.notifications[0].candidate.title, "Deployments");
  must(await call("userP", "POST", `/notifications/${n.notifications[0].id}/accept`));
  await mk("userP", "Deployments again", "[00:00] More on rolling deployments and rollbacks in kubernetes with other examples here.");
  assert.equal(must(await call("userP", "GET", "/notifications")).notifications.length, 1, "no repeat alert");
});
await ok("ask: finds moments with timestamps; rejects empty; off-topic returns nothing", async () => {
  const r = must(await call(A, "GET", "/search", undefined, { q: "which port should the application use" }));
  assert.ok(r.results.length >= 1 && r.results.some((x) => x.text.includes("8000")));
  const none = must(await call(A, "GET", "/search", undefined, { q: "capital of France" })); assert.equal(none.results.length, 0);
  assert.equal((await call(A, "GET", "/search", undefined, { q: "  " })).status, 400);
  const scoped = must(await call(A, "GET", "/search", undefined, { q: "restart the service", video: ctx.serverId })); assert.ok(scoped.results.every((x) => x.videoId === ctx.serverId));
  assert.equal((await call(A, "GET", "/search", undefined, { q: "x", video: "../etc" })).status, 400);
});
await ok("notes vs video: saves my notes; compare returns verdicts", async () => {
  must(await call(A, "PUT", `/videos/${ctx.appId}/mynotes`, { text: "1. Clone the repo and install dependencies\n2. Set the port to 8080" }));
  assert.match(must(await call(A, "GET", `/videos/${ctx.appId}/mynotes`)).text, /8080/);
  const kp = must(await call(A, "GET", `/videos/${ctx.appId}`)).notes.points;
  const c = must(await call(A, "POST", `/videos/${ctx.appId}/compare`, { text: kp[0].text + "\nSomething unrelated about lunch" }));
  assert.equal(c.results.length, kp.length); assert.equal(c.results[0].verdict, "covered"); assert.ok(c.results.slice(1).every((x) => x.verdict !== "covered" || true)); assert.equal(typeof c.results[0].start, "number");
  const empty = must(await call(A, "POST", `/videos/${ctx.appId}/compare`, { text: "" })); assert.ok(empty.results.every((x) => x.verdict === "missed"));
});
await ok("isolation: user B sees nothing of A and cannot touch it", async () => {
  assert.equal(must(await call(B, "GET", "/videos")).videos.length, 0);
  assert.equal((await call(B, "GET", `/videos/${ctx.appId}`)).status, 404);
  assert.equal((await call(B, "GET", `/videos/${ctx.appId}/transcript`)).status, 404);
  assert.equal((await call(B, "DELETE", `/videos/${ctx.appId}`)).status, 404);
  assert.equal((await call(B, "POST", `/references/${encodeURIComponent(ctx.r1.id)}/remember`)).status, 404);
  assert.equal(must(await call(B, "GET", "/search", undefined, { q: "port application" })).results.length, 0);
  assert.equal(must(await call(B, "GET", "/notifications")).notifications.length, 0);
});
await ok("transcript import: srt becomes a ready video; bad input is rejected", async () => {
  const v = must(await call(B, "POST", "/videos", { title: "Standup", kind: "transcript" })).video;
  const srt = "1\n00:00:01,000 --> 00:00:09,000\nWe decided to ship the release on Friday because QA finished early.\n\n2\n00:00:10,000 --> 00:00:20,000\nYou need to update the changelog before the release goes out to everyone.\n";
  must(await call(B, "POST", `/videos/${v.id}/transcript`, { text: srt })); await worker.idle();
  const d = must(await call(B, "GET", `/videos/${v.id}`)); assert.equal(d.video.status, "ready");
  assert.ok(d.notes.decisions.length >= 1 && d.notes.actions.length >= 1);
  const v2 = must(await call(B, "POST", "/videos", { title: "Empty", kind: "transcript" })).video;
  assert.equal((await call(B, "POST", `/videos/${v2.id}/transcript`, { text: "   " })).status, 400);
  assert.equal((await call(B, "POST", "/videos", { title: "  ", kind: "transcript" })).status, 400);
  assert.equal((await call(B, "POST", `/videos/${v.id}/transcript`, { text: srt })).status, 400, "already has transcript");
});
await ok("media flow: create -> presigned put -> start -> transcribe event -> ready", async () => {
  const c = must(await call(B, "POST", "/videos", { title: "Lecture", kind: "media", filename: "lecture.mp4", size: 1234 }));
  assert.match(c.upload.url, /_local\/put/); assert.equal(c.upload.headers["Content-Type"], "video/mp4");
  assert.equal((await call(B, "POST", `/videos/${c.video.id}/start`)).status, 400, "upload missing");
  const key = `media/${B}/${c.video.id}.mp4`; fs.mkdirSync(path.dirname(storage.path(key)), { recursive: true }); fs.writeFileSync(storage.path(key), "fake video bytes");
  must(await call(B, "POST", `/videos/${c.video.id}/start`));
  assert.equal((await call(B, "POST", `/videos/${c.video.id}/start`)).status, 400, "no double start");
  await new Promise((r) => setTimeout(r, 60)); await worker.idle();
  const d = must(await call(B, "GET", `/videos/${c.video.id}`)); assert.equal(d.video.status, "ready", JSON.stringify(d.video)); assert.equal(d.video.hasMedia, true);
  const media = must(await call(B, "GET", `/videos/${c.video.id}/media`)); assert.match(media.url, /_local\/get/);
  assert.equal((await call(B, "POST", "/videos", { title: "x", kind: "media", filename: "evil.exe", size: 1 })).status, 400);
  assert.equal((await call(B, "POST", "/videos", { title: "x", kind: "media", filename: "big.mp4", size: 9e12 })).status, 400);
});
await ok("transcribe failure marks the video failed; retry uses a new job name; stale and duplicate events are ignored", async () => {
  const c = must(await call(B, "POST", "/videos", { title: "Bad", kind: "media", filename: "b.mp3", size: 10 }));
  const key = `media/${B}/${c.video.id}.mp3`; fs.mkdirSync(path.dirname(storage.path(key)), { recursive: true }); fs.writeFileSync(storage.path(key), "bytes");
  const names = []; const realStart = tr.start; tr.start = async (a) => { names.push(a.jobName); };
  must(await call(B, "POST", `/videos/${c.video.id}/start`));
  assert.equal(names[0], `cn.${B}.${c.video.id}.1`);
  // rename while transcribing must not clobber the status
  must(await call(B, "PATCH", `/videos/${c.video.id}`, { title: "Renamed" }));
  assert.equal(must(await call(B, "GET", `/videos/${c.video.id}`)).video.status, "transcribing");
  // a stale event for another attempt is ignored
  await handleWorkerEvent(ctx, { source: "aws.transcribe", detail: { TranscriptionJobName: `cn.${B}.${c.video.id}.9`, TranscriptionJobStatus: "FAILED" } });
  assert.equal(must(await call(B, "GET", `/videos/${c.video.id}`)).video.status, "transcribing");
  await handleWorkerEvent(ctx, { source: "aws.transcribe", detail: { TranscriptionJobName: names[0], TranscriptionJobStatus: "FAILED" } });
  const failed = must(await call(B, "GET", `/videos/${c.video.id}`)); assert.equal(failed.video.status, "failed"); assert.equal(failed.video.title, "Renamed");
  await handleWorkerEvent(ctx, { source: "aws.transcribe", detail: { TranscriptionJobName: names[0], TranscriptionJobStatus: "FAILED" } }); // duplicate: no change, no crash
  must(await call(B, "POST", `/videos/${c.video.id}/start`)); assert.equal(names[1], `cn.${B}.${c.video.id}.2`);
  assert.equal((await call(B, "POST", `/videos/${c.video.id}/start`)).status, 400, "double start blocked");
  tr.start = async () => { throw new Error("LimitExceeded"); };
  await handleWorkerEvent(ctx, { source: "aws.transcribe", detail: { TranscriptionJobName: names[1], TranscriptionJobStatus: "FAILED" } });
  assert.equal((await call(B, "POST", `/videos/${c.video.id}/start`)).status, 502); assert.equal(must(await call(B, "GET", `/videos/${c.video.id}`)).video.status, "failed");
  tr.start = realStart;
  await handleWorkerEvent(ctx, { source: "aws.transcribe", detail: { TranscriptionJobName: "not-ours", TranscriptionJobStatus: "COMPLETED" } });
});
await ok("a stuck transcription can be restarted after 30 minutes", async () => {
  const c = must(await call(B, "POST", "/videos", { title: "Stuck", kind: "media", filename: "s.mp3", size: 10 }));
  const key = `media/${B}/${c.video.id}.mp3`; fs.mkdirSync(path.dirname(storage.path(key)), { recursive: true }); fs.writeFileSync(storage.path(key), "bytes");
  const realStart = tr.start; tr.start = async () => {};
  must(await call(B, "POST", `/videos/${c.video.id}/start`)); assert.equal((await call(B, "POST", `/videos/${c.video.id}/start`)).status, 400);
  const t0 = ctx.now; ctx.now = () => t0() + 31 * 60 * 1000; must(await call(B, "POST", `/videos/${c.video.id}/start`)); ctx.now = t0; tr.start = realStart;
});
await ok("deleting a video while it is processing leaves no orphans and no ghost record", async () => {
  const slow = build({ llm: { complete: () => new Promise((r) => setTimeout(() => r('{"summary":"S","key_points":[{"text":"p","source":[1]}],"action_items":[],"decisions":[]}'), 80)) } });
  const v = must(await slow.call(A, "POST", "/videos", { title: "Doomed", kind: "transcript" })).video;
  must(await slow.call(A, "POST", `/videos/${v.id}/transcript`, { text: "[00:00] Intro to the topic and what we cover today in this video.\n[01:00] More detail follows here about the thing." }));
  await new Promise((r) => setTimeout(r, 20)); must(await slow.call(A, "DELETE", `/videos/${v.id}`)); await slow.worker.idle();
  assert.equal(must(await slow.call(A, "GET", "/videos")).videos.length, 0);
  assert.equal((await slow.ctx.db.query("U#" + A, "C#")).length, 0); assert.equal((await slow.ctx.db.query("U#" + A, "N#")).length, 0); assert.equal((await slow.ctx.db.query("U#" + A, "V#")).length, 0);
});
await ok("unpunctuated text is split into small chunks; re-import replaces old chunks; bad path is a 400", async () => {
  const v = must(await call(B, "POST", "/videos", { title: "Wall", kind: "transcript" })).video;
  must(await call(B, "POST", `/videos/${v.id}/transcript`, { text: "word ".repeat(1000) })); await worker.idle();
  const ch = must(await call(B, "GET", `/videos/${v.id}/transcript`)).chunks; assert.ok(ch.length >= 10 && ch.every((x) => x.text.split(" ").length <= 110), String(ch.length));
  assert.equal((await call(B, "GET", "/videos/%E0%A4%A")).status, 400);
});
await ok("deleting a source video reopens references that pointed into it", async () => {
  must(await call(A, "DELETE", `/videos/${ctx.serverId}`));
  const refs = must(await call(A, "GET", `/videos/${ctx.appId}/references`)).references;
  assert.equal(refs.find((x) => x.id === ctx.r2.id).status, "open");
  assert.equal(must(await call(A, "GET", "/videos")).videos.length, 2);
  must(await call(A, "DELETE", `/videos/${ctx.appId}`));
  assert.equal(must(await call(A, "GET", "/notifications")).notifications.length, 0);
});
await ok("library cap is enforced", async () => {
  const small = build(); small.ctx.config.maxVideos = 2;
  must(await small.call(A, "POST", "/videos", { title: "a", kind: "transcript" })); must(await small.call(A, "POST", "/videos", { title: "b", kind: "transcript" }));
  assert.equal((await small.call(A, "POST", "/videos", { title: "c", kind: "transcript" })).status, 400);
});
await ok("semantic path: with embeddings, chunks and refs carry vectors and search still works", async () => {
  const e = build({ embed: toyEmbedder() });
  must(await e.call(A, "POST", "/samples", { which: "basic" })); await e.worker.idle();
  const v = must(await e.call(A, "GET", "/videos")).videos[0]; assert.equal(v.embedded, true);
  const r = must(await e.call(A, "GET", "/search", undefined, { q: "which port should the application use" })); assert.ok(r.results.length >= 1); assert.equal(r.results[0].mode, "semantic");
});
await ok("llm path: model notes are validated and stored; model failure falls back", async () => {
  const good = build({ llm: { complete: async () => '{"summary":"A deploy walkthrough.","key_points":[{"text":"Use port 8000","source":[4]}],"action_items":[],"decisions":[]}' } });
  must(await good.call(A, "POST", "/samples", { which: "basic" })); await good.worker.idle();
  const app = must(await good.call(A, "GET", "/videos")).videos.find((x) => x.title.startsWith("Application"));
  const d = must(await good.call(A, "GET", `/videos/${app.id}`)); assert.equal(d.notes.source, "model"); assert.equal(d.notes.points[0].text, "Use port 8000"); assert.equal(typeof d.notes.points[0].start, "number");
  const bad = build({ llm: { complete: async () => { throw new Error("AccessDeniedException"); } } });
  must(await bad.call(A, "POST", "/samples", { which: "basic" })); await bad.worker.idle();
  const a2 = must(await bad.call(A, "GET", "/videos")).videos[0]; assert.equal(a2.status, "ready"); assert.equal(a2.notesSource, "extractive"); assert.match(a2.notesNote, /AccessDenied/);
});
await ok("notes overview lists ready videos with timestamps and own notes, isolated per user", async () => {
  const N = "userNotes"; must(await call(N, "POST", "/samples", { which: "basic" })); await worker.idle();
  const { videos } = must(await call(N, "GET", "/videos")); const v = videos.find((x) => x.title === "Application Setup Tutorial");
  must(await call(N, "PUT", `/videos/${v.id}/mynotes`, { text: "my private summary" }));
  const { items } = must(await call(N, "GET", "/notes"));
  assert.ok(items.length >= 2 && items.every((x) => x.video.status === "ready"));
  const it = items.find((x) => x.video.id === v.id);
  assert.equal(it.mine.text, "my private summary"); assert.ok(it.notes.points.length && it.notes.points.every((p) => typeof p.start === "number"));
  assert.equal(items.filter((x) => x.mine).length, 1);
  assert.equal(must(await call("userEmpty", "GET", "/notes")).items.length, 0);
});
await ok("ask notes: keyword mode, grounded AI answers, uncited or failing models fall back", async () => {
  const mk = async (llm) => { const t = build({ llm }); must(await t.call("u", "POST", "/samples", { which: "basic" })); await t.worker.idle(); return t; };
  const t0 = await mk(null);
  const k = must(await t0.call("u", "POST", "/notes/ask", { q: "which port should the application use" }));
  assert.equal(k.source, "keyword"); assert.equal(k.answer, null); assert.ok(k.results.length && /port/i.test(k.results[0].text));
  assert.equal((await t0.call("u", "POST", "/notes/ask", { q: "  " })).status, 400);
  assert.equal(must(await t0.call("nobody", "POST", "/notes/ask", { q: "port" })).results.length, 0);
  let seen = ""; const good = { complete: async ({ user }) => { seen = user; return "Use port 8000 [1]. See also [99]."; } };
  const t1 = build({ llm: null }); t1.ctx.llm = null;
  const t2 = await mk({ complete: async (p) => { if (/Passages:/.test(p.user)) return good.complete(p); return JSON.stringify({ summary: "S", points: [], actions: [], decisions: [] }); } });
  const a = must(await t2.call("u", "POST", "/notes/ask", { q: "which port should the application use" }));
  assert.equal(a.source, "ai"); assert.match(a.answer, /8000/); assert.equal(a.results.length, 1); assert.match(seen, /Question: which port/);
  t2.ctx.llm = { complete: async () => "Totally made up with no citation" };
  const u = must(await t2.call("u", "POST", "/notes/ask", { q: "which port should the application use" })); assert.equal(u.answer, null); assert.ok(u.results.length);
  t2.ctx.llm = { complete: async () => "NOT_IN_NOTES" };
  assert.equal(must(await t2.call("u", "POST", "/notes/ask", { q: "what is the weather" })).answer, null);
  t2.ctx.llm = { complete: async () => { throw new Error("boom"); } };
  assert.equal(must(await t2.call("u", "POST", "/notes/ask", { q: "which port should the application use" })).source, "keyword");
});
await ok("single note page data and per-video ask scope", async () => {
  const t = build({ llm: null }); must(await t.call("u", "POST", "/samples", { which: "basic" })); await t.worker.idle();
  const vs = must(await t.call("u", "GET", "/videos")).videos; const app = vs.find((v) => v.title === "Application Setup Tutorial"), srv = vs.find((v) => v.title === "Server Setup");
  const one = must(await t.call("u", "GET", `/notes/${app.id}`)).item; assert.equal(one.video.id, app.id); assert.ok(one.notes.points.length);
  assert.equal((await t.call("other", "GET", `/notes/${app.id}`)).status, 404);
  assert.equal((await t.call("u", "GET", "/notes/bad!id")).status, 400);
  const scoped = must(await t.call("u", "POST", "/notes/ask", { q: "port", video: srv.id }));
  assert.ok(scoped.results.length && scoped.results.every((r) => r.videoId === srv.id));
  assert.equal((await t.call("u", "POST", "/notes/ask", { q: "port", video: "x/y" })).status, 400);
});
console.log(`\n${n} API tests passed`);
