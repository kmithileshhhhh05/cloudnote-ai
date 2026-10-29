// Data access on top of the db provider. Every key is scoped by user, so one user can never read another's data.
import { Library, vecToB64 } from "./core/library.js";
import { HttpError } from "./context.js";

const U = (u) => `U#${u}`;
const pad = (n) => String(n).padStart(5, "0");
export const newId = () => { const a = new Uint8Array(5); globalThis.crypto.getRandomValues(a); return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join(""); };
// small stable non-cryptographic hash (cyrb53), used only to make short ids
const hash12 = (str) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0").slice(-12); };
export const ID_RE = /^[a-z0-9]{6,20}$/;
export const REF_RE = /^r-[A-Za-z0-9:_-]{3,80}$/;
export const CHUNK_RE = /^[a-z0-9]{6,20}:\d{1,6}$/;

export const keys = {
  video: (v) => `V#${v}`, chunk: (v, i) => `C#${v}#${pad(i)}`, chunksOf: (v) => `C#${v}#`,
  notes: (v) => `N#${v}`, mynotes: (v) => `M#${v}`, ref: (r) => `R#${r}`, notif: (r, c) => `F#${r}#${c}`, meta: () => "META#lib",
};

export function store(ctx, userId) {
  const db = ctx.db, pk = U(userId);
  const S = {
    pk,
    async getVideo(id) { return db.get(pk, keys.video(id)); },
    async requireVideo(id) {
      if (!ID_RE.test(id)) throw new HttpError(404, "Video not found");
      const v = await db.get(pk, keys.video(id));
      if (!v) throw new HttpError(404, "Video not found");
      return v;
    },
    async listVideos() { return (await db.query(pk, "V#")).sort((a, b) => b.createdAt - a.createdAt); },
    async putVideo(v) { v.updatedAt = ctx.now(); await db.put({ ...v, pk, sk: keys.video(v.id) }); return v; },
    /** Update only the given fields of an existing video. Returns false if it is gone or not in an allowed status. */
    async patchVideo(id, fields, opts) { return db.update(pk, keys.video(id), { ...fields, updatedAt: ctx.now() }, opts); },
    async getChunks(videoId, { withEmb = false } = {}) {
      const items = await db.query(pk, keys.chunksOf(videoId));
      return items.sort((a, b) => a.idx - b.idx).map((c) => (withEmb ? c : { ...c, emb: undefined }));
    },
    async replaceChunks(videoId, chunks) { await db.deleteMany(pk, keys.chunksOf(videoId)); for (const c of chunks) await db.put({ ...c, pk, sk: keys.chunk(videoId, c.idx) }); },
    async putChunks(videoId, chunks) {
      for (const c of chunks) await db.put({ ...c, pk, sk: keys.chunk(videoId, c.idx) });
    },
    async allChunks() { return db.query(pk, "C#"); },
    async getNotes(videoId) { return db.get(pk, keys.notes(videoId)); },
    async putNotes(videoId, notes) { await db.put({ ...notes, pk, sk: keys.notes(videoId) }); },
    async getMyNotes(videoId) { return db.get(pk, keys.mynotes(videoId)); },
    async putMyNotes(videoId, text) { await db.put({ pk, sk: keys.mynotes(videoId), text, updatedAt: ctx.now() }); },
    async refs() { return db.query(pk, "R#"); },
    async refsOf(videoId) { return (await S.refs()).filter((r) => r.videoId === videoId).sort((a, b) => a.chunkId.localeCompare(b.chunkId, undefined, { numeric: true })); },
    async getRef(id) {
      if (!REF_RE.test(id)) throw new HttpError(404, "Reference not found");
      const r = await db.get(pk, keys.ref(id));
      if (!r) throw new HttpError(404, "Reference not found");
      return r;
    },
    async putRef(r, { ifNew = false } = {}) { return db.put({ ...r, pk, sk: keys.ref(r.id) }, { ifNotExists: ifNew }); },
    async notifs() { return (await db.query(pk, "F#")).sort((a, b) => b.createdAt - a.createdAt); },
    async putNotif(n, { ifNew = false } = {}) { return db.put({ ...n, pk, sk: keys.notif(n.refId, n.chunkId) }, { ifNotExists: ifNew }); },
    async getNotif(id) { return (await S.notifs()).find((n) => n.id === id) || null; },
    async bump() {
      // random version: concurrent bumps cannot collide, and any other container sees a different value
      await db.put({ pk, sk: keys.meta(), ver: ctx.now() * 1000 + Math.floor(Math.random() * 1000) });
      ctx.cache.delete(userId);
    },
    /** Cached per Lambda container; invalidated when the library version changes. */
    async library() {
      const m = (await db.get(pk, keys.meta())) || { ver: 0 };
      const hit = ctx.cache.get(userId);
      if (hit && hit.ver === m.ver) return hit.lib;
      const ready = new Set((await S.listVideos()).filter((v) => v.status === "ready").map((v) => v.id));
      const chunks = (await S.allChunks()).filter((c) => ready.has(c.videoId));
      const lib = new Library(chunks, ctx.config.thresholds);
      lib.videoTime = new Map((await S.listVideos()).map((v) => [v.id, v.createdAt]));
      ctx.cache.set(userId, { ver: m.ver, lib });
      while (ctx.cache.size > 3) ctx.cache.delete(ctx.cache.keys().next().value); // keep memory bounded
      return lib;
    },
    async deleteVideoData(videoId) {
      await db.deleteMany(pk, keys.chunksOf(videoId));
      await db.delete(pk, keys.notes(videoId));
      await db.delete(pk, keys.mynotes(videoId));
      const refs = await S.refs();
      for (const r of refs) {
        if (r.videoId === videoId) { await db.delete(pk, keys.ref(r.id)); await db.deleteMany(pk, `F#${r.id}#`); }
        else if (r.source && r.source.chunkId.startsWith(videoId + ":")) { await S.putRef({ ...r, status: "open", source: null, manual: false }); }
      }
      for (const n of await S.notifs()) if (n.chunkId.startsWith(videoId + ":")) await db.delete(pk, keys.notif(n.refId, n.chunkId));
      await db.delete(pk, keys.video(videoId));
      await S.bump();
    },
  };
  return S;
}

export const notifId = (refId, chunkId) => hash12(refId + "|" + chunkId);
export { vecToB64 };
