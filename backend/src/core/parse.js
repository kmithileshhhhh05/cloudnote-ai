// Transcript parsing. Every parser returns chunks: [{ start, end, text }]
// start/end are seconds, or null when the source has no timing (plain text).

const MIN_WORDS = 16;
const MAX_WORDS = 48;
const MAX_GAP = 2.5; // seconds of silence that forces a chunk boundary

const wc = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const endsSentence = (s) => /[.!?]["')\]]?$/.test(s.trim());
const clean = (s) => s.replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim();

/** Amazon Transcribe output JSON -> chunks. */
export function parseTranscribeJson(json) {
  const items = (json && json.results && json.results.items) || [];
  const chunks = [];
  let words = [], start = null, end = null, lastEnd = null;
  const flush = () => {
    if (!words.length) return;
    const text = words.join(" ").replace(/\s+([,.!?;:])/g, "$1").trim();
    if (text) chunks.push({ start, end: end ?? start, text });
    words = []; start = null; end = null;
  };
  for (const it of items) {
    const content = it.alternatives && it.alternatives[0] && it.alternatives[0].content;
    if (content == null) continue;
    if (it.type === "punctuation") {
      if (words.length) words[words.length - 1] += content;
      if (/[.!?]/.test(content) && wc(words.join(" ")) >= MIN_WORDS) flush();
      continue;
    }
    const s = Number(it.start_time), e = Number(it.end_time);
    if (words.length && lastEnd != null && s - lastEnd > MAX_GAP && wc(words.join(" ")) >= 6) flush();
    if (start == null) start = s;
    words.push(content);
    end = e; lastEnd = e;
    if (words.length >= MAX_WORDS) flush();
  }
  flush();
  return chunks;
}

function tsToSec(t) {
  const m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d+))?$/.exec(t.trim());
  if (!m) return null;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +("0." + m[4]) : 0);
}

function mergeCues(cues) {
  const chunks = [];
  let cur = null;
  for (const c of cues) {
    if (!c.text) continue;
    if (!cur) cur = { start: c.start, end: c.end, text: c.text };
    else { cur.text += " " + c.text; cur.end = c.end; }
    if (wc(cur.text) >= MAX_WORDS || (wc(cur.text) >= MIN_WORDS && endsSentence(cur.text))) { chunks.push(cur); cur = null; }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** SRT or WebVTT text -> chunks. */
export function parseCues(text) {
  const blocks = text.replace(/\r/g, "").replace(/^﻿/, "").split(/\n{2,}/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.length);
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, bRaw] = lines[ti].split("-->");
    const s = tsToSec(a), e = tsToSec(bRaw.trim().split(/\s+/)[0]);
    if (s == null || e == null) continue;
    cues.push({ start: s, end: e, text: clean(lines.slice(ti + 1).join(" ")) });
  }
  return mergeCues(cues);
}

/** Plain text. Lines may start with [mm:ss], mm:ss or hh:mm:ss. */
export function parsePlain(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const timed = [];
  let anyTime = false;
  for (const l of lines) {
    const m = /^\[?((?:\d+:)?\d{1,2}:\d{2}(?:\.\d+)?)\]?\s*[-:]?\s*(.*)$/.exec(l);
    if (m && tsToSec(m[1]) != null && m[2]) { anyTime = true; timed.push({ start: tsToSec(m[1]), text: clean(m[2]) }); }
    else timed.push({ start: null, text: clean(l) });
  }
  const chunks = [];
  if (anyTime) {
    timed.forEach((t, i) => {
      if (t.start == null && chunks.length) { chunks[chunks.length - 1].text += " " + t.text; return; }
      chunks.push({ start: t.start, end: null, text: t.text });
    });
    chunks.forEach((c, i) => { c.end = chunks[i + 1] ? chunks[i + 1].start : c.start; });
    return chunks.filter((c) => c.text);
  }
  // no timing: group sentences
  const sentences = lines.join(" ").match(/[^.!?]+[.!?]*/g) || [];
  let cur = "";
  for (const s of sentences) {
    cur += (cur ? " " : "") + s.trim();
    if (wc(cur) >= MIN_WORDS) { chunks.push({ start: null, end: null, text: cur }); cur = ""; }
  }
  if (cur.trim()) chunks.push({ start: null, end: null, text: cur.trim() });
  return chunks;
}

export function parseTranscript(input) {
  if (input && typeof input === "object") return parseTranscribeJson(input);
  const text = String(input || "");
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) { try { return parseTranscribeJson(JSON.parse(trimmed)); } catch { /* fall through */ } }
  if (text.includes("-->")) return parseCues(text);
  return parsePlain(text);
}

export const durationOf = (chunks) => chunks.reduce((m, c) => Math.max(m, c.end ?? c.start ?? 0), 0);
