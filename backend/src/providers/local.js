// Local providers for development and tests: no AWS needed.
import fs from "node:fs";
import path from "node:path";
import { memoryDb as memDb, localWorker, toyEmbedder } from "./memory.js";
export { localWorker, toyEmbedder };

export function fsStorage(dir) {
  const p = (key) => { const full = path.resolve(dir, key); if (!full.startsWith(path.resolve(dir) + path.sep)) throw new Error("bad key"); return full; };
  return {
    dir, path: p,
    async presignPut(key, type) { return { url: `/api/_local/put/${encodeURIComponent(key)}`, headers: { "Content-Type": type } }; },
    async presignGet(key) { return `/api/_local/get/${encodeURIComponent(key)}`; },
    async head(key) { try { return { size: fs.statSync(p(key)).size }; } catch { return null; } },
    async getJson(key) { return JSON.parse(fs.readFileSync(p(key), "utf8")); },
    async putJson(key, obj) { fs.mkdirSync(path.dirname(p(key)), { recursive: true }); fs.writeFileSync(p(key), JSON.stringify(obj)); },
    async delete(key) { try { fs.unlinkSync(p(key)); } catch { /* ignore */ } },
  };
}

/** Pretends to transcribe. Real speech recognition only happens on AWS. */
export function fakeTranscribe(storage, { delayMs = 50, canned } = {}) {
  const jobs = new Map();
  const api = {
    next: canned || null, onDone: null,
    async start({ jobName, outputKey }) {
      const json = api.next || cannedJson();
      jobs.set(jobName, { status: "IN_PROGRESS" });
      setTimeout(async () => {
        await storage.putJson(outputKey, json);
        jobs.set(jobName, { status: "COMPLETED", outputKey });
        if (api.onDone) api.onDone(jobName, "COMPLETED");
      }, delayMs);
    },
    async result(jobName) {
      const j = jobs.get(jobName) || { status: "FAILED" };
      return { status: j.status, json: j.outputKey ? await storage.getJson(j.outputKey) : null, failure: j.status === "FAILED" ? "Simulated failure" : null };
    },
  };
  return api;
}

function cannedJson() {
  const text = "Welcome to this simulated recording. Local development cannot run real speech recognition so this canned transcript stands in for it. Step one is to configure the server and set the port to 8000. Make sure you restart the service afterwards, and check the logs if anything fails.";
  const items = []; let t = 0;
  for (const w of text.split(" ")) {
    const bare = w.replace(/[.,]$/, ""), punct = /[.,]$/.test(w) ? w.slice(-1) : null;
    items.push({ type: "pronunciation", start_time: String(t), end_time: String(t + 0.3), alternatives: [{ content: bare }] });
    if (punct) items.push({ type: "punctuation", alternatives: [{ content: punct }] });
    t += 0.4;
  }
  return { results: { items } };
}

/** memoryDb persisted to a JSON file (dev server). */
export function memoryDb(file) {
  return memDb(file ? { load: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null), save: (o) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(o)); } } : undefined);
}
