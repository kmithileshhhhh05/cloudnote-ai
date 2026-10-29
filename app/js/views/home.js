import { h, icon, clear, toast, fmtDuration, fmtTime } from "../ui.js";
import { cover, countUp, ring, skeleton } from "../art.js";
import { drawMap } from "./map.js";
import { statusChip } from "./common.js";
import { auth } from "../auth.js";

const greet = () => { const hr = new Date().getHours(); return hr < 5 ? "Working late" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"; };
const nameOf = (email) => { const n = (email || "").split("@")[0].replace(/[._-]+/g, " ").replace(/\d+/g, "").trim(); return n ? n.charAt(0).toUpperCase() + n.slice(1).split(" ")[0] : "there"; };
const flag = (k) => { try { return localStorage.getItem("cn.done." + k) === "1"; } catch { return false; } };
export const markDone = (k) => { try { localStorage.setItem("cn.done." + k, "1"); } catch { /* ignore */ } };

const EXAMPLES = ["Which port should the application use?", "What did we decide about the release date?", "Where did the speaker explain the database settings?", "What is still unexplained across my recordings?"];

export async function homeView({ view, api, app, go, refreshNotifs }) {
  let alive = true;
  const body = h("div", { class: "home" }, skeleton(4, "home-skel"));
  view.append(body);
  let videos, map, notifs;
  try { [videos, map, notifs] = await Promise.all([api.get("/videos"), api.get("/map"), api.get("/notifications")]); } catch (e) { clear(body); body.append(h("div", { class: "empty-state" }, h("h2", null, "Could not load your home"), h("p", null, e.message), h("button", { class: "btn btn-primary", onclick: () => go("/") }, "Try again"))); return () => {}; }
  if (!alive) return () => {};
  const vs = videos.videos, ready = vs.filter((v) => v.status === "ready");
  const hours = ready.reduce((a, v) => a + (v.duration || 0), 0) / 3600, moments = ready.reduce((a, v) => a + (v.chunkCount || 0), 0);
  const title = new Map(vs.map((v) => [v.id, v.title]));
  clear(body);

  // ---- hero ask bar ----
  const input = h("input", { type: "text", id: "home-ask", "aria-label": "Ask your library", autocomplete: "off", placeholder: EXAMPLES[0] });
  let ei = 0, timer = setInterval(() => { if (!alive || document.activeElement === input || input.value) return; ei = (ei + 1) % EXAMPLES.length; input.placeholder = EXAMPLES[ei]; }, 3200);
  const askForm = h("form", { class: "ask-hero", onsubmit: (e) => { e.preventDefault(); const q = input.value.trim(); go(q ? "/ask?q=" + encodeURIComponent(q) : "/ask"); } }, icon("spark", "ah-ic"), input, h("button", { class: "kbd-btn", type: "button", title: "Open the command bar", onclick: () => window.__cn.openPalette() }, "Ctrl K"), h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Ask"));
  body.append(h("div", { class: "home-head" }, h("div", null, h("span", { class: "eyebrow-s" }, new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })), h("h1", null, greet() + ", ", h("span", { class: "grad-text" }, nameOf(auth.user().email)), ".")), h("a", { class: "btn btn-primary", href: "#/upload" }, icon("plus"), " Add video")), askForm);

  // ---- KPIs ----
  const kpi = (ic, label, value, opts = {}, cls = "") => { const num = h("b", null, "0"); const tile = h("div", { class: "kpi " + cls }, h("span", { class: "kpi-ic" }, icon(ic)), num, h("span", { class: "kpi-l" }, label)); countUp(num, value, opts); return tile; };
  body.append(h("div", { class: "kpis" },
    kpi("film", "videos", vs.length), kpi("clock", "hours indexed", hours, { decimals: hours < 10 ? 1 : 0 }), kpi("note", "moments searchable", moments),
    kpi("compass", "open items", map.stats.gaps, {}, map.stats.gaps ? "warn" : "")));

  body.append(h("details", { class: "learn" }, h("summary", null, icon("info"), " What do these numbers mean?"), h("div", { class: "learn-b" },
    h("p", null, h("b", null, "Open items"), " are places where a video points outside itself and CloudNote AI has not found the answer yet."),
    h("ul", null, h("li", null, h("b", null, "Unresolved reference: "), "a speaker says something like \"as we covered earlier\" and no recording in your library explains it so far."), h("li", null, h("b", null, "Pending follow-up: "), "a speaker says \"in the next video\" and no later recording covers that topic yet.")),
    h("p", null, "Both resolve on their own. Add the missing video and you get a notification with the two moments side by side."))));

  // ---- attention + checklist ----
  const items = [];
  notifs.notifications.filter((n) => n.status === "new").forEach((n) => items.push({ tone: "cyan", ic: "bell", t: n.dir === "forward" ? "A follow-up may now be covered" : "A saved question may be answered", d: `${n.origin ? n.origin.title : "Your video"} ${n.origin ? fmtTime(n.origin.start) : ""} and ${n.candidate.title} ${fmtTime(n.candidate.start)} look related. Review and decide.`, act: ["Review", () => document.querySelector(".side .bell, .mtop .bell").click()] }));
  vs.filter((v) => v.status === "failed").forEach((v) => items.push({ tone: "red", ic: "warn", t: `"${v.title}" needs attention`, d: v.error || "Processing failed.", act: ["Open", () => go(`/v/${v.id}`)] }));
  map.gaps.filter((g) => g.kind === "promise").forEach((g) => items.push({ tone: "violet", ic: "flag", t: "Follow-up not yet covered", d: `${title.get(g.videoId) || "A video"} at ${fmtTime(g.at)} says "${g.phrase}". No later video covers it yet.`, act: ["See it", () => go(`/v/${g.videoId}?t=${Math.floor(g.at || 0)}&tab=context`)] }));
  map.gaps.filter((g) => g.kind !== "promise").forEach((g) => items.push({ tone: "amber", ic: "compass", t: "Unresolved reference", d: `${title.get(g.videoId) || "A video"} at ${fmtTime(g.at)} says "${g.phrase}" with no confirmed source${g.topic.length ? " (" + g.topic.slice(0, 3).join(", ") + ")" : ""}.`, act: ["Resolve", () => go(`/v/${g.videoId}?t=${Math.floor(g.at || 0)}&tab=context`)] }));
  vs.filter((v) => ["transcribing", "processing"].includes(v.status)).forEach((v) => items.push({ tone: "dim", ic: "clock", t: `Working on "${v.title}"`, d: v.status === "transcribing" ? "Transcribing speech." : "Writing notes and indexing.", act: ["Open", () => go(`/v/${v.id}`)] }));
  const attn = h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, "Needs your attention"), items.length ? h("span", { class: "pill amber" }, items.length) : null),
    items.length ? h("ul", { class: "attn" }, ...items.slice(0, 6).map((i) => h("li", { class: "attn-i " + i.tone }, h("span", { class: "ai-ic" }, icon(i.ic)), h("div", null, h("b", null, i.t), h("span", null, i.d)), h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: i.act[1] }, i.act[0]))))
      : h("div", { class: "all-good" }, h("span", { class: "ag-ic" }, icon("check")), h("div", null, h("b", null, vs.length ? "All clear" : "Nothing yet"), h("span", null, vs.length ? "Every reference has a source and every follow-up is covered." : "Add a video and your open questions will show up here."))));
  const steps = [
    ["Add your first video", "Upload a recording or import a transcript.", vs.length > 0, "/upload"],
    ["Ask your library a question", "Search by meaning and jump to the moment.", flag("ask"), "/ask"],
    ["Resolve a reference or follow-up", "Link what a video points to, or keep watching for it.", map.stats.linked > 0 || map.gaps.some((g) => g.pending), vs[0] ? `/v/${vs[0].id}?tab=context` : "/upload"],
    ["Check the library map", "See what depends on what, and what is missing.", flag("map"), "/map"],
  ];
  const done = steps.filter((s) => s[2]).length;
  const check = h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, done === steps.length ? "Library health" : "Getting started"), h("span", { class: "hint" }, done === steps.length ? "All steps done" : `${done} of ${steps.length}`)),
    done === steps.length
      ? h("div", { class: "health" }, ring(map.stats.explained, { size: 92, stroke: 9 }), h("div", null, h("b", null, "Resolved"), h("span", null, `${map.stats.linked} linked, ${map.stats.gaps} still open.`)))
      : h("div", { class: "check" }, h("div", { class: "check-ring" }, ring((done / steps.length) * 100, { size: 76 })), h("ul", null, ...steps.map(([t, d, ok, to]) => h("li", { class: ok ? "ok" : "" }, h("span", { class: "tick" }, ok ? icon("check") : null), h("a", { href: "#" + to }, h("b", null, t), h("span", null, d)))))));
  body.append(h("div", { class: "home-grid" }, attn, check));

  // ---- recent ----
  if (!vs.length) {
    body.append(h("section", { class: "panel hero-empty" }, h("div", { class: "he-art" }, cover("Your first video", { cls: "cover-xl" })), h("div", null, h("h2", null, "Start with a sample or your own recording"), h("p", null, "Load three tutorials to see notes, questions, references and follow-ups in action, or add a video of your own."), h("div", { class: "es-acts" }, h("button", { class: "btn btn-primary", type: "button", onclick: async () => { try { await api.post("/samples", { which: "basic" }); toast("Sample videos added. They are being analyzed."); go("/library"); } catch (e) { toast(e.message, "err"); } } }, icon("spark"), " Try with sample videos"), h("a", { class: "btn btn-ghost", href: "#/upload" }, icon("upload"), " Add a video")))));
  } else {
    body.append(h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, "Recent videos"), h("a", { class: "linkbtn", href: "#/library" }, "View all")),
      h("div", { class: "recents" }, ...vs.slice(0, 6).map((v) => h("a", { class: "recent", href: `#/v/${v.id}` }, cover(v.title, { kind: v.kind === "transcript" ? "transcript" : "video", bars: 28 }), h("div", { class: "rc-b" }, h("b", null, v.title), h("span", { class: "vc-meta" }, statusChip(v.status), v.status === "ready" ? h("span", null, fmtDuration(v.duration)) : null)))))));
  }

  // ---- map preview ----
  if (map.nodes.length) {
    const prev = h("a", { class: "map-prev", href: "#/map", "aria-label": "Open the library map" }, drawMap(map, go));
    body.append(h("section", { class: "panel" }, h("div", { class: "panel-h" }, h("h2", null, "Library map"), h("a", { class: "linkbtn", href: "#/map" }, "Open the map")), prev,
      h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--green)" } }), "confirmed"), h("span", null, h("i", { style: { background: "var(--amber)" } }), "unresolved"), h("span", null, h("i", { style: { background: "var(--cyan)" } }), "candidate"))));
  }
  return () => { alive = false; clearInterval(timer); };
}
