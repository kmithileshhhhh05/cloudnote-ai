import assert from "node:assert/strict";
import { parseTranscript, parseTranscribeJson, parseCues, parsePlain, durationOf } from "../src/core/parse.js";
import { extractiveNotes, parseNotesReply, generateNotes, notesPrompt, batchChunks } from "../src/core/notes.js";
import { Library, buildRefItems, candidatesFor, pendingCheck, buildMap, vecToB64 } from "../src/core/library.js";
import { CHUNKS } from "../../shared/sample-data.js";

let n = 0; const ok = (name, fn) => { const r = fn(); const done = () => { n++; console.log("ok -", name); }; if (r && r.then) return r.then(done); done(); };

// ---- parsers ----
const tj = { results: { items: [] } };
const words = "In this tutorial we deploy the sample application in five setup steps. Step one is to clone the repository and install the dependencies with the package manager. Then copy the example environment file.".split(" ");
let t = 0;
for (const w of words) {
  const bare = w.replace(/[.,]$/, ""); const punct = /[.,]$/.test(w) ? w.slice(-1) : null;
  tj.results.items.push({ type: "pronunciation", start_time: String(t), end_time: String(t + 0.3), alternatives: [{ content: bare }] });
  if (punct) tj.results.items.push({ type: "punctuation", alternatives: [{ content: punct }] });
  t += 0.4;
}
ok("transcribe json -> chunks with times and punctuation", () => {
  const c = parseTranscribeJson(tj);
  assert.ok(c.length >= 1 && c.length <= 3, "chunks " + c.length);
  assert.equal(c[0].start, 0);
  assert.match(c.map((x) => x.text).join(" "), /five setup steps\./);
  assert.ok(c.every((x) => x.end >= x.start));
});
ok("transcribe json: long silence splits a chunk", () => {
  const items = []; let tt = 0;
  for (let i = 0; i < 10; i++) { items.push({ type: "pronunciation", start_time: String(tt), end_time: String(tt + 0.3), alternatives: [{ content: "alpha" + i }] }); tt += 0.4; }
  tt += 5;
  for (let i = 0; i < 10; i++) { items.push({ type: "pronunciation", start_time: String(tt), end_time: String(tt + 0.3), alternatives: [{ content: "beta" + i }] }); tt += 0.4; }
  const c = parseTranscribeJson({ results: { items } });
  assert.equal(c.length, 2);
  assert.ok(c[1].start > 8);
});
const srt = `1\n00:00:01,000 --> 00:00:04,000\nWelcome to the server setup walkthrough.\n\n2\n00:00:04,500 --> 00:00:09,000\nIn this session we prepare a Linux server to host our application and nothing else.\n\n3\n00:01:10,000 --> 00:01:15,000\nFirst update the package index and install nginx and Python.\n`;
ok("srt cues merge into sentence chunks", () => {
  const c = parseTranscript(srt);
  assert.ok(c.length >= 1); assert.equal(c[0].start, 1);
  assert.match(c[0].text, /Welcome to the server setup/);
});
ok("vtt with tags and header", () => {
  const c = parseTranscript("WEBVTT\n\n00:00.000 --> 00:03.000 align:start\n<v Alice>Hello and welcome to the review meeting today everyone, thanks for joining us.</v>\n");
  assert.equal(c.length, 1); assert.equal(c[0].text.startsWith("Hello and welcome"), true); assert.ok(!c[0].text.includes("<"));
});
ok("plain text with [mm:ss] timestamps", () => {
  const c = parseTranscript("[00:00] Intro to the topic and what we cover today.\n[02:30] Step two is to set the port.\ncontinues here.\n[04:20] Step three restart.");
  assert.equal(c.length, 3); assert.equal(c[1].start, 150); assert.match(c[1].text, /continues here/); assert.equal(c[0].end, 150);
});
ok("plain text without timing -> null starts", () => {
  const c = parsePlain("This is the first sentence of a long enough talk about servers and ports. Here is another one that continues the thought for a while longer.");
  assert.ok(c.length >= 1 && c.every((x) => x.start === null));
});
ok("empty input -> no chunks, no crash", () => { assert.deepEqual(parseTranscript(""), []); assert.deepEqual(parseTranscript("   \n  "), []); });

// ---- chunks from the demo library, as stored chunks ----
const stored = CHUNKS.map((c, i) => ({ id: c.id, videoId: c.videoId, idx: i, start: c.start, end: c.start + 30, text: c.text }));
const V = (id) => stored.filter((c) => c.videoId === id);

