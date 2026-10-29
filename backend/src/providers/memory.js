// Pure in-memory providers (no Node APIs). Used by the local server, tests and the in-browser preview.
import { handleWorkerEvent } from "../worker.js";

/** persist: optional { load(): object|null, save(obj): void } for durability (file or localStorage). */
export function memoryDb(persist) {
  const tables = new Map();
  let timer = null;
  if (persist) { try { const o = persist.load(); if (o) for (const [pk, rows] of Object.entries(o)) tables.set(pk, new Map(Object.entries(rows))); } catch { /* start empty */ } }
  const save = () => {
    if (!persist) return;
    clearTimeout(timer);
    timer = setTimeout(() => { try { const o = {}; for (const [pk, m] of tables) o[pk] = Object.fromEntries(m); persist.save(o); } catch { /* storage full or blocked */ } }, 200);
  };
  const part = (pk) => { if (!tables.has(pk)) tables.set(pk, new Map()); return tables.get(pk); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    async get(pk, sk) { const v = tables.get(pk) && tables.get(pk).get(sk); return v ? clone(v) : null; },
    async put(item, { ifNotExists = false } = {}) {
      const p = part(item.pk);
      if (ifNotExists && p.has(item.sk)) return false;
      p.set(item.sk, clone(item)); save(); return true;
    },
    async query(pk, prefix) { const p = tables.get(pk); if (!p) return []; return [...p.entries()].filter(([sk]) => sk.startsWith(prefix)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => clone(v)); },
    async update(pk, sk, fields, { ifStatus } = {}) {
      const p = tables.get(pk); const cur = p && p.get(sk);
      if (!cur) return false;
      if (ifStatus && !ifStatus.includes(cur.status)) return false;
      p.set(sk, { ...cur, ...clone(fields) }); save(); return true;
    },
    async delete(pk, sk) { const p = tables.get(pk); if (p) { p.delete(sk); save(); } },
    async deleteMany(pk, prefix) { const p = tables.get(pk); if (!p) return; for (const sk of [...p.keys()]) if (sk.startsWith(prefix)) p.delete(sk); save(); },
  };
}

/** In-process worker that mimics async invocation. idle() lets tests wait for it. */
export function localWorker(getCtx) {
  const pending = new Set();
  return {
    run(evt) { const p = Promise.resolve().then(() => handleWorkerEvent(getCtx(), evt)).catch((e) => console.error("worker error", e)); pending.add(p); p.finally(() => pending.delete(p)); },
    async idle() { while (pending.size) await Promise.all([...pending]); },
  };
}

/** Deterministic toy embedding for tests: hashed bag of words, normalised. */
export function toyEmbedder(dim = 64) {
  return { async embed(text) {
    const v = new Float32Array(dim);
    for (const w of (text.toLowerCase().match(/[a-z0-9]+/g) || [])) { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0; v[h % dim] += 1; }
    const n = Math.hypot(...v) || 1; return v.map((x) => x / n);
  } };
}
