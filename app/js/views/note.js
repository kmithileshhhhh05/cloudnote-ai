// Full-page notes reader for one video: outline, in-note search with highlighting, and an AI question box scoped to this video.
import { h, icon, clear, toast, fmtTime, fmtDate } from "../ui.js";
import { cover, skeleton } from "../art.js";
import { copyText, downloadText } from "./common.js";

const SECTIONS = [["points", "Key points"], ["actions", "Action items"], ["decisions", "Decisions"]];

/** Highlights every occurrence of term (case-insensitive) using <mark>. Text is never parsed as HTML. */
function mark(text, term) {
  if (!term) return [text];
  const out = [], low = text.toLowerCase(), t = term.toLowerCase(); let i = 0, j;
  while ((j = low.indexOf(t, i)) >= 0) { if (j > i) out.push(text.slice(i, j)); out.push(h("mark", null, text.slice(j, j + t.length))); i = j + t.length; }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

export async function noteView({ view, api, id }) {
  let alive = true;
  const wrap = h("div", { class: "nread" }, skeleton(2, "grid-skel"));
  view.append(wrap);
  let item;
  try { item = (await api.get(`/notes/${id}`)).item; } catch (e) { clear(wrap); wrap.append(h("div", { class: "empty-state" }, h("h2", null, "Could not open these notes"), h("p", null, e.message), h("a", { class: "btn btn-primary", href: "#/notes" }, "Back to notes"))); return () => {}; }
  if (!alive) return () => {};
  const { video, notes, mine } = item;
  const search = h("input", { type: "search", class: "nr-search", placeholder: "Search in these notes", "aria-label": "Search in these notes", oninput: () => paint() });
  const count = h("span", { class: "nr-count hint", "aria-live": "polite" });
  const body = h("div", { class: "nr-body" });
  const outline = h("nav", { class: "nr-outline", "aria-label": "Sections" });
  const ts = (start) => start == null ? null : h("a", { class: "ts", href: `#/v/${video.id}?t=${Math.floor(start)}` }, fmtTime(start));
  const md = () => { const li = (a) => (a && a.length ? a.map((i) => `- ${i.text}${i.start != null ? ` (${fmtTime(i.start)})` : ""}`).join("\n") : "- None"); return `# ${video.title}\n\n${notes ? notes.summary : ""}\n\n## Key points\n${li(notes && notes.points)}\n\n## Action items\n${li(notes && notes.actions)}\n\n## Decisions\n${li(notes && notes.decisions)}\n` + (mine ? `\n## My notes\n${mine.text}\n` : ""); };

  // ---- ask this note ----
  const askIn = h("input", { type: "text", "aria-label": "Ask about these notes", placeholder: "Ask a question about this video's notes", autocomplete: "off", maxlength: 300 });
  const askBtn = h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Ask");
  const answer = h("div", { class: "nask-out", "aria-live": "polite" });
  async function ask(q) {
    q = q.trim(); if (!q) { askIn.focus(); return; }
    askBtn.disabled = true; askBtn.textContent = "Thinking..."; clear(answer); answer.append(skeleton(1, "ans-skel"));
    try {
      const r = await api.post("/notes/ask", { q, video: video.id }); if (!alive) return; clear(answer);
      const src = r.results.map((x) => h("li", null, h("a", { href: `#/v/${x.videoId}` + (x.start != null ? `?t=${Math.floor(x.start)}` : "") }, h("span", { class: "pill dim" }, x.label), x.start != null ? [" ", h("span", { class: "ts" }, fmtTime(x.start))] : null), h("p", null, x.text)));
      answer.append(h("section", { class: "panel nans" }, h("div", { class: "panel-h" }, h("h2", null, r.answer ? "Answer" : r.results.length ? (r.source === "ai" ? "No direct answer, closest notes" : "Matching notes") : "No match"), h("span", { class: "pill " + (r.answer ? "cyan" : "dim") }, r.answer ? "AI, from these notes" : r.source === "ai" ? "AI found no answer" : "keyword search")), r.answer ? h("p", { class: "nans-t" }, r.answer) : (r.results.length ? null : h("p", { class: "nans-t" }, "Nothing in these notes matches that question.")), src.length ? h("ul", { class: "nsrc" }, ...src) : null));
    } catch (e) { clear(answer); toast(e.message, "err"); }
    askBtn.disabled = false; askBtn.textContent = "Ask";
  }

  function paint() {
    const term = search.value.trim(); const low = term.toLowerCase();
    clear(body); clear(outline);
    let total = 0; const secs = [];
    const has = (t) => !low || t.toLowerCase().includes(low);
    const addSec = (key, label, node, n) => { secs.push([key, label, n]); body.append(node); };
    if (notes && (has(notes.summary))) { total += low ? 1 : 0; addSec("summary", "Summary", h("section", { class: "nd-sec", id: "sec-summary" }, h("h3", null, "Summary"), h("p", { class: "nc-sum" }, ...mark(notes.summary, term))), 1); }
    if (notes) SECTIONS.forEach(([k, label]) => {
      const rows = notes[k].filter((i) => has(i.text)); if (!rows.length) return; total += low ? rows.length : 0;
      addSec(k, label, h("section", { class: "nd-sec", id: "sec-" + k }, h("h3", null, label, " ", h("span", { class: "hint" }, rows.length)), h("ul", { class: "nlist" }, ...rows.map((i) => h("li", null, ...mark(i.text, term), " ", ts(i.start))))), rows.length);
    });
    if (mine && has(mine.text)) { total += low ? 1 : 0; addSec("mine", "My notes", h("section", { class: "nd-sec nc-mine", id: "sec-mine" }, h("h3", null, "My notes", mine.updatedAt ? ` (saved ${fmtDate(mine.updatedAt)})` : ""), h("p", null, ...mark(mine.text, term))), 1); }
    if (!secs.length) body.append(h("div", { class: "nomatch" }, low ? `Nothing in these notes matches "${term}".` : "There are no notes for this video yet."));
    secs.forEach(([k, l, n]) => outline.append(h("button", { type: "button", class: "nr-o", onclick: () => { const el = document.getElementById("sec-" + k); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); } }, l, h("em", null, n))));
    count.textContent = low ? (total ? `${total} matching item${total === 1 ? "" : "s"}` : "No matches") : "";
  }

  clear(wrap);
  wrap.append(
    h("a", { class: "back", href: "#/notes" }, "Notes"),
    h("div", { class: "nr-head" }, h("div", { class: "nc-cov nr-cov" }, cover(video.title, { kind: video.kind === "transcript" ? "transcript" : "video", bars: 20 })), h("div", { class: "nr-title" }, h("h1", null, video.title), h("div", { class: "vc-meta" }, h("span", { class: "pill " + (notes && notes.source === "model" ? "cyan" : "dim") }, notes ? (notes.source === "model" ? "AI notes" : "Extractive notes") : "No notes"), h("span", null, fmtDate(video.createdAt)), notes ? h("span", null, `${notes.points.length} points, ${notes.actions.length} actions, ${notes.decisions.length} decisions`) : null)),
      h("div", { class: "head-acts" }, h("a", { class: "btn btn-primary btn-sm", href: `#/v/${video.id}` }, icon("play"), " Open video"), h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => copyText(md(), "Notes copied as Markdown.", toast) }, icon("copy"), " Copy"), h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => downloadText(`${video.title.replace(/[^\w-]+/g, "-")}-notes.md`, md()) }, icon("download"), " .md"))),
    h("div", { class: "nr-tools" }, h("div", { class: "nr-sbox" }, icon("search"), search, count), h("form", { class: "ask-hero nask", onsubmit: (e) => { e.preventDefault(); ask(askIn.value); } }, icon("spark", "ah-ic"), askIn, askBtn)),
    answer,
    h("div", { class: "nr-layout" }, outline, body));
  paint();
  const onKey = (e) => { if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); search.focus(); } };
  document.addEventListener("keydown", onKey);
  return () => { alive = false; document.removeEventListener("keydown", onKey); };
}
