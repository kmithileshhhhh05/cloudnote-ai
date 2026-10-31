// Ask questions across saved notes. Keyword ranking always works; an LLM (when configured) writes a short
// answer that may only use the numbered passages, and cites them. Any LLM failure falls back to keyword results.
import { buildIndex, search } from "../../../shared/nlp.js";

const KIND_LABEL = { summary: "Summary", point: "Key point", action: "Action item", decision: "Decision", mine: "My notes" };

/** items: [{video:{id,title}, notes:{summary,points,actions,decisions}|null, mine:{text}|null}] -> flat passages */
export function passagesOf(items) {
  const out = [];
  const add = (it, kind, text, start) => { const t = String(text || "").trim(); if (t) out.push({ id: `p${out.length}`, videoId: it.video.id, title: it.video.title, kind, label: KIND_LABEL[kind], text: t.slice(0, 600), start: start ?? null }); };
  for (const it of items) {
    if (it.notes) {
      add(it, "summary", it.notes.summary, null);
      for (const [k, arr] of [["point", it.notes.points], ["action", it.notes.actions], ["decision", it.notes.decisions]]) (arr || []).forEach((i) => add(it, k, i.text, i.start));
    }
    if (it.mine && it.mine.text) it.mine.text.split(/\n{2,}|\n(?=[-*\d])/).slice(0, 40).forEach((para) => add(it, "mine", para, null));
  }
  return out;
}

// Both prompts ask for two parts: ANSWER (only from the passages, cited) and BACKGROUND (a general textbook
// explanation, uncited, shown separately and labelled as not from the user's material).
const TWO_PARTS = "Reply in exactly this format:\nANSWER: a clear explanation in 3 to 6 sentences that directly answers the question, like a good tutor, using ONLY facts from the numbered passages, with the passage number in square brackets like [2] after each claim. Clean up spoken filler.\nBACKGROUND: 3 to 5 sentences of general textbook explanation of the topic (what it is, how it works, a tiny example if useful) for a student who needs the basics. No citations here.\nIf the passages say nothing relevant to the question, write ANSWER: NOT_IN_NOTES and still give BACKGROUND. Never invent facts, times or video names in ANSWER.";

/** Split a two-part reply into the cited answer text and the general background. */
export function splitReply(reply) {
  const t = String(reply || "").replace(/\*\*(ANSWER|BACKGROUND):?\*\*:?/gi, "$1:");
  const m = t.match(/BACKGROUND\s*:/i);
  const ans = (m ? t.slice(0, m.index) : t).replace(/^\s*ANSWER\s*:\s*/i, "").trim();
  const bg = m ? t.slice(m.index + m[0].length).trim().replace(/[【\[]\s*\d[^\]】]*[\]】]/g, "").trim().slice(0, 1200) : "";
  return { ans, bg: bg || null };
}

export function askPrompt(question, ps) {
  return {
    system: "You answer questions about a person's saved video notes. " + TWO_PARTS,
    user: `Passages:\n${ps.map((p, i) => `[${i + 1}] (${p.title}, ${p.label}) ${p.text}`).join("\n")}\n\nQuestion: ${question}`,
  };
}

export function parseAnswer(reply, ps) {
  // models vary in citation style: [1, 3], 【1】, 【1†L1-L2】, [1-2] all become [1][3]
  const text = String(reply || "").trim()
    .replace(/[【\[]\s*(\d{1,3})\s*†[^】\]]*[】\]]/g, "[$1]")
    .replace(/[【\[]\s*(\d{1,3}(?:\s*[,;–-]\s*\d{1,3})+)\s*[】\]]/g, (_, list) => list.split(/\s*[,;–-]\s*/).map((n) => `[${n}]`).join(""))
    .replace(/【\s*(\d{1,3})\s*】/g, "[$1]");
  if (!text || /^NOT_IN_NOTES\b/i.test(text)) return null;
  const cites = [...new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= ps.length))];
  if (!cites.length) return null; // an uncited answer cannot be verified, so it is not shown
  return { text: text.slice(0, 1500), cites };
}

export async function askNotes(question, items, llm) {
  const ps = passagesOf(items);
  if (!ps.length) return { query: question, answer: null, source: "keyword", results: [] };
  const idx = buildIndex(ps.map((p) => ({ id: p.id, videoId: p.videoId, text: p.text })));
  const byId = new Map(ps.map((p) => [p.id, p]));
  const hits = search(idx, question, { k: 25, minScore: 0.05 }).map((h) => ({ ...byId.get(h.chunk.id), score: Math.round(h.score * 100) / 100 }));
  const pub = (p) => ({ videoId: p.videoId, title: p.title, kind: p.kind, label: p.label, text: p.text, start: p.start, score: p.score });
  if (llm) {
    try {
      const seen = new Set(hits.map((h) => h.id));
      const cand = hits.concat(ps.filter((p) => !seen.has(p.id)).slice(-Math.max(0, 25 - hits.length)));
      const { ans, bg } = splitReply(await llm.complete(askPrompt(question, cand)));
      const a = parseAnswer(ans, cand);
      if (!a && !/^\s*NOT_IN_NOTES/i.test(ans)) console.error("ask: reply had no usable citations:", String(ans).slice(0, 300));
      if (a) return { query: question, answer: a.text, background: bg, source: "ai", results: a.cites.map((n) => pub(cand[n - 1])) };
      return { query: question, answer: null, background: bg, source: "ai", results: hits.slice(0, 5).map(pub) };
    } catch { /* fall through to keyword */ }
  }
  return { query: question, answer: null, source: "keyword", results: hits.slice(0, 6).map(pub) };
}

/** Answer a question from transcript moments (Ask tab / Ask page). Passages carry their timestamps; the
 * model must cite them. Returns null on any failure so callers keep the plain moment list. */
export async function answerFromMoments(question, moments, llm) {
  if (!llm || !moments.length) return null;
  const fmt = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  const ps = moments.map((m) => ({ ...m, label: fmt(m.start) || "moment" }));
  try {
    const { ans: reply, bg } = splitReply(await llm.complete({
      system: "You answer a student's question about their recorded lectures; the numbered passages are transcript excerpts. " + TWO_PARTS,
      user: `Transcript excerpts:\n${ps.map((p, i) => `[${i + 1}] (${p.title}, ${p.label}) ${p.text}`).join("\n")}\n\nQuestion: ${question}`,
    }));
    const a = parseAnswer(reply, ps);
    if (!a) return bg ? { text: null, background: bg, cites: [] } : null;
    return { text: a.text, background: bg, cites: a.cites.map((n) => ps[n - 1]) };
  } catch (e) { console.error("moment answer failed:", String((e && e.message) || e).slice(0, 200)); return null; }
}
