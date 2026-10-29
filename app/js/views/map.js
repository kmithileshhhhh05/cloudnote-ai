import { h, icon, clear, toast, fmtTime } from "../ui.js";
import { momentLink, copyText, highlight } from "./common.js";
import { markDone } from "./home.js";

const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } kids.forEach((k) => e.append(k)); return e; };

function layout(m) {
  const deps = {}; m.nodes.forEach((n) => (deps[n.id] = new Set()));
  m.edges.forEach((e) => { if (e.from !== e.to && deps[e.from]) deps[e.from].add(e.to); });
  const hasGap = new Set(m.gaps.map((g) => g.videoId));
  const depth = {}, visiting = new Set();
  const d = (id) => { if (depth[id] != null) return depth[id]; if (visiting.has(id)) return 0; visiting.add(id); let x = hasGap.has(id) ? 1 : 0; for (const dep of deps[id] || []) x = Math.max(x, d(dep) + 1); visiting.delete(id); return (depth[id] = x); };
  m.nodes.forEach((n) => d(n.id));
  const cols = {}; const place = (col, item) => { (cols[col] = cols[col] || []).push(item); };
  m.nodes.forEach((n) => place(depth[n.id], { kind: "video", id: n.id, title: n.title, sub: fmtTime(n.duration) }));
  m.gaps.forEach((g, i) => place(g.kind === "promise" ? depth[g.videoId] + 1 : Math.max(0, depth[g.videoId] - 1), { kind: "ghost", id: "gap" + i, gap: g, title: g.kind === "promise" ? "Follow-up, not yet covered" : "Missing explanation", sub: g.topic.slice(0, 3).join(", ") || "not uploaded yet" }));
  const maxCol = Math.max(0, ...Object.keys(cols).map(Number)), rows = Math.max(1, ...Object.values(cols).map((c) => c.length));
  const W = 236, Hh = 56, gx = 90, gy = 34;
  const pos = {};
  for (const [c, items] of Object.entries(cols)) items.forEach((it, r) => { it.x = 24 + Number(c) * (W + gx); it.y = 24 + r * (Hh + gy) + ((rows - items.length) * (Hh + gy)) / 2; pos[it.id] = it; });
  return { pos, W, Hh, width: 48 + (maxCol + 1) * W + maxCol * gx, height: 48 + rows * Hh + (rows - 1) * gy };
}

