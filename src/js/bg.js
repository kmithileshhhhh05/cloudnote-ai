// Hero background: layered audio-waveform ribbons that drift and lean toward the pointer.
import { reduceMotion } from "./util.js";

export function initBackground() {
  const canvas = document.getElementById("bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1, raf = 0, visible = true;
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const layers = [
    { amp: 0.11, f: 2.1, sp: 0.35, y: 0.34, a: 0.4, c0: "#8b7bff", c1: "#46e0ff", lw: 1.6 },
    { amp: 0.08, f: 3.4, sp: -0.5, y: 0.4, a: 0.26, c0: "#46e0ff", c1: "#8b7bff", lw: 1.2 },
    { amp: 0.14, f: 1.4, sp: 0.22, y: 0.3, a: 0.2, c0: "#5aa2ff", c1: "#a58bff", lw: 1 },
    { amp: 0.06, f: 5.2, sp: 0.7, y: 0.46, a: 0.2, c0: "#ffc65c", c1: "#46e0ff", lw: 0.9 },
  ];

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    const px = (pointer.x - 0.5) * 2;
    const py = (pointer.y - 0.5) * 2;
    layers.forEach((L, li) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, L.c0);
      g.addColorStop(1, L.c1);
      ctx.strokeStyle = g;
      ctx.globalAlpha = L.a;
      ctx.lineWidth = L.lw;
      ctx.beginPath();
      const steps = Math.max(60, Math.floor(w / 6));
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        const u = i / steps;
        // envelope: strongest in the right/middle, fades at the edges
        const env = Math.sin(Math.PI * u) ** 1.4 * (0.12 + 0.88 * u * u);
        const wob = Math.sin(u * Math.PI * 2 * L.f + t * 0.001 * L.sp * 2 + li) + 0.5 * Math.sin(u * Math.PI * 2 * L.f * 2.3 - t * 0.0013 * L.sp + px * 2);
        const near = Math.exp(-((u - pointer.x) ** 2) / 0.02);
        const y = h * (L.y + py * 0.03) + wob * h * L.amp * env * (1 + near * 0.9);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    if (!visible || document.hidden) { raf = 0; return; }
    draw(t);
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!raf && !reduceMotion()) raf = requestAnimationFrame(loop); };

  resize();
  draw(0);
  window.addEventListener("resize", () => { resize(); draw(performance.now()); });
  window.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    pointer.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  }, { passive: true });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { threshold: 0 }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
  start();
}
