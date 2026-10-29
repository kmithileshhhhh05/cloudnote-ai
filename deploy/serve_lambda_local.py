# Local harness: serves the Lambda handler (with its CSP headers) on :8766 to test exactly what AWS will send.
import sys, os, base64
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lambda"))
import handler as H
H.ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
class R(BaseHTTPRequestHandler):
    def do_GET(self):
        r = H.handler({"rawPath": self.path.split("?")[0], "requestContext": {"http": {"method": "GET"}}})
        body = base64.b64decode(r["body"]) if r["isBase64Encoded"] else r["body"].encode()
        self.send_response(r["statusCode"])
        for k, v in r["headers"].items(): self.send_header(k, v)
        self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
HTTPServer(("", 8766), R).serve_forever()
