// Hero "stage": a looping, scripted product moment. No fake numbers beyond the deck's own examples.
import { $, esc, sleep, reduceMotion, waveHeights } from "./util.js";

const SCENES = [
  {
    title: "Product Tutorial", day: "Day 1", time: "06:10",
    before: "Configure the server using the method shown in ", hit: "the previous tutorial", after: ".",
    result: { kind: "found", src: "Server Setup", at: "03:20", sub: "Explanation of the configuration steps", score: 0.77, label: "Candidate source" },
    pin: 0.43,
  },
  {
    title: "Application Setup", day: "Day 1", time: "06:10",
    before: "Use the database settings from ", hit: "the earlier tutorial", after: ".",
    result: { kind: "pending", src: "No suitable source yet", at: "", sub: "Saved as a pending reference. We will check again after every new upload.", score: 0.12, label: "Remembered" },
    pin: 0.43,
  },
  {
    title: "Database Tutorial uploaded", day: "Day 2", time: "04:20",
    before: "Create a database user and password, then the application database. ", hit: "These are the database settings", after: ".",
    result: { kind: "found", src: "Possible explanation found", at: "04:20", sub: "Notification sent: it answers the pending reference from Application Setup 06:10.", score: 0.44, label: "Candidate source" },
    pin: 0.4,
  },
];

export function initHero() {
  const quote = $("#h-quote"), result = $("#h-result"), title = $("#h-title"), day = $("#h-day"), time = $("#h-time"), wave = $("#h-wave");
  if (!quote) return;
  const hs = waveHeights("hero", 64);
  wave.innerHTML = hs.map((h) => `<i style="--h:${h}%"></i>`).join("");
  const bars = Array.from(wave.children);

  const paint = (s, typed, hitOn) => {
    const full = s.before + s.hit + s.after;
    const t = full.slice(0, typed);
    const b = s.before.length, hEnd = b + s.hit.length;
    let html = "";
    html += esc(t.slice(0, b));
    if (typed > b) html += `<mark class="${hitOn ? "hit" : ""}">${esc(t.slice(b, hEnd))}</mark>`;
    if (typed > hEnd) html += esc(t.slice(hEnd));
    quote.innerHTML = html + '<span class="caret"></span>';
  };

  const showResult = (r) => {
    result.className = "result " + r.kind;
    result.innerHTML = `
      <div class="row"><span class="pill ${r.kind === "found" ? "green" : "amber"}"><span class="dot"></span>${esc(r.label)}</span>${r.at ? `<span class="ts">${esc(r.at)}</span>` : ""}</div>
      <div class="src">${esc(r.src)}</div>
      <div class="sub">${esc(r.sub)}</div>
      <div class="bar" role="img" aria-label="Similarity ${r.score}"><i style="--w:0%"></i></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { result.querySelector(".bar i").style.setProperty("--w", Math.round(r.score * 100) + "%"); }));
  };
  const showSearching = () => {
    result.className = "result";
    result.innerHTML = '<div class="shimmer" style="width:56%"></div><div class="shimmer" style="width:86%"></div><div class="shimmer" style="width:38%"></div>';
  };

  const setWave = (pin, upto) => {
    const pi = Math.round(pin * (bars.length - 1));
    bars.forEach((b, i) => {
      b.classList.toggle("past", i <= upto);
      b.classList.toggle("mk", i === pi);
    });
  };

  let gen = 0, active = false;
  const still = reduceMotion();
  async function run(my) {
    let i = 0;
    while (my === gen) {
      const s = SCENES[i % SCENES.length];
      title.textContent = s.title; day.textContent = s.day; time.textContent = s.time;
      const full = (s.before + s.hit + s.after).length;
      showSearching();
      if (still) {
        paint(s, full, true); setWave(s.pin, Math.round(s.pin * 63)); showResult(s.result);
        return;
      }
      for (let n = 0; n <= full && my === gen; n++) {
        paint(s, n, false);
        setWave(s.pin, Math.round((n / full) * s.pin * 63));
        await sleep(26);
      }
      paint(s, full, true);
      await sleep(700);
      showSearching();
      await sleep(1100);
      showResult(s.result);
      await sleep(3300);
      i++;
    }
  }
  // only animate while visible
  const start = () => { if (!active) { active = true; run(++gen); } };
  const stop = () => { active = false; gen++; };
  new IntersectionObserver((es) => { es[0].isIntersecting ? start() : stop(); }).observe($(".stage"));
}
