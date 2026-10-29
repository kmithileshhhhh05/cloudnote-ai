// Notes: summary, key points, action items, decisions.
// Two paths: an LLM path (validated, source-linked) and an extractive fallback that needs no model.
import { buildIndex, cosine, tokenize } from "../../../shared/nlp.js";

const ACTION = /\b(you (?:need|have|should|must|will need) to|we (?:need|have|should|must) to|need to|needs to|make sure|be sure to|don't forget|remember to|action item|to-?do|next step|follow up|please (?:send|check|review|update|share|make|add)|i(?:'ll| will) (?:send|check|share|update|follow)|let's (?:schedule|set up|plan)|deadline|by (?:monday|tuesday|wednesday|thursday|friday|tomorrow|next week))\b/i;
const DECISION = /\b(we (?:decided|agreed|chose|settled|picked)|decided to|agreed to|the decision|going with|we(?:'ll| will) go with|let's go with|we(?:'re| are) using|use [a-z0-9 ]{2,24} because|because the [a-z ]+ expects|final(?:ly)? (?:choice|call))\b/i;

const sentencesOf = (t) => (t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t]).map((s) => s.trim()).filter(Boolean);
const clip = (s, n = 150) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "..." : s);

function centrality(chunks) {
  const idx = buildIndex(chunks.map((c) => ({ id: c.id, videoId: "x", start: 0, text: c.text })));
  const vecs = idx.docs.map((d) => d.vec);
  return chunks.map((_, i) => {
    let s = 0;
    for (let j = 0; j < vecs.length; j++) if (i !== j) s += cosine(vecs[i], vecs[j]);
    return s / Math.max(1, vecs.length - 1);
  });
}

/** Pick the sentence in a chunk that best matches a regex, else the first sentence. */
function sentenceFor(chunk, re) {
  const ss = sentencesOf(chunk.text);
  return clip(ss.find((s) => re.test(s)) || ss[0]);
}

export function extractiveNotes(chunks) {
  if (!chunks.length) return { summary: "", points: [], actions: [], decisions: [] };
  const cen = centrality(chunks);
  const order = chunks.map((_, i) => i).sort((a, b) => cen[b] - cen[a]);
  const nPoints = Math.max(1, Math.min(8, Math.ceil(chunks.length / 4)));
  // spread picks across the video: at most one per equal-sized segment
  const seg = Math.ceil(chunks.length / nPoints);
  const taken = new Set(), pick = [];
  for (const i of order) {
    const s = Math.floor(i / seg);
    if (taken.has(s)) continue;
    taken.add(s); pick.push(i);
    if (pick.length >= nPoints) break;
  }
  pick.sort((a, b) => a - b);
  const points = pick.map((i) => ({ text: sentenceFor(chunks[i], /./), chunkId: chunks[i].id }));
  const sumIdx = order.slice(0, 3).sort((a, b) => a - b);
  const summary = sumIdx.map((i) => sentencesOf(chunks[i].text)[0]).join(" ");
  const actions = [], decisions = [], seenA = new Set(), seenD = new Set();
  for (const c of chunks) {
    if (ACTION.test(c.text) && actions.length < 8) { const t = sentenceFor(c, ACTION); if (!seenA.has(t)) { seenA.add(t); actions.push({ text: t, chunkId: c.id }); } }
    if (DECISION.test(c.text) && decisions.length < 6) { const t = sentenceFor(c, DECISION); if (!seenD.has(t)) { seenD.add(t); decisions.push({ text: t, chunkId: c.id }); } }
  }
  return { summary, points, actions, decisions };
}

// ---------- LLM path ----------

/** Batches of numbered chunks so long videos fit a model context. */
export function batchChunks(chunks, maxWords = 5500) {
  const out = []; let cur = [], w = 0;
  for (const c of chunks) {
    const n = c.text.split(/\s+/).length;
    if (w + n > maxWords && cur.length) { out.push(cur); cur = []; w = 0; }
    cur.push(c); w += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function notesPrompt(chunks, title) {
  const body = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n");
  return {
    system: "You write precise study and meeting notes from a transcript. Use only what the transcript says. Never invent facts. Reply with JSON only.",
    user: `Video title: ${title}\n\nTranscript chunks, each with a number in brackets:\n${body}\n\nReturn JSON with exactly these keys:\n{"summary": "2-4 sentences",\n "key_points": [{"text": "short statement", "source": [chunk numbers]}],\n "action_items": [{"text": "...", "source": [chunk numbers]}],\n "decisions": [{"text": "...", "source": [chunk numbers]}]}\nRules: every item must cite at least one chunk number that supports it. Use empty arrays when there are none. At most 8 key points. No text outside the JSON.`,
  };
}

function extractJson(raw) {
  const s = String(raw || "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in model reply");
  return JSON.parse(s.slice(a, b + 1));
}

/** Validate the model reply: keep only items whose cited chunk numbers exist. Timestamps come from the DB, never the model. */
export function parseNotesReply(raw, chunks) {
  const j = extractJson(raw);
  const ok = (arr) => (Array.isArray(arr) ? arr : []).map((x) => {
    const src = (Array.isArray(x && x.source) ? x.source : [x && x.source]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= chunks.length);
    const text = x && typeof x.text === "string" ? x.text.trim() : "";
    return text && src.length ? { text: clip(text, 220), chunkId: chunks[src[0] - 1].id } : null;
  }).filter(Boolean);
  const out = { summary: typeof j.summary === "string" ? j.summary.trim() : "", points: ok(j.key_points).slice(0, 8), actions: ok(j.action_items).slice(0, 8), decisions: ok(j.decisions).slice(0, 6) };
  if (!out.summary && !out.points.length) throw new Error("model reply had no usable notes");
  return out;
}

/** llm: { complete({system,user}) -> string }. Falls back to extractive on any failure. */
export async function generateNotes(chunks, title, llm) {
  if (!llm) return { ...extractiveNotes(chunks), source: "extractive" };
  try {
    const batches = batchChunks(chunks);
    const parts = [];
    for (const b of batches) {
      const p = notesPrompt(b, title);
      parts.push(parseNotesReply(await llm.complete(p), b));
    }
    const withPoints = (n) => (n.points.length ? n : { ...n, points: extractiveNotes(chunks).points });
    if (parts.length === 1) return { ...withPoints(parts[0]), source: "model" };
    const merged = { summary: parts.map((p) => p.summary).filter(Boolean).join(" "), points: parts.flatMap((p) => p.points).slice(0, 12), actions: parts.flatMap((p) => p.actions), decisions: parts.flatMap((p) => p.decisions) };
    return { ...withPoints(merged), source: "model" };
  } catch (e) {
    return { ...extractiveNotes(chunks), source: "extractive", note: String(e && e.message || e).slice(0, 200) };
  }
}

export const _t = { tokenize };
