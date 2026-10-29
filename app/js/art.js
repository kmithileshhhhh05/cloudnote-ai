// Generated cover art: a stable gradient and waveform per title, so every video looks distinct without thumbnails.
import { h, icon } from "./ui.js";

const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
const rnd = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), t | 1); r ^= r + Math.imul(r ^ (r >>> 7), r | 61); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

export function hues(title) { const n = hash(title || "x"); return [n % 360, (n % 360 + 40 + (n >> 8) % 70) % 360]; }

/** kind: 'video' | 'transcript' | 'sample' (only used for the corner icon). */
export function cover(title, { kind = "video", bars = 34, cls = "" } = {}) {
  const [a, b] = hues(title), r = rnd(hash(title || "x") ^ 0x9e3779b9);
  let v = 0.5;
  const wave = h("div", { class: "cv-wave", "aria-hidden": "true" }, ...Array.from({ length: bars }, (_, i) => { v = Math.max(0.15, Math.min(1, v + (r() - 0.5) * 0.6)); const env = 0.55 + 0.45 * Math.sin((i / bars) * Math.PI * 2.2 + r()); return h("i", { style: { height: Math.round(Math.max(0.14, Math.min(1, v * env + 0.1)) * 100) + "%" } }); }));
  const el = h("div", { class: "cover " + cls, style: { "--c1": `hsl(${a} 72% 42%)`, "--c2": `hsl(${b} 80% 22%)`, "--c3": `hsl(${a} 90% 70%)` }, "aria-hidden": "true" },
    h("span", { class: "cv-glow" }), wave, h("span", { class: "cv-ic" }, icon(kind === "video" ? "film" : "file")));
  return el;
}

/** Animated count-up. */
export function countUp(el, to, { ms = 800, suffix = "", decimals = 0 } = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => (decimals ? n.toFixed(decimals) : String(Math.round(n))) + suffix;
  if (reduce || !to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(to * e); if (p < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = fmt(to); };
  requestAnimationFrame(step);
}

/** Progress ring (SVG). */
export function ring(pct, { size = 76, stroke = 8, label } = {}) {
  const NS = "http://www.w3.org/2000/svg", rr = (size - stroke) / 2, c = 2 * Math.PI * rr;
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", `0 0 ${size} ${size}`); svg.setAttribute("class", "ring"); svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${Math.round(pct)} percent`);
  const mk = (cls, extra) => { const e = document.createElementNS(NS, "circle"); e.setAttribute("cx", size / 2); e.setAttribute("cy", size / 2); e.setAttribute("r", rr); e.setAttribute("fill", "none"); e.setAttribute("stroke-width", stroke); e.setAttribute("class", cls); Object.entries(extra || {}).forEach(([k, val]) => e.setAttribute(k, val)); return e; };
  svg.append(mk("ring-bg"), mk("ring-fg", { "stroke-dasharray": c, "stroke-dashoffset": c * (1 - Math.max(0, Math.min(100, pct)) / 100), "stroke-linecap": "round", transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  const t = document.createElementNS(NS, "text"); t.setAttribute("x", size / 2); t.setAttribute("y", size / 2 + 5); t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "ring-t"); t.textContent = label ?? Math.round(pct) + "%"; svg.append(t);
  return svg;
}

export const skeleton = (n = 3, cls = "") => h("div", { class: "skels " + cls, "aria-hidden": "true" }, ...Array.from({ length: n }, () => h("div", { class: "skel" })));
