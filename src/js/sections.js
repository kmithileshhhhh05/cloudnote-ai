import { $, $$, esc, ic, reduceMotion } from "./util.js";
import { PAPERS, PAPER_TAGS, GAP, PIPELINE, ARCH, SCHEMA, PLAN, EVAL, COSTS, ROADMAP, AUDIENCE, FAQ, TEAM, GUIDE, REFS_IMPL } from "./content.js";

/* ---------- marquee ---------- */
export function initMarquee() {
  if (!$("#marquee")) return;
  const items = [["Amazon Transcribe", "#ffc65c"], ["Amazon Bedrock", "#a58bff"], ["AWS Lambda", "#ff9f7b"], ["Amazon Cognito", "#4de2a1"], ["DynamoDB", "#5aa2ff"], ["Amazon S3", "#46e0ff"], ["CloudFront", "#7b8cff"], ["API Gateway", "#4de2a1"]];
  const html = items.map(([n, c]) => `<span class="mq"><i style="--c:${c}"></i>${esc(n)}</span>`).join("");
  $("#marquee").innerHTML = html + html;
}

/* ---------- pipeline ---------- */
export function initPipeline() {
  if (!$("#steps")) return;
  const steps = $("#steps"), pane = $("#pane");
  let cur = 0, timer = null, userTouched = false, visible = false;
  const DUR = 5200;

  steps.innerHTML = PIPELINE.map((s, i) => `
    <button class="step" role="tab" id="st-${i}" aria-selected="${i === 0}" aria-controls="pane" tabindex="${i === 0 ? 0 : -1}" data-i="${i}">
      <span class="n">${i + 1}</span>
      <span><span class="nm">${esc(s.short)}</span><br><span class="ot">${esc(s.out)}</span></span>
      <span class="chev">${ic("arrow")}</span>
      <span class="fill"></span>
    </button>`).join("");

  function render() {
    const s = PIPELINE[cur];
    pane.setAttribute("aria-labelledby", "st-" + cur);
    pane.innerHTML = `<div class="pane-body">
      <span class="pill cyan" style="align-self:flex-start">Step ${cur + 1} of ${PIPELINE.length}</span>
      <h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>
      <div class="term" aria-label="Illustrative example">${s.code.map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join("")}</div>
    </div>`;
    $$(".step", steps).forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === cur));
      b.tabIndex = i === cur ? 0 : -1;
      const f = $(".fill", b);
      f.classList.remove("run");
      void f.offsetWidth;
      if (i === cur && !userTouched && !reduceMotion()) { f.style.setProperty("--dur", DUR + "ms"); f.classList.add("run"); }
    });
  }
  function schedule() {
    clearTimeout(timer);
    if (userTouched || !visible || reduceMotion()) return;
    timer = setTimeout(() => { cur = (cur + 1) % PIPELINE.length; render(); schedule(); }, DUR);
  }
  steps.addEventListener("click", (e) => {
    const b = e.target.closest(".step"); if (!b) return;
    userTouched = true; cur = +b.dataset.i; render(); clearTimeout(timer);
  });
  steps.addEventListener("keydown", (e) => {
    const k = e.key;
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(k)) return;
    e.preventDefault(); userTouched = true; clearTimeout(timer);
    if (k === "Home") cur = 0; else if (k === "End") cur = PIPELINE.length - 1;
    else cur = (cur + (k === "ArrowDown" || k === "ArrowRight" ? 1 : -1) + PIPELINE.length) % PIPELINE.length;
    render(); $("#st-" + cur).focus();
  });
  render();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { render(); schedule(); } else clearTimeout(timer); }, { threshold: 0.35 }).observe(steps);
}

