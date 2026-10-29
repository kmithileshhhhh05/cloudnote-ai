import { $, $$, spotlight } from "./util.js";
import { initBackground } from "./bg.js";
import { initHero } from "./hero.js";
import { initMarquee, initPipeline, initArch, initPapers, initPlan, initStatic } from "./sections.js";
import { initWorkspace } from "./workspace.js";
import { initPalette } from "./palette.js";

function initChrome() {
  const nav = $("#nav"), bar = $("#progress"), top = $("#to-top"), burger = $("#burger"), drawer = $("#drawer");
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle("scrolled", y > 12);
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    top.classList.toggle("show", y > 900);
    ticking = false;
  };
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));

  const setDrawer = (open) => {
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setDrawer(!drawer.classList.contains("open")));
  drawer.addEventListener("click", (e) => { if (e.target.closest("a")) setDrawer(false); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) setDrawer(false); });
  window.addEventListener("resize", () => { if (window.innerWidth > 1060 && drawer.classList.contains("open")) setDrawer(false); });

  // active nav link
  const links = $$(".nav-links a");
  const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const secs = Array.from(map.keys()).map((id) => document.getElementById(id)).filter(Boolean);
  const io = new IntersectionObserver((es) => {
    es.forEach((en) => { if (en.isIntersecting) { links.forEach((l) => l.classList.remove("active")); const a = map.get(en.target.id); if (a) a.classList.add("active"); } });
  }, { rootMargin: "-45% 0px -50% 0px" });
  secs.forEach((s) => io.observe(s));
}

function initReveal() {
  const els = $$(".reveal:not(.in)");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((es) => {
    es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  els.forEach((e) => io.observe(e));
}

function boot() {
  initChrome();
  initMarquee();
  initStatic();
  initPipeline();
  initArch();
  initPapers();
  initPlan();
  const workspace = initWorkspace();
  initPalette({ workspace });
  $$("[data-open-tab]").forEach((b) => b.addEventListener("click", () => workspace && workspace.openTab(b.dataset.openTab)));
  initBackground();
  initHero();
  spotlight();
  initReveal();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
