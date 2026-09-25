"""
小红书工作台 API 代理服务器
解决浏览器 CORS 跨域问题

用法: python3 proxy.py
默认监听: http://127.0.0.1:8877（只允许本机访问）

安全限制：
- 只接受来自本机页面（localhost / 127.0.0.1 / 直接打开的 file://）的请求
- 只转发到公网 https 地址，拒绝内网/本机地址，也不跟随重定向

可选环境变量：
- XHS_PROXY_HOST           监听地址，默认 127.0.0.1
- XHS_ALLOWED_ORIGINS      额外允许的页面来源，逗号分隔，例如 https://yourname.github.io
- XHS_ALLOWED_API_HOSTS    只允许转发到这些域名，逗号分隔，例如 token-plan-sgp.xiaomimimo.com
"""
import http.server
import ipaddress
import json
import os
import re
import socket
import urllib.error
import urllib.parse
import urllib.request

PORT = 8877
HOST = os.environ.get('XHS_PROXY_HOST', '127.0.0.1')

LOCAL_ORIGIN_RE = re.compile(r'^http://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$')
EXTRA_ORIGINS = {o.strip().rstrip('/') for o in os.environ.get('XHS_ALLOWED_ORIGINS', '').split(',') if o.strip()}
ALLOWED_API_HOSTS = {h.strip().lower() for h in os.environ.get('XHS_ALLOWED_API_HOSTS', '').split(',') if h.strip()}


def origin_allowed(origin):
    if not origin:
        return False
    # 'null' 是直接双击打开 index.html（file://）时浏览器发送的 Origin
    return origin == 'null' or bool(LOCAL_ORIGIN_RE.match(origin)) or origin in EXTRA_ORIGINS


def check_target(url):
    """只允许公网 https 目标，返回错误信息或 None"""
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return 'Invalid apiUrl'
    if parsed.scheme != 'https' or not parsed.hostname:
        return 'apiUrl must be an https:// URL'
    host = parsed.hostname.lower()
    if ALLOWED_API_HOSTS and host not in ALLOWED_API_HOSTS:
        return f'apiUrl host {host} is not in XHS_ALLOWED_API_HOSTS'
    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return f'Cannot resolve {host}'
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split('%')[0])
        if not ip.is_global:
            return f'apiUrl resolves to non-public address {ip}'
    return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, f'Redirect to {newurl} blocked', headers, fp)


opener = urllib.request.build_opener(NoRedirect)


class CORSProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        if not origin_allowed(self.headers.get('Origin')):
            self.send_response(403)
            self.end_headers()
            return
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

        if not origin_allowed(self.headers.get('Origin')):
            self._json_response(403, {'error': {'message': 'Origin not allowed'}})
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))

            target_url = body.get('apiUrl', '')
            api_key = body.get('apiKey', '')
            payload = body.get('payload', {})

            if not target_url or not api_key:
                self._json_response(400, {'error': {'message': 'Missing apiUrl or apiKey'}})
                return

            err = check_target(target_url)
            if err:
                self._json_response(400, {'error': {'message': err}})
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

            with opener.open(req, timeout=120) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                self._json_response(200, result)

        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='replace') if e.fp else str(e.reason)
            try:
                err_json = json.loads(err_body)
            except ValueError:
                err_json = {'error': {'message': err_body[:500]}}
            self._json_response(e.code, err_json)

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
        origin = self.headers.get('Origin')
        if origin_allowed(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
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
    server = http.server.HTTPServer((HOST, PORT), CORSProxyHandler)
    print(f'🚀 API 代理服务器已启动: http://{HOST}:{PORT}')
    print(f'   健康检查: http://localhost:{PORT}/health')
    print(f'   按 Ctrl+C 停止')
    server.serve_forever()