/* ---------- architecture explorer ---------- */
export function initArch() {
  if (!$("#arch")) return;
  const host = $("#arch"), tabs = $("#arch-tabs"), list = $("#flow-steps"), title = $("#flow-title"), detail = $("#node-detail");
  const nodeMap = {};
  ARCH.zones.forEach((z) => z.nodes.forEach((n) => (nodeMap[n.id] = n)));
  let fi = 0, si = 0, timer = null, pausedUntil = 0, visible = false, pinned = null;

  host.innerHTML = ARCH.zones.map((z) => `
    <div class="zone ${z.id}"><div class="zone-h"><b>${esc(z.label)}</b><span>${esc(z.sub)}</span></div>
      <div class="nodes">${z.nodes.map((n) => `<button class="node" data-n="${n.id}" type="button"><span class="nn">${esc(n.name)}</span><span class="rl">${esc(n.role)}</span><span class="seq"></span></button>`).join("")}</div>
    </div>`).join("");

  tabs.innerHTML = ARCH.flows.map((f, i) => `<button class="chip ${i === 0 ? "on" : ""}" role="tab" aria-selected="${i === 0}" data-f="${i}" type="button">${esc(f.label)}</button>`).join("");

  function showDetail(id, stepText) {
    const n = nodeMap[id]; if (!n) return;
    detail.innerHTML = `<span class="pill cyan" style="align-self:flex-start">${esc(n.role)}</span><h4>${esc(n.name)}</h4><p>${esc(n.desc)}</p>${stepText ? `<p style="color:var(--amber)">In this flow: ${esc(stepText)}</p>` : ""}`;
  }
  function paint() {
    const flow = ARCH.flows[fi];
    title.textContent = flow.label;
    list.innerHTML = flow.steps.map(([id, t], i) => `<li class="${i === si ? "on" : ""}" data-s="${i}"><span><b>${esc(nodeMap[id].name)}</b> ${esc(t)}</span></li>`).join("");
    const seqs = {};
    flow.steps.forEach(([id], i) => (seqs[id] = (seqs[id] || []).concat(i + 1)));
    $$(".node", host).forEach((el) => {
      const id = el.dataset.n, inFlow = !!seqs[id];
      el.classList.toggle("lit", inFlow);
      el.classList.toggle("dim", !inFlow);
      el.classList.toggle("cur", flow.steps[si][0] === id);
      el.classList.toggle("sel", pinned === id);
      $(".seq", el).textContent = inFlow ? seqs[id].join(",") : "";
    });
    const [cid, ctext] = flow.steps[si];
    showDetail(pinned || cid, pinned ? (seqs[pinned] ? flow.steps[seqs[pinned][0] - 1][1] : "") : ctext);
  }
  function tick() {
    clearTimeout(timer);
    if (!visible || reduceMotion()) return;
    timer = setTimeout(() => {
      if (Date.now() > pausedUntil) { si = (si + 1) % ARCH.flows[fi].steps.length; paint(); }
      tick();
    }, 1700);
  }
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    fi = +b.dataset.f; si = 0; pinned = null;
    $$(".chip", tabs).forEach((c) => { const on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-selected", String(on)); });
    pausedUntil = Date.now() + 6000; paint();
  });
  list.addEventListener("click", (e) => { const li = e.target.closest("li"); if (!li) return; si = +li.dataset.s; pinned = null; pausedUntil = Date.now() + 8000; paint(); });
  host.addEventListener("click", (e) => { const n = e.target.closest(".node"); if (!n) return; pinned = pinned === n.dataset.n ? null : n.dataset.n; pausedUntil = Date.now() + 8000; paint(); });
  host.addEventListener("mouseover", (e) => { const n = e.target.closest(".node"); if (n && !pinned) showDetail(n.dataset.n); });
  host.addEventListener("mouseleave", () => { if (!pinned) paint(); });
  paint();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) tick(); else clearTimeout(timer); }, { threshold: 0.3 }).observe(host);

  // schema, lightly highlighted
  const sch = esc(SCHEMA)
    .replace(/(--[^\n]*)/g, '<span class="cm">$1</span>')
    .replace(/\b(create table|references|primary key|unique)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(uuid|text|real|vector\(384\))/g, '<span class="ty">$1</span>');
  $("#schema").innerHTML = sch;
}

/* ---------- papers ---------- */
export function initPapers() {
  if (!$("#papers")) return;
  const grid = $("#papers"), q = $("#p-q"), tagsEl = $("#p-tags"), count = $("#p-count");
  let tag = "all";
  tagsEl.innerHTML = PAPER_TAGS.map((t) => `<button class="chip ${t.id === "all" ? "on" : ""}" type="button" data-t="${t.id}" aria-pressed="${t.id === "all"}">${esc(t.label)}</button>`).join("");

  const card = (p) => `
    <article class="paper reveal in">
      <div class="top"><span class="no">[${p.n}]</span><span>${p.year}</span><span>/</span><span>${esc(p.venue)}</span></div>
      <h4>${esc(p.title)}</h4>
      <div class="au">${esc(p.authors)}</div>
      <dl><dt>Technique</dt><dd>${esc(p.technique)}</dd><dt>Data</dt><dd>${esc(p.data)}</dd><dt>Measured</dt><dd>${esc(p.params)}</dd><dt>Takeaway</dt><dd>${esc(p.inference)}</dd></dl>
      <div class="foot"><a class="doi" href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener noreferrer">doi:${esc(p.doi)}</a><a class="btn btn-ghost btn-xs" href="${p.url}" target="_blank" rel="noopener noreferrer">Open paper ${ic("ext")}</a></div>
    </article>`;

  function render() {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = PAPERS.filter((p) => {
      if (tag !== "all" && !p.tags.includes(tag)) return false;
      const hay = [p.title, p.authors, p.venue, p.technique, p.data, p.params, p.inference, p.objective, String(p.year)].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    grid.innerHTML = rows.length ? rows.map(card).join("") : `<div class="empty">No papers match. Try a different word or clear the filter.</div>`;
    count.textContent = `Showing ${rows.length} of ${PAPERS.length} papers`;
  }
  tagsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    tag = b.dataset.t;
    $$(".chip", tagsEl).forEach((c) => { const on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); });
    render();
  });
  q.addEventListener("input", render);
  render();

  $("#gap").innerHTML = GAP.map((g, i) => `
    <div class="gap-row reveal" style="--d:${i * 60}ms">
      <div class="p"><b>${esc(g.paper)}</b><span>${esc(g.authors)} [${g.ref}]</span></div>
      <div class="m"><b>${esc(g.method)}</b><span>${esc(g.finding)}</span></div>
      <div class="arr">${ic("arrow")}</div>
      <div class="x">${esc(g.ext)}<small>project extension</small></div>
    </div>`).join("");
}

