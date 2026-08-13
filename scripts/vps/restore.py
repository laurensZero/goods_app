#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
restore.py <archive> [--with-images]

从备份归档回档 Supabase 数据。由 backup_server.py 以 detach 方式调用。
流程：
  1) 先对当前数据库做一次 db 快照备份（安全网，防止回档过程出错丢失现网数据；
     通过 --no-lock 让 run_backup.sh 跳过锁检查，否则会因本进程持锁而静默跳过）
  2) 解压归档，校验 7 张表文件齐全
  3) 单事务调用 admin_restore_all RPC：全部表「清空 + 重建」原子完成，
     任一步失败整体回滚（不再留下半恢复状态）；RPC 内保留原始 updated_at、
     跳过 user_id 已不在 auth.users 的孤儿行
  4) 可选 --with-images：把本地图库目录全部重传到 Supabase Storage（幂等覆盖）
状态写回 Supabase backup_logs 表（kind=restore），detail.progress 记录当前阶段，
供管理台轮询展示「恢复到哪一步」。
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
def rest(method, path, data=None, prefer="return=minimal", timeout=120):
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
        with urllib.request.urlopen(req, timeout=timeout) as r:
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


# ── 回档进度上报（写 backup_logs.detail.progress，供管理台轮询展示）────
def report_progress(stage):
    rest("PATCH", f"/rest/v1/{LOG_TABLE}?id=eq.{LOG_ID}",
         {"detail": {"progress": stage}})


# ── 表回档（单事务原子）────────────────────────────────────────────────
def restore_tables(tables):
    """单次调用 admin_restore_all RPC 完成全部表的清空+重建。

    整个回档在一个数据库事务里执行，任一步失败整体回滚，避免旧实现
    「逐表 DELETE + 插入」中途失败留下半恢复状态。
    RPC 内部会：设 app.is_sync_push=true 保留归档里的原始 updated_at，
    并过滤掉 user_id 已不在 auth.users 的孤儿行（已删除用户的数据不回档）。
    超时放宽到 1800s：大库 + updated_at/提醒触发器可能超过默认 120s。
    """
    payload = {t: tables[t] for t in INSERT_ORDER}
    status, body = rest(
        "POST", "/rest/v1/rpc/admin_restore_all", payload, timeout=1800,
    )
    if status >= 400:
        text = body.decode("utf-8", "replace")[:300] if isinstance(body, (bytes, bytearray)) else str(body)[:300]
        log(f"  [ERR {status}] admin_restore_all: {text}")
        return False, {}
    text = body.decode("utf-8", "replace") if isinstance(body, (bytes, bytearray)) else str(body)
    try:
        counts = json.loads(text) if text.strip() else {}
    except Exception:
        counts = {}
    return True, counts


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
        #    --no-lock：本进程已持有备份锁，run_backup.sh 默认会因锁被占用而跳过；
        #    显式要求它跳过锁检查才能真正执行快照。
        #    快照失败 → 中止回档（没有安全网就不动线上数据）。
        report_progress("安全快照")
        log(">>> pre-restore snapshot (db)")
        try:
            r = subprocess.run(
                ["bash", str(BASE_DIR / "run_backup.sh"), "db", "--no-lock"],
                stdout=open(LOG_FILE, "a"), stderr=subprocess.STDOUT, timeout=1800,
            )
        except Exception as e:
            log(f"  (snapshot error: {e})")
            report_fail(f"回档前快照异常: {e}")
            return 1
        if r.returncode != 0:
            log("[ERR] 快照失败，中止回档")
            report_fail("回档前快照失败")
            return 1
        log(">>> snapshot done")

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

            # 3) 校验归档完整性 + 读取全部表
            #    7 张表文件缺一不可：缺失就中止（避免 RPC 里清空该表后无处恢复）。
            #    （备份脚本每次都会写全 7 个文件，缺失只可能因拷贝损坏/不完整。）
            tables = {t: [] for t in INSERT_ORDER}
            for t in INSERT_ORDER:
                p = os.path.join(data_dir, t + ".json")
                if not os.path.isfile(p):
                    log(f"[ERR] 归档缺少 {t}.json，中止回档")
                    report_fail(f"归档缺少 {t}.json")
                    return 1
                try:
                    tables[t] = json.loads(open(p, encoding="utf-8").read())
                except Exception as e:
                    log(f"[ERR] 读取 {t}.json 失败: {e}")
                    report_fail(f"读取 {t}.json 失败")
                    return 1

            # 4) 原子回档（单事务，失败整体回滚）
            report_progress("回档数据表")
            log(">>> atomic restore (admin_restore_all)")
            ok, counts = restore_tables(tables)
            if not ok:
                log("[FAILED] 表回档失败（事务已回滚，线上数据未改变）")
                report_fail("表回档失败（事务已回滚）")
                return 1
            for t in INSERT_ORDER:
                n = counts.get(t, 0)
                log(f"  [OK] {t}: {n} 行")
            summary = {
                "archive": archive,
                "db_rows": sum(len(v) for v in tables.values()),
            }
            log(">>> tables restored (atomic, committed)")

            # 5) 图库
            if with_images:
                report_progress("回传图库")
                ok, new_count = restore_images()
                summary["image_new"] = new_count
                if not ok:
                    report_fail("图库回档部分失败")
                    return 1

            report_progress("完成")
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
