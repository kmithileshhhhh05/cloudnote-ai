"""Serves the static CloudNote AI site from a Lambda Function URL (payload format 2.0)."""
import base64, mimetypes, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("image/svg+xml", ".svg")
TEXT = ("text/", "application/javascript", "application/json", "image/svg+xml")
SEC = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
}

def _resp(code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
    h = {"content-type": ctype, **SEC, **(extra or {})}
    is_text = ctype.startswith(TEXT)
    return {
        "statusCode": code,
        "headers": h,
        "isBase64Encoded": not is_text,
        "body": body.decode("utf-8") if is_text else base64.b64encode(body).decode("ascii"),
    }

def handler(event, context=None):
    http = event.get("requestContext", {}).get("http", {})
    method, path = http.get("method", "GET"), event.get("rawPath", "/")
    if method not in ("GET", "HEAD"):
        return _resp(405, b"Method not allowed")
    rel = path.lstrip("/") or "index.html"
    full = os.path.realpath(os.path.join(ROOT, rel))
    if not full.startswith(os.path.realpath(ROOT) + os.sep) or not os.path.isfile(full):
        return _resp(404, b"Not found")
    ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype == "application/javascript":
        ctype += "; charset=utf-8"
    cache = "no-cache" if full.endswith("index.html") else "public, max-age=31536000, immutable" if "/fonts/" in full else "public, max-age=3600"
    with open(full, "rb") as f:
        data = f.read()
    return _resp(200, b"" if method == "HEAD" else data, ctype, {"cache-control": cache})
