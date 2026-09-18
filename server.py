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

class LocalhostAIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-target-url, x-api-key')
        self.end_headers()

    def do_POST(self):
        """Proxy POST requests to bypass browser CORS restrictions"""
        if self.path.startswith('/api/proxy') or self.path.startswith('/proxy'):
            self.handle_proxy()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_proxy(self):
        # Read target URL from header or query param
        target_url = self.headers.get('x-target-url')
        if not target_url:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"error": "Missing x-target-url header"}')
            return

        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else None

        # Build proxy request
        req = urllib.request.Request(target_url, data=post_data, method='POST')

        # Forward headers
        forward_headers = ['Authorization', 'Content-Type', 'Accept', 'User-Agent']
        for h in forward_headers:
            val = self.headers.get(h)
            if val:
                req.add_header(h, val)

        # Fallback authorization header if passed via x-api-key
        custom_key = self.headers.get('x-api-key')
        if custom_key and not self.headers.get('Authorization'):
            req.add_header('Authorization', f"Bearer {custom_key.strip()}")

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                self.send_response(response.status)
                
                # Copy response headers
                for header, value in response.headers.items():
                    if header.lower() not in ['transfer-encoding', 'content-length', 'content-encoding']:
                        self.send_header(header, value)

                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', '*')
                self.end_headers()

                # Stream response chunks back to client
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
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            err_msg = json.dumps({"error": f"Proxy request failed: {str(e)}"}).encode('utf-8')
            self.wfile.write(err_msg)

    def end_headers(self):
        # Disable caching for local development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def run_server(port=PORT):
    # Enable SO_REUSEADDR so port is immediately freed on restart
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