/* ---------- plan ---------- */
export function initPlan() {
  if (!$("#gantt")) return;
  const g = $("#gantt");
  g.innerHTML = PLAN.map((p) => `
    <div class="gantt-row"><div class="nm">${esc(p.name)}<small>${esc(p.note)}</small></div>
      <div class="track" role="img" aria-label="${esc(p.name)}: ${esc(p.days)}"><div class="bar-fill ${p.pre ? "pre" : ""}" style="--l:${p.from}%;--w:${p.w}%">${esc(p.days)}</div></div>
    </div>`).join("");
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { g.classList.add("in"); o.disconnect(); } }, { threshold: 0.3 }).observe(g);

  $("#eval").innerHTML = EVAL.map((e, i) => `<article class="card reveal" style="--d:${i * 70}ms"><h3>${esc(e.h)}</h3><p>${esc(e.t)}</p></article>`).join("");
  $("#costs").innerHTML = COSTS.map((c, i) => `<article class="card cost reveal" style="--d:${i * 70}ms"><h3>${esc(c.h)}</h3><p>${esc(c.t)}</p><div class="k">${esc(c.k)}</div></article>`).join("");
}

/* ---------- roadmap / audience / faq / team / refs ---------- */
const setHtml = (sel, html) => { const e = $(sel); if (e) e.innerHTML = html; };
export function initStatic() {
  setHtml("#aud", AUDIENCE.map((a, i) => `<article class="card reveal" style="--d:${i * 70}ms"><h3>${esc(a.h)}</h3><p>${esc(a.t)}</p></article>`).join(""));
  setHtml("#road", ROADMAP.map((r, i) => `<article class="card reveal" style="--d:${(i % 4) * 70}ms"><h3>${esc(r.h)}</h3><p>${esc(r.t)}</p></article>`).join(""));

  setHtml("#faq-list", FAQ.map((f) => `<details><summary>${esc(f.q)}<i aria-hidden="true">+</i></summary><div class="ans">${esc(f.a)}</div></details>`).join(""));

  setHtml("#team-grid", TEAM.map((t, i) => `<article class="card person reveal" style="--d:${i * 80}ms"><div class="avatar" aria-hidden="true">${esc(t.initials)}</div><h3>${esc(t.name)}</h3><div class="id">${esc(t.id)}</div></article>`).join(""));
  setHtml("#guide", `<div class="avatar" aria-hidden="true">NG</div><div><span class="eyebrow">Under the guidance of</span><h3 style="font-family:var(--font-display);font-size:1.5rem;letter-spacing:-0.02em;margin-top:8px">${esc(GUIDE.name)}</h3><p style="color:var(--muted);margin:2px 0 0">${esc(GUIDE.role)}, Department of Computer Science and Engineering</p></div>`);

  setHtml("#refs", PAPERS.map((p) => `<li><span class="rn">[${p.n}]</span><b>${esc(p.authors)}</b> (${p.year}). ${esc(p.title)}. <i>${esc(p.venue)}</i>.<br><a href="https://doi.org/${encodeURI(p.doi)}" target="_blank" rel="noopener noreferrer">https://doi.org/${esc(p.doi)}</a></li>`).join(""));
  setHtml("#impl", REFS_IMPL.map((r) => `<a href="${r.url}" target="_blank" rel="noopener noreferrer"><span>${esc(r.h)}</span>${ic("ext")}</a>`).join(""));
}
