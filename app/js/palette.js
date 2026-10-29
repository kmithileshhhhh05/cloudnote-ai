// Ctrl+K command bar: jump to pages and videos, or send a question to Ask.
import { h, icon, clear } from "./ui.js";
import { api } from "./api.js";

let open = false;
export function installPalette(go, isSignedIn) {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (isSignedIn()) toggle(go); }
  });
}
export function openPalette(go) { if (!open) toggle(go); }

async function toggle(go) {
  if (open) return; open = true;
  const prev = document.activeElement;
  let videos = [], sel = 0, shown = [];
  const input = h("input", { type: "text", "aria-label": "Command bar", placeholder: "Jump to a page or video, or type a question", autocomplete: "off" });
  const list = h("ul", { class: "cmdk-list", role: "listbox" });
  const box = h("div", { class: "cmdk", role: "dialog", "aria-modal": "true", "aria-label": "Command bar" }, h("div", { class: "cmdk-in" }, icon("search"), input, h("kbd", null, "Esc")), list);
  const back = h("div", { class: "cmdk-back", onmousedown: (e) => { if (e.target === back) close(); } }, box);
  const pages = [["Home", "/", "home"], ["Library", "/library", "grid"], ["Add video", "/upload", "upload"], ["Notes", "/notes", "note"], ["Ask your library", "/ask", "search"], ["Library map", "/map", "graph"]];
  function close() { open = false; back.remove(); document.removeEventListener("keydown", onkey, true); if (prev && prev.focus) prev.focus(); }
  function run(it) { close(); it.run(); }
  function paint() {
    const q = input.value.trim().toLowerCase(); shown = [];
    pages.filter(([l]) => !q || l.toLowerCase().includes(q)).forEach(([l, to, ic]) => shown.push({ ic, label: l, hint: "Page", run: () => go(to) }));
    videos.filter((v) => !q || v.title.toLowerCase().includes(q)).slice(0, 6).forEach((v) => shown.push({ ic: "film", label: v.title, hint: "Video", run: () => go(`/v/${v.id}`) }));
    if (q.length > 2) shown.unshift({ ic: "spark", label: `Ask: ${input.value.trim()}`, hint: "Ask", run: () => go("/ask?q=" + encodeURIComponent(input.value.trim())) });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    clear(list);
    if (!shown.length) list.append(h("li", { class: "cmdk-empty" }, "Nothing matches."));
    shown.forEach((it, i) => list.append(h("li", { role: "option", "aria-selected": String(i === sel), class: "cmdk-i" + (i === sel ? " on" : ""), onmousemove: () => { if (sel !== i) { sel = i; paint(); } }, onclick: () => run(it) }, icon(it.ic), h("span", null, it.label), h("em", null, it.hint))));
    const on = list.querySelector(".on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  function onkey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[sel]) run(shown[sel]); }
    else if (e.key === "Tab") { e.preventDefault(); }
  }
  input.addEventListener("input", () => { sel = 0; paint(); });
  document.addEventListener("keydown", onkey, true);
  document.body.append(back); input.focus(); paint();
  try { videos = (await api.get("/videos")).videos; if (open) paint(); } catch { /* pages still work */ }
}
