// "Know more": a short, general AI explanation of a topic the user's videos do not cover.
// Clearly separate from ask-your-notes: this is background knowledge, not grounded in the library.

export function explainPrompt({ topic, context }) {
  return {
    system: "You explain a technical or academic topic to a student who is watching recorded lectures. None of their saved videos explains it, so give general background knowledge. Plain text only: no markdown, no headings, no lists. The first line must be exactly 'Topic: <short topic name>'. Then at most two short paragraphs, under 160 words in total, starting with a one-sentence definition. Do not mention videos, lectures or the speaker. If you cannot tell what concept is meant, reply exactly: UNCLEAR",
    user: context
      ? `A lecture says: "${context}"\nExplain the concept this refers to that a viewer may not know yet.`
      : `Explain this topic: ${topic}`,
  };
}

export function parseExplain(reply, fallbackTopic = "") {
  let text = String(reply || "").replace(/\*\*|__|^#+\s*/gm, "").trim();
  if (!text || /^UNCLEAR\b/i.test(text)) return null;
  let topic = fallbackTopic;
  const m = text.match(/^\s*Topic:\s*(.+)\s*(?:\n|$)/i);
  if (m) { topic = m[1].trim().replace(/[.:]+$/, ""); text = text.slice(m[0].length).trim(); }
  if (!text) return null;
  return { topic: topic.slice(0, 80), text: text.slice(0, 1500) };
}

const cache = new Map(); // per Lambda container; explanations do not depend on the user

export async function explainTopic({ topic = "", context = "" }, llm) {
  const key = (context || topic).toLowerCase().replace(/\s+/g, " ").trim();
  if (cache.has(key)) return cache.get(key);
  const out = parseExplain(await llm.complete(explainPrompt({ topic, context })), topic);
  if (out) { if (cache.size > 300) cache.delete(cache.keys().next().value); cache.set(key, out); }
  return out;
}
