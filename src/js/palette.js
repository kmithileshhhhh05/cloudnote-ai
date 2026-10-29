// Command palette: searches the site itself with the same TF-IDF engine the demo uses.
import { $, $$, esc } from "./util.js";
import { buildIndex, search } from "./nlp.js";
import { PAPERS, FAQ, PIPELINE, ARCH } from "./content.js";

const ON_PROJECT = document.body.dataset.page === "project";
const PROJECT_IDS = new Set(["#architecture", "#research", "#plan", "#team", "#references"]);
const SECTIONS = [
  ["#problem", "The problem", "References without a source, notes that drift, hours of re-watching"],
  ["#platform", "The platform", "Transcripts, notes, summaries, timestamps, action items, semantic search"],
  ["#features", "Three proposed extensions", "Context Recovery, My Notes vs Video, Remember the Missing Explanation"],
  ["#demo", "Live demo", "Play the tutorial, confirm links, upload tomorrow's video"],
  ["#pipeline", "How it works", "Login, store, transcribe, notes, semantic search"],
  ["#architecture", "Architecture", "CloudFront, Cognito, API Gateway, Lambda, S3, Transcribe, Bedrock, DynamoDB"],
  ["#research", "Literature survey", "Fifteen papers and the research gap"],
  ["#plan", "Plan and evaluation", "Implementation estimate, evaluation checks, free-tier costs"],
  ["#roadmap", "Audience and roadmap", "Students, professionals, educators, future enhancements"],
  ["#faq", "FAQ", "What is real, what is illustrative, what is not claimed"],
  ["#team", "Team and guide", "Mithilesh, Nithin, Sai Chetan, Dr. Neelima Gogineni"],
  ["#references", "References", "DOIs and implementation links"],
];