export function drawMap(m, go) {
  const L = layout(m);
  const svg = s("svg", { class: "map", viewBox: `0 0 ${L.width} ${L.height}`, role: "img", "aria-label": "Map of which videos depend on which" },
    s("defs", {}, s("marker", { id: "arr", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", fill: "#4de2a1" })),
      s("marker", { id: "arr2", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, s("path", { d: "M0,0 L10,5 L0,10 z", fill: "#ffc65c" }))));
  const link = (a, b, cls, label, marker) => {
    const x1 = a.x + L.W, y1 = a.y + L.Hh / 2, x2 = b.x, y2 = b.y + L.Hh / 2, mx = (x1 + x2) / 2;
    svg.append(s("path", { class: "ed " + cls, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, "marker-end": `url(#${marker})` }));
    const t = s("text", { class: "el " + cls, x: mx, y: (y1 + y2) / 2 - 6, "text-anchor": "middle" }); t.textContent = label; svg.append(t);
  };
  m.edges.forEach((e) => { const a = L.pos[e.to], b = L.pos[e.from]; if (a && b && a !== b) link(a, b, "ok", e.dir === "forward" ? `follow-up at ${fmtTime(e.toTime)}` : `at ${fmtTime(e.fromTime)}`, "arr"); });
  m.gaps.forEach((g, i) => { const gh = L.pos["gap" + i], v = L.pos[g.videoId]; if (!gh || !v) return; const cls = g.candidate ? "cand" : "gap"; g.kind === "promise" ? link(v, gh, cls, `follow-up at ${fmtTime(g.at)}`, "arr2") : link(gh, v, cls, `at ${fmtTime(g.at)}`, "arr2"); });
  Object.values(L.pos).forEach((n) => {
    const grp = s("g", { class: "gn " + (n.kind === "ghost" ? "ghost" : ""), transform: `translate(${n.x},${n.y})`, tabindex: n.kind === "video" ? "0" : "-1", role: n.kind === "video" ? "link" : "img", "aria-label": n.title + (n.sub ? ", " + n.sub : "") });
    grp.append(s("rect", { width: L.W, height: L.Hh, rx: 12 }));
    const t1 = s("text", { x: L.W / 2, y: 24, "text-anchor": "middle", class: "t1" }); t1.textContent = n.title.length > 28 ? n.title.slice(0, 27) + "..." : n.title;
    const t2 = s("text", { x: L.W / 2, y: 42, "text-anchor": "middle", class: "t2" }); t2.textContent = n.sub;
    grp.append(t1, t2);
    if (n.kind === "video") { grp.style.cursor = "pointer"; grp.addEventListener("click", () => go(`/v/${n.id}`)); grp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(`/v/${n.id}`); }); }
    svg.append(grp);
  });
  return svg;
}

function reportText(m) {
  const t = new Map(m.nodes.map((n) => [n.id, n.title]));
  const lines = ["CloudNote AI gaps report", `${m.stats.linked} linked, ${m.stats.gaps} open (${m.stats.promises || 0} pending follow-ups), ${m.stats.explained}% resolved`, ""];
  m.gaps.forEach((g, i) => lines.push(g.kind === "promise" ? `${i + 1}. ${t.get(g.videoId) || "Video"} ${fmtTime(g.at)}: "${g.phrase}" said something would come later, but no video covers it. Cover: ${g.topic.join(", ") || "the topic"}.` : `${i + 1}. ${t.get(g.videoId) || "Video"} ${fmtTime(g.at)}: "${g.phrase}" has no confirmed source. Cover: ${g.topic.join(", ") || "the referenced topic"}.`));
  if (!m.gaps.length) lines.push("No gaps. Every reference has a confirmed source.");
  return lines.join("\n");
}

export async function mapView({ view, api, go }) {
  markDone("map");
  let m;
  try { m = await api.get("/map"); } catch (e) { toast(e.message, "err"); view.append(h("div", { class: "empty-state" }, h("h2", null, "Could not load the map"), h("p", null, e.message), h("a", { class: "btn btn-primary", href: "#/map" }, "Try again"))); return () => {}; }
  const stat = (n, l, cls = "") => h("div", { class: "sumcell " + cls }, h("b", null, n), h("span", null, l));
  const head = h("div", { class: "page-head" }, h("div", null, h("h1", null, "Library map"), h("p", { class: "sub" }, "Which videos lean on which, the order to watch them in, and what your library assumes but never explains.")));
  if (!m.nodes.length) { view.append(head, h("div", { class: "empty-state" }, h("h2", null, "Nothing to map yet"), h("p", null, "Add videos, then link or remember the references they make."), h("a", { class: "btn btn-primary", href: "#/upload" }, "Add a video"))); return () => {}; }
  const vmap = new Map(m.nodes.map((n) => [n.id, n]));
  view.append(head,
    h("div", { class: "sumrow" }, stat(m.stats.linked, "linked", "g"), stat(m.stats.gaps - (m.stats.promises || 0), "unresolved references", "a"), stat(m.stats.promises || 0, "pending follow-ups", "v"), stat(m.stats.explained + "%", "resolved")),
    h("div", { class: "card mapcard" }, drawMap(m, go), h("div", { class: "legend" }, h("span", null, h("i", { style: { background: "var(--green)" } }), "confirmed link"), h("span", null, h("i", { style: { background: "var(--amber)" } }), "gap or remembered"), h("span", null, h("i", { style: { background: "var(--cyan)" } }), "candidate to review"))),
    h("div", { class: "two-col" },
      h("div", { class: "card" }, h("h3", null, "Suggested watch order"), h("p", { class: "hint" }, "Sources come before the videos that rely on them."), h("ol", { class: "wo" }, ...m.order.map((id, i) => h("li", null, h("span", { class: "n" }, i + 1), h("a", { href: `#/v/${id}` }, (vmap.get(id) || {}).title || id), m.gaps.some((g) => g.videoId === id) ? h("span", { class: "pill amber" }, "assumes missing knowledge") : null)))),
      h("div", { class: "card" }, h("div", { class: "rh", style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, h("h3", null, "Gaps and follow-ups report"), h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => copyText(reportText(m), "Gaps report copied.", toast) }, icon("copy"), " Copy report")),
        h("p", { class: "hint" }, "What your recordings assume viewers already know, and what they said would come later but never did."),
        h("div", { style: { display: "grid", gap: "10px" } }, ...(m.gaps.length ? m.gaps.map((g) => h("div", { class: "gapitem" },
          h("div", { class: "rh" }, h("span", { class: "pill " + (g.candidate ? "cyan" : g.kind === "promise" ? "violet" : "amber") }, g.candidate ? "candidate found" : g.kind === "promise" ? (g.pending ? "watching a follow-up" : "follow-up pending") : g.pending ? "remembered reference" : "unresolved reference"), h("span", { class: "hint" }, (vmap.get(g.videoId) || {}).title || "", " ", momentLink(g.videoId, g.at))),
          h("p", { class: "rq" }, ...highlight(g.text, g.phrase)),
          g.candidate ? h("div", { class: "hint" }, "Possible fix: ", h("a", { class: "ts-link", href: `#/v/${g.candidate.videoId}?t=${Math.floor(g.candidate.at || 0)}` }, (vmap.get(g.candidate.videoId) || {}).title || "a video"), ". Confirm it in notifications.")
            : h("div", { class: "hint" }, h("b", { style: { color: "var(--text)" } }, g.kind === "promise" ? "Follow-up not yet covered. Cover: " : "Record or upload a video covering: "), ...g.topic.map((w) => h("span", { class: "kw" }, w, " "))))) : [h("div", { class: "linked" }, icon("check"), h("span", null, "Every reference has a source and every follow-up is covered."))])))));
  return () => {};
}
