export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const ic = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function toast(msg) {
  const host = $("#toasts");
  if (!host) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${ic("check")}<span>${esc(msg)}</span>`;
  host.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 320);
  }, 3600);
  while (host.children.length > 3) host.firstChild.remove();
}

// Deterministic pseudo-random for waveforms
export function rng(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function waveHeights(seed, n) {
  const r = rng(seed);
  const out = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    v = Math.max(0.12, Math.min(1, v + (r() - 0.5) * 0.55));
    const env = 0.55 + 0.45 * Math.sin((i / n) * Math.PI * 3.1 + r());
    out.push(Math.round(Math.max(0.14, Math.min(1, v * env + 0.12)) * 100));
  }
  return out;
}

// Spotlight on cards
export function spotlight() {
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = e.target.closest && e.target.closest(".card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    },
    { passive: true }
  );
}
