"""
Localhost AI Chat - Static Web Server & CORS Bypass Proxy
Zero pip dependencies required (Uses only Python standard library)
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import json
import sys
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

DEFAULT_UA = (
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
)

# এই হেডারগুলো প্রক্সি নিজে সেট করে, ক্লায়েন্ট থেকে ফরওয়ার্ড হবে না
BLOCKED_FORWARD_HEADERS = {
    'host', 'content-length', 'connection', 'x-target-url',
    'x-target-method', 'x-forward-headers', 'accept-encoding'
}


class LocalhostAIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, x-target-url, x-target-method, x-forward-headers, x-api-key'
        )
        self.end_headers()

    def do_POST(self):
        """Proxy requests to bypass browser CORS restrictions"""
        if self.path.startswith('/api/proxy') or self.path.startswith('/proxy'):
            self.handle_proxy()
        else:
            self.send_error(404, "Endpoint not found")

    def _send_json_error(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Localhost-Proxy', '1')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode('utf-8'))

    def handle_proxy(self):
        target_url = self.headers.get('x-target-url')
        if not target_url:
            self._send_json_error(400, "Missing x-target-url header")
            return

        # শুধু http/https অনুমোদিত (file:// ইত্যাদি ব্লক)
        scheme = urllib.parse.urlparse(target_url).scheme.lower()
        if scheme not in ('http', 'https'):
            self._send_json_error(400, "Only http/https targets are allowed")
            return

        method = (self.headers.get('x-target-method') or 'POST').upper()
        if method not in ('GET', 'POST', 'HEAD'):
            method = 'POST'

        content_length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(content_length) if content_length > 0 else None
        post_data = raw_body if method == 'POST' else None

        req = urllib.request.Request(target_url, data=post_data, method=method)

        # সাধারণ হেডার ফরওয়ার্ড
        for h in ['Authorization', 'Content-Type', 'Accept', 'User-Agent']:
            val = self.headers.get(h)
            if val:
                req.add_header(h, val)

        # ক্লায়েন্ট থেকে আসা অতিরিক্ত হেডার (যেমন সার্চ API key হেডার)
        extra = self.headers.get('x-forward-headers')
        if extra:
            try:
                for k, v in json.loads(extra).items():
                    if k.lower() not in BLOCKED_FORWARD_HEADERS and isinstance(v, str):
                        req.add_header(k, v)
            except Exception:
                pass

        custom_key = self.headers.get('x-api-key')
        if custom_key and not req.has_header('Authorization'):
            req.add_header('Authorization', f"Bearer {custom_key.strip()}")

        if not req.has_header('User-agent'):
            req.add_header('User-Agent', DEFAULT_UA)
        if not req.has_header('Accept-language'):
            req.add_header('Accept-Language', 'en-US,en;q=0.9')

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                self.send_response(response.status)

                for header, value in response.headers.items():
                    if header.lower() not in ['transfer-encoding', 'content-length', 'content-encoding']:
                        self.send_header(header, value)

                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.send_header('X-Localhost-Proxy', '1')
                self.end_headers()

                while True:
                    chunk = response.read(1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()

        except urllib.error.HTTPError as e:
            err_body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', e.headers.get('Content-Type', 'application/json'))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('X-Localhost-Proxy', '1')
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            self._send_json_error(502, f"Proxy request failed: {str(e)}")

    def end_headers(self):
        # Disable caching for local development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def run_server(port=PORT):
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), LocalhostAIHandler) as httpd:
        print("=" * 60)
        print("          Localhost AI Chat Web Server + CORS Proxy")
        print("=" * 60)
        print(f"\nLocal App URL:  http://localhost:{port}")
        print(f"CORS Proxy URL: http://localhost:{port}/api/proxy\n")
        print("Press Ctrl+C to stop the server.")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server gracefully...")
            httpd.shutdown()


if __name__ == '__main__':
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)