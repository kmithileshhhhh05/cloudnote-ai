// Local development server: same API code as AWS, with local stand-ins for the cloud services.
// Real speech recognition and AI models only exist on AWS. Locally, uploads are "transcribed" with a canned transcript.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeContext } from "./src/context.js";
import { handle } from "./src/api.js";
import { memoryDb, fsStorage, fakeTranscribe, localWorker, toyEmbedder } from "./src/providers/local.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DATA = process.env.DATA_DIR || path.join(here, "..", ".data");
const DIST = path.join(here, "..", "dist");
fs.mkdirSync(DATA, { recursive: true });

const storage = fsStorage(path.join(DATA, "files"));
const tr = fakeTranscribe(storage, { delayMs: 800 });
let ctx;
const worker = localWorker(() => ctx);
ctx = makeContext({ db: memoryDb(path.join(DATA, "db.json")), storage, transcribe: tr, worker, embed: process.env.LOCAL_EMBED === "1" ? toyEmbedder() : null });
tr.onDone = (jobName, status) => worker.run({ type: "transcribed", jobName, status });

// ---- dev auth (NOT for production: the real app uses Amazon Cognito) ----
const usersFile = path.join(DATA, "users.json");
const users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, "utf8")) : {};
const saveUsers = () => fs.writeFileSync(usersFile, JSON.stringify(users));
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const userIdOf = (email) => crypto.createHash("sha1").update(email.toLowerCase()).digest("hex").slice(0, 16);
const tokenFor = (id) => "dev." + id;
const userFromReq = (req) => { const m = /^Bearer dev\.([a-f0-9]{16})$/.exec(req.headers.authorization || ""); return m ? m[1] : null; };

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".webm": "video/webm" };
const readBody = (req, limit = 12e6) => new Promise((res, rej) => { let b = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > limit) { rej(new Error("too large")); req.destroy(); } else b.push(c); }); req.on("end", () => res(Buffer.concat(b))); req.on("error", rej); });
const send = (res, status, body, headers = {}) => { res.writeHead(status, { "cache-control": "no-store", ...headers }); res.end(body); };
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { "content-type": "application/json" });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/config.json") return sendJson(res, 200, { mode: "dev" });
    if (url.pathname === "/api/_dev/auth" && req.method === "POST") {
      const { mode, email, password } = JSON.parse((await readBody(req)).toString() || "{}");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return sendJson(res, 400, { error: "Enter a valid email address." });
      if (!password || password.length < 8) return sendJson(res, 400, { error: "Password must be at least 8 characters." });
      const key = email.toLowerCase();
      if (mode === "signup") {
        if (users[key]) return sendJson(res, 400, { error: "An account with this email already exists." });
        const salt = crypto.randomBytes(8).toString("hex"); users[key] = { salt, h: hash(password, salt) }; saveUsers();
      } else {
        const u = users[key];
        if (!u || u.h !== hash(password, u.salt)) return sendJson(res, 401, { error: "Incorrect email or password." });
      }
      return sendJson(res, 200, { token: tokenFor(userIdOf(key)), email: key });
    }
    if (url.pathname.startsWith("/api/_local/")) {
      const [, , , verb, ...rest] = url.pathname.split("/");
      const key = decodeURIComponent(rest.join("/"));
      const m = /^media\/([a-f0-9]{16})\//.exec(key);
      if (verb === "put" && req.method === "PUT") {
        if (!m) return send(res, 403, "forbidden");
        const body = await readBody(req, 600e6); const p = storage.path(key);
        fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return send(res, 200, "");
      }
      if (verb === "get") {
        const p = storage.path(key); if (!fs.existsSync(p)) return send(res, 404, "not found");
        const size = fs.statSync(p).size, type = MIME[path.extname(p)] || "application/octet-stream";
        const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
        if (r) { const s = r[1] ? +r[1] : 0, e = r[2] ? +r[2] : size - 1; res.writeHead(206, { "content-type": type, "content-range": `bytes ${s}-${e}/${size}`, "accept-ranges": "bytes", "content-length": e - s + 1 }); return fs.createReadStream(p, { start: s, end: e }).pipe(res); }
        res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" }); return fs.createReadStream(p).pipe(res);
      }
      return send(res, 404, "not found");
    }
    if (url.pathname.startsWith("/api/")) {
      let body; if (!["GET", "HEAD", "DELETE"].includes(req.method)) { const raw = await readBody(req); if (raw.length) { try { body = JSON.parse(raw.toString()); } catch { return sendJson(res, 400, { error: "Request body must be JSON." }); } } }
      const query = Object.fromEntries(url.searchParams);
      const r = await handle(ctx, { method: req.method, path: url.pathname, query, body, userId: userFromReq(req) });
      return sendJson(res, r.status, r.body);
    }
    // static
    let p = path.join(DIST, decodeURIComponent(url.pathname));
    if (!p.startsWith(DIST)) return send(res, 403, "forbidden");
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) return send(res, 404, "not found", { "content-type": "text/plain" });
    return send(res, 200, fs.readFileSync(p), { "content-type": MIME[path.extname(p)] || "application/octet-stream", "cache-control": "no-cache" });
  } catch (e) { console.error(e); sendJson(res, 500, { error: "Server error" }); }
});
server.listen(PORT, () => console.log(`CloudNote AI local server on http://localhost:${PORT} (data in ${DATA})`));
export { ctx, worker };
