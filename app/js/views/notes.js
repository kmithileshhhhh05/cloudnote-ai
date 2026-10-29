import { h, icon, clear, toast, fmtTime, fmtDate } from "../ui.js";
import { cover, skeleton } from "../art.js";
import { copyText, downloadText } from "./common.js";

const SECTIONS = [["points", "Key points"], ["actions", "Action items"], ["decisions", "Decisions"]];
const SUGGEST = ["What did we decide?", "What are the action items?", "Which port should the application use?"];

export async function notesView({ view, api }) {
  let items = [], kind = "all", alive = true;
  const filter = h("input", { type: "search", class: "lib-search", placeholder: "Filter notes", "aria-label": "Filter notes", oninput: () => paint() });
  const chips = h("div", { class: "chips" });
  const grid = h("div", { class: "ngrid", "aria-live": "polite" }, skeleton(3, "grid-skel"));
  const acts = h("div", { class: "head-acts" });
  const askIn = h("input", { type: "text", "aria-label": "Ask your notes", placeholder: "Ask your notes, for example: " + SUGGEST[0], autocomplete: "off", maxlength: 300 });
  const askBtn = h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Ask");
  const answer = h("div", { class: "nask-out", "aria-live": "polite" });
  const askForm = h("form", { class: "ask-hero nask", onsubmit: (e) => { e.preventDefault(); ask(askIn.value); } }, icon("spark", "ah-ic"), askIn, askBtn);
  const sug = h("div", { class: "nask-sug" }, ...SUGGEST.map((q) => h("button", { type: "button", class: "chip", onclick: () => { askIn.value = q; ask(q); } }, q)));
  view.append(h("div", { class: "page-head" }, h("div", null, h("h1", null, "Notes"), h("p", { class: "sub" }, "Your saved notes from every video. Open a card to read the full notes, search inside them, or ask a question across all of them.")), acts), askForm, sug, answer, h("div", { class: "lib-bar" }, filter, chips), grid);

  const hit = (t, term) => !term || (t || "").toLowerCase().includes(term);
  const ts = (id, start) => start == null ? null : h("a", { class: "ts", href: `#/v/${id}?t=${Math.floor(start)}` }, fmtTime(start));

  async function ask(q) {
    q = (q || "").trim(); if (!q) { askIn.focus(); return; }
    askBtn.disabled = true; askBtn.textContent = "Thinking..."; clear(answer); answer.append(skeleton(1, "ans-skel"));
    try {
      const r = await api.post("/notes/ask", { q }); if (!alive) return; clear(answer);
      const src = r.results.map((x) => h("li", null, h("a", { href: `#/v/${x.videoId}` + (x.start != null ? `?t=${Math.floor(x.start)}` : "") }, h("b", null, x.title), " ", h("span", { class: "pill dim" }, x.label), x.start != null ? [" ", h("span", { class: "ts" }, fmtTime(x.start))] : null), h("p", null, x.text)));
      if (r.answer) answer.append(h("section", { class: "panel nans" }, h("div", { class: "panel-h" }, h("h2", null, "Answer"), h("span", { class: "pill cyan" }, "AI, from your notes")), h("p", { class: "nans-t" }, r.answer), h("div", { class: "hint" }, "Sources"), h("ul", { class: "nsrc" }, ...src), h("p", { class: "hint" }, "Generated from your notes only. Check the linked moments before relying on it.")));
      else if (r.results.length) answer.append(h("section", { class: "panel nans" }, h("div", { class: "panel-h" }, h("h2", null, r.source === "ai" ? "No direct answer, closest notes" : "Matching notes"), h("span", { class: "pill dim" }, r.source === "ai" ? "AI found no answer" : "keyword search")), h("ul", { class: "nsrc" }, ...src), r.source === "keyword" ? h("p", { class: "hint" }, "AI answers are not available here, so these are the best keyword matches.") : null));
      else answer.append(h("section", { class: "panel nans" }, h("p", { class: "nans-t" }, items.length ? "Nothing in your notes matches that question." : "You have no notes yet. Add a video first.")));
    } catch (e) { clear(answer); toast(e.message, "err"); }
    askBtn.disabled = false; askBtn.textContent = "Ask";
  }

  function markdown(subset) {
    return subset.map(({ video, notes, mine }) => {
      const li = (a) => (a && a.length ? a.map((i) => `- ${i.text}${i.start != null ? ` (${fmtTime(i.start)})` : ""}`).join("\n") : "- None");
      return `# ${video.title}\n\n${notes ? notes.summary : ""}\n\n## Key points\n${li(notes && notes.points)}\n\n## Action items\n${li(notes && notes.actions)}\n\n## Decisions\n${li(notes && notes.decisions)}\n` + (mine ? `\n## My notes\n${mine.text}\n` : "");
    }).join("\n---\n\n");
  }
  function filtered() {
    const term = filter.value.trim().toLowerCase();
    return items.filter(({ video, notes, mine }) => {
      if (kind === "mine") return !!mine && (hit(mine.text, term) || hit(video.title, term));
      if (kind !== "all" && !(notes && notes[kind].length)) return false;
      return !term || hit(video.title, term) || (notes && (hit(notes.summary, term) || SECTIONS.some(([k]) => notes[k].some((i) => hit(i.text, term))))) || (mine && hit(mine.text, term));
    });
  }

  function paint() {
    clear(grid); clear(chips); clear(acts);
    if (!items.length) { grid.append(h("div", { class: "empty-state nfull" }, h("div", { class: "es-ic" }, icon("note")), h("h2", null, "No notes yet"), h("p", null, "Notes appear here once a video has been processed. Add a video or load the sample videos to see them."), h("div", { class: "es-acts" }, h("a", { class: "btn btn-primary", href: "#/upload" }, icon("plus"), " Add video"), h("a", { class: "btn btn-ghost", href: "#/library" }, "Go to library")))); return; }
    const mineCount = items.filter((i) => i.mine).length;
    [["all", `All ${items.length}`], ["points", "Key points"], ["actions", "Actions"], ["decisions", "Decisions"], ["mine", `My notes ${mineCount}`]].forEach(([k, l]) => chips.append(h("button", { type: "button", class: "chip" + (kind === k ? " on" : ""), "aria-pressed": String(kind === k), onclick: () => { kind = k; paint(); } }, l)));
    const shown = filtered();
    acts.append(h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => copyText(markdown(shown), "Notes copied as Markdown.", toast) }, icon("copy"), " Copy all"), h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => downloadText("cloudnote-notes.md", markdown(shown)) }, icon("download"), " Download .md"));
    if (!shown.length) { grid.append(h("div", { class: "nomatch nfull" }, "No notes match that filter.")); return; }
    shown.forEach((it) => {
      const { video, notes, mine } = it, n = (k) => (notes ? notes[k].length : 0);
      const first = notes && notes.points[0] ? notes.points[0].text : "";
      const card = h("a", { class: "ncard-s", href: `#/notes/${video.id}`, "aria-label": `Read notes for ${video.title}` },
        h("div", { class: "ncs-cov" }, cover(video.title, { kind: video.kind === "transcript" ? "transcript" : "video", bars: 30 })),
        h("div", { class: "ncs-b" }, h("h3", null, video.title), h("p", { class: "ncs-sum" }, (notes && notes.summary) || (mine ? mine.text : "No notes yet.")), first ? h("p", { class: "ncs-pt" }, first) : null,
          h("div", { class: "ncs-m" }, h("span", { class: "pill dim" }, n("points") + " points"), n("actions") ? h("span", { class: "pill green" }, n("actions") + " actions") : null, n("decisions") ? h("span", { class: "pill cyan" }, n("decisions") + " decisions") : null, mine ? h("span", { class: "pill violet" }, "my notes") : null, h("span", { class: "ncs-go" }, "Read ", icon("arrow")))));
      grid.append(card);
    });
  }
  try { items = (await api.get("/notes")).items; } catch (e) { toast(e.message, "err"); }
  if (!alive) return () => {};
  paint();
  return () => { alive = false; };
}
