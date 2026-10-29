import assert from "node:assert/strict";
import { CHUNKS, CHUNKS_BY_ID, KEYPOINTS_V2, SAMPLE_NOTES, SAMPLE_REFERENCES } from "../src/js/demo-data.js";
import { buildIndex, search, detectReferences, detectInText, referenceQuery, compareNotes, checkPending, THRESHOLD } from "../shared/nlp.js";

const show = (...a) => process.env.V && console.log(...a);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };

const v2 = CHUNKS.filter((c) => c.videoId === "v2");
const lib1 = CHUNKS.filter((c) => c.videoId === "v1" || c.videoId === "v2");
const libAll = CHUNKS;

ok("detects exactly the two reference chunks in v2", () => {
  const refs = detectReferences(v2);
  assert.deepEqual(refs.map((r) => r.chunk.id), ["v2-05", "v2-08"]);
});
ok("no false positives in v1 / v3", () => {
  assert.equal(detectReferences(CHUNKS.filter((c) => c.videoId === "v1")).length, 0);
  assert.equal(detectReferences(CHUNKS.filter((c) => c.videoId === "v3")).length, 0);
});

// Day 1 library = v1 + v2
const idx1 = buildIndex(lib1);
const refs = detectReferences(v2);
const q05 = referenceQuery(v2, refs[0].chunkIndex);
const q08 = referenceQuery(v2, refs[1].chunkIndex);

ok("reference 2 (server config) resolves to Server Setup 03:20", () => {
  const h = search(idx1, q08, { excludeVideo: "v2", k: 3 });
  show("q08", h.map((x) => [x.chunk.id, x.score.toFixed(3)]));
  assert.equal(h[0].chunk.id, "v1-04");
  assert.ok(h[0].score >= THRESHOLD, "score " + h[0].score);
});
ok("reference 1 (database settings) has NO suitable source on day 1", () => {
  const h = search(idx1, q05, { excludeVideo: "v2", k: 3 });
  show("q05 day1", h.map((x) => [x.chunk.id, x.score.toFixed(3)]));
  assert.ok(!h.length || h[0].score < THRESHOLD, "top " + (h[0] && h[0].score));
});

// Day 2: v3 indexed
const idx2 = buildIndex(libAll);
ok("pending reference resolves to Database Tutorial 04:20 after v3 upload", () => {
  const pending = [{ id: "ref1", status: "pending", query: q05 }];
  const out = checkPending(idx2, pending, "v3", new Set());
  show("pending", out.map((o) => [o.hit.chunk.id, o.hit.score.toFixed(3)]));
  assert.equal(out.length, 1);
  assert.equal(out[0].hit.chunk.id, "v3-03");
});
ok("dedupe: same candidate is not alerted twice", () => {
  const pending = [{ id: "ref1", status: "pending", query: q05 }];
  const first = checkPending(idx2, pending, "v3", new Set());
  const second = checkPending(idx2, pending, "v3", new Set([first[0].key]));
  assert.equal(second.length, 0);
});
ok("resolved / rejected refs are skipped", () => {
  const out = checkPending(idx2, [{ id: "ref1", status: "resolved", query: q05 }], "v3", new Set());
  assert.equal(out.length, 0);
});
ok("v3 upload does not wrongly resolve the server-config reference", () => {
  const out = checkPending(idx2, [{ id: "ref2", status: "pending", query: q08 }], "v3", new Set());
  show("ref2 vs v3", out.map((o) => [o.hit.chunk.id, o.hit.score.toFixed(3)]));
  assert.equal(out.length, 0);
});

ok("notes vs video: 3 covered, 1 mismatch (8080 vs 8000), 1 missed (restart)", () => {
  const r = compareNotes(SAMPLE_NOTES, KEYPOINTS_V2, CHUNKS_BY_ID);
  show(r.results.map((x) => [x.keypoint.id, x.verdict, x.score.toFixed(2), x.bestLine]));
  const by = Object.fromEntries(r.results.map((x) => [x.keypoint.id, x]));
  assert.equal(by.kp1.verdict, "covered");
  assert.equal(by.kp2.verdict, "covered");
  assert.equal(by.kp3.verdict, "mismatch");
  assert.equal(by.kp3.detail.notes, "8080");
  assert.equal(by.kp3.detail.video, "8000");
  assert.equal(by.kp4.verdict, "covered");
  assert.equal(by.kp5.verdict, "missed");
});
ok("notes: adding the restart line flips it to covered", () => {
  const r = compareNotes(SAMPLE_NOTES + "\n5. Restart the service to load the new configuration", KEYPOINTS_V2, CHUNKS_BY_ID);
  assert.equal(r.results.find((x) => x.keypoint.id === "kp5").verdict, "covered");
});
ok("notes: fixing the port flips mismatch to covered", () => {
  const r = compareNotes(SAMPLE_NOTES.replace("8080", "8000"), KEYPOINTS_V2, CHUNKS_BY_ID);
  assert.equal(r.results.find((x) => x.keypoint.id === "kp3").verdict, "covered");
});
ok("notes: empty notes => everything missed, no crash", () => {
  const r = compareNotes("", KEYPOINTS_V2, CHUNKS_BY_ID);
  assert.ok(r.results.every((x) => x.verdict === "missed"));
});

ok("free-text sample references behave sensibly", () => {
  for (const s of SAMPLE_REFERENCES) {
    const d = detectInText(s);
    const h = d ? search(idx2, s, { excludeVideo: "v2", k: 3 }) : [];
    show(JSON.stringify(s), d && d.phrase, h.map((x) => [x.chunk.id, x.score.toFixed(2)]));
  }
  assert.ok(detectInText(SAMPLE_REFERENCES[0]));
  assert.ok(detectInText(SAMPLE_REFERENCES[1]));
  assert.ok(detectInText(SAMPLE_REFERENCES[2]));
  const idx1b = buildIndex(lib1);
  for (const i of [0, 1, 2]) {
    const hh = search(idx1b, SAMPLE_REFERENCES[i], { excludeVideo: "v2", k: 1 });
    show("day1-lib sample", i, hh.map((x) => [x.chunk.id, x.score.toFixed(2)]));
  }
  const off = search(idx2, SAMPLE_REFERENCES[3], { excludeVideo: "v2", k: 1 });
  assert.ok(!off.length || off[0].score < THRESHOLD, "off-topic should not match");
  assert.equal(detectInText("We now install the package."), null);
});

console.log(`\n${n} tests passed`);
