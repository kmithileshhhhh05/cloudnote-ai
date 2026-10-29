// Interactive workspace: player + transcript + three feature panels sharing one state.
import { VIDEOS, CHUNKS, CHUNKS_BY_ID, KEYPOINTS_V2, SAMPLE_NOTES, SAMPLE_REFERENCES, NOTES, ASK_SAMPLES } from "./demo-data.js";
import { keywords, buildIndex, search, detectReferences, detectInText, referenceQuery, compareNotes, checkPending, THRESHOLD, fmtTime } from "./nlp.js";
import { $, $$, esc, ic, sleep, toast, waveHeights, reduceMotion } from "./util.js";

const NOTES_KEY = "cloudnote-demo-notes-v1";
const BARS = 72;
const SPEEDS = [4, 8, 16];

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } };
const safeDel = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

const V2 = CHUNKS.filter((c) => c.videoId === "v2");
const chunksOf = (vid) => CHUNKS.filter((c) => c.videoId === vid);

function freshState() {
  const saved = safeGet(NOTES_KEY);
  const refs = detectReferences(V2).map((r) => ({
    id: "r-" + r.chunk.id, kind: "chunk", chunkId: r.chunk.id, phrase: r.phrase,
    query: referenceQuery(V2, r.chunkIndex), status: "open", source: null, manual: false,
  }));
  return {
    video: "v2", time: 0, playing: false, speedI: 1,
    uploaded: { v1: true, v2: true, v3: false },
    processing: null, tab: "ask", ask: null,
    refs, userRefN: 0,
    notifs: [], notified: new Set(), lastWorker: null,
    notes: saved != null ? saved : SAMPLE_NOTES, noteSaved: saved != null ? saved : SAMPLE_NOTES,
    cmp: null, dismissed: new Set(),
    tryResult: null, log: [], workerBusy: false, bellOpen: false,
  };
}

