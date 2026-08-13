#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
restore.py <archive> [--with-images]

从备份归档回档 Supabase 数据。由 backup_server.py 以 detach 方式调用。
流程：
  1) 先对当前数据库做一次 db 快照备份（安全网，防止回档过程出错丢失现网数据）
  2) 解压归档，对每张业务表「清空 + 分批 upsert」
  3) 可选 --with-images：把本地图库目录全部重传到 Supabase Storage（幂等覆盖）
状态写回 Supabase backup_logs 表（kind=restore）。
"""

import base64
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "config.json"
CFG = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

SUPABASE_URL = CFG["supabase_url"].rstrip("/")
SERVICE_KEY = CFG["service_key"]
BACKUP_DIR = CFG.get("backup_dir", "")
IMAGE_DIR = CFG.get("image_dir", "")
LOG_DIR = CFG.get("log_dir") or str(BASE_DIR / "logs")
LOG_TABLE = CFG.get("log_table", "backup_logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOCK_FILE = os.path.join(LOG_DIR, "backup.lock")

# 回档顺序：先插入被引用表（groups），再插入引用表（group_items）
INSERT_ORDER = ["goods", "goods_groups", "events", "recharge_records",
                "sync_manifest", "sync_presets", "goods_group_items"]

LOG_FILE = ""
LOG_ID = ""


# ── 锁 ────────────────────────────────────────────────────────────────
def acquire_lock():
    global LOCK_FILE
    if os.path.exists(LOCK_FILE):
        try:
            old = int(open(LOCK_FILE).read().strip() or 0)
        except (ValueError, OSError):
            old = 0
        if old > 0:
            try:
                os.kill(old, 0)
                return False
            except OSError:
                pass
        try:
            os.remove(LOCK_FILE)
        except OSError:
            pass
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    return True


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except OSError:
        pass


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ── Supabase REST ─────────────────────────────────────────────────────
def rest(method, path, data=None, prefer="return=minimal"):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        method=method,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": "Bearer " + SERVICE_KEY,
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
        data=json.dumps(data).encode("utf-8") if data is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:2000]


def report_start(kind):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = {"id": LOG_ID, "kind": kind, "status": "running", "started_at": now}
    rest("POST", f"/rest/v1/{LOG_TABLE}", body)


def report_done(fields):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = {"status": "success", "finished_at": now}
    body.update(fields)
    rest("PATCH", f"/rest/v1/{LOG_TABLE}?id=eq.{LOG_ID}", body)


def report_fail(err):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    body = {"status": "failed", "finished_at": now, "error": err[:2000]}
    rest("PATCH", f"/rest/v1/{LOG_TABLE}?id=eq.{LOG_ID}", body)


# ── 表回档 ─────────────────────────────────────────────────────────────
def replace_table(table, rows):
    if not rows:
        log(f"  (skip {table}: 备份为空)")
        return True
    filter_col = "user_id" if table in ("sync_manifest", "sync_presets") else "id"
    status, _ = rest("DELETE", f"/rest/v1/{table}?{filter_col}=not.is.null")
    if status >= 400:
        log(f"  [ERR {status}] 清空 {table} 失败")
        return False
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        # 走 admin_restore_upsert RPC：会话内设 app.is_sync_push=true，
        # 让 set_xxx_updated_at 触发器短路，保留归档里的原始 updated_at。
        # （要求线上先应用 supabase-migration-restore-preserve-updated-at.sql）
        status, body = rest(
            "POST", "/rest/v1/rpc/admin_restore_upsert",
            {"p_table": table, "p_rows": batch, "p_conflict": filter_col},
        )
        if status >= 400:
            log(f"  [ERR {status}] restore_upsert {table} batch {i // 500}: {body[:200]}")
            return False
        total += len(batch)
    log(f"  [OK] {table}: {total} 行")
    return True


# ── 图库回档（幂等覆盖重传）───────────────────────────────────────────
def restore_images():
    if not os.path.isdir(IMAGE_DIR):
        log(f"  (skip images: 目录不存在 {IMAGE_DIR})")
        return True, 0
    new = err = 0
    for root, _dirs, files in os.walk(IMAGE_DIR):
        for name in files:
            fp = os.path.join(root, name)
            rel = os.path.relpath(fp, IMAGE_DIR).replace("\\", "/")
            bucket, _, obj = rel.partition("/")
            if not obj:
                continue
            req = urllib.request.Request(
                SUPABASE_URL + "/storage/v1/object/" + bucket + "/" + obj,
                method="PUT",
                headers={
                    "apikey": SERVICE_KEY,
                    "Authorization": "Bearer " + SERVICE_KEY,
                    "Content-Type": "application/octet-stream",
                },
                data=open(fp, "rb").read(),
            )
            try:
                with urllib.request.urlopen(req, timeout=300):
                    new += 1
            except Exception as e:
                err += 1
                if err <= 5:
                    log(f"  [ERR] {rel}: {e}")
    log(f"  images uploaded: {new}, errors: {err}")
    return err == 0, new


# ── 主流程 ─────────────────────────────────────────────────────────────
def main():
    global LOG_FILE, LOG_ID
    archive = sys.argv[1] if len(sys.argv) > 1 else ""
    with_images = "--with-images" in sys.argv

    if not archive or not archive.endswith(".tar.gz"):
        print("usage: restore.py <archive.tar.gz> [--with-images]")
        return 2
    archive_path = os.path.join(BACKUP_DIR, archive)
    if not os.path.isfile(archive_path):
        print(f"archive not found: {archive_path}")
        return 1

    LOG_ID = "restore-" + time.strftime("%Y%m%d-%H%M%S")
    LOG_FILE = os.path.join(LOG_DIR, LOG_ID + ".log")

    if not acquire_lock():
        log("已有备份/回档任务运行中，跳过本次")
        return 0

    try:
        report_start("restore")
        log(f"restore archive={archive} with_images={with_images}")

        # 1) 安全网快照
        log(">>> pre-restore snapshot (db)")
        try:
            subprocess.run(
                ["bash", str(BASE_DIR / "run_backup.sh"), "db"],
                stdout=open(LOG_FILE, "a"), stderr=subprocess.STDOUT, timeout=1800,
            )
        except Exception as e:
            log(f"  (snapshot skipped: {e})")

        # 2) 解压
        import tempfile
        tempdir = ""
        tempdir = tempfile.mkdtemp(prefix="goods-restore-")
        try:
            with tarfile.open(archive_path) as tf:
                tf.extractall(tempdir)
            data_dir = None
            for d in os.listdir(tempdir):
                p = os.path.join(tempdir, d)
                if os.path.isdir(p):
                    data_dir = p
                    break
            if not data_dir:
                log("[ERR] 归档内未找到数据目录")
                report_fail("归档结构异常")
                return 1

            # 3) 清空 + 重建
            tables = {t: [] for t in INSERT_ORDER}
            for t in INSERT_ORDER:
                p = os.path.join(data_dir, t + ".json")
                if os.path.isfile(p):
                    try:
                        tables[t] = json.loads(open(p, encoding="utf-8").read())
                    except Exception as e:
                        log(f"[ERR] 读取 {t}.json 失败: {e}")
                        report_fail(f"读取 {t}.json 失败")
                        return 1

            failed = False
            for t in INSERT_ORDER:
                if not replace_table(t, tables[t]):
                    failed = True
                    break

            if failed:
                log("[FAILED] 表回档失败")
                report_fail("表回档失败")
                return 1

            summary = {
                "archive": archive,
                "db_rows": sum(len(v) for v in tables.values()),
            }
            log(">>> tables restored")

            # 4) 图库
            if with_images:
                ok, new_count = restore_images()
                summary["image_new"] = new_count
                if not ok:
                    report_fail("图库回档部分失败")
                    return 1

            report_done(summary)
            log("restore complete")
            return 0
        finally:
            import shutil
            if tempdir:
                shutil.rmtree(tempdir, ignore_errors=True)
    except Exception as e:
        log(f"[EXC] {e}")
        report_fail(str(e))
        return 1
    finally:
        release_lock()


if __name__ == "__main__":
    sys.exit(main())
