// Preview mode: the same backend code, running inside the page with an in-memory database kept in localStorage.
// No server, no uploads, no real transcription. Used for previews and offline demos.
import { makeContext } from "../../backend/src/context.js";
import { handle } from "../../backend/src/api.js";
import { memoryDb, localWorker } from "../../backend/src/providers/memory.js";

const KEY = "cn.browser.db.v1";
const persist = {
  load: () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } },
  save: (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage unavailable */ } },
};
const noStorage = { async presignPut() { throw new Error("Uploads are disabled in preview mode."); }, async presignGet() { throw new Error("No media in preview mode."); }, async head() { return null; }, async getJson() { throw new Error("No storage"); }, async delete() {} };
let ctx;
function get() {
  if (ctx) return ctx;
  const worker = localWorker(() => ctx);
  ctx = makeContext({ db: memoryDb(persist), storage: noStorage, transcribe: null, worker });
  return ctx;
}
export const browserCall = (method, path, body, query, userId) => handle(get(), { method, path: "/api" + path, body, query, userId });
export function resetBrowserData() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } ctx = null; }
