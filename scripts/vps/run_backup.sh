#!/bin/bash
# run_backup.sh <kind>   kind: all | db | images
# 由 backup_server.py 以 detach 方式调用；也可手动执行（如 crontab）。
# 职责：调用现有 supabase-backup.sh / supabase-image-backup.sh，并把
# 运行状态写回 Supabase backup_logs 表（service key，绕过 RLS）。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

cfg() { python3 -c "import json,sys; print(json.load(open('$CONFIG_FILE')).get('$1',''))" 2>/dev/null; }

SUPABASE_URL="$(cfg supabase_url)"
SERVICE_KEY="$(cfg service_key)"
BACKUP_SCRIPT="$(cfg backup_script)"
IMAGE_SCRIPT="$(cfg image_script)"
BACKUP_DIR="$(cfg backup_dir)"
IMAGE_DIR="$(cfg image_dir)"
LOG_DIR="$(cfg log_dir)"
LOG_TABLE="$(cfg log_table)"
[ -z "$LOG_DIR" ] && LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

KIND="${1:-all}"
ID="backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/$ID.log"
LOCK_FILE="$LOG_DIR/backup.lock"

# ── 单任务互斥（pidfile + 进程存活检查）──
if [ -f "$LOCK_FILE" ]; then
  OLD_PID="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$ID] 已有任务运行中 (pid=$OLD_PID)，跳过本次" >> "$LOG_FILE"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── Supabase REST 上报 ──
supa() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -X "$method" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" -H "Prefer: return=minimal" "$SUPABASE_URL$path")
  if [ -n "$data" ]; then args+=(-d "$data"); fi
  curl "${args[@]}" >/dev/null 2>&1 || true
}

report_start() {
  local started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  supa POST "/rest/v1/$LOG_TABLE" \
    "{\"id\":\"$ID\",\"kind\":\"$KIND\",\"status\":\"running\",\"started_at\":\"$started\"}"
}

report_done() {
  local finished fields="$1"
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  supa PATCH "/rest/v1/$LOG_TABLE?id=eq.$ID" \
    "{\"status\":\"success\",\"finished_at\":\"$finished\"${fields:+,$fields}}"
}

report_fail() {
  local finished err
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  err="$(python3 -c "import sys,json; print(json.dumps(sys.stdin.read()[:2000]))" <<< "$1")"
  supa PATCH "/rest/v1/$LOG_TABLE?id=eq.$ID" \
    "{\"status\":\"failed\",\"finished_at\":\"$finished\",\"error\":$err}"
}

# ── 主流程 ──
report_start
echo "[$ID] kind=$KIND started: $(date)" | tee -a "$LOG_FILE"

if [ "$KIND" = "all" ] || [ "$KIND" = "db" ]; then
  if [ ! -x "$BACKUP_SCRIPT" ]; then
    report_fail "supabase-backup.sh 不存在或不可执行: $BACKUP_SCRIPT"
    echo "[$ID] missing backup_script: $BACKUP_SCRIPT" | tee -a "$LOG_FILE"
    exit 1
  fi
  echo "[$ID] >>> running supabase-backup.sh" | tee -a "$LOG_FILE"
  if ! bash "$BACKUP_SCRIPT" >> "$LOG_FILE" 2>&1; then
    report_fail "supabase-backup.sh 执行失败"
    echo "[$ID] FAILED supabase-backup.sh (exit=$?)" | tee -a "$LOG_FILE"
    tail -n 20 "$LOG_FILE"
    exit 1
  fi
fi

if [ "$KIND" = "all" ] || [ "$KIND" = "images" ]; then
  if [ ! -x "$IMAGE_SCRIPT" ]; then
    report_fail "supabase-image-backup.sh 不存在或不可执行: $IMAGE_SCRIPT"
    echo "[$ID] missing image_script: $IMAGE_SCRIPT" | tee -a "$LOG_FILE"
    exit 1
  fi
  echo "[$ID] >>> running supabase-image-backup.sh" | tee -a "$LOG_FILE"
  if ! bash "$IMAGE_SCRIPT" >> "$LOG_FILE" 2>&1; then
    report_fail "supabase-image-backup.sh 执行失败"
    echo "[$ID] FAILED supabase-image-backup.sh" | tee -a "$LOG_FILE"
    tail -n 20 "$LOG_FILE"
    exit 1
  fi
fi

# ── 汇总（解析日志摘要 + 兜底扫描归档/图库目录）──
SUMMARY="$(python3 - "$LOG_FILE" "$BACKUP_DIR" "$IMAGE_DIR" <<'PY'
import sys, re, os, json, glob, tarfile
log = open(sys.argv[1], encoding="utf-8", errors="replace").read()
backup_dir, image_dir = sys.argv[2], sys.argv[3]
out = {}

m = re.search(r"备份完成:\s+(\S+?)\s+\([^,]+,\s*(\d+)\s*行\)", log)
if m:
    out["archive"] = os.path.basename(m.group(1))
    p = os.path.join(backup_dir, out["archive"])
    try:
        out["archive_size"] = os.path.getsize(p) if os.path.exists(p) else 0
    except OSError:
        out["archive_size"] = 0
    out["db_rows"] = int(m.group(2))

if not out.get("archive") and os.path.isdir(backup_dir):
    files = glob.glob(os.path.join(backup_dir, "backup-*.tar.gz"))
    if files:
        latest = max(files, key=os.path.getmtime)
        out["archive"] = os.path.basename(latest)
        try:
            out["archive_size"] = os.path.getsize(latest)
        except OSError:
            out["archive_size"] = 0

m = re.search(r"Backup complete:\s*new=(\d+)\s+skipped=(\d+)", log)
if m:
    out["image_new"] = int(m.group(1))
    out["image_skipped"] = int(m.group(2))

if os.path.isdir(image_dir):
    total = 0
    for root, _dirs, files in os.walk(image_dir):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    out["image_bytes"] = total

if out.get("archive") and "db_rows" not in out:
    try:
        with tarfile.open(os.path.join(backup_dir, out["archive"])) as tf:
            rows = 0
            for n in tf.getnames():
                if n.endswith(".json"):
                    try:
                        rows += len(json.loads(tf.extractfile(n).read()))
                    except Exception:
                        pass
            out["db_rows"] = rows
    except Exception:
        pass

print(json.dumps(out))
PY
)"

FIELDS="$(python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join('\"%s\":%s' % (k, json.dumps(v)) for k,v in d.items()))" <<< "$SUMMARY" 2>/dev/null || true)"

report_done "$FIELDS"
echo "[$ID] done: $SUMMARY" | tee -a "$LOG_FILE"
exit 0
