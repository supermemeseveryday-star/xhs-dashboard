"""
小红书工作台 API 代理服务器
解决浏览器 CORS 跨域问题

用法: python3 proxy.py
默认监听: http://0.0.0.0:8877
"""
import http.server
import json
import urllib.request
import urllib.error
import os

PORT = 8877

class CORSProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != '/api/chat':
            self.send_response(404)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'Not Found')
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))

            target_url = body.get('apiUrl', '')
            api_key = body.get('apiKey', '')
            payload = body.get('payload', {})

            if not target_url or not api_key:
                self._json_response(400, {'error': 'Missing apiUrl or apiKey'})
                return

            # Forward to actual API
            req = urllib.request.Request(
                target_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {api_key}',
                },
                method='POST'
            )

            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                self._json_response(200, result)

        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace')
            try:
                err_json = json.loads(err_body)
            except:
                err_json = {'error': {'message': err_body[:500]}}
            self._json_response(e.status, err_json)

        except Exception as e:
            self._json_response(500, {'error': {'message': str(e)}})

    def do_GET(self):
        if self.path == '/health':
            self._json_response(200, {'status': 'ok', 'proxy': 'xhs-dashboard'})
            return
        self.send_response(404)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json_response(self, code, data):
        self.send_response(code)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")

if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), CORSProxyHandler)
    print(f'🚀 API 代理服务器已启动: http://0.0.0.0:{PORT}')
    print(f'   健康检查: http://localhost:{PORT}/health')
    print(f'   按 Ctrl+C 停止')
    server.serve_forever()
