// CloudNote AI demo engine.
// Pure functions, no DOM. Runs in the browser and in Node (for tests).
//
// Honest note: the production design in the project deck uses Sentence
// Transformers (all-MiniLM-L6-v2) embeddings stored in Supabase pgvector.
// This in-browser demo uses TF-IDF cosine similarity instead so that it works
// offline with zero setup. The pipeline around it (reference detection,
// surrounding-sentence queries, thresholds, source validation, user approval)
// is the same shape as the proposed design.

const STOP = new Set(
  ("a an the and or but if then so to of in on at by for with from as is are was were be been being it its this that these those " +
    "i you we they he she them our your their my me us do does did done can could should would will shall may might must not no " +
    "just also very more most some any all each than too into out up down over under again once here there when where why how what which who whom " +
    "have has had having about because while during before after above below between through off own same other such only both few " +
    "make sure so lets let well now going gonna ok okay right").split(/\s+/)
);

// Words that describe the act of referring, not the topic. Removed from queries.
const META = new Set(
  ("earlier previous last prior tutorial video session lecture meeting class recording episode part shown show method discussed covered mentioned " +
    "explained described use using used created saw seen refer next following upcoming future later recording").split(/\s+/)
);

const SYN = {
  repo: "repository",
  repos: "repository",
  env: "environment",
  app: "application",
  deps: "dependency",
  dependencies: "dependency",
  config: "configuration",
  configure: "configuration",
  configured: "configuration",
  configuring: "configuration",
  db: "database",
  pwd: "password",
  secrets: "secret",
  keys: "key",
  restarting: "restart",
  restarted: "restart",
  reload: "restart",
  reloaded: "restart",
  migrate: "migration",
  migrations: "migration",
  migrating: "migration",
  install: "install",
  installing: "install",
  installed: "install",
  cloning: "clone",
  cloned: "clone",
  settings: "setting",
  setup: "setup",
};

export function stem(w) {
  if (SYN[w]) w = SYN[w];
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(text, { dropMeta = false } = {}) {
  const raw = (text || "").toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)*/g) || [];
  const out = [];
  for (const w of raw) {
    if (STOP.has(w)) continue;
    if (dropMeta && META.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

export function numbersIn(text) {
  return (text || "").match(/\b\d{2,5}\b/g) || [];
}

// ---------- index ----------

/** chunks: [{id, videoId, start, text}] */
export function buildIndex(chunks) {
  const docs = chunks.map((c) => ({ chunk: c, tokens: tokenize(c.text) }));
  const df = new Map();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  const N = Math.max(docs.length, 1);
  const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0))) + 1;
  const vec = (tokens) => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * idf(t);
      v.set(t, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) || 1 };
  };
  const dv = docs.map((d) => ({ ...d, vec: vec(d.tokens) }));
  return { docs: dv, vec, size: docs.length };
}

export function cosine(a, b) {
  const [small, large] = a.v.size < b.v.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small.v) {
    const o = large.v.get(t);
    if (o) dot += w * o;
  }
  return dot / (a.norm * b.norm);
}

