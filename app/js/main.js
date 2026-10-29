import { h, icon, clear, toast, $ } from "./ui.js";
import { auth } from "./auth.js";
import { api } from "./api.js";
import { loginView } from "./views/login.js";
import { homeView } from "./views/home.js";
import { libraryView } from "./views/library.js";
import { uploadView } from "./views/upload.js";
import { videoView } from "./views/video.js";
import { askView } from "./views/ask.js";
import { notesView } from "./views/notes.js";
import { noteView } from "./views/note.js";
import { mapView } from "./views/map.js";
import { installPalette, openPalette } from "./palette.js";
import { notifPanel } from "./views/notifications.js";

const app = { me: null, unread: 0, bell: null, view: null, cleanup: null };
window.__cn = app;

function parseRoute() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [pathPart, qs] = raw.split("?");
  const seg = pathPart.split("/").filter(Boolean);
  return { seg, q: Object.fromEntries(new URLSearchParams(qs || "")) };
}
export const go = (p) => { if (location.hash === "#" + p) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = p; };

async function refreshNotifs() {
  try { const r = await api.get("/notifications"); app.unread = r.unread; paintBell(); return r; } catch { return null; }
}
app.refreshNotifs = refreshNotifs;
function paintBell() {
  if (!app.bell) return;
  const n = app.bell.querySelector(".n"); n.textContent = String(app.unread); app.bell.classList.toggle("has", app.unread > 0);
  app.bell.setAttribute("aria-label", app.unread ? `Notifications, ${app.unread} new` : "Notifications");
}

function shell() {
  const nav = (href, ic, label) => h("a", { href: "#" + href, class: "nav-i", "data-href": href }, icon(ic), h("span", null, label));
  app.bell = h("button", { class: "bell", type: "button", "aria-label": "Notifications", onclick: () => notifPanel(app) }, icon("bell"), h("span", { class: "n" }, "0"));
  const side = h("aside", { class: "side" },
    h("a", { class: "brand", href: "#/" }, h("svg", { class: "logo-svg" }, h("use", { href: "#logo" })), h("span", null, "Cloud", h("b", null, "Note"), " AI")),
    h("nav", { class: "snav", "aria-label": "Main" }, nav("/", "home", "Home"), nav("/library", "grid", "Library"), nav("/upload", "upload", "Add video"), nav("/notes", "note", "Notes"), nav("/ask", "search", "Ask"), nav("/map", "graph", "Library map")),
    h("div", { class: "side-foot" },
      h("div", { class: "who" }, h("span", { class: "av", "aria-hidden": "true" }, (auth.user().email[0] || "?").toUpperCase()), h("span", { class: "em", title: auth.user().email }, auth.user().email)),
      h("div", { class: "side-acts" }, app.bell, h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => auth.signOut() }, icon("logout"), " Sign out"))));
  const main = h("main", { class: "main", id: "view", tabindex: "-1" });
  const top = h("header", { class: "mtop" }, h("a", { class: "brand", href: "#/" }, h("svg", { class: "logo-svg" }, h("use", { href: "#logo" })), h("span", null, "Cloud", h("b", null, "Note"))),
    h("div", { class: "mtop-r" }, h("button", { class: "bell", type: "button", "aria-label": "Notifications", onclick: () => notifPanel(app) }, icon("bell"), h("span", { class: "n m-n" }, "0")), h("button", { class: "btn btn-ghost btn-xs", type: "button", onclick: () => auth.signOut() }, icon("logout"))));
  const tabs = h("nav", { class: "tabbar", "aria-label": "Main" }, ...[["/", "home", "Home"], ["/library", "grid", "Library"], ["/notes", "note", "Notes"], ["/ask", "search", "Ask"], ["/map", "graph", "Map"]].map(([hr, ic, l]) => h("a", { href: "#" + hr, class: "tab-i", "data-href": hr }, icon(ic), h("span", null, l))));
  return h("div", { class: "shell" }, side, top, main, tabs);
}

let renderToken = 0;
async function render() {
  const my = ++renderToken;
  const root = $("#root");
  const user = auth.user();
  if (!user) { app.cleanup && app.cleanup(); app.cleanup = null; app.me = null; clear(root); loginView(root, () => { location.hash = "#/"; boot(); }); return; }
  if (!$(".shell", root)) { clear(root); root.append(shell()); }
  if (!app.me) {
    try { app.me = await api.get("/me"); }
    catch (e) { if (my !== renderToken) return; const v = $("#view"); clear(v); v.append(h("div", { class: "empty-state" }, h("h2", null, "Could not reach the server"), h("p", null, e.message), h("button", { class: "btn btn-primary", type: "button", onclick: () => render() }, "Try again"))); return; }
    refreshNotifs();
  }
  if (my !== renderToken) return;
  const { seg, q } = parseRoute();
  const view = $("#view");
  app.cleanup && app.cleanup(); app.cleanup = null;
  clear(view); view.classList.remove("view-in"); void view.offsetWidth; view.classList.add("view-in");
  const key = "/" + (seg[0] || "");
  document.querySelectorAll("[data-href]").forEach((a) => a.classList.toggle("on", a.dataset.href === key || (key === "/v" && a.dataset.href === "/library")));
  const ctx = { app, api, view, q, go, refreshNotifs };
  let cleanup = null;
  try {
    if (!seg.length) cleanup = await homeView(ctx);
    else if (seg[0] === "library") cleanup = await libraryView(ctx);
    else if (seg[0] === "upload") cleanup = await uploadView(ctx);
    else if (seg[0] === "ask") cleanup = await askView(ctx);
    else if (seg[0] === "notes" && seg[1]) cleanup = await noteView({ ...ctx, id: seg[1] });
    else if (seg[0] === "notes") cleanup = await notesView(ctx);
    else if (seg[0] === "map") cleanup = await mapView(ctx);
    else if (seg[0] === "v" && seg[1]) cleanup = await videoView({ ...ctx, id: seg[1] });
  } catch (e) { clear(view); view.append(h("div", { class: "empty-state" }, h("h2", null, "Something went wrong"), h("p", null, e && e.message ? e.message : "Please try again."), h("a", { class: "btn btn-primary", href: "#/" }, "Back to home"))); return; }
  if (my !== renderToken) { cleanup && cleanup(); return; }
  app.cleanup = cleanup;
  if (!seg.length || ["library", "upload", "ask", "map", "notes"].includes(seg[0]) || (seg[0] === "v" && seg[1])) { /* handled above */ } else view.append(h("div", { class: "empty-state" }, h("h2", null, "Page not found"), h("a", { class: "btn btn-primary", href: "#/" }, "Back to home")));
  document.title = "CloudNote AI";
  window.scrollTo(0, 0);
}

async function boot() { await render(); }
installPalette(go, () => !!auth.user());
app.openPalette = () => openPalette(go);
auth.onChange(() => { app.me = null; render(); });
window.addEventListener("hashchange", render);
(async () => { await auth.init(); await boot(); setInterval(() => { if (auth.user() && !document.hidden) refreshNotifs(); }, 15000); })();
