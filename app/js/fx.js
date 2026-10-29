// Motion and 3D effects. Everything here is decoration: it is skipped for reduced motion and touch screens.
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = () => window.matchMedia("(pointer: fine)").matches;

/** Drifting audio-waveform ribbons on a canvas. Returns a stop function. */
export function waves(canvas) {
  const ctx = canvas.getContext("2d"); let w = 0, h = 0, raf = 0, alive = true; const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  const size = () => { const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect(); w = r.width; h = r.height; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const L = [{ a: 0.11, f: 2.1, s: 0.35, y: 0.62, al: 0.45, c0: "#8b7bff", c1: "#46e0ff", lw: 1.6 }, { a: 0.08, f: 3.4, s: -0.5, y: 0.7, al: 0.3, c0: "#46e0ff", c1: "#8b7bff", lw: 1.2 }, { a: 0.13, f: 1.4, s: 0.22, y: 0.55, al: 0.22, c0: "#5aa2ff", c1: "#a58bff", lw: 1 }, { a: 0.06, f: 5.2, s: 0.7, y: 0.78, al: 0.18, c0: "#ffc65c", c1: "#46e0ff", lw: 0.9 }];
  const draw = (t) => {
    ctx.clearRect(0, 0, w, h); ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
    L.forEach((l, li) => {
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, l.c0); g.addColorStop(1, l.c1);
      ctx.strokeStyle = g; ctx.globalAlpha = l.al; ctx.lineWidth = l.lw; ctx.beginPath();
      const n = Math.max(60, Math.floor(w / 6));
      for (let i = 0; i <= n; i++) {
        const u = i / n, env = Math.sin(Math.PI * u) ** 1.3, near = Math.exp(-((u - ptr.x) ** 2) / 0.02);
        const y = h * (l.y + (ptr.y - 0.5) * 0.03) + (Math.sin(u * Math.PI * 2 * l.f + t * 0.001 * l.s * 2 + li) + 0.5 * Math.sin(u * Math.PI * 2 * l.f * 2.3 - t * 0.0013 * l.s)) * h * l.a * env * (1 + near * 0.9);
        i ? ctx.lineTo(u * w, y) : ctx.moveTo(u * w, y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  };
  const loop = (t) => { if (!alive) return; if (!canvas.isConnected) { stop(); return; } draw(t); raf = requestAnimationFrame(loop); };
  size(); draw(0);
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); ptr.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); ptr.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); };
  const onResize = () => { size(); draw(performance.now()); };
  window.addEventListener("resize", onResize); window.addEventListener("pointermove", onMove, { passive: true });
  if (!reduce()) raf = requestAnimationFrame(loop);
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); } else if (alive && !reduce()) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", onVis);
  function stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); window.removeEventListener("pointermove", onMove); document.removeEventListener("visibilitychange", onVis); }
  return stop;
}

/** Gentle 3D tilt with a light sheen that follows the pointer. */
export function tilt(el, max = 7) {
  if (reduce() || !fine()) return;
  el.classList.add("tilt");
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", (-y * max).toFixed(2) + "deg"); el.style.setProperty("--ry", (x * max).toFixed(2) + "deg");
    el.style.setProperty("--sx", ((x + 0.5) * 100).toFixed(0) + "%"); el.style.setProperty("--sy", ((y + 0.5) * 100).toFixed(0) + "%");
  });
  el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
}

/** Pointer parallax for a 3D scene: sets --px and --py (-1..1) on the element. */
export function parallax(scene, area = window) {
  if (reduce() || !fine()) return () => {};
  const on = (e) => { const r = scene.getBoundingClientRect(); scene.style.setProperty("--px", (((e.clientX - (r.left + r.width / 2)) / innerWidth) * 2).toFixed(3)); scene.style.setProperty("--py", (((e.clientY - (r.top + r.height / 2)) / innerHeight) * 2).toFixed(3)); };
  area.addEventListener("pointermove", on, { passive: true });
  return () => area.removeEventListener("pointermove", on);
}