ok("extractive notes: summary, points with valid chunk ids, order by time", () => {
  const n = extractiveNotes(V("v2"));
  assert.ok(n.summary.length > 20); assert.ok(n.points.length >= 2 && n.points.length <= 8);
  const ids = new Set(V("v2").map((c) => c.id));
  assert.ok(n.points.every((p) => ids.has(p.chunkId)));
  const pos = n.points.map((p) => V("v2").findIndex((c) => c.id === p.chunkId));
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b));
});
ok("extractive notes: decisions and actions found by pattern", () => {
  const n = extractiveNotes(V("v2"));
  assert.ok(n.decisions.some((d) => d.chunkId === "v2-04"), JSON.stringify(n.decisions));
  assert.ok(n.actions.length >= 0);
  const m = extractiveNotes([{ id: "a", text: "We decided to ship on Friday." }, { id: "b", text: "You need to update the README before then." }, { id: "c", text: "Lunch is at noon." }]);
  assert.equal(m.decisions[0].chunkId, "a"); assert.equal(m.actions[0].chunkId, "b");
});
ok("extractive notes: empty and single chunk", () => {
  assert.deepEqual(extractiveNotes([]).points, []);
  assert.equal(extractiveNotes([{ id: "x", text: "Only one short chunk here." }]).points.length, 1);
});
ok("llm reply validation drops invented sources and clamps", () => {
  const chunks = V("v2").slice(0, 4);
  const raw = 'Sure! {"summary":"S","key_points":[{"text":"ok","source":[2]},{"text":"bad","source":[99]},{"text":"none"}],"action_items":[{"text":"do it","source":2}],"decisions":[]}';
  const n = parseNotesReply(raw, chunks);
  assert.equal(n.points.length, 1); assert.equal(n.points[0].chunkId, chunks[1].id); assert.equal(n.actions[0].chunkId, chunks[1].id);
});
ok("llm reply with no usable content throws", () => { assert.throws(() => parseNotesReply('{"summary":"","key_points":[]}', V("v2"))); assert.throws(() => parseNotesReply("not json", V("v2"))); });
await ok("generateNotes falls back to extractive when the model fails", async () => {
  const r = await generateNotes(V("v2"), "T", { complete: async () => { throw new Error("AccessDenied"); } });
  assert.equal(r.source, "extractive"); assert.match(r.note, /AccessDenied/); assert.ok(r.points.length);
  const m = await generateNotes(V("v2"), "T", { complete: async () => '{"summary":"A summary.","key_points":[{"text":"Port is 8000","source":[4]}],"action_items":[],"decisions":[]}' });
  assert.equal(m.source, "model"); assert.equal(m.points[0].chunkId, V("v2")[3].id);
});
ok("batching splits long transcripts", () => {
  const big = Array.from({ length: 100 }, (_, i) => ({ id: "c" + i, text: "word ".repeat(100) }));
  const b = batchChunks(big, 2000); assert.ok(b.length >= 5); assert.equal(b.flat().length, 100);
  assert.match(notesPrompt(b[0], "X").user, /\[1\]/);
});

