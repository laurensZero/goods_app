#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Goods 备份 Webhook 监听服务（纯 Python 标准库，无第三方依赖）。

调用链路：
  管理台 → Edge Function(backup-api) → 本服务

接口：
  POST /api/backup/trigger  触发备份（detach 运行 run_backup.sh，立即返回 202）
  POST /api/backup/restore  从归档回档（detach 运行 restore.py，立即返回 202）
  POST /api/backup/delete   删除指定归档文件（仅文件；backup_logs 历史行保留）
  GET  /api/backup/files    列出备份归档（名称/大小/时间）
  GET  /files/<archive>     下载归档（需签名 token，见下）
  GET  /health              健康检查

鉴权：
  - API 接口要求请求头 X-Backup-Secret 与 config.json 的 secret 一致（常数时间比较）。
  - 文件下载要求 ?token=<sig>:<exp>：sig = HMAC-SHA256(secret, "<name>:<exp>") 的
    URL-safe base64，由 Edge Function 用同一 secret 签名，exp 过期后拒绝。

配置：本文件同目录下的 config.json（见 config.example.json）。
"""

import base64
import hashlib
import hmac
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

with open(CONFIG_FILE, "r", encoding="utf-8") as f:
    CFG = json.load(f)

SECRET = str(CFG.get("secret", "")).encode("utf-8")
LOG_DIR = CFG.get("log_dir") or os.path.join(BASE_DIR, "logs")
LOCK_FILE = os.path.join(LOG_DIR, "backup.lock")
os.makedirs(LOG_DIR, exist_ok=True)

RUN_BACKUP = os.path.join(BASE_DIR, "run_backup.sh")
RESTORE_PY = os.path.join(BASE_DIR, "restore.py")
IMAGE_EXPORT_SH = os.path.join(BASE_DIR, "run_image_export.sh")

_job_lock = threading.Lock()


# ── 鉴权 ──────────────────────────────────────────────────────────────
def secret_ok(provided: str) -> bool:
    if not SECRET:
        return False
    return hmac.compare_digest(SECRET, str(provided or "").encode("utf-8"))


def verify_download_token(name: str, token: str) -> bool:
    try:
        sig, exp = token.rsplit(":", 1)
        exp = int(exp)
    except (ValueError, AttributeError):
        return False
    if exp < int(time.time()):
        return False
    payload = f"{name}:{exp}".encode("utf-8")
    expected = hmac.new(SECRET, payload, hashlib.sha256).digest()
    try:
        provided = base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4))
    except Exception:
        return False
    return hmac.compare_digest(expected, provided)


# ── 归档工具 ──────────────────────────────────────────────────────────
def list_archives():
    out = []
    d = CFG.get("backup_dir", "")
    if d and os.path.isdir(d):
        for name in sorted(os.listdir(d), reverse=True):
            if not name.endswith(".tar.gz"):
                continue
            p = os.path.join(d, name)
            try:
                st = os.stat(p)
                out.append({"name": name, "size": st.st_size, "mtime": int(st.st_mtime)})
            except OSError:
                continue
    return out


def backup_in_progress():
    if not os.path.exists(LOCK_FILE):
        return None
    try:
        with open(LOCK_FILE, "r", encoding="utf-8") as f:
            pid = int(f.read().strip() or "0")
    except (ValueError, OSError):
        return None
    if pid <= 0:
        return None
    try:
        os.kill(pid, 0)
        return pid
    except OSError:
        return None


def spawn_job(cmd, log_prefix, body=None):
    """detach 启动一个备份/回档任务，返回 (status, response)。"""
    with _job_lock:
        pid = backup_in_progress()
        if pid:
            return 409, {"error": "backup_running", "pid": pid}
        stamp = time.strftime("%Y%m%d-%H%M%S")
        log_file = os.path.join(LOG_DIR, f"{log_prefix}-{stamp}.log")
        with open(log_file, "ab") as lf:
            if body is not None:
                lf.write((json.dumps(body) + "\n").encode("utf-8"))
            proc = subprocess.Popen(
                cmd,
                stdout=lf,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                stdin=subprocess.DEVNULL,
            )
        return 202, {"accepted": True, "pid": proc.pid, "log": os.path.basename(log_file)}


# ── HTTP Handler ──────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    server_version = "GoodsBackup/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), fmt % args))

    def _send(self, status, payload=None, content_type="application/json; charset=utf-8"):
        body = b""
        if payload is not None:
            body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, x-backup-secret, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _read_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 5 * 1024 * 1024:
                return None
            raw = self.rfile.read(n) if n else b""
            return json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            return None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, x-backup-secret, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/health":
            return self._send(200, {
                "ok": True,
                "secret_configured": bool(SECRET),
                "backup_script_exists": os.path.exists(CFG.get("backup_script", "")),
                "image_script_exists": os.path.exists(CFG.get("image_script", "")),
                "backup_dir": CFG.get("backup_dir", ""),
                "running_pid": backup_in_progress(),
            })

        # 下载：浏览器新窗口直连，无法带自定义头，鉴权仅靠签名 token
        if path.startswith("/files/"):
            name = path[len("/files/"):]
            qs = parse_qs(parsed.query)
            token = (qs.get("token") or [""])[0]
            if not verify_download_token(name, token):
                return self._send(403, {"error": "invalid_or_expired_token"})
            file_path = os.path.join(CFG.get("backup_dir", ""), os.path.basename(name))
            if not os.path.isfile(file_path):
                return self._send(404, {"error": "not_found"})
            size = os.path.getsize(file_path)
            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.send_header("Content-Length", str(size))
            self.send_header(
                "Content-Disposition",
                "attachment; filename*=UTF-8''%s" % quote(name),
            )
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(1024 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            return

        # 其余 API：要求 X-Backup-Secret 头
        if not secret_ok(self.headers.get("X-Backup-Secret")):
            return self._send(403, {"error": "forbidden"})

        if path == "/api/backup/files":
            return self._send(200, {"files": list_archives()})

        return self._send(404, {"error": "not_found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if not secret_ok(self.headers.get("X-Backup-Secret")):
            return self._send(403, {"error": "forbidden"})

        if path == "/api/backup/trigger":
            body = self._read_json() or {}
            kind = body.get("kind") or "all"
            if kind not in ("all", "db", "images"):
                return self._send(400, {"error": "invalid_kind", "kind": kind})
            status, payload = spawn_job(
                ["bash", RUN_BACKUP, kind], "trigger", {"kind": kind}
            )
            return self._send(status, payload)

        if path == "/api/backup/restore":
            body = self._read_json() or {}
            archive = str(body.get("archive") or "").strip()
            if not archive or not archive.endswith(".tar.gz"):
                return self._send(400, {"error": "missing_archive"})
            include_images = bool(body.get("includeImages"))
            restore_cmd = ["python3", RESTORE_PY, archive]
            if include_images:
                restore_cmd.append("--with-images")
            status, payload = spawn_job(
                restore_cmd,
                "restore",
                {"archive": archive, "includeImages": include_images},
            )
            return self._send(status, payload)

        if path == "/api/backup/image-export":
            status, payload = spawn_job(["bash", IMAGE_EXPORT_SH], "image-export", {})
            return self._send(status, payload)

        if path == "/api/backup/delete":
            body = self._read_json() or {}
            name = os.path.basename(str(body.get("archive") or "").strip())
            # 只允许合法归档名，防目录穿越
            if not re.match(r"^(backup|images)-[\w.-]+\.tar\.gz$", name):
                return self._send(400, {"error": "invalid_archive"})
            target = os.path.join(CFG.get("backup_dir", ""), name)
            if not os.path.isfile(target):
                return self._send(404, {"error": "not_found", "archive": name})
            try:
                os.remove(target)
            except OSError as e:
                return self._send(500, {"error": "remove_failed", "detail": str(e)})
            return self._send(200, {"ok": True, "deleted": name})

        return self._send(404, {"error": "not_found"})


def main():
    host = CFG.get("host", "0.0.0.0")
    port = int(CFG.get("port", 8080))

    def _term(_sig, _frm):
        print("shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGTERM, _term)
    signal.signal(signal.SIGINT, _term)

    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Goods backup webhook listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
