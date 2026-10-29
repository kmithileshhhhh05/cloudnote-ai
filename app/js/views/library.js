import { h, icon, clear, toast, fmtDuration, fmtDate, confirmDialog } from "../ui.js";
import { statusChip } from "./common.js";
import { cover, skeleton } from "../art.js";
import { tilt } from "../fx.js";

export async function libraryView({ view, api, app, go, refreshNotifs }) {
  let videos = [], timer = null, alive = true, wasBusy = false, sort = "new", status = "all", mode = "grid";
  const search = h("input", { type: "search", class: "lib-search", placeholder: "Filter by title", "aria-label": "Filter videos by title", oninput: () => paint() });
  const sortSel = h("select", { class: "sel", "aria-label": "Sort", onchange: () => { sort = sortSel.value; paint(); } }, h("option", { value: "new" }, "Newest first"), h("option", { value: "old" }, "Oldest first"), h("option", { value: "title" }, "Title A to Z"), h("option", { value: "long" }, "Longest first"));
  const chips = h("div", { class: "chips" });
  const toggle = h("div", { class: "seg small", role: "group", "aria-label": "Layout" }, h("button", { type: "button", "aria-selected": "true", "aria-label": "Grid", onclick: (e) => setMode("grid", e) }, icon("grid")), h("button", { type: "button", "aria-selected": "false", "aria-label": "List", onclick: (e) => setMode("list", e) }, icon("list")));
  function setMode(m, e) { mode = m; [...toggle.children].forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); paint(); }
  const head = h("div", { class: "page-head" }, h("div", null, h("h1", null, "Library"), h("p", { class: "sub", id: "lib-sub" }, "")), h("a", { class: "btn btn-primary", href: "#/upload" }, icon("plus"), " Add video"));
  const banner = h("div", { id: "banner" });
  const bar = h("div", { class: "lib-bar" }, search, chips, h("span", { class: "sp" }), sortSel, toggle);
  const grid = h("div", { class: "vgrid", "aria-live": "polite" }, skeleton(3, "grid-skel"));
  view.append(head, banner, bar, grid);

  async function sample(which) {
    try { await api.post("/samples", { which }); toast(which === "basic" ? "Sample videos added. They are being analyzed." : which === "database" ? "Database Tutorial added." : "Monitoring and Alerts added."); await load(); refreshNotifs(); }
    catch (e) { toast(e.message, "err"); }
  }
  function card(v) {
    const ready = v.status === "ready";
    return h("article", { class: "vcard-lib" + (ready ? "" : " busy") + (mode === "list" ? " row" : "") },
      h("a", { class: "vc-link", href: `#/v/${v.id}`, "aria-label": `Open ${v.title}` }),
      h("div", { class: "vc-thumb" }, cover(v.title, { kind: v.kind === "transcript" ? "transcript" : "video", bars: mode === "list" ? 18 : 40 }), h("span", { class: "vc-tag" }, v.sample ? "sample" : v.kind === "transcript" ? "transcript" : "video"), ready && v.duration ? h("span", { class: "vc-dur" }, fmtDuration(v.duration)) : null),
      h("div", { class: "vc-body" }, h("h3", null, v.title), h("div", { class: "vc-meta" }, statusChip(v.status), ready ? h("span", null, v.chunkCount + " moments") : null, h("span", null, fmtDate(v.createdAt))),
        v.status === "failed" ? h("p", { class: "vc-err" }, v.error || "Something went wrong.") : null),
      h("button", { class: "vc-del", type: "button", "aria-label": `Delete ${v.title}`, title: "Delete", onclick: async (e) => { e.preventDefault(); e.stopPropagation(); if (await confirmDialog("Delete this video?", `"${v.title}" and its notes, transcript and links will be removed.`)) { try { await api.del(`/videos/${v.id}`); toast("Deleted."); await load(); refreshNotifs(); } catch (er) { toast(er.message, "err"); } } } }, icon("trash")));
  }
  function paint() {
    document.getElementById("lib-sub").textContent = videos.length ? `${videos.length} video${videos.length === 1 ? "" : "s"}, ${videos.filter((v) => v.status === "ready").length} ready` : "Everything you upload lives here.";
    clear(grid); clear(banner); clear(chips);
    grid.className = "vgrid" + (mode === "list" ? " list" : "");
    bar.hidden = !videos.length;
    if (!videos.length) {
      grid.append(h("div", { class: "empty-state" }, h("div", { class: "es-ic" }, icon("film")), h("h2", null, "Add your first video"), h("p", null, "Upload a recording or import a transcript. CloudNote AI turns it into notes you can search and connects it to your other videos."),
        h("div", { class: "es-acts" }, h("a", { class: "btn btn-primary", href: "#/upload" }, icon("upload"), " Upload a video"), h("button", { class: "btn btn-ghost", type: "button", onclick: () => sample("basic") }, icon("spark"), " Try with sample videos"))));
      return;
    }
    const counts = { all: videos.length, ready: 0, busy: 0, failed: 0 };
    videos.forEach((v) => { if (v.status === "ready") counts.ready++; else if (v.status === "failed") counts.failed++; else counts.busy++; });
    [["all", "All"], ["ready", "Ready"], ["busy", "In progress"], ["failed", "Failed"]].filter(([k]) => k === "all" || counts[k]).forEach(([k, l]) => chips.append(h("button", { type: "button", class: "chip" + (status === k ? " on" : ""), "aria-pressed": String(status === k), onclick: () => { status = k; paint(); } }, `${l} ${counts[k]}`)));
    const hasBasic = videos.some((v) => v.sample && v.title === "Server Setup"), hasDb = videos.some((v) => v.sample && v.title === "Database Tutorial"), hasMon = videos.some((v) => v.sample && v.title === "Monitoring and Alerts");
    if (hasBasic && !hasDb) banner.append(h("div", { class: "banner" }, icon("compass"), h("div", null, h("b", null, "Try the missing-explanation flow"), h("span", null, " Open Application Setup Tutorial, keep watching for the 06:10 reference, then add the next sample. It answers that question automatically.")), h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => sample("database") }, "Add Database Tutorial")));
    if (hasBasic && hasDb && !hasMon) banner.append(h("div", { class: "banner" }, icon("flag"), h("div", null, h("b", null, "Try the follow-up flow"), h("span", null, " Open Application Setup Tutorial, go to the Context tab and choose to watch for the follow-up at 13:40 (\"in the next tutorial we will set up monitoring and alerts\"). Then add this sample and you will be notified that it is covered.")), h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => sample("monitoring") }, "Add Monitoring and Alerts")));
    const term = search.value.trim().toLowerCase();
    let shown = videos.filter((v) => (!term || v.title.toLowerCase().includes(term)) && (status === "all" || (status === "ready" ? v.status === "ready" : status === "failed" ? v.status === "failed" : !["ready", "failed"].includes(v.status))));
    shown = shown.slice().sort((a, b) => (sort === "old" ? a.createdAt - b.createdAt : sort === "title" ? a.title.localeCompare(b.title) : sort === "long" ? (b.duration || 0) - (a.duration || 0) : b.createdAt - a.createdAt));
    if (!shown.length) grid.append(h("div", { class: "nomatch" }, "No videos match that filter."));
    shown.forEach((v) => { const c = card(v); if (mode === "grid") tilt(c, 6); grid.append(c); });
  }
  async function load() {
    try { videos = (await api.get("/videos")).videos; } catch (e) { toast(e.message, "err"); return; }
    if (!alive) return;
    paint(); clearTimeout(timer);
    const busy = videos.some((v) => ["transcribing", "processing"].includes(v.status));
    if (wasBusy && !busy) refreshNotifs();
    wasBusy = busy;
    if (busy) timer = setTimeout(load, 3000);
  }
  await load();
  return () => { alive = false; clearTimeout(timer); };
}
