// Library: search over a user's chunks, the reference engine, and the library map.
import { buildIndex, cosine, tokenize, detectReferences, detectForward, referenceQuery, keywords } from "../../../shared/nlp.js";

export const DEFAULTS = {
  // thresholds on the final score. TF-IDF mode and semantic mode live on different scales.
  refTfidf: 0.3, refSemantic: 0.5,
  askTfidf: 0.14, askSemantic: 0.33,
  semanticLexicalWeight: 0.2,
};

export const b64ToVec = (b64) => {
  if (typeof Buffer !== "undefined") { const buf = Buffer.from(b64, "base64"); return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); }
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
};
export const vecToB64 = (vec) => {
  const bytes = new Uint8Array(new Float32Array(vec).buffer);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

function dot(a, b) {
  let s = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? s / Math.sqrt(na * nb) : 0;
}

/** chunks: [{id, videoId, idx, start, end, text, emb?(base64)}] */
export class Library {
  constructor(chunks, cfg = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.chunks = chunks;
    this.byId = new Map(chunks.map((c) => [c.id, c]));
    this.index = buildIndex(chunks.map((c) => ({ id: c.id, videoId: c.videoId, start: c.start ?? 0, text: c.text })));
    this.vecs = chunks.map((c) => (c.emb ? (c.embVec || (c.embVec = b64ToVec(c.emb))) : null));
  }

  /**
   * opts: { purpose: 'ref'|'ask', k, onlyVideo, excludeVideo, queryVec, dropMeta }
   * Returns hits with { chunk, score, mode, passes } sorted best first.
   */
  search(query, opts = {}) {
    const { purpose = "ask", k = 3, onlyVideo, onlyVideos, excludeVideo, queryVec, dropMeta = purpose === "ref" } = opts;
    const q = this.index.vec(tokenize(query, { dropMeta }));
    const hits = [];
    const th = purpose === "ref" ? { tfidf: this.cfg.refTfidf, semantic: this.cfg.refSemantic } : { tfidf: this.cfg.askTfidf, semantic: this.cfg.askSemantic };
    this.index.docs.forEach((d, i) => {
      const c = this.chunks[i];
      if (excludeVideo && c.videoId === excludeVideo) return;
      if (onlyVideo && c.videoId !== onlyVideo) return;
      if (onlyVideos && !onlyVideos.has(c.videoId)) return;
      const lex = q.v.size ? cosine(q, d.vec) : 0;
      const v = this.vecs[i];
      let score, mode;
      if (queryVec && v) { score = (1 - this.cfg.semanticLexicalWeight) * dot(queryVec, v) + this.cfg.semanticLexicalWeight * lex; mode = "semantic"; }
      else { score = lex; mode = "tfidf"; }
      if (score <= 0) return;
      hits.push({ chunk: c, score, mode, passes: score >= th[mode] });
    });
    // rank by closeness to the passing threshold so the two scales are comparable
    hits.sort((a, b) => b.score / th[b.mode] - a.score / th[a.mode]);
    return hits.slice(0, k);
  }
}

// ---------- references ----------

/** Backward references ("as discussed earlier") and forward promises ("in the next video we will..."). */
export function buildRefItems(videoId, chunks) {
  const back = detectReferences(chunks).map((r) => ({
    id: `r-${r.chunk.id}`, dir: "back", videoId, chunkId: r.chunk.id, phrase: r.phrase,
    query: referenceQuery(chunks, r.chunkIndex), status: "open", source: null, manual: false,
  }));
  const fwd = detectForward(chunks).map((r) => ({
    id: `r-fwd-${r.chunk.id}`, dir: "forward", videoId, chunkId: r.chunk.id, phrase: r.phrase,
    query: referenceQuery(chunks, r.chunkIndex), status: "open", source: null, manual: false,
  }));
  return [...back, ...fwd];
}

/** Videos that can fulfil a promise: any other video uploaded at or after the one that made it. */
export function laterVideos(lib, ref) {
  const vt = lib.videoTime, t0 = vt && vt.get(ref.videoId);
  if (!vt || t0 == null) return undefined;
  const ok = new Set();
  for (const [id, t] of vt) if (id !== ref.videoId && t >= t0) ok.add(id);
  return ok;
}

export function candidatesFor(lib, ref, queryVec) {
  const opts = ref.dir === "forward" ? { onlyVideos: laterVideos(lib, ref) || new Set() } : { excludeVideo: ref.videoId };
  return lib.search(ref.query, { purpose: "ref", k: 3, queryVec, ...opts }).filter((h) => h.passes);
}

/** After a video is indexed, check every pending reference against ONLY that video. */
export function pendingCheck(lib, pendingRefs, newVideoId, notified, queryVecOf = () => undefined) {
  const out = [];
  for (const ref of pendingRefs) {
    if (ref.status !== "pending" || ref.videoId === newVideoId) continue;
    if (ref.dir === "forward" && lib.videoTime && lib.videoTime.get(newVideoId) < lib.videoTime.get(ref.videoId)) continue; // a promise can only be kept by a later video
    const top = lib.search(ref.query, { purpose: "ref", k: 1, onlyVideo: newVideoId, queryVec: queryVecOf(ref) }).filter((h) => h.passes)[0];
    if (!top) continue;
    const key = `${ref.id}::${top.chunk.id}`;
    if (notified.has(key)) continue;
    out.push({ ref, hit: top, key });
  }
  return out;
}

// ---------- map ----------

export function buildMap(videos, refs, byChunk, notifications = []) {
  const vids = videos.filter((v) => v.status === "ready");
  const edges = [], gaps = [];
  for (const r of refs) {
    const here = byChunk.get(r.chunkId);
    if (!here) continue;
    const fwd = r.dir === "forward";
    if (r.status === "resolved" && r.source) {
      const other = byChunk.get(r.source.chunkId);
      if (!other) continue;
      // back reference: this video depends on the source. Forward promise: the video that kept it follows the one that made it.
      edges.push(fwd ? { refId: r.id, dir: "forward", from: other.videoId, to: here.videoId, fromTime: other.start, toTime: here.start } : { refId: r.id, dir: "back", from: here.videoId, to: other.videoId, fromTime: here.start, toTime: other.start });
    } else {
      const note = notifications.find((n) => n.refId === r.id && n.status === "new");
      const cand = note ? byChunk.get(note.chunkId) : null;
      gaps.push({ refId: r.id, kind: fwd ? "promise" : "reference", videoId: here.videoId, at: here.start, phrase: r.phrase, text: here.text, topic: keywords(r.query, 4), pending: r.status === "pending", candidate: cand ? { chunkId: cand.id, videoId: cand.videoId, at: cand.start } : null });
    }
  }
  const deps = Object.fromEntries(vids.map((v) => [v.id, new Set(edges.filter((e) => e.from === v.id && e.to !== v.id).map((e) => e.to))]));
  const left = new Set(vids.map((v) => v.id)), order = [];
  while (left.size) {
    const ready = [...left].filter((v) => [...deps[v]].every((d) => !left.has(d)));
    const pick = ready.length ? ready : [...left];
    pick.forEach((v) => { order.push(v); left.delete(v); });
  }
  const total = edges.length + gaps.length;
  return { nodes: vids.map((v) => ({ id: v.id, title: v.title, duration: v.duration })), edges, gaps, order, stats: { linked: edges.length, gaps: gaps.length, promises: gaps.filter((g) => g.kind === "promise").length, explained: total ? Math.round((edges.length / total) * 100) : 100 } };
}
