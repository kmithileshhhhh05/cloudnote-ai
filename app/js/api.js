import { auth } from "./auth.js";
import { browserCall } from "./browser-backend.js";

export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

async function request(method, path, body, query) {
  if (auth.mode() === "browser") {
    const u = auth.user(); const r = await browserCall(method, path, body, query, u ? "b:" + u.email : undefined);
    if (r.status === 401) { auth.signOut(); throw new ApiError(401, "Please sign in."); }
    if (r.status >= 400) throw new ApiError(r.status, (r.body && r.body.error) || `Request failed (${r.status}).`);
    return r.body;
  }
  const url = "/api" + path + (query ? "?" + new URLSearchParams(query) : "");
  const go = async () => {
    const token = await auth.token();
    return fetch(url, { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  };
  let res;
  try { res = await go(); } catch { throw new ApiError(0, "You appear to be offline. Check your connection and try again."); }
  if (res.status === 401 && (await auth.refresh())) res = await go();
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401) { auth.signOut(); throw new ApiError(401, "Your session expired. Please sign in again."); }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status}).`);
  return data;
}
export const api = {
  get: (p, q) => request("GET", p, undefined, q), post: (p, b) => request("POST", p, b ?? {}), put: (p, b) => request("PUT", p, b), del: (p) => request("DELETE", p), patch: (p, b) => request("PATCH", p, b),
};

/** Upload a file to a presigned URL with progress. */
export function putFile(upload, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", upload.url);
    for (const [k, v] of Object.entries(upload.headers || {})) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new ApiError(x.status, "The upload was rejected (" + x.status + ").")));
    x.onerror = () => reject(new ApiError(0, "The upload failed. Check your connection and try again."));
    x.send(file);
  });
}