export function initPalette(api) {
  const pal = $("#pal"), input = $("#pal-q"), list = $("#pal-list");
  const items = [];
  SECTIONS.forEach(([href, t, s]) => items.push({ kind: "Section", title: t, sub: s, href, text: t + " " + s }));
  items.push({ kind: "Feature", title: "Video Context Recovery", sub: "Finds supporting excerpts for 'as discussed earlier'", href: "#demo", tab: "context", text: "context recovery earlier reference previous video excerpt supporting source timestamp" });
  items.push({ kind: "Feature", title: "My Notes vs Video", sub: "Covered points, missed points, mismatches", href: "#demo", tab: "notes", text: "notes compare video transcript covered missed mismatch personal review port" });
  items.push({ kind: "Feature", title: "Remember the Missing Explanation", sub: "Pending references and notifications after future uploads", href: "#demo", tab: "remember", text: "remember missing explanation pending reference future upload notification worker" });
  items.push({ kind: "Feature", title: "Notes and Ask", sub: "Auto notes, action items, decisions, and questions answered with moments", href: "#demo", tab: "ask", text: "notes ask question search summary key points action items decisions download markdown moment timestamp" });
  items.push({ kind: "Demo", title: "Play the 60-second story", sub: "A guided run of the whole demo", href: "#demo", text: "story tour guided walkthrough watch demo automatically" });
  items.push({ kind: "Feature", title: "Follow-up Tracker", sub: "Catches 'in the next video' follow-ups and checks whether later recordings covered them", href: "#features", text: "promise tracker forward reference next video next time later series uncovered topics follow through" });
  items.push({ kind: "Feature", title: "Library Map", sub: "Dependency map, watch order and gaps report for instructors and teams", href: "#demo", tab: "map", text: "library map dependency graph watch order gaps report instructors teams missing prerequisite assumed knowledge" });
  PIPELINE.forEach((p) => items.push({ kind: "Pipeline", title: p.title, sub: p.body, href: "#pipeline", text: p.title + " " + p.body }));
  ARCH.zones.forEach((z) => z.nodes.forEach((n) => items.push({ kind: "Stack", title: n.name, sub: n.desc, href: "#architecture", text: n.name + " " + n.role + " " + n.desc })));
  PAPERS.forEach((p) => items.push({ kind: "Paper", title: p.title, sub: `${p.authors}, ${p.year}, ${p.venue}`, href: "#research", paper: p, text: [p.title, p.authors, p.technique, p.data, p.params, p.inference, p.objective].join(" ") }));
  FAQ.forEach((f, i) => items.push({ kind: "FAQ", title: f.q, sub: f.a.slice(0, 110) + "...", href: "#faq", faq: i, text: f.q + " " + f.a }));

  const idx = buildIndex(items.map((it, i) => ({ id: String(i), videoId: "site", start: 0, text: it.text })));
  let results = [], sel = 0, lastFocus = null;

  function rank(q) {
    q = q.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    const terms = q.split(/\s+/);
    const sub = items.filter((it) => { const h = (it.title + " " + it.text).toLowerCase(); return terms.every((t) => h.includes(t)); })
      .sort((a, b) => (b.title.toLowerCase().includes(q) ? 1 : 0) - (a.title.toLowerCase().includes(q) ? 1 : 0));
    const sem = search(idx, q, { k: 8, dropMeta: false }).filter((h) => h.score > 0.12).map((h) => items[+h.chunk.id]);
    const seen = new Set(), out = [];
    [...sub, ...sem].forEach((it) => { if (!seen.has(it)) { seen.add(it); out.push(it); } });
    return out.slice(0, 12);
  }
  function paint() {
    list.innerHTML = results.length ? results.map((r, i) => `<button type="button" class="pal-item" role="option" id="po-${i}" aria-selected="${i === sel}" data-i="${i}"><span class="k">${esc(r.kind)}</span><span><span class="tt">${esc(r.title)}</span><span class="ss">${esc(r.sub.length > 120 ? r.sub.slice(0, 118) + "..." : r.sub)}</span></span></button>`).join("") : `<div class="pal-empty">Nothing found. Try "whisper", "port", "retrieval" or "cost".</div>`;
    input.setAttribute("aria-activedescendant", results.length ? "po-" + sel : "");
    const s = $(`#po-${sel}`); if (s) s.scrollIntoView({ block: "nearest" });
  }
  function open() {
    lastFocus = document.activeElement;
    pal.classList.add("open"); pal.setAttribute("aria-hidden", "false");
    input.value = ""; results = rank(""); sel = 0; paint(); input.focus();
    document.body.style.overflow = "hidden";
  }
  function close() {
    pal.classList.remove("open"); pal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function go(it) {
    close();
    if (it.tab && api.workspace) api.workspace.openTab(it.tab);
    if (it.paper && $("#p-q")) {
      const q = $("#p-q"); q.value = it.paper.title.split(":")[0]; q.dispatchEvent(new Event("input"));
    }
    if (it.faq !== undefined) { const d = $$("#faq-list details")[it.faq]; if (d) d.open = true; }
    const t = $(it.href);
    if (t) setTimeout(() => t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 30);
    else location.href = (PROJECT_IDS.has(it.href) ? "project.html" : "about.html") + it.href;
  }
  input.addEventListener("input", () => { results = rank(input.value); sel = 0; paint(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[sel]) go(results[sel]); }
    else if (e.key === "Tab") { e.preventDefault(); }
  });
  list.addEventListener("click", (e) => { const b = e.target.closest(".pal-item"); if (b) go(results[+b.dataset.i]); });
  pal.addEventListener("click", (e) => { if (e.target === pal) close(); });
  document.addEventListener("keydown", (e) => {
    const typing = /^(input|textarea|select)$/i.test(document.activeElement && document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.classList.contains("open") ? close() : open(); }
    else if (e.key === "/" && !typing && !pal.classList.contains("open")) { e.preventDefault(); open(); }
    else if (e.key === "Escape" && pal.classList.contains("open")) close();
  });
  $("#open-pal").addEventListener("click", open);
  $$("[data-pal]").forEach((b) => b.addEventListener("click", open));
}
