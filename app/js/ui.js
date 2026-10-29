// Tiny DOM helpers. All user content goes through textContent, never innerHTML.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
export const icon = (name, cls = "") => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("class", "i " + cls); s.setAttribute("aria-hidden", "true"); const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#i-" + name); s.append(u); return s; };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export function fmtTime(sec) {
  if (sec == null || Number.isNaN(sec)) return "--:--";
  const s = Math.max(0, Math.floor(sec)), hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return (hh ? String(hh) + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(s % 60).padStart(2, "0");
}
export function fmtDuration(sec) { if (!sec) return "-"; const m = Math.round(sec / 60); return m < 1 ? "<1 min" : m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; }
export function fmtSize(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB"; }
export function fmtDate(ms) { return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }

export function toast(msg, kind = "ok") {
  const host = document.getElementById("toasts"); if (!host) return;
  const t = h("div", { class: "toast", role: "status" }, icon(kind === "err" ? "warn" : "check"), h("span", null, msg));
  if (kind === "err") t.querySelector("svg").style.color = "var(--red)";
  host.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, kind === "err" ? 6000 : 3600);
  while (host.children.length > 3) host.firstChild.remove();
}

export function confirmDialog(title, body, okLabel = "Delete") {
  return new Promise((resolve) => {
    const done = (v) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    const overlay = h("div", { class: "modal-bg", onclick: (e) => { if (e.target === overlay) done(false); } },
      h("div", { class: "modal", role: "alertdialog", "aria-modal": "true", "aria-label": title },
        h("h3", null, title), h("p", null, body),
        h("div", { class: "modal-acts" }, h("button", { class: "btn btn-ghost btn-sm", onclick: () => done(false) }, "Cancel"), h("button", { class: "btn btn-warn btn-sm", id: "dlg-ok", onclick: () => done(true) }, okLabel))));
    document.body.append(overlay); document.addEventListener("keydown", onKey); overlay.querySelector("#dlg-ok").focus();
  });
}

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function promptDialog(title, label, value = "", okLabel = "Save") {
  return new Promise((resolve) => {
    const done = (v) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    const input = h("input", { type: "text", value, maxlength: "120", "aria-label": label });
    const overlay = h("div", { class: "modal-bg", onclick: (e) => { if (e.target === overlay) done(null); } },
      h("form", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title, onsubmit: (e) => { e.preventDefault(); done(input.value.trim() || null); } },
        h("h3", null, title), h("label", { style: { display: "block", margin: "14px 0 6px" } }, label), input,
        h("div", { class: "modal-acts" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => done(null) }, "Cancel"), h("button", { class: "btn btn-primary btn-sm", type: "submit" }, okLabel))));
    document.body.append(overlay); document.addEventListener("keydown", onKey); input.focus(); input.select();
  });
}
