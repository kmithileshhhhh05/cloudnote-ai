import { h, icon, fmtTime, clear } from "../ui.js";
import { api } from "../api.js";

export const STATUS = {
  awaiting_upload: ["dim", "Waiting for upload"], transcribing: ["amber", "Transcribing"], processing: ["amber", "Analyzing"], ready: ["green", "Ready"], failed: ["red", "Failed"],
};
export const statusChip = (s) => { const [c, l] = STATUS[s] || ["dim", s]; return h("span", { class: "pill " + c }, ["transcribing", "processing"].includes(s) ? h("span", { class: "dot live" }) : null, l); };

export function highlight(text, phrase) {
  if (!phrase) return [text];
  const i = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return [text];
  return [text.slice(0, i), h("mark", null, text.slice(i, i + phrase.length)), text.slice(i + phrase.length)];
}

/** A link to a moment in a video. Same video: calls onSeek. Other video: navigates. */
export function momentLink(videoId, start, { currentId, onSeek, label } = {}) {
  const t = fmtTime(start);
  const href = `#/v/${videoId}` + (start != null ? `?t=${Math.floor(start)}` : "");
  return h("a", { class: "ts-link", href, onclick: (e) => { if (currentId === videoId && onSeek) { e.preventDefault(); onSeek(start); } } }, label || t);
}

export function momentCard(r, { currentId, onSeek, extra } = {}) {
  return h("div", { class: "cand" },
    h("div", { class: "ct" }, h("span", null, r.title || "This video", " "), momentLink(r.videoId, r.start, { currentId, onSeek }), r.score != null ? h("span", { class: "sc" }, h("span", { class: "bar" }, h("i", { style: { "--w": Math.min(100, Math.round(r.score * 125)) + "%" } })), r.score.toFixed(2)) : null),
    h("div", { class: "cx" }, r.text), extra || null);
}

export function emptyState(title, body, ...actions) {
  return h("div", { class: "empty-state" }, h("div", { class: "es-ic" }, icon("film")), h("h2", null, title), h("p", null, body), h("div", { class: "es-acts" }, ...actions));
}

export function copyText(text, ok, toast) {
  (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(ok), () => toast("Copy was blocked by the browser.", "err"));
}
export function downloadText(name, text, mime = "text/markdown") {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove();
}

/** "Know more" button: a general AI explanation for a topic none of the user's videos covers. */
export function knowMore({ topic = "", chunkId = "", label = "Know more about this topic" } = {}) {
  const out = h("div", { class: "km-out", "aria-live": "polite" });
  const btn = h("button", { class: "btn btn-ghost btn-xs km-btn", type: "button", onclick: go }, icon("spark"), " " + label);
  async function go() {
    if (out.childNodes.length) { clear(out); btn.setAttribute("aria-expanded", "false"); return; }
    btn.disabled = true; out.append(h("div", { class: "hint" }, "Asking the AI..."));
    try {
      const r = await api.post("/explain", chunkId ? { chunkId, topic } : { topic });
      clear(out);
      out.append(h("section", { class: "km-panel" },
        h("div", { class: "km-h" }, h("b", null, r.topic || topic || "Explanation"), h("span", { class: "pill violet" }, "General AI explanation")),
        ...String(r.text).split(/\n\s*\n/).map((para) => h("p", null, para.trim())),
        h("p", { class: "hint" }, "Not from your videos. AI-generated background knowledge, so check important facts.")));
      btn.setAttribute("aria-expanded", "true");
    } catch (e) { clear(out); out.append(h("div", { class: "hint km-err" }, e.message)); }
    btn.disabled = false;
  }
  return h("div", { class: "km" }, btn, out);
}

/** General explanation that is not from the user's material; always labelled as such. */
export function backgroundBlock(text) {
  if (!text) return null;
  return h("div", { class: "nbg" }, h("div", { class: "nbg-h" }, "General explanation (AI, not from your videos)"), h("p", { class: "nbg-t" }, text));
}

/** AI answer from transcript moments, shown above the moments it cites. */
export function answerCard(r, opts = {}) {
  if (!r || (!r.answer && !r.background)) return null;
  return h("section", { class: "panel nans" },
    h("div", { class: "panel-h" }, h("h2", null, r.answer ? "Answer" : "Not covered in your videos"), h("span", { class: "pill " + (r.answer ? "cyan" : "dim") }, r.answer ? "AI, from the video transcript" : "general explanation")),
    r.answer ? h("p", { class: "nans-t" }, r.answer) : null,
    backgroundBlock(r.background),
    r.answer ? h("p", { class: "hint" }, "Numbers in brackets point to the moments below. Click a timestamp to play it.") : null);
}
