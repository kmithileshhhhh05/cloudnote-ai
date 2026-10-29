import { h, icon, clear, toast, fmtTime, fmtDuration, debounce, confirmDialog, promptDialog } from "../ui.js";
import { statusChip, momentLink, momentCard, highlight, copyText, downloadText, knowMore } from "./common.js";

const stripBullet = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();

export async function videoView({ view, api, app, id, q, go, refreshNotifs }) {
  let alive = true, wasBusy = false, timer = null, data = null, chunks = [], tab = ["notes", "ask", "context", "compare"].includes(q.tab) ? q.tab : "notes";
  let media = null, rows = [], activeIdx = -1, refsState = null;
  const root = h("div", { class: "vpage" });
  view.append(root);

  async function load() {
    try { data = await api.get(`/videos/${id}`); } catch (e) { clear(root); root.append(h("div", { class: "empty-state" }, h("h2", null, e.status === 404 ? "Video not found" : "Could not load this video"), h("p", null, e.message), h("a", { class: "btn btn-primary", href: "#/" }, "Back to your library"))); return; }
    if (!alive) return;
    document.title = data.video.title + " | CloudNote AI";
    if (data.video.status === "ready") { if (wasBusy) refreshNotifs(); chunks = (await api.get(`/videos/${id}/transcript`)).chunks; renderReady(); }
    else { wasBusy = true; renderBusy(); clearTimeout(timer); if (["transcribing", "processing"].includes(data.video.status)) timer = setTimeout(load, 3000); }
  }

  const head = (v) => h("div", { class: "page-head" },
    h("div", null, h("a", { class: "back", href: "#/library" }, "Library"), h("h1", null, v.title), h("div", { class: "vc-meta" }, statusChip(v.status), v.status === "ready" ? [h("span", null, fmtDuration(v.duration)), h("span", null, v.chunkCount + " moments"), h("span", { class: "pill " + (v.notesSource === "model" ? "cyan" : "dim"), title: v.notesNote || "" }, v.notesSource === "model" ? "AI notes" : "extractive notes")] : null)),
    h("div", { class: "head-acts" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: rename }, icon("note"), " Rename"), v.status === "ready" ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: reprocess }, icon("refresh"), " Reprocess") : null, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: remove }, icon("trash"), " Delete")));

  async function rename() { const t = await promptDialog("Rename video", "Title", data.video.title); if (!t || t === data.video.title) return; try { await api.patch(`/videos/${id}`, { title: t }); toast("Renamed."); await load(); } catch (e) { toast(e.message, "err"); } }
  async function remove() { if (await confirmDialog("Delete this video?", `"${data.video.title}" and its notes, transcript and links will be removed.`)) { try { await api.del(`/videos/${id}`); toast("Deleted."); refreshNotifs(); go("/library"); } catch (e) { toast(e.message, "err"); } } }
  async function reprocess() { try { await api.post(`/videos/${id}/reprocess`); toast("Reprocessing."); load(); } catch (e) { toast(e.message, "err"); } }

  // ---------- busy / failed ----------
  function renderBusy() {
    const v = data.video, isMedia = v.kind === "media";
    const steps = isMedia ? ["Uploaded", "Transcribing speech", "Writing notes and indexing", "Ready"] : ["Imported", "Writing notes and indexing", "Ready"];
    const cur = v.status === "awaiting_upload" ? 0 : v.status === "transcribing" ? 1 : isMedia ? 2 : 1;
    clear(root);
    root.append(head(v), h("div", { class: "card busy-card" },
      v.status === "failed" ? h("div", null, h("h3", { style: { color: "var(--red)" } }, "This video could not be processed"), h("p", null, v.error || "Something went wrong."), h("div", { class: "acts" }, h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: async () => { try { await api.post(v.kind === "media" && !v.chunkCount ? `/videos/${id}/start` : `/videos/${id}/reprocess`); toast("Trying again."); load(); } catch (e) { toast(e.message, "err"); } } }, icon("refresh"), " Try again")))
        : v.status === "awaiting_upload" ? h("div", null, h("h3", null, "Waiting for the upload to finish"), h("p", null, "If you closed the page during the upload, delete this video and add it again."))
        : h("div", null, h("h3", null, "Working on it"), h("p", null, isMedia ? "Transcribing usually takes a fraction of the video's length. You can leave this page and come back." : "Analyzing the transcript. This takes a few seconds.")),
      v.status !== "failed" ? h("ol", { class: "steps-s" }, ...steps.map((s, i) => h("li", { class: i < cur ? "done" : i === cur ? "now" : "" }, h("i", null, i < cur ? icon("check") : String(i + 1)), h("span", null, s)))) : null));
  }

  // ---------- ready ----------
  function renderReady() {
    const v = data.video;
    clear(root);
    const left = h("div", { class: "vleft" });
    const right = h("div", { class: "vright" });
    root.append(head(v), h("div", { class: "vgrid2" }, left, right));
    buildPlayer(left, v); buildTimeline(left, v); buildTranscript(left); buildTabs(right);
    const t = Number(q.t); if (Number.isFinite(t) && q.t !== undefined) setTimeout(() => seek(t), 300);
  }

  function buildPlayer(box, v) {
    if (!v.hasMedia) { box.append(h("div", { class: "noplayer" }, icon("file", "big"), h("b", null, "Imported transcript"), h("span", null, "There is no media file for this one. Moments are highlighted in the transcript below."))); return; }
    const wrap = h("div", { class: "player-box" }, h("div", { class: "hint", style: { padding: "40px 16px", textAlign: "center" } }, "Loading player..."));
    box.append(wrap);
    api.get(`/videos/${id}/media`).then((m) => {
      if (!alive) return;
      const isAudio = m.type.startsWith("audio");
      media = h(isAudio ? "audio" : "video", { controls: true, preload: "metadata", playsinline: true, src: m.url, "aria-label": v.title });
      media.addEventListener("timeupdate", () => markActive(media.currentTime));
      media.addEventListener("error", () => { clear(wrap); wrap.append(h("div", { class: "hint", style: { padding: "30px 16px", textAlign: "center" } }, "The media could not be loaded. The link may have expired. Reload the page.")); });
      clear(wrap); wrap.append(media);
    }).catch((e) => { clear(wrap); wrap.append(h("div", { class: "hint", style: { padding: "30px 16px" } }, e.message)); });
  }

  function buildTimeline(box, v) {
    const dur = v.duration || 0; if (!dur) return;
    const n = data.notes, track = h("div", { class: "tl-track", role: "list", "aria-label": "Moments timeline" }), head2 = h("div", { class: "tl-h" }, h("b", null, "Moments"), h("span", { class: "tl-legend" }));
    const wrap = h("div", { class: "timeline" }, head2, track, h("div", { class: "tl-scale" }, h("span", null, "0:00"), h("span", null, fmtDuration(dur))));
    const kinds = { point: ["Key point", "indigo"], action: ["Action item", "green"], decision: ["Decision", "cyan"], ref: ["Reference", "amber"], promise: ["Follow-up", "violet"] };
    const used = new Set();
    const add = (kind, start, text) => { if (start == null || start < 0 || start > dur) return; used.add(kind); const k = kinds[kind]; track.append(h("button", { type: "button", role: "listitem", class: "tl-m " + k[1], style: { left: Math.min(99, (start / dur) * 100) + "%" }, title: `${k[0]} ${fmtTime(start)}: ${text}`, "aria-label": `${k[0]} at ${fmtTime(start)}: ${text}`, onclick: () => seek(start) })); };
    if (n) { n.points.forEach((i) => add("point", i.start, i.text)); n.actions.forEach((i) => add("action", i.start, i.text)); n.decisions.forEach((i) => add("decision", i.start, i.text)); }
    const legend = () => { const l = head2.querySelector(".tl-legend"); clear(l); Object.entries(kinds).filter(([k]) => used.has(k)).forEach(([k, d]) => l.append(h("span", null, h("i", { class: d[1] }), d[0]))); };
    legend(); box.append(wrap);
    api.get(`/videos/${id}/references`).then((r) => { if (!alive) return; (r.references || []).forEach((x) => add(x.dir === "forward" ? "promise" : "ref", x.start, x.phrase || x.text || "")); legend(); }).catch(() => {});
  }

  function buildTranscript(box) {
    const search = h("input", { type: "search", class: "tx-search", placeholder: "Search this transcript", "aria-label": "Search this transcript" });
    const list = h("div", { class: "tx-list2", role: "list" });
    rows = chunks.map((c) => { const r = h("button", { type: "button", class: "tx-row", role: "listitem", onclick: () => seek(c.start, c) }, h("span", { class: "t" }, fmtTime(c.start)), h("span", { class: "tt" }, c.text)); r.__c = c; list.append(r); return r; });
    const filter = debounce(() => {
      const t = search.value.trim().toLowerCase();
      rows.forEach((r) => { const hit = !t || r.__c.text.toLowerCase().includes(t); r.hidden = !hit; const tt = r.querySelector(".tt"); clear(tt); tt.append(...(t && hit ? highlight(r.__c.text, search.value.trim()) : [r.__c.text])); });
    }, 120);
    search.addEventListener("input", filter);
    box.append(h("div", { class: "tx2" }, h("div", { class: "tx-h" }, h("b", null, "Transcript"), search), list));
  }

  function markActive(sec) {
    let idx = -1;
    for (let i = 0; i < chunks.length; i++) { if (chunks[i].start != null && chunks[i].start <= sec + 0.2) idx = i; else if (chunks[i].start != null) break; }
    if (idx === activeIdx) return; activeIdx = idx;
    rows.forEach((r, i) => r.classList.toggle("on", i === idx));
    const on = rows[idx]; const box = on && on.parentElement;
    if (on && box) { const top = on.offsetTop - box.offsetTop; if (top < box.scrollTop + 6 || top + on.offsetHeight > box.scrollTop + box.clientHeight - 6) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: "smooth" }); }
  }
  function seek(sec, chunk) {
    if (sec == null) { if (chunk) { activeIdx = -1; rows.forEach((r) => r.classList.toggle("on", r.__c === chunk)); } return; }
    if (media) { const go2 = () => { media.currentTime = sec; media.play().catch(() => {}); }; media.readyState >= 1 ? go2() : media.addEventListener("loadedmetadata", go2, { once: true }); }
    activeIdx = -2; markActive(sec);
    const pl = root.querySelector(".player-box, .noplayer"); if (pl) { const r = pl.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) pl.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }

  function buildTabs(box) {
    const panels = {};
    const defs = [["notes", "note", "Notes"], ["ask", "search", "Ask"], ["context", "compass", "Context"], ["compare", "cols", "Compare"]];
    const bar = h("div", { class: "tabs", role: "tablist", "aria-label": "Video tools" });
    const badge = h("span", { class: "c amber", id: "ctx-badge", hidden: true }, "0");
    const show = (t) => {
      tab = t;
      [...bar.children].forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === t)));
      Object.entries(panels).forEach(([k, p]) => (p.hidden = k !== t));
      if (t === "context") loadRefs(); if (t === "compare") loadMyNotes();
    };
    defs.forEach(([t, ic, label]) => { const b = h("button", { class: "tab", role: "tab", type: "button", dataset: { t }, onclick: () => show(t) }, icon(ic), " " + label, t === "context" ? badge : null); bar.append(b); });
    panels.notes = notesPanel(); panels.ask = askPanel(); panels.context = contextPanel(); panels.compare = comparePanel();
    box.append(h("div", { class: "ws-right2" }, bar, ...Object.values(panels)));
    show(tab);
    api.get(`/videos/${id}/references`).then((r) => { const n = r.references.filter((x) => x.status === "open").length; badge.textContent = String(n); badge.hidden = !n; }).catch(() => {});
    setBadge = (n) => { badge.textContent = String(n); badge.hidden = !n; };
  }
  let setBadge = () => {};

  // ---------- notes ----------
  function notesPanel() {
    const n = data.notes, p = h("div", { class: "tabpanel", role: "tabpanel" });
    if (!n) { p.append(h("p", { class: "hint" }, "No notes yet.")); return p; }
    const list = (items, empty) => items.length ? h("ul", { class: "nlist" }, ...items.map((i) => h("li", null, i.text, " ", momentLink(id, i.start, { currentId: id, onSeek: seek })))) : h("p", { class: "hint" }, empty);
    p.append(...[h("div", { class: "pnl-h" }, h("div", null, h("h3", null, "Notes"), h("p", null, n.source === "model" ? "Written by an AI model from the transcript. Every item links to its source moment." : "Written with a simple extractive method, no AI model. Every item links to its source moment."))),
      n.source !== "model" && n.note ? h("div", { class: "hint" }, "Model unavailable: " + n.note) : null,
      h("div", { class: "rcard" }, h("div", { class: "hint" }, "Summary"), h("p", { class: "rq" }, n.summary || "No summary available.")),
      h("div", null, h("div", { class: "hint" }, "Key points"), list(n.points, "None found.")),
      h("div", { class: "two" }, h("div", null, h("div", { class: "hint" }, "Action items"), list(n.actions, "None found.")), h("div", null, h("div", { class: "hint" }, "Decisions"), list(n.decisions, "None found."))),
      h("details", { class: "learn" }, h("summary", null, icon("info"), " How these notes are made"), h("div", { class: "learn-b" },
        h("ol", null, h("li", null, "The transcript is split into short moments, each with a timestamp."), h("li", null, "Notes are written from those moments. Every item links back to the second it came from, so you can verify it."), h("li", null, "Use the Context tab to see where this video points to other recordings, and Compare to check your own notes against it.")),
        h("p", null, "Notes are generated automatically and can miss details. Click a timestamp to confirm anything important."))),
      h("div", { class: "acts" }, h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => copyText(notesMd(), "Notes copied as Markdown.", toast) }, icon("copy"), " Copy as Markdown"), h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => downloadText((data.video.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "notes") + "-notes.md", notesMd()) }, icon("download"), " Download .md"))].filter(Boolean));
    return p;
  }
  function notesMd() {
    const n = data.notes, li = (a) => a.map((i) => `- ${i.text}${i.start != null ? ` (${fmtTime(i.start)})` : ""}`).join("\n") || "- none";
    return `# ${data.video.title}\n\n${n.summary}\n\n## Key points\n${li(n.points)}\n\n## Action items\n${li(n.actions)}\n\n## Decisions\n${li(n.decisions)}\n`;
  }

  // ---------- ask ----------
  function askPanel() {
    let scope = "video";
    const input = h("input", { type: "text", placeholder: "Ask about this video...", "aria-label": "Question" });
    const out = h("div", { "aria-live": "polite" });
    const seg = h("div", { class: "seg small" }, h("button", { type: "button", "aria-selected": "true", onclick: (e) => setScope("video", e) }, "This video"), h("button", { type: "button", "aria-selected": "false", onclick: (e) => setScope("all", e) }, "Whole library"));
    function setScope(s, e) { scope = s; [...seg.children].forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); }
    async function run() {
      const t = input.value.trim(); if (!t) { input.focus(); return; }
      clear(out); out.append(h("div", { class: "hint" }, "Searching..."));
      try {
        const r = await api.get("/search", scope === "video" ? { q: t, video: id } : { q: t });
        clear(out);
        if (!r.results.length) out.append(h("div", { class: "nomatch" }, h("b", null, "Nothing close enough. "), "Try other words."));
        else r.results.forEach((x) => out.append(momentCard(x, { currentId: id, onSeek: seek })));
      } catch (e) { clear(out); toast(e.message, "err"); }
    }
    return h("div", { class: "tabpanel", role: "tabpanel" }, h("div", { class: "pnl-h" }, h("div", null, h("h3", null, "Ask"), h("p", null, "Search by meaning. You get moments you can play, not a made-up answer."))), seg,
      h("form", { class: "askbar", onsubmit: (e) => { e.preventDefault(); run(); } }, input, h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Find")), out);
  }

  // ---------- context (references) ----------
  function contextPanel() { return h("div", { class: "tabpanel", role: "tabpanel", id: "ctx-panel" }, h("p", { class: "hint" }, "Loading...")); }
  async function loadRefs() {
    const p = root.querySelector("#ctx-panel"); if (!p) return;
    try { refsState = await api.get(`/videos/${id}/references`); } catch (e) { toast(e.message, "err"); return; }
    setBadge(refsState.references.filter((r) => r.status === "open").length);
    clear(p);
    p.append(h("div", { class: "pnl-h" }, h("div", null, h("h3", null, "Context and follow-ups"), h("p", null, "Where this video points back to an explanation elsewhere (\"as covered earlier\"), and where it says something will come later (\"in the next video\"). Matches come only from your own library. You decide what gets linked."))));
    if (!refsState.references.length) { p.append(h("div", { class: "nomatch" }, "No references or follow-ups were detected, like \"as we covered earlier\" or \"in the next video\".")); return; }
    refsState.references.forEach((r) => p.append(refCard(r)));
  }
  async function act(path, body, msg) { try { await api.post(path, body); if (msg) toast(msg); await loadRefs(); refreshNotifs(); } catch (e) { toast(e.message, "err"); } }
  function refCard(r) {
    const rid = encodeURIComponent(r.id);
    const fwd = r.dir === "forward";
    const card = h("div", { class: "rcard " + r.status }, h("div", { class: "rh" }, h("span", { class: "pill " + (fwd ? "violet" : "amber") }, fwd ? "Follow-up at " : "Reference at ", momentLink(id, r.start, { currentId: id, onSeek: seek })), h("span", { class: "pill " + (r.status === "resolved" ? "green" : r.status === "pending" ? "amber" : "cyan") }, r.status === "resolved" ? (fwd ? "follow-up covered" : "linked") : r.status === "pending" ? "watching" : (fwd ? "not kept yet" : "needs a source"))),
      h("p", { class: "rq" }, ...highlight(r.text, r.phrase)));
    if (r.status === "resolved" && r.source) card.append(h("div", { class: "linked" }, icon("link"), h("span", null, fwd ? "Kept by " : "Linked to ", h("b", null, r.source.title), " ", momentLink(r.source.videoId, r.source.start), r.manual ? " (picked manually)" : "", "."), h("button", { class: "linkbtn", type: "button", onclick: () => act(`/references/${rid}/undo`) }, "Undo")));
    else if (r.status === "pending") card.append(h("div", { class: "nomatch pend" }, (fwd ? "We are watching for it. When a later video covers this follow-up you get one notification. " : "Saved as a pending reference. After each new upload is processed, it is checked again and you get one notification if something matches. "), h("button", { class: "linkbtn", type: "button", onclick: () => act(`/references/${rid}/undo`) }, "Undo")), knowMore({ chunkId: r.chunkId }));
    else {
      if (r.candidates.length) { card.append(h("div", { class: "hint" }, fwd ? "Later videos that seem to cover it. A score marks a candidate, not proof." : "Closest excerpts from your other videos. A score marks a candidate, not proof.")); r.candidates.forEach((c) => card.append(momentCard(c, { extra: h("div", { class: "ca" }, h("button", { class: "btn btn-ok btn-xs", type: "button", onclick: () => act(`/references/${rid}/accept`, { chunkId: c.chunkId, score: c.score }, "Source linked.") }, icon("check"), fwd ? " This covers the follow-up" : " Accept this source"), h("a", { class: "btn btn-ghost btn-xs", href: `#/v/${c.videoId}?t=${Math.floor(c.start || 0)}` }, "Open in its video")) }))); }
      else card.append(h("div", { class: "nomatch" }, h("b", null, fwd ? "No later video covers this yet. " : "No suitable source in your library yet. "), fwd ? "It stays on your list of follow-ups until one does." : "Nothing is suggested rather than guessing."), knowMore({ chunkId: r.chunkId }));
      const sel = h("select", { class: "sel", "aria-label": "Pick a source manually" }, h("option", { value: "" }, "Pick a source manually..."), ...refsState.options.map((o) => h("option", { value: o.chunkId }, `${o.title} ${fmtTime(o.start)}: ${o.text}`)));
      card.append(h("div", { class: "pickrow" }, sel, h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => { if (!sel.value) { toast("Pick a source from the list first.", "err"); return; } act(`/references/${rid}/accept`, { chunkId: sel.value, manual: true }, "Linked manually."); } }, "Link")),
        h("div", { class: "acts" }, h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => act(`/references/${rid}/remember`, {}, fwd ? "Watching for it. You will be notified if a later video covers it." : "Saved. We will check after every new upload.") }, icon("bookmark"), fwd ? " Keep watching for it" : " Leave unresolved and remember it")));
    }
    return card;
  }

  // ---------- compare ----------
  let notesText = "", savedText = "", cmp = null, dismissed = new Set(), ta = null, saveBar = null, cmpOut = null;
  function comparePanel() {
    ta = h("textarea", { class: "notes-ta", spellcheck: "false", placeholder: "Paste your own notes for this video here, one point per line.", "aria-label": "Your notes", oninput: () => { notesText = ta.value; paintSave(); } });
    saveBar = h("div", { class: "savebar" }); cmpOut = h("div", { "aria-live": "polite" });
    return h("div", { class: "tabpanel", role: "tabpanel", id: "cmp-panel" }, h("div", { class: "pnl-h" }, h("div", null, h("h3", null, "Notes vs Video"), h("p", null, "Check your own notes against the video. Your saved notes are never changed until you press Save."))), ta, saveBar,
      h("div", { class: "acts" }, h("button", { class: "btn btn-primary btn-sm", type: "button", id: "cmp-go", onclick: () => runCompare(true) }, icon("cols"), " Compare with transcript")), cmpOut,
      h("p", { class: "hint" }, "Key points come from this video's notes. A point that is missing from the video is not automatically wrong."));
  }
  function paintSave() {
    const dirty = notesText !== savedText;
    saveBar.className = "savebar" + (dirty ? " dirty" : "");
    clear(saveBar); saveBar.append(h("span", null, dirty ? "Unsaved changes. Your saved notes are preserved until you save." : "Saved."), h("span", { class: "acts" }, h("button", { class: "btn btn-ghost btn-xs", type: "button", disabled: !dirty, onclick: () => { notesText = savedText; ta.value = savedText; paintSave(); if (cmp) runCompare(false); } }, "Revert"), h("button", { class: "btn btn-ok btn-xs", type: "button", id: "save-notes", disabled: !dirty, onclick: async () => { try { await api.put(`/videos/${id}/mynotes`, { text: notesText }); savedText = notesText; paintSave(); toast("Notes saved."); } catch (e) { toast(e.message, "err"); } } }, icon("check"), " Save notes")));
  }
  async function loadMyNotes() { if (savedText !== "" || notesText !== "") return; try { const r = await api.get(`/videos/${id}/mynotes`); savedText = notesText = r.text || ""; ta.value = notesText; } catch { /* ignore */ } paintSave(); }
  async function runCompare(announce) {
    try { cmp = await api.post(`/videos/${id}/compare`, { text: notesText }); } catch (e) { toast(e.message, "err"); return; }
    paintCompare(); if (announce) { const c = (v) => cmp.results.filter((x) => x.verdict === v).length; toast(`${c("covered")} covered, ${c("mismatch")} possible mismatch, ${c("missed")} missed`); }
  }
  const VERD = { covered: ["green", "Covered"], mismatch: ["red", "Possible mismatch"], missed: ["amber", "Missed key point"] };
  function setNotes(t) { notesText = t; ta.value = t; paintSave(); runCompare(false); }
  function paintCompare() {
    clear(cmpOut); if (!cmp) return;
    const c = (v) => cmp.results.filter((x) => x.verdict === v).length;
    cmpOut.append(h("div", { class: "sumrow" }, h("div", { class: "sumcell g" }, h("b", null, c("covered")), h("span", null, "covered")), h("div", { class: "sumcell r" }, h("b", null, c("mismatch")), h("span", null, "mismatch")), h("div", { class: "sumcell a" }, h("b", null, c("missed")), h("span", null, "missed"))));
    cmp.results.forEach((r) => {
      const [col, label] = VERD[r.verdict], dis = dismissed.has(r.id);
      const acts = [];
      if (r.verdict === "mismatch") acts.push(h("button", { class: "btn btn-ok btn-xs", type: "button", onclick: () => { const lines = notesText.split("\n"); const i = lines.findIndex((l) => stripBullet(l) === r.bestLine); if (i >= 0) { lines[i] = lines[i].replace(r.detail.notes, r.detail.video); setNotes(lines.join("\n")); toast(`Changed ${r.detail.notes} to ${r.detail.video} (unsaved).`); } } }, `Use the video's value (${r.detail.video})`));
      if (r.verdict === "missed") acts.push(h("button", { class: "btn btn-ok btn-xs", type: "button", onclick: () => { const ls = notesText.split("\n").filter((l) => l.trim()); const numbered = ls.length && /^\s*\d+[.)]/.test(ls[ls.length - 1]); setNotes((notesText.trim() ? notesText.replace(/\s+$/, "") + "\n" : "") + (numbered ? `${ls.length + 1}. ` : "- ") + r.text); toast("Added to your notes (unsaved)."); } }, icon("check"), " Add to my notes"));
      if (r.verdict !== "covered") acts.push(h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => { dis ? dismissed.delete(r.id) : dismissed.add(r.id); paintCompare(); } }, dis ? "Undo dismiss" : "Dismiss"));
      cmpOut.append(h("div", { class: "vcard " + r.verdict + (dis ? " done" : "") }, h("div", { class: "vh" }, h("span", { class: "pill " + col }, label)), h("div", { class: "kp" }, r.text),
        r.bestLine && r.verdict !== "missed" ? h("div", { class: "hint" }, `Matched your line: "${r.bestLine}"`) : null,
        r.verdict === "mismatch" ? h("div", { class: "mm" }, h("span", null, "Your notes:"), h("s", null, r.detail.notes), h("span", null, "Video says:"), h("b", null, r.detail.video)) : null,
        h("div", { class: "ev" }, "Evidence ", momentLink(id, r.start, { currentId: id, onSeek: seek }), ": \"" + r.evidence + "\""), acts.length ? h("div", { class: "acts" }, acts) : null));
    });
  }

  await load();
  return () => { alive = false; clearTimeout(timer); if (media) { try { media.pause(); } catch { /* ignore */ } } };
}