// ---- library / references ----
const lib1 = new Library(stored.filter((c) => c.videoId !== "v3"));
const lib2 = new Library(stored);
const refs = buildRefItems("v2", V("v2"));
ok("ref items: two backward references and one promise in v2; one promise in v1; none in v3", () => {
  assert.deepEqual(refs.map((r) => [r.chunkId, r.dir]), [["v2-05", "back"], ["v2-08", "back"], ["v2-11", "forward"]]);
  assert.deepEqual(buildRefItems("v1", V("v1")).map((r) => [r.chunkId, r.dir, r.id]), [["v1-09", "forward", "r-fwd-v1-09"]]);
  assert.equal(buildRefItems("v3", V("v3")).length, 0);
});
const T = new Map([["v1", 1], ["v2", 2], ["v3", 3]]); lib1.videoTime = T; lib2.videoTime = T;
ok("promises: 'in the next recording' in Server Setup is kept by Application Setup; the monitoring promise is not kept by anything", () => {
  const p1 = buildRefItems("v1", V("v1"))[0];
  const c = candidatesFor(lib2, p1); assert.equal(c[0].chunk.videoId, "v2"); assert.ok(c[0].passes);
  assert.ok(c.every((h) => h.chunk.videoId !== "v1"), "never matches its own video");
  const p2 = refs[2]; assert.equal(candidatesFor(lib2, p2).length, 0);
});
ok("promises can only be kept by a later video", () => {
  const p1 = buildRefItems("v1", V("v1"))[0];
  const early = new Library(stored.filter((c) => c.videoId !== "v3")); early.videoTime = new Map([["v1", 5], ["v2", 2]]);
  assert.equal(candidatesFor(early, p1).length, 0, "v2 is older than the promise");
  assert.equal(pendingCheck(early, [{ ...p1, status: "pending" }], "v2", new Set()).length, 0);
  const ok2 = pendingCheck(lib1, [{ ...p1, status: "pending" }], "v2", new Set()); assert.equal(ok2.length, 1); assert.equal(ok2[0].hit.chunk.videoId, "v2");
});
ok("candidates: 09:30 resolves to Server Setup 03:20; 06:10 has none on day 1", () => {
  const c8 = candidatesFor(lib1, refs[1]); assert.equal(c8[0].chunk.id, "v1-04");
  assert.equal(candidatesFor(lib1, refs[0]).length, 0);
  assert.equal(candidatesFor(lib2, refs[0])[0].chunk.id, "v3-03");
});
ok("pending check: day 2 finds v3-03 once, never twice, skips resolved", () => {
  const p = [{ ...refs[0], status: "pending" }];
  const a = pendingCheck(lib2, p, "v3", new Set()); assert.equal(a.length, 1); assert.equal(a[0].hit.chunk.id, "v3-03");
  assert.equal(pendingCheck(lib2, p, "v3", new Set([a[0].key])).length, 0);
  assert.equal(pendingCheck(lib2, [{ ...refs[0], status: "resolved" }], "v3", new Set()).length, 0);
  assert.equal(pendingCheck(lib2, [{ ...refs[1], status: "pending" }], "v3", new Set()).length, 0);
});
ok("ask search: finds the moment, rejects off-topic", () => {
  const h = lib2.search("which port should the application use", { purpose: "ask", k: 3 }); assert.ok(h.some((x) => x.chunk.id === "v2-04" && x.passes)); assert.equal(lib1.search("which port should the application use", { purpose: "ask", k: 1 })[0].chunk.id, "v2-04");
  assert.ok(lib2.search("what is the capital of France", { purpose: "ask" }).filter((x) => x.passes).length === 0);
  assert.equal(lib2.search("restart the service", { purpose: "ask", onlyVideo: "v1" }).filter((x) => x.passes)[0].chunk.videoId, "v1");
});
ok("semantic mode: embeddings drive ranking when both sides have them", () => {
  const mk = (id, v) => ({ id, videoId: id[0], idx: 0, start: 0, text: id + " text", emb: vecToB64(v) });
  const l = new Library([mk("a1", [1, 0, 0]), mk("b1", [0, 1, 0]), mk("c1", [0.9, 0.1, 0])]);
  const h = l.search("zzz", { purpose: "ask", k: 3, queryVec: new Float32Array([1, 0, 0]) });
  assert.equal(h[0].chunk.id, "a1"); assert.equal(h[0].mode, "semantic"); assert.ok(h[0].passes); assert.ok(!h.some((x) => x.chunk.id === "b1"));
});
ok("library map: edges, gaps, order, stats", () => {
  const videos = ["v1", "v2", "v3"].map((id) => ({ id, title: id, status: "ready", duration: 100 }));
  const byChunk = new Map(stored.map((c) => [c.id, c]));
  const rs = [{ ...refs[1], status: "resolved", source: { chunkId: "v1-04" } }, { ...refs[0], status: "pending" }];
  let m = buildMap(videos, rs, byChunk, []);
  assert.equal(m.stats.linked, 1); assert.equal(m.stats.gaps, 1); assert.equal(m.stats.explained, 50);
  assert.ok(m.order.indexOf("v1") < m.order.indexOf("v2")); assert.ok(m.gaps[0].topic.includes("database"));
  const pr = buildRefItems("v1", V("v1"))[0];
  const mp = buildMap(videos, [{ ...pr, status: "resolved", source: { chunkId: "v2-01" } }, { ...refs[2], status: "pending" }], byChunk, []);
  assert.equal(mp.edges[0].dir, "forward"); assert.equal(mp.edges[0].from, "v2"); assert.equal(mp.edges[0].to, "v1"); assert.equal(mp.gaps[0].kind, "promise"); assert.equal(mp.stats.promises, 1);
  assert.ok(mp.order.indexOf("v1") < mp.order.indexOf("v2"), "the promising video comes first");
  m = buildMap(videos, [{ ...refs[1], status: "resolved", source: { chunkId: "v1-04" } }, { ...refs[0], status: "resolved", source: { chunkId: "v3-03" } }], byChunk, []);
  assert.equal(m.stats.explained, 100); assert.deepEqual(m.order, ["v1", "v3", "v2"].filter(Boolean).sort((a, b) => m.order.indexOf(a) - m.order.indexOf(b)));
  assert.ok(m.order.indexOf("v3") < m.order.indexOf("v2"));
});
console.log(`\n${n} backend core tests passed`);
