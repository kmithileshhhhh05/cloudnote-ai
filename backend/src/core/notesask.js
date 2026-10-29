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

export function askPrompt(question, ps) {
  return {
    system: "You answer questions about a person's saved video notes. Use ONLY the numbered passages. If they do not contain the answer, reply exactly: NOT_IN_NOTES. Keep the answer under 90 words. After each claim cite the passage number in square brackets like [2]. Never invent facts, times or video names.",
    user: `Passages:\n${ps.map((p, i) => `[${i + 1}] (${p.title}, ${p.label}) ${p.text}`).join("\n")}\n\nQuestion: ${question}\nAnswer:`,
  };
}

export function parseAnswer(reply, ps) {
  // models vary in citation style: [1, 3], 【1】, [1-2] all become [1][3]
  const text = String(reply || "").trim()
    .replace(/[【\[]\s*(\d{1,3}(?:\s*[,;–-]\s*\d{1,3})+)\s*[】\]]/g, (_, list) => list.split(/\s*[,;–-]\s*/).map((n) => `[${n}]`).join(""))
    .replace(/【\s*(\d{1,3})\s*】/g, "[$1]");
  if (!text || /^NOT_IN_NOTES\b/i.test(text)) return null;
  const cites = [...new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= ps.length))];
  if (!cites.length) return null; // an uncited answer cannot be verified, so it is not shown
  return { text: text.slice(0, 900), cites };
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
      const reply = await llm.complete(askPrompt(question, cand));
      const a = parseAnswer(reply, cand);
      if (!a && !/^\s*NOT_IN_NOTES/i.test(reply)) console.error("ask: reply had no usable citations:", String(reply).slice(0, 300));
      if (a) return { query: question, answer: a.text, source: "ai", results: a.cites.map((n) => pub(cand[n - 1])) };
      return { query: question, answer: null, source: "ai", results: hits.slice(0, 5).map(pub) };
    } catch { /* fall through to keyword */ }
  }
  return { query: question, answer: null, source: "keyword", results: hits.slice(0, 6).map(pub) };
}