export function initWorkspace() {
  const root = $("#ws");
  if (!root) return;
  let S = freshState();
  let idxCache = { key: "", idx: null };
  let timer = null;
  let lastChunk = { video: "", id: "" };
  let waveCache = {};

  const getIndex = () => {
    const key = Object.keys(S.uploaded).filter((k) => S.uploaded[k]).join(",");
    if (idxCache.key !== key) idxCache = { key, idx: buildIndex(CHUNKS.filter((c) => S.uploaded[c.videoId])) };
    return idxCache.idx;
  };
  const candidates = (query, exclude = "v2", k = 3) => search(getIndex(), query, { excludeVideo: exclude, k }).filter((h) => h.score >= THRESHOLD);
  const vtitle = (id) => VIDEOS[id].title;
  const stamp = (c) => `${esc(vtitle(c.videoId))} ${fmtTime(c.start)}`;
  const seekBtn = (c, label) => `<button type="button" class="linkbtn ts" data-seek="${c.videoId}:${c.start}" aria-label="Open ${esc(vtitle(c.videoId))} at ${fmtTime(c.start)}">${label || fmtTime(c.start)}</button>`;
  const hl = (text, phrase) => {
    if (!phrase) return esc(text);
    const i = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + phrase.length)) + "</mark>" + esc(text.slice(i + phrase.length));
  };
  const excerpt = (c, n = 150) => (c.text.length > n ? c.text.slice(0, n - 1).trimEnd() + "..." : c.text);

  /* ================= skeleton ================= */
  root.insertAdjacentHTML("beforeend", `
    <div class="ws-bar">
      <div class="lights" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="title"><b>CloudNote AI</b><span>workspace / demo library</span></div>
      <span class="sp"></span>
      <button class="btn btn-ghost btn-xs" type="button" id="ws-reset" title="Reset the demo">${ic("reset")} Reset</button>
      <div class="bellwrap">
        <button class="bell" id="bell" type="button" aria-label="Notifications" aria-expanded="false" aria-haspopup="true">${ic("bell")}<span class="n" id="bell-n">0</span></button>
        <div class="notif" id="notif" role="menu" aria-label="Notifications"></div>
      </div>
    </div>
    <div class="tour-cap" id="tour-cap" role="status" aria-live="polite"><b id="tour-step"></b><span id="tour-text"></span></div>
    <div class="lib" id="lib"></div>
    <div class="ws-main">
      <div class="ws-left">
        <div class="player" id="player">
          <div class="screen" id="screen"></div>
          <div class="ctrl">
            <button class="pbtn" id="play" type="button" aria-label="Play">${ic("play")}</button>
            <span class="time" id="time"></span><span class="sp"></span>
            <button class="chip" id="speed" type="button" aria-label="Playback speed" style="height:30px"></button>
          </div>
          <div class="scrub-wrap"><div class="scrub" id="scrub" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="wv" id="wv"></div><div class="head" id="head"></div><div id="pins"></div></div></div>
          <div class="legend"><span><i style="background:var(--amber)"></i>reference</span><span><i style="background:var(--green)"></i>linked</span><span><i style="background:var(--cyan)"></i>source</span><span><i style="box-shadow:0 0 0 1.5px var(--amber)"></i>remembered</span></div>
        </div>
        <div class="tx"><div class="tx-h"><span id="tx-title"></span><span>demo speed</span></div><div class="tx-list" id="tx-list" role="list"></div></div>
      </div>
      <div class="ws-right">
        <div class="tabs" role="tablist" aria-label="Features" id="tabs">
          <button class="tab" role="tab" id="tab-ask" data-tab="ask" aria-controls="pn-ask">${ic("search")} Notes &amp; Ask</button>
          <button class="tab" role="tab" id="tab-context" data-tab="context" aria-controls="pn-context">${ic("compass")} Context Recovery <span class="c" id="c-context">0</span></button>
          <button class="tab" role="tab" id="tab-notes" data-tab="notes" aria-controls="pn-notes">${ic("cols")} Notes vs Video</button>
          <button class="tab" role="tab" id="tab-remember" data-tab="remember" aria-controls="pn-remember">${ic("bookmark")} Missing Explanation <span class="c" id="c-remember">0</span></button>
          <button class="tab" role="tab" id="tab-map" data-tab="map" aria-controls="pn-map">${ic("graph")} Library Map <span class="c amber" id="c-map">0</span></button>
        </div>
        <div class="tabpanel" id="pn-ask" role="tabpanel" aria-labelledby="tab-ask">
          <div class="pnl-h"><div><h3>Notes and Ask</h3><p>Automatic notes for the video you are watching, and a search box that answers with moments, not paragraphs.</p></div></div>
          <div id="ask-notes" style="display:grid;gap:12px"></div>
          <div class="try">
            <label for="ask-in">Ask your library</label>
            <div class="inp"><input id="ask-in" type="text" placeholder="e.g. Which port should the application use?" autocomplete="off"><button class="btn btn-primary btn-sm" id="ask-go" type="button">Find the moment</button></div>
            <div class="chips" id="ask-chips"></div>
            <div id="ask-out" aria-live="polite"></div>
          </div>
        </div>
        <div class="tabpanel" id="pn-context" role="tabpanel" aria-labelledby="tab-context" hidden>
          <div class="pnl-h"><div><h3>Video Context Recovery</h3><p>References found in <b>${esc(vtitle("v2"))}</b>. Each search uses the surrounding sentences and only your own library.</p></div></div>
          <div id="ctx-refs" style="display:grid;gap:12px"></div>
          <div class="try">
            <label for="try-in">Try your own sentence</label>
            <div class="inp"><input id="try-in" type="text" placeholder="e.g. As we covered earlier, the bind address..." autocomplete="off"><button class="btn btn-primary btn-sm" id="try-go" type="button">Find context</button></div>
            <div class="chips" id="try-chips"></div>
            <div id="try-out" aria-live="polite"></div>
          </div>
        </div>
        <div class="tabpanel" id="pn-notes" role="tabpanel" aria-labelledby="tab-notes" hidden>
          <div class="pnl-h"><div><h3>My Notes vs Video</h3><p>Compare what you wrote with the transcript of <b>${esc(vtitle("v2"))}</b>. Your notes stay untouched until you save.</p></div></div>
          <label class="sr-only" for="notes-ta">Your notes</label>
          <textarea class="notes-ta" id="notes-ta" spellcheck="false" placeholder="Paste your notes here, one point per line"></textarea>
          <div class="savebar" id="savebar"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="cmp-go" type="button">${ic("cols")} Compare with transcript</button><button class="btn btn-ghost btn-sm" id="notes-sample" type="button">Restore sample notes</button></div>
          <div id="cmp-out" aria-live="polite"></div>
          <p class="hint">Illustrative: the video's key points are precomputed here. In the real app a Bedrock model extracts them, every source ID is checked against the transcript, and a claim absent from the video is not automatically false.</p>
        </div>
        <div class="tabpanel" id="pn-remember" role="tabpanel" aria-labelledby="tab-remember" hidden>
          <div class="pnl-h"><div><h3>Remember the Missing Explanation</h3><p>Save what no video explains yet. Upload tomorrow's recording and let the worker check again.</p></div></div>
          <div id="rem-body" style="display:grid;gap:14px"></div>
        </div>
        <div class="tabpanel" id="pn-map" role="tabpanel" aria-labelledby="tab-map" hidden>
          <div class="pnl-h"><div><h3>Library Map</h3><p>Which recordings lean on which, the order to watch them in, and what your library assumes but never explains.</p></div></div>
          <div id="map-body" style="display:grid;gap:14px"></div>
        </div>
      </div>
    </div>`);

  const el = {
    lib: $("#lib"), screen: $("#screen"), play: $("#play"), time: $("#time"), speed: $("#speed"), scrub: $("#scrub"), wv: $("#wv"), head: $("#head"), pins: $("#pins"),
    txList: $("#tx-list"), txTitle: $("#tx-title"), ctxRefs: $("#ctx-refs"), tryOut: $("#try-out"), tryIn: $("#try-in"), notesTa: $("#notes-ta"), cmpOut: $("#cmp-out"), savebar: $("#savebar"),
    askNotes: $("#ask-notes"), askOut: $("#ask-out"), askIn: $("#ask-in"), rem: $("#rem-body"), map: $("#map-body"), cMap: $("#c-map"), bell: $("#bell"), bellN: $("#bell-n"), notif: $("#notif"), cCtx: $("#c-context"), cRem: $("#c-remember"),
  };
  $("#ask-chips").innerHTML = ASK_SAMPLES.map((q, i) => `<button type="button" class="chip" data-ask="${i}">${esc(q)}</button>`).join("");
  $("#try-chips").innerHTML = SAMPLE_REFERENCES.map((s, i) => `<button type="button" class="chip" data-try="${i}">${esc(s)}</button>`).join("");
  el.notesTa.value = S.notes;

  /* ================= library ================= */
  function renderLib() {
    el.lib.innerHTML = Object.values(VIDEOS).map((v) => {
      const up = S.uploaded[v.id], proc = S.processing === v.id;
      const status = proc ? '<span class="pill amber">processing</span>' : up ? '<span class="pill green"><span class="dot"></span>indexed</span>' : '<span class="pill dim">not uploaded</span>';
      return `<button type="button" class="vid ${S.video === v.id ? "active" : ""} ${!up ? "locked" : ""} ${proc ? "processing" : ""}" data-vid="${v.id}" aria-pressed="${S.video === v.id}">
        <span class="th">${esc(v.tag)}</span><span class="tx2"><span class="tt">${esc(v.title)}</span><span class="ss">${fmtTime(v.duration)} ${status}</span></span></button>`;
    }).join("");
  }

  /* ================= player ================= */
  function waveFor(vid) {
    if (!waveCache[vid]) waveCache[vid] = waveHeights(vid, BARS);
    return waveCache[vid];
  }
  function renderVideo() {
    const v = VIDEOS[S.video];
    el.txTitle.textContent = `Transcript: ${v.title}`;
    el.wv.innerHTML = waveFor(S.video).map((h) => `<i style="--h:${h}%"></i>`).join("");
    el.txList.innerHTML = chunksOf(S.video).map((c) => {
      const d = detectInText(c.text);
      return `<button type="button" class="tx-row" data-seek="${c.videoId}:${c.start}" data-cid="${c.id}" role="listitem"><span class="t">${fmtTime(c.start)}</span><span>${d ? hl(c.text, d.phrase) : esc(c.text)}</span></button>`;
    }).join("");
    lastChunk = { video: "", id: "" };
    renderPins();
    renderTime(true); renderAsk();
  }
  function renderPins() {
    const v = VIDEOS[S.video];
    const pins = [];
    if (S.video === "v2") {
      S.refs.filter((r) => r.kind === "chunk").forEach((r) => {
        const c = CHUNKS_BY_ID[r.chunkId];
        pins.push({ at: c.start, cls: r.status === "resolved" ? "resolved" : r.status === "pending" ? "pending" : "", label: `Reference at ${fmtTime(c.start)}` });
      });
    }
    S.refs.forEach((r) => {
      if (r.status === "resolved" && r.source) {
        const sc = CHUNKS_BY_ID[r.source.chunkId];
        if (sc.videoId === S.video) pins.push({ at: sc.start, cls: "target", label: `Linked source at ${fmtTime(sc.start)}` });
      }
    });
    el.pins.innerHTML = pins.map((p) => `<span class="pin ${p.cls}" style="left:${(p.at / v.duration) * 100}%" title="${esc(p.label)}"><i></i></span>`).join("");
  }
  function activeChunk() {
    const list = chunksOf(S.video);
    let a = list[0];
    for (const c of list) if (c.start <= S.time) a = c;
    return a;
  }
  function renderTime(force) {
    const v = VIDEOS[S.video];
    const pct = Math.min(1, S.time / v.duration);
    el.head.style.left = `calc(${pct * 100}% - 1px)`;
    el.time.innerHTML = `<b>${fmtTime(S.time)}</b> / ${fmtTime(v.duration)}`;
    el.scrub.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
    el.scrub.setAttribute("aria-valuetext", `${fmtTime(S.time)} of ${fmtTime(v.duration)}`);
    const bars = el.wv.children, upto = Math.floor(pct * bars.length);
    for (let i = 0; i < bars.length; i++) bars[i].classList.toggle("past", i < upto);
    const c = activeChunk();
    if (force || c.id !== lastChunk.id || S.video !== lastChunk.video) {
      lastChunk = { video: S.video, id: c.id };
      const d = detectInText(c.text);
      const s = c.screen;
      el.screen.innerHTML = `<span class="badge-live">${esc(v.title)}</span>
        <div class="scr-win"><div class="scr-bar"><i></i><i></i><i></i><span>${esc(s.title)}</span></div><div class="scr-body">${s.lines.map((l) => `<div class="${l.startsWith("#") || l.startsWith("(") ? "cm" : l.startsWith("$") ? "pr" : ""}">${esc(l)}</div>`).join("")}</div></div>
        <div class="cc">${d ? hl(c.text, d.phrase) : esc(c.text)}</div>`;
      $$(".tx-row", el.txList).forEach((r) => r.classList.toggle("on", r.dataset.cid === c.id));
      const on = $(".tx-row.on", el.txList);
      if (on) {
        const box = el.txList, top = on.offsetTop - box.offsetTop;
        if (top < box.scrollTop + 8 || top + on.offsetHeight > box.scrollTop + box.clientHeight - 8) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: reduceMotion() ? "auto" : "smooth" });
      }
    }
  }
  function setPlaying(p) {
    S.playing = p;
    el.play.innerHTML = ic(p ? "pause" : "play");
    el.play.setAttribute("aria-label", p ? "Pause" : "Play");
    clearInterval(timer);
    if (p) {
      if (S.time >= VIDEOS[S.video].duration - 0.2) S.time = 0;
      timer = setInterval(() => {
        const v = VIDEOS[S.video];
        S.time += 0.1 * SPEEDS[S.speedI];
        if (S.time >= v.duration) { S.time = v.duration; setPlaying(false); }
        renderTime();
      }, 100);
    }
  }
  function seek(vid, sec, opts = {}) {
    if (!S.uploaded[vid]) return;
    const switched = S.video !== vid;
    S.video = vid;
    S.time = Math.max(0, Math.min(VIDEOS[vid].duration, sec));
    if (switched) { renderLib(); renderVideo(); } else renderTime(true);
    if (opts.flash !== false) {
      const c = activeChunk();
      const row = $(`.tx-row[data-cid="${c.id}"]`, el.txList);
      if (row) { row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); }
    }
    const pl = $("#player"), r = pl.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight) pl.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
  }


  /* ================= notes and ask ================= */
  const askList = (items) => items.map(([cid, text]) => `<li>${esc(text)} ${seekBtn(CHUNKS_BY_ID[cid])}</li>`).join("");
  function renderAsk() {
    const n = NOTES[S.video], v = VIDEOS[S.video];
    el.askNotes.innerHTML = `<div class="rcard"><div class="rh"><b style="font-family:var(--font-display)">${esc(v.title)}</b><span class="pill dim">auto notes, illustrative</span></div>
      <p class="rq">${esc(n.summary)}</p>
      <div><div class="hint">Key points</div><ul class="nlist">${askList(n.points)}</ul></div>
      <div class="two"><div><div class="hint">Action items</div><ul class="nlist">${askList(n.actions)}</ul></div><div><div class="hint">Decisions</div><ul class="nlist">${askList(n.decisions)}</ul></div></div>
      <div class="acts"><button class="btn btn-ghost btn-xs" type="button" id="copy-notes">${ic("note")} Copy as Markdown</button><button class="btn btn-ghost btn-xs" type="button" id="dl-notes">${ic("up", "flip")} Download .md</button></div></div>`;
    renderAskOut();
  }
  function notesMarkdown() {
    const n = NOTES[S.video], v = VIDEOS[S.video];
    const li = (items) => items.map(([cid, t]) => `- ${t} (${fmtTime(CHUNKS_BY_ID[cid].start)})`).join("\n");
    return `# ${v.title}\n\n${n.summary}\n\n## Key points\n${li(n.points)}\n\n## Action items\n${li(n.actions)}\n\n## Decisions\n${li(n.decisions)}\n\n_Illustrative demo content from CloudNote AI._\n`;
  }
  function renderAskOut() {
    const a = S.ask;
    if (!a) { el.askOut.innerHTML = ""; return; }
    const hits = search(getIndex(), a, { k: 3, minScore: 0.14, dropMeta: false });
    el.askOut.innerHTML = hits.length
      ? `<div class="hint">Closest moments across your library. Click one to jump there.</div>` + hits.map((h, i) => `<div class="cand ${i === 0 ? "top" : ""}"><div class="ct">${esc(vtitle(h.chunk.videoId))} ${seekBtn(h.chunk)}</div><div class="sc"><span class="bar"><i style="--w:${Math.min(100, (h.score / 0.8) * 100)}%"></i></span>${h.score.toFixed(2)}</div><div class="cx">${esc(excerpt(h.chunk, 170))}</div><div class="ca"><button class="btn btn-ghost btn-xs" type="button" data-seek="${h.chunk.videoId}:${h.chunk.start}">Play this moment</button></div></div>`).join("")
      : `<div class="nomatch">Nothing in your library is close enough to that question. Try other words, or upload the video that covers it.</div>`;
  }
  function runAsk(q) { q = (q || "").trim(); if (!q) { el.askIn.focus(); return; } S.ask = q; renderAskOut(); }

  /* ================= context tab ================= */
  const statusPill = (r) => r.status === "resolved" ? '<span class="pill green">linked</span>' : r.status === "pending" ? '<span class="pill amber">remembered</span>' : '<span class="pill cyan">needs a source</span>';
  function refCard(r) {
    const c = r.kind === "chunk" ? CHUNKS_BY_ID[r.chunkId] : null;
    const head = c
      ? `<span class="pill amber">Reference at ${seekBtn(c)}</span>`
      : `<span class="pill amber">Your sentence</span>`;
    const quote = c ? hl(c.text, r.phrase) : hl(r.text, r.phrase);
    let body = "";
    if (r.status === "resolved") {
      const sc = CHUNKS_BY_ID[r.source.chunkId];
      body = `<div class="linked">${ic("link")}<span>Linked to <b>${esc(vtitle(sc.videoId))}</b> ${seekBtn(sc)}${r.manual ? " (picked manually)" : ""}. The note now has a clickable link.</span><button class="linkbtn" type="button" data-undo="${r.id}">Undo</button></div>`;
    } else if (r.status === "pending") {
      body = `<div class="nomatch" style="border-style:solid;border-color:rgba(255,198,92,.4)">Saved as a pending reference. After each new upload is indexed, the worker checks it again. <button class="linkbtn" type="button" data-tab-go="remember" style="color:var(--amber)">Open Missing Explanation</button> &nbsp; <button class="linkbtn" type="button" data-undo="${r.id}">Undo</button></div>`;
    } else {
      const cands = candidates(r.query);
      body = cands.length
        ? `<div class="hint">Showing up to three excerpts from your other videos. A score marks a candidate, not proof.</div>` + cands.map((h, i) => `
          <div class="cand ${i === 0 ? "top" : ""}">
            <div class="ct">${esc(vtitle(h.chunk.videoId))} ${seekBtn(h.chunk)}</div>
            <div class="sc"><span class="bar"><i style="--w:${Math.min(100, (h.score / 0.8) * 100)}%"></i></span>${h.score.toFixed(2)}</div>
            <div class="cx">${esc(excerpt(h.chunk))}</div>
            <div class="ca"><button class="btn btn-ok btn-xs" type="button" data-accept="${r.id}|${h.chunk.id}|${h.score.toFixed(3)}">${ic("check")} Accept this source</button><button class="btn btn-ghost btn-xs" type="button" data-seek="${h.chunk.videoId}:${h.chunk.start}">Preview in player</button></div>
          </div>`).join("")
        : `<div class="nomatch"><b>No suitable source in your library yet.</b> The best match did not reach the ${THRESHOLD.toFixed(2)} threshold, so nothing is suggested rather than guessing.</div>`;
      body += manualPicker(r) + `<div class="acts"><button class="btn btn-ghost btn-xs" type="button" data-remember="${r.id}">${ic("bookmark")} Leave unresolved and remember it</button></div>`;
    }
    return `<div class="rcard ${r.status}"><div class="rh">${head}${statusPill(r)}</div><p class="rq">${quote}</p>${body}</div>`;
  }
  function manualPicker(r) {
    const opts = CHUNKS.filter((c) => S.uploaded[c.videoId] && c.videoId !== "v2");
    return `<div style="display:flex;gap:8px;align-items:center"><select class="sel" aria-label="Pick a source manually" data-manual-for="${r.id}"><option value="">Pick a source manually...</option>${opts.map((c) => `<option value="${c.id}">${esc(vtitle(c.videoId))} ${fmtTime(c.start)}: ${esc(excerpt(c, 46))}</option>`).join("")}</select><button class="btn btn-ghost btn-xs" type="button" data-manual="${r.id}">Link</button></div>`;
  }
  function renderContext() {
    el.ctxRefs.innerHTML = S.refs.length ? S.refs.map(refCard).join("") : `<div class="nomatch">No reference phrases detected.</div>`;
    const open = S.refs.filter((r) => r.status === "open").length;
    el.cCtx.textContent = String(open);
    renderTry(); renderMap();
  }
  function renderTry() {
    const t = S.tryResult;
    if (!t) { el.tryOut.innerHTML = ""; return; }
    if (!t.det) { el.tryOut.innerHTML = `<div class="nomatch">No reference phrase detected. Try wording like <i>"as we discussed earlier"</i> or <i>"in the previous tutorial"</i>.</div>`; return; }
    const cands = candidates(t.text);
    el.tryOut.innerHTML = `<div class="rcard"><div class="rh"><span class="pill amber">Detected: "${esc(t.det.phrase)}"</span></div>` +
      (cands.length ? cands.map((h, i) => `<div class="cand ${i === 0 ? "top" : ""}"><div class="ct">${esc(vtitle(h.chunk.videoId))} ${seekBtn(h.chunk)}</div><div class="sc"><span class="bar"><i style="--w:${Math.min(100, (h.score / 0.8) * 100)}%"></i></span>${h.score.toFixed(2)}</div><div class="cx">${esc(excerpt(h.chunk))}</div></div>`).join("")
        : `<div class="nomatch"><b>No suitable source yet.</b> Nothing reached the ${THRESHOLD.toFixed(2)} threshold.</div>`) +
      `<div class="acts"><button class="btn btn-ghost btn-xs" type="button" data-remember-text="1">${ic("bookmark")} Remember this sentence</button></div></div>`;
  }
  function runTry(text) {
    text = (text || "").trim();
    if (!text) { el.tryIn.focus(); return; }
    S.tryResult = { text, det: detectInText(text) };
    renderTry();
  }

  function setStatus(id, status, source = null, manual = false) {
    const r = S.refs.find((x) => x.id === id);
    if (!r) return;
    r.status = status; r.source = source; r.manual = manual;
    renderContext(); renderPins(); renderRemember(); renderBell();
  }

  /* ================= notes tab ================= */
  function renderSavebar() {
    const dirty = S.notes !== S.noteSaved;
    el.savebar.className = "savebar" + (dirty ? " dirty" : "");
    el.savebar.innerHTML = `<span>${dirty ? "Unsaved changes. Your saved notes are preserved until you save." : "Saved. Appears on any device you sign in from."}</span><span style="display:flex;gap:8px"><button class="btn btn-ghost btn-xs" type="button" data-notes-revert ${dirty ? "" : "disabled"}>Revert</button><button class="btn btn-ok btn-xs" type="button" data-notes-save ${dirty ? "" : "disabled"}>${ic("check")} Save notes</button></span>`;
  }
  const VERDICT = { covered: ["green", "Covered"], mismatch: ["red", "Possible mismatch"], missed: ["amber", "Missed key point"] };
  function renderCompare() {
    if (!S.cmp) { el.cmpOut.innerHTML = ""; return; }
    const { results } = S.cmp;
    const n = (v) => results.filter((r) => r.verdict === v).length;
    el.cmpOut.innerHTML = `<div class="sumrow"><div class="sumcell g"><b>${n("covered")}</b><span>covered</span></div><div class="sumcell r"><b>${n("mismatch")}</b><span>mismatch</span></div><div class="sumcell a"><b>${n("missed")}</b><span>missed</span></div></div>
    <div style="display:grid;gap:10px;margin-top:12px">` + results.map((r) => {
      const [col, label] = VERDICT[r.verdict];
      const dismissed = S.dismissed.has(r.keypoint.id);
      let extra = "", acts = "";
      if (r.verdict === "mismatch") {
        extra = `<div class="mm"><span>Your notes:</span><s>${esc(r.detail.notes)}</s><span>Video says:</span><b>${esc(r.detail.video)}</b></div>`;
        acts = `<button class="btn btn-ok btn-xs" type="button" data-fix="${r.keypoint.id}">Use the video's value (${esc(r.detail.video)})</button><button class="btn btn-ghost btn-xs" type="button" data-edit-note>Edit myself</button>`;
      } else if (r.verdict === "missed") {
        acts = `<button class="btn btn-ok btn-xs" type="button" data-add="${r.keypoint.id}">${ic("check")} Add to my notes</button><button class="btn btn-ghost btn-xs" type="button" data-edit-note>Edit first</button>`;
      }
      if (r.verdict !== "covered") acts += dismissed ? `<button class="btn btn-ghost btn-xs" type="button" data-undismiss="${r.keypoint.id}">Undo dismiss</button>` : `<button class="btn btn-ghost btn-xs" type="button" data-dismiss="${r.keypoint.id}">Dismiss</button>`;
      return `<div class="vcard ${r.verdict} ${dismissed ? "done" : ""}"><div class="vh"><span class="pill ${col}">${label}</span><span class="hint">key point ${esc(r.keypoint.id.replace("kp", ""))} of ${results.length}</span></div>
        <div class="kp">${esc(r.keypoint.text)}</div>
        ${r.bestLine && r.verdict !== "missed" ? `<div class="hint">Matched your line: "${esc(r.bestLine)}"</div>` : ""}
        ${extra}
        <div class="ev">Evidence ${seekBtn(r.chunk)}: "${esc(excerpt(r.chunk, 110))}"</div>
        ${acts && !dismissed ? `<div class="acts">${acts}</div>` : dismissed ? `<div class="acts">${acts}</div>` : ""}</div>`;
    }).join("") + `</div>`;
  }
  function runCompare(announce) {
    S.cmp = compareNotes(S.notes, KEYPOINTS_V2, CHUNKS_BY_ID);
    renderCompare();
    if (announce) {
      const n = (v) => S.cmp.results.filter((r) => r.verdict === v).length;
      toast(`${n("covered")} covered, ${n("mismatch")} possible mismatch, ${n("missed")} missed`);
    }
  }
  function setNotes(text, { run = true } = {}) {
    S.notes = text; el.notesTa.value = text; renderSavebar();
    if (run && S.cmp) runCompare(false);
  }

  /* ================= remember tab ================= */
  const addLog = (cls, text) => {
    S.log.push([cls, text]);
    const l = $("#rem-log");
    if (!l) { renderRemember(); return; }
    l.insertAdjacentHTML("beforeend", `<div class="${cls}">${esc(text)}</div>`);
    l.scrollTop = l.scrollHeight;
  };
  function pendingRefs() { return S.refs.filter((r) => r.status === "pending"); }
  function renderRemember() {
    const pend = pendingRefs();
    const newN = S.notifs.filter((n) => n.status === "new").length;
    el.cRem.textContent = String(newN || pend.length);
    el.cRem.classList.toggle("amber", newN > 0);
    const day2 = S.uploaded.v3;
    const steps = [
      ["Upload a video with an unresolved reference", S.refs.some((r) => r.status === "pending") || day2 ? "done" : "now"],
      ["Save the reference as pending", pend.length || day2 ? "done" : S.refs.length ? "now" : ""],
      ["Upload another video later", day2 ? "done" : pend.length ? "now" : ""],
      ["Worker checks pending references after indexing", S.lastWorker ? "done" : day2 ? "now" : ""],
      ["You confirm or reject the suggested link", S.notifs.some((n) => n.status !== "new") ? "done" : newN ? "now" : ""],
    ];
    const pendHtml = pend.length ? pend.map((r) => {
      const c = r.kind === "chunk" ? CHUNKS_BY_ID[r.chunkId] : null;
      return `<div class="rcard pending"><div class="rh"><span class="pill amber">${c ? `${esc(vtitle(c.videoId))} ${seekBtn(c)}` : "Your sentence"}</span><span class="pill dim">waiting for a matching upload</span></div><p class="rq">${c ? hl(c.text, r.phrase) : hl(r.text, r.phrase)}</p></div>`;
    }).join("") : `<div class="nomatch">Nothing remembered yet. ${S.refs.some((r) => r.id === "r-v2-05" && r.status === "open") ? `<button class="btn btn-ghost btn-xs" type="button" data-remember="r-v2-05" style="margin-top:8px">${ic("bookmark")} Remember the database-settings reference</button>` : "Use Context Recovery to leave a reference unresolved."}</div>`;

    const reviews = S.notifs.map((n) => {
      const r = S.refs.find((x) => x.id === n.refId);
      const oc = r.kind === "chunk" ? CHUNKS_BY_ID[r.chunkId] : null;
      const cc = CHUNKS_BY_ID[n.chunkId];
      if (n.status === "accepted") return `<div class="linked">${ic("link")}<span>Link saved in the older video's notes: ${oc ? `<b>${esc(vtitle(oc.videoId))} ${fmtTime(oc.start)}</b>` : "your sentence"} now points to <b>${esc(vtitle(cc.videoId))}</b> ${seekBtn(cc)}.</span></div>`;
      if (n.status === "rejected") return `<div class="nomatch">You rejected that candidate. It will not be suggested again, and the reference keeps waiting for other uploads.</div>`;
      return `<div class="review rcard" style="border-color:rgba(255,198,92,.55)"><div class="rh"><span class="pill amber"><span class="dot live"></span>Possible explanation found</span><span class="pill cyan">similarity ${n.score.toFixed(2)}</span></div>
        <div class="cmp"><div><small>Where you asked</small><b>${oc ? esc(vtitle(oc.videoId)) : "Your sentence"}</b>${oc ? seekBtn(oc) : ""}<span>${hl(oc ? oc.text : r.text, r.phrase)}</span></div><div><small>Possible explanation</small><b>${esc(vtitle(cc.videoId))}</b>${seekBtn(cc)}<span>${esc(cc.text)}</span></div></div>
        <div class="hint">Open both excerpts, then decide. A similarity score indicates a candidate, not proof of the original source.</div>
        <div class="sp-actions"><button class="btn btn-ok btn-xs" type="button" data-review="accept|${n.id}">${ic("check")} Accept link</button><button class="btn btn-warn btn-xs" type="button" data-review="reject|${n.id}">Reject</button></div></div>`;
    }).join("");

    el.rem.innerHTML = `
      <div class="days"><div class="day on"><b>Day 1 · Today</b><span>${esc(vtitle("v2"))} uploaded</span></div><div class="day ${day2 ? "on" : ""}"><b>Day 2 · Tomorrow</b><span>${day2 ? esc(vtitle("v3")) + " uploaded" : "Waiting for an upload"}</span></div></div>
      <div class="stepper-m">${steps.map(([t, st], i) => `<div class="sm ${st}"><i>${st === "done" ? "&#10003;" : i + 1}</i><span>${esc(t)}</span></div>`).join("")}</div>
      <div><div class="hint" style="margin-bottom:8px">Pending references (${pend.length})</div><div style="display:grid;gap:10px">${pendHtml}</div></div>
      <div class="sp-actions">
        <button class="btn btn-primary btn-sm" type="button" id="up-v3" ${S.uploaded.v3 || S.workerBusy ? "disabled" : ""}>${ic("clock")} Fast-forward: upload "${esc(vtitle("v3"))}"</button>
        <button class="btn btn-ghost btn-sm" type="button" id="re-check" ${S.uploaded.v3 && !S.workerBusy ? "" : "disabled"}>Run the worker again</button>
      </div>
      ${S.log.length ? `<div class="log" id="rem-log" aria-live="polite">${S.log.map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join("")}</div>` : ""}
      ${reviews ? `<div style="display:grid;gap:10px">${reviews}</div>` : ""}`;
    renderMap();
  }

  async function runWorker(videoId, { first }) {
    S.workerBusy = true;
    renderRemember();
    const pend = pendingRefs();
    if (first) {
      addLog("mu", `> upload ${vtitle(videoId)}.mp4  (private storage, under 50 MB)`);
      S.processing = videoId; renderLib();
      await sleep(550); addLog("mu", "> ffmpeg: extracting audio");
      await sleep(600); addLog("mu", "> whisper: transcribing, saving timestamped chunks");
      await sleep(650); addLog("mu", `> embeddings: ${chunksOf(videoId).length} chunks indexed`);
      S.uploaded[videoId] = true; S.processing = null; idxCache.key = "";
      renderLib(); renderContext();
    }
    await sleep(450);
    addLog("ac", `> worker: checking ${pend.length} pending reference${pend.length === 1 ? "" : "s"} against ${vtitle(videoId)} only`);
    await sleep(500);
    const found = checkPending(getIndex(), pend.map((r) => ({ id: r.id, status: "pending", query: r.query })), videoId, S.notified);
    S.lastWorker = Date.now();
    if (!found.length) {
      addLog("wr", pend.length ? "> no new candidates (anything already alerted is not repeated)" : "> nothing pending, nothing to check");
    } else {
      found.forEach((f) => {
        S.notified.add(f.key);
        S.notifs.push({ id: "n" + (S.notifs.length + 1), refId: f.ref.id, chunkId: f.hit.chunk.id, score: f.hit.score, status: "new" });
        addLog("ok", `> candidate: ${vtitle(videoId)} ${fmtTime(f.hit.chunk.start)}  similarity ${f.hit.score.toFixed(2)}  -> in-app notification saved`);
      });
    }
    S.workerBusy = false;
    renderRemember(); renderBell();
    if (found.length) { ringBell(); toast("New notification: possible explanation found"); }
  }


  /* ================= library map ================= */
  const POS = { v2: [200, 22], v1: [75, 168], v3: [325, 168] };
  function mapData() {
    const edges = [], gaps = [];
    S.refs.forEach((r) => {
      const c = r.kind === "chunk" ? CHUNKS_BY_ID[r.chunkId] : null;
      const from = c ? c.videoId : "v2", at = c ? c.start : null;
      if (r.status === "resolved" && r.source) {
        const t = CHUNKS_BY_ID[r.source.chunkId];
        edges.push({ from, to: t.videoId, kind: "ok", label: `${at != null ? fmtTime(at) : "text"} to ${fmtTime(t.start)}` });
      } else {
        const note = S.notifs.find((n) => n.refId === r.id && n.status === "new");
        gaps.push({ r, from, at, phrase: r.phrase, topic: keywords(r.query, 4), candidate: note ? CHUNKS_BY_ID[note.chunkId] : null, pending: r.status === "pending" });
      }
    });
    return { edges, gaps };
  }
  function watchOrder(edges) {
    const vids = Object.keys(VIDEOS).filter((v) => S.uploaded[v]);
    const deps = Object.fromEntries(vids.map((v) => [v, new Set(edges.filter((e) => e.from === v && e.to !== v).map((e) => e.to))]));
    const out = [], left = new Set(vids);
    while (left.size) {
      const ready = [...left].filter((v) => [...deps[v]].every((d) => !left.has(d)));
      const pick = ready.length ? ready : [...left];
      pick.forEach((v) => { out.push(v); left.delete(v); });
    }
    return out;
  }
  function renderMap() {
    if (!el.map) return;
    const { edges, gaps } = mapData();
    const total = S.refs.length, done = edges.length;
    el.cMap.textContent = String(gaps.length);
    el.cMap.classList.toggle("amber", gaps.length > 0);
    const ghost = !S.uploaded.v3;
    const node = (id, x, y, ghostNode) => {
      const v = VIDEOS[id];
      const cls = ghostNode ? "gn ghost" : "gn";
      return `<g class="${cls}" transform="translate(${x - 62},${y})"><rect width="124" height="46" rx="12"/><text x="62" y="20" text-anchor="middle" class="t1">${esc(ghostNode ? "Missing explanation" : v.title.replace(" Tutorial", ""))}</text><text x="62" y="36" text-anchor="middle" class="t2">${ghostNode ? "not uploaded yet" : esc(fmtTime(v.duration))}</text></g>`;
    };
    let paths = "";
    const per = {};
    const draw = (from, to, cls, label, i) => {
      const [x1, y1] = POS[from], [x2, y2] = POS[to];
      const off = (i % 3) * 14 - 8;
      const sx = x1 + off, ex = x2 + off * 0.5, sy = y1 + 46, ey = y2;
      const my = (sy + ey) / 2;
      paths += `<path class="ed ${cls}" d="M${sx},${sy} C${sx},${my} ${ex},${my} ${ex},${ey}"/>`;
      paths += `<text class="el ${cls}" x="${(sx + ex) / 2 + (ex < sx ? -6 : 6)}" y="${my + i * 12}" text-anchor="${ex < sx ? "end" : "start"}">${esc(label)}</text>`;
    };
    edges.forEach((e) => { per[e.to] = (per[e.to] || 0); draw(e.from, e.to, "ok", e.label, per[e.to]++); });
    gaps.forEach((g) => { const to = "v3"; per[to] = (per[to] || 0); draw(g.from, to, g.candidate ? "cand" : "gap", g.at != null ? `${fmtTime(g.at)} ?` : "?", per[to]++); });
    const order = watchOrder(edges);
    const report = gaps.length
      ? gaps.map((g) => `<div class="gapitem"><div class="rh"><span class="pill ${g.candidate ? "cyan" : "amber"}">${g.candidate ? "candidate found" : g.pending ? "remembered gap" : "open gap"}</span><span class="hint">${g.at != null ? `${esc(vtitle(g.from))} ${seekBtn(CHUNKS_BY_ID[g.r.chunkId])}` : "your sentence"}</span></div>
          <p class="rq">${g.at != null ? hl(CHUNKS_BY_ID[g.r.chunkId].text, g.phrase) : hl(g.r.text, g.phrase)}</p>
          <div class="hint">${g.candidate ? `Possible fix: ${esc(vtitle(g.candidate.videoId))} ${seekBtn(g.candidate)}. Confirm it in Missing Explanation.` : `<b style="color:var(--text)">Record or upload a video covering:</b> ${g.topic.map((w) => `<span class="kw">${esc(w)}</span>`).join(" ")}`}</div></div>`).join("")
      : `<div class="linked">${ic("check")}<span>Every reference in this library has a confirmed source. Nothing is assumed without being explained.</span></div>`;
    el.map.innerHTML = `
      <svg class="map" viewBox="0 0 400 230" role="img" aria-label="Dependency map of recordings">${paths}${node("v2", ...POS.v2)}${node("v1", ...POS.v1)}${node("v3", POS.v3[0], POS.v3[1], ghost)}</svg>
      <div class="sumrow"><div class="sumcell g"><b>${done}</b><span>linked</span></div><div class="sumcell a"><b>${gaps.length}</b><span>gaps</span></div><div class="sumcell"><b>${total ? Math.round((done / total) * 100) : 100}%</b><span>explained</span></div></div>
      <div><div class="hint" style="margin-bottom:8px">Suggested watch order</div><ol class="wo">${order.map((v, i) => `<li><span class="n">${i + 1}</span><button type="button" class="linkbtn" data-vid="${v}" style="color:var(--text);text-decoration:none">${esc(vtitle(v))}</button>${gaps.some((g) => g.from === v) ? '<span class="pill amber">assumes missing knowledge</span>' : ""}</li>`).join("")}</ol></div>
      <div><div class="hint" style="margin-bottom:8px">Gaps report: what your recordings assume but never explain</div><div style="display:grid;gap:10px">${report}</div></div>
      <div class="sp-actions"><button class="btn btn-ghost btn-xs" type="button" id="copy-gaps">${ic("note")} Copy report</button></div>
      <p class="hint">Built from the same reference links you confirm in the other tabs. For instructors and teams, it turns "students keep asking about X" into a list of recordings to make.</p>`;
  }
  function gapsText() {
    const { edges, gaps } = mapData();
    const lines = ["CloudNote AI gaps report (illustrative demo)", `${edges.length} linked, ${gaps.length} gaps`, ""];
    gaps.forEach((g, i) => lines.push(`${i + 1}. ${g.at != null ? vtitle(g.from) + " " + fmtTime(g.at) : "Your sentence"}: "${g.phrase}" has no confirmed source. Cover: ${g.topic.join(", ")}.`));
    if (!gaps.length) lines.push("No gaps. Every reference has a confirmed source.");
    return lines.join("\n");
  }

  /* ================= bell ================= */
  function renderBell() {
    const n = S.notifs.filter((x) => x.status === "new").length;
    el.bellN.textContent = String(n);
    el.bell.classList.toggle("has", n > 0);
    el.bell.setAttribute("aria-label", n ? `Notifications, ${n} new` : "Notifications");
    el.notif.innerHTML = `<h5>Notifications</h5>` + (S.notifs.length ? S.notifs.slice().reverse().map((x) => {
      const r = S.refs.find((q) => q.id === x.refId);
      const oc = r.kind === "chunk" ? CHUNKS_BY_ID[r.chunkId] : null, cc = CHUNKS_BY_ID[x.chunkId];
      return `<button class="notif-item" type="button" role="menuitem" data-notif="${x.id}"><b>${x.status === "new" ? "Possible explanation found" : x.status === "accepted" ? "Link confirmed" : "Candidate rejected"}</b><span>${oc ? esc(vtitle(oc.videoId)) + " " + fmtTime(oc.start) : "Your sentence"} to ${esc(vtitle(cc.videoId))} ${fmtTime(cc.start)}</span></button>`;
    }).join("") : `<div class="notif-empty">Nothing yet. Notifications appear here when a later upload answers a pending reference.</div>`);
  }
  function ringBell() { if (reduceMotion()) return; el.bell.classList.remove("ring"); void el.bell.offsetWidth; el.bell.classList.add("ring"); }
  function toggleBell(open) {
    S.bellOpen = open ?? !S.bellOpen;
    el.notif.classList.toggle("open", S.bellOpen);
    el.bell.setAttribute("aria-expanded", String(S.bellOpen));
  }

  /* ================= tabs ================= */
  function setTab(t, focus) {
    S.tab = t;
    $$(".tab", root).forEach((b) => { const on = b.dataset.tab === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    ["ask", "context", "notes", "remember", "map"].forEach((k) => { $("#pn-" + k).hidden = k !== t; });
    if (focus) $("#tab-" + t).focus();
  }

  /* ================= events ================= */
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, [data-seek]");
    if (!t || !root.contains(t)) { if (S.bellOpen && !e.target.closest(".bellwrap")) toggleBell(false); return; }
    if (S.bellOpen && !t.closest(".bellwrap")) toggleBell(false);
    const d = t.dataset;
    if (d.seek) { const [v, s] = d.seek.split(":"); seek(v, +s); return; }
    if (d.vid) {
      if (!S.uploaded[d.vid]) { toast("That video arrives tomorrow. Use the Missing Explanation tab to upload it."); setTab("remember"); return; }
      seek(d.vid, 0, { flash: false }); return;
    }
    if (d.tab) { setTab(d.tab); return; }
    if (d.tabGo) { setTab(d.tabGo); return; }
    if (d.accept) { const [id, cid, sc] = d.accept.split("|"); setStatus(id, "resolved", { chunkId: cid, score: +sc }); toast("Source linked. The note now has a clickable link."); return; }
    if (d.manual) {
      const sel = $(`select[data-manual-for="${d.manual}"]`, root);
      if (!sel || !sel.value) { toast("Pick a source from the list first."); if (sel) sel.focus(); return; }
      setStatus(d.manual, "resolved", { chunkId: sel.value, score: 0 }, true); toast("Linked manually."); return;
    }
    if (d.remember) { setStatus(d.remember, "pending"); toast("Saved as a pending reference. We will check after every new upload."); return; }
    if (d.rememberText) {
      const text = S.tryResult && S.tryResult.text; if (!text) return;
      const det = detectInText(text); S.userRefN++;
      S.refs.push({ id: "u" + S.userRefN, kind: "text", text, phrase: det ? det.phrase : "", query: text, status: "pending", source: null, manual: false });
      renderContext(); renderRemember(); renderPins(); toast("Your sentence is remembered. Upload the next video to test it.");
      return;
    }
    if (d.undo) { setStatus(d.undo, "open"); return; }
    if (d.try !== undefined) { el.tryIn.value = SAMPLE_REFERENCES[+d.try]; runTry(el.tryIn.value); return; }
    if (d.ask !== undefined) { el.askIn.value = ASK_SAMPLES[+d.ask]; runAsk(el.askIn.value); return; }
    if (t.id === "ask-go") { runAsk(el.askIn.value); return; }
    if (t.id === "copy-notes") { const md = notesMarkdown(); (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(md) : Promise.reject()).then(() => toast("Notes copied as Markdown."), () => toast("Copy was blocked by the browser. Use Download instead.")); return; }
    if (t.id === "dl-notes") { try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([notesMarkdown()], { type: "text/markdown" })); a.download = vtitle(S.video).toLowerCase().replace(/\s+/g, "-") + "-notes.md"; document.body.appendChild(a); a.click(); a.remove(); toast("Notes downloaded."); } catch { toast("Download is not available here. Use Copy instead."); } return; }
    if (t.id === "try-go") { runTry(el.tryIn.value); return; }
    if (t.id === "play") { setPlaying(!S.playing); return; }
    if (t.id === "speed") { S.speedI = (S.speedI + 1) % SPEEDS.length; el.speed.textContent = SPEEDS[S.speedI] + "x"; return; }
    if (t.id === "ws-reset") { resetAll(); return; }
    if (t.id === "bell") { toggleBell(); return; }
    if (d.notif) {
      const n = S.notifs.find((x) => x.id === d.notif); toggleBell(false); setTab("remember");
      $("#pn-remember").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" }); return;
    }
    if (t.id === "copy-gaps") {
      const txt = gapsText();
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Gaps report copied."), () => { toast("Copy was blocked by the browser. Select the report text instead."); });
      return;
    }
    if (t.id === "cmp-go") { runCompare(true); return; }
    if (t.id === "notes-sample") { setNotes(SAMPLE_NOTES); toast("Sample notes restored (not saved yet)."); return; }
    if (d.notesSave !== undefined) { safeSet(NOTES_KEY, S.notes); S.noteSaved = S.notes; renderSavebar(); toast("Notes saved. Only approved changes are ever written."); return; }
    if (d.notesRevert !== undefined) { setNotes(S.noteSaved); return; }
    if (d.editNote !== undefined) { el.notesTa.focus(); el.notesTa.setSelectionRange(el.notesTa.value.length, el.notesTa.value.length); return; }
    if (d.add) {
      const kp = KEYPOINTS_V2.find((k) => k.id === d.add);
      const lines = S.notes.split(/\r?\n/).filter((l) => l.trim());
      const numbered = lines.length && /^\s*\d+[.)]/.test(lines[lines.length - 1]);
      const line = numbered ? `${lines.length + 1}. ${kp.text}` : `- ${kp.text}`;
      setNotes((S.notes.trim() ? S.notes.replace(/\s+$/, "") + "\n" : "") + line); toast("Added to your notes (unsaved until you press Save)."); return;
    }
    if (d.fix) {
      const r = S.cmp.results.find((x) => x.keypoint.id === d.fix);
      const lines = S.notes.split(/\r?\n/);
      const i = lines.findIndex((l) => l.trim() && l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim() === r.bestLine);
      if (i >= 0) { lines[i] = lines[i].replace(r.detail.notes, r.detail.video); setNotes(lines.join("\n")); toast(`Changed ${r.detail.notes} to ${r.detail.video} (unsaved until you press Save).`); }
      return;
    }
    if (d.dismiss) { S.dismissed.add(d.dismiss); renderCompare(); return; }
    if (d.undismiss) { S.dismissed.delete(d.undismiss); renderCompare(); return; }
    if (t.id === "up-v3") { runWorker("v3", { first: true }); return; }
    if (t.id === "re-check") { addLog("mu", "> re-running the worker on the same upload"); runWorker("v3", { first: false }); return; }
    if (d.review) {
      const [act, nid] = d.review.split("|"); const n = S.notifs.find((x) => x.id === nid);
      if (act === "accept") {
        n.status = "accepted";
        const r = S.refs.find((x) => x.id === n.refId); r.status = "resolved"; r.source = { chunkId: n.chunkId, score: n.score };
        renderContext(); renderPins(); toast("Link confirmed and saved in the older video's notes.");
      } else { n.status = "rejected"; toast("Rejected. It will not be suggested again."); }
      renderRemember(); renderBell(); return;
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.bellOpen) { toggleBell(false); el.bell.focus(); }
    if (e.key === "Enter" && e.target === el.tryIn) { e.preventDefault(); runTry(el.tryIn.value); }
    if (e.key === "Enter" && e.target === el.askIn) { e.preventDefault(); runAsk(el.askIn.value); }
    const tab = e.target.closest && e.target.closest(".tab");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const order = ["ask", "context", "notes", "remember", "map"]; let i = order.indexOf(S.tab);
      i = e.key === "Home" ? 0 : e.key === "End" ? 4 : (i + (e.key === "ArrowRight" ? 1 : -1) + 5) % 5;
      setTab(order[i], true);
    }
  });
  document.addEventListener("click", (e) => { if (S.bellOpen && !e.target.closest(".bellwrap")) toggleBell(false); });
  el.notesTa.addEventListener("input", () => { S.notes = el.notesTa.value; renderSavebar(); });

  // scrubbing
  let dragging = false;
  const scrubTo = (clientX) => { const r = el.scrub.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); S.time = p * VIDEOS[S.video].duration; renderTime(); };
  el.scrub.addEventListener("pointerdown", (e) => { dragging = true; el.scrub.setPointerCapture(e.pointerId); scrubTo(e.clientX); });
  el.scrub.addEventListener("pointermove", (e) => { if (dragging) scrubTo(e.clientX); });
  el.scrub.addEventListener("pointerup", () => { dragging = false; });
  el.scrub.addEventListener("pointercancel", () => { dragging = false; });
  el.scrub.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 30 : 10, dur = VIDEOS[S.video].duration;
    if (e.key === "ArrowRight") S.time = Math.min(dur, S.time + step);
    else if (e.key === "ArrowLeft") S.time = Math.max(0, S.time - step);
    else if (e.key === "Home") S.time = 0; else if (e.key === "End") S.time = dur;
    else if (e.key === " ") { e.preventDefault(); setPlaying(!S.playing); return; }
    else return;
    e.preventDefault(); renderTime();
  });


  /* ================= guided story ================= */
  let tourRun = 0;
  const cap = (n, text) => { const c = $("#tour-cap"); c.classList.toggle("on", !!text); if (text) { $("#tour-step").textContent = `STEP ${n} OF 6`; $("#tour-text").textContent = text; } };
  async function playStory() {
    const my = ++tourRun, ok = () => my === tourRun;
    const go = $("#tour-go");
    resetAll(true); go.disabled = true;
    const click = (sel) => { const e = $(sel, root); if (e) e.click(); };
    $("#demo").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
    try {
      await sleep(900); if (!ok()) return;
      cap(1, "At 06:10 the speaker says \"the earlier tutorial\". CloudNote AI detected that reference automatically."); setTab("context"); seek("v2", 370); await sleep(3800); if (!ok()) return;
      cap(2, "Another reference at 09:30 has a likely source in the library. One click links it to Server Setup 03:20."); click('[data-accept^="r-v2-08"]'); seek("v2", 570, { flash: false }); await sleep(3800); if (!ok()) return;
      cap(3, "The 06:10 reference has no source yet. Instead of guessing, it is remembered."); click('[data-remember="r-v2-05"]'); await sleep(3600); if (!ok()) return;
      cap(4, "Next day: a new Database Tutorial is uploaded. The worker checks pending references against it."); setTab("remember"); click("#up-v3");
      for (let i = 0; i < 40 && !$("[data-review^='accept']", root); i++) { await sleep(250); if (!ok()) return; }
      await sleep(1800); if (!ok()) return;
      cap(5, "A possible explanation appears with both excerpts side by side. You decide. Accepting saves the link."); click("[data-review^='accept']"); await sleep(3600); if (!ok()) return;
      cap(6, "The Library Map now shows every reference explained, with the order to watch the videos in."); setTab("map"); await sleep(4500); if (!ok()) return;
      cap(6, "That is the whole loop. Now try it yourself."); await sleep(2500);
    } finally {
      if (ok()) { go.disabled = false; setTimeout(() => { if (ok()) cap(0, ""); }, 2500); }
    }
  }
  root.addEventListener("pointerdown", (e) => { if (e.isTrusted && tourRun) { tourRun++; cap(0, ""); const g = $("#tour-go"); if (g) g.disabled = false; } }, true);
  $("#tour-go") && $("#tour-go").addEventListener("click", playStory);

  /* ================= reset + external API ================= */
  function resetAll(quiet) {
    setPlaying(false); safeDel(NOTES_KEY);
    S = freshState(); S.notes = SAMPLE_NOTES; S.noteSaved = SAMPLE_NOTES; idxCache = { key: "", idx: null };
    el.notesTa.value = S.notes; el.tryIn.value = ""; el.askIn.value = "";
    toggleBell(false); renderAll(); setTab("ask"); if (quiet !== true) toast("Demo reset.");
  }
  function renderAll() {
    el.speed.textContent = SPEEDS[S.speedI] + "x";
    renderLib(); renderVideo(); renderContext(); renderSavebar(); renderCompare(); renderRemember(); renderBell();
  }
  renderAll();
  setTab("ask");
  el.play.innerHTML = ic("play");

  return {
    openTab(t) {
      setTab(t);
      const r = root.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.7 || r.bottom < 0) $("#demo").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
    },
  };
}