/** Search an index. opts.excludeVideo, opts.onlyVideo, opts.k, opts.minScore */
export function search(index, query, opts = {}) {
  const { excludeVideo, onlyVideo, k = 3, minScore = 0, dropMeta = true } = opts;
  const q = index.vec(tokenize(query, { dropMeta }));
  if (q.v.size === 0) return [];
  const hits = [];
  for (const d of index.docs) {
    if (excludeVideo && d.chunk.videoId === excludeVideo) continue;
    if (onlyVideo && d.chunk.videoId !== onlyVideo) continue;
    const s = cosine(q, d.vec);
    if (s > minScore) hits.push({ chunk: d.chunk, score: s });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

// ---------- reference detection ----------

const REF_PATTERNS = [
  /\bas\s+(?:we|i|you)?\s*(?:discussed|covered|mentioned|saw|explained|showed|shown|talked about|went over)\s+(?:earlier|before|previously|last time)\b/i,
  /\b(?:the\s+)?(?:previous|earlier|last|prior)\s+(?:video|tutorial|session|lecture|meeting|class|recording|part|episode|module)s?\b/i,
  /\bearlier\s+(?:discussion|explanation|section|walkthrough)\b/i,
  /\b(?:we|i)\s+(?:already\s+)?(?:covered|discussed|explained|showed)\s+(?:this|that|it|them)\s+(?:earlier|before|previously)\b/i,
  /\blast\s+time\b/i,
  /\bin\s+the\s+(?:first|second)\s+(?:video|tutorial|session|lecture)\b/i,
];

/** Returns [{ chunkIndex, phrase, index }] for each chunk containing a reference phrase. */
export function detectReferences(chunks) {
  const found = [];
  chunks.forEach((c, i) => {
    for (const re of REF_PATTERNS) {
      const m = re.exec(c.text);
      if (m) {
        found.push({ chunk: c, chunkIndex: i, phrase: m[0], index: m.index });
        break;
      }
    }
  });
  return found;
}

const FWD_PATTERNS = [
  /\b(?:in|during|for)\s+the\s+(?:next|following|upcoming)\s+(?:video|tutorial|session|lecture|meeting|class|recording|part|episode|module|chapter)s?\b/i,
  /\b(?:next|following)\s+(?:video|tutorial|session|lecture|meeting|class|recording|part|episode|module|chapter)\b/i,
  /\b(?:later|coming up)\s+(?:in|on)\s+(?:this|the)\s+(?:series|course|playlist|module)\b/i,
  /\b(?:we|i)(?:'ll| will| shall)\s+(?:cover|look at|talk about|discuss|see|go (?:over|through)|dive into|explain|get to)\s+(?:that|this|it|them)\s+(?:later|next time|in (?:a|the) (?:future|later|next|follow-?up))/i,
  /\bnext time\b/i,
  /\bin a (?:future|later|follow-?up) (?:video|tutorial|session|lecture|part|episode|recording)\b/i,
  /\bmore (?:on|about) (?:this|that|it) (?:later|next time|in the next)/i,
];

/** Promises: wording that points forward to something a later recording will cover. */
export function detectForward(chunks) {
  const found = [];
  chunks.forEach((c, i) => {
    for (const re of FWD_PATTERNS) {
      const m = re.exec(c.text);
      if (m) { found.push({ chunk: c, chunkIndex: i, phrase: m[0], index: m.index }); break; }
    }
  });
  return found;
}

/** Detect inside free text. Returns first match or null. */
export function detectInText(text) {
  for (const re of REF_PATTERNS) {
    const m = re.exec(text);
    if (m) return { phrase: m[0], index: m.index };
  }
  return null;
}

/** Build a query from the reference chunk plus its neighbours (surrounding sentences). */
export function referenceQuery(chunks, chunkIndex, radius = 1) {
  const parts = [];
  for (let i = Math.max(0, chunkIndex - 0); i <= Math.min(chunks.length - 1, chunkIndex + radius); i++) {
    parts.push(chunks[i].text);
  }
  return parts.join(" ");
}

// ---------- thresholds ----------

export const THRESHOLD = 0.3; // a candidate must reach this to be suggested

// ---------- notes comparison ----------

/**
 * keypoints: [{id, text, chunkId}]  (in the proposed system, extracted by Gemini; precomputed here)
 * Returns per-keypoint verdicts: covered | mismatch | missed, each with the matching note line.
 */
export function compareNotes(noteText, keypoints, chunksById, opts = {}) {
  const { coverThreshold = 0.34 } = opts;
  const lines = (noteText || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const idx = buildIndex(lines.map((t, i) => ({ id: "n" + i, videoId: "notes", start: 0, text: t })).concat(
    keypoints.map((k) => ({ id: k.id, videoId: "kp", start: 0, text: k.text }))
  ));
  const noteDocs = idx.docs.filter((d) => d.chunk.videoId === "notes");
  const results = [];
  const usedLines = new Set();
  for (const k of keypoints) {
    const q = idx.vec(tokenize(k.text));
    let best = null;
    for (const d of noteDocs) {
      const s = cosine(q, d.vec);
      if (!best || s > best.score) best = { line: d.chunk.text, id: d.chunk.id, score: s };
    }
    const chunk = chunksById[k.chunkId];
    const base = { keypoint: k, chunk, bestLine: best && best.score > 0 ? best.line : null, score: best ? best.score : 0 };
    if (best && best.score >= coverThreshold) {
      usedLines.add(best.id);
      const kn = numbersIn(k.text);
      const ln = numbersIn(best.line);
      const conflict = kn.length && ln.length && kn.some((n) => !ln.includes(n));
      results.push({
        ...base,
        verdict: conflict ? "mismatch" : "covered",
        detail: conflict ? { notes: ln.find((n) => !kn.includes(n)) || ln[0], video: kn[0] } : null,
      });
    } else {
      results.push({ ...base, verdict: "missed" });
    }
  }
  return { results, lines, extraLines: lines.filter((_, i) => !usedLines.has("n" + i)) };
}

// ---------- pending reference worker ----------

/**
 * After a new video is indexed, check each pending reference against ONLY that video's chunks.
 * Skips candidates that were already notified (dedupe by refId + chunkId).
 */
export function checkPending(index, pending, newVideoId, notified) {
  const out = [];
  for (const p of pending) {
    if (p.status !== "pending") continue;
    const hits = search(index, p.query, { onlyVideo: newVideoId, k: 1 });
    const top = hits[0];
    if (top && top.score >= THRESHOLD) {
      const key = p.id + "::" + top.chunk.id;
      if (notified.has(key)) continue;
      out.push({ ref: p, hit: top, key });
    }
  }
  return out;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

/** Readable topic words (original spelling) for a gap description. */
export function keywords(text, n = 4) {
  const raw = (text || "").toLowerCase().match(/[a-z][a-z0-9]+/g) || [];
  const seen = new Map();
  for (const w of raw) {
    if (STOP.has(w) || META.has(w) || w.length < 4) continue;
    seen.set(w, (seen.get(w) || 0) + 1);
  }
  return Array.from(seen.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map((e) => e[0]);
}
