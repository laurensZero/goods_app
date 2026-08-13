#!/bin/bash
# run_image_export.sh [--no-lock]
# 把本地图库镜像目录（image_dir）打包为 images-<日期>_<时间>.tar.gz，
# 落到 backup_dir，并把运行状态写回 Supabase backup_logs（kind=image_export）。
# 由 backup_server.py 以 detach 方式调用；打包结果出现在归档列表供下载。
# --no-lock：跳过互斥锁。run_backup.sh 在 kind=all 时持有锁调用本脚本，
#   需要跳过锁检查才能真正打包（见 run_backup.sh）。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"

cfg() { python3 -c "import json,sys; print(json.load(open('$CONFIG_FILE')).get('$1',''))" 2>/dev/null; }

SUPABASE_URL="$(cfg supabase_url)"
SERVICE_KEY="$(cfg service_key)"
IMAGE_DIR="$(cfg image_dir)"
BACKUP_DIR="$(cfg backup_dir)"
LOG_DIR="$(cfg log_dir)"
LOG_TABLE="$(cfg log_table)"
[ -z "$LOG_DIR" ] && LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

NO_LOCK=0
[ "${1:-}" = "--no-lock" ] && NO_LOCK=1
ID="image-export-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/$ID.log"
LOCK_FILE="$LOG_DIR/backup.lock"

# ── 单任务互斥（与备份/回档共用同一把锁）；--no-lock 时整体跳过 ──
if [ "$NO_LOCK" = "0" ]; then
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
fi

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
    "{\"id\":\"$ID\",\"kind\":\"image_export\",\"status\":\"running\",\"started_at\":\"$started\"}"
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

report_progress() {
  local stage="$1"
  supa PATCH "/rest/v1/$LOG_TABLE?id=eq.$ID" \
    "{\"detail\":{\"progress\":\"$stage\"}}"
}

# ── 主流程 ──
report_start
report_progress "打包图库"
echo "[$ID] export images started: $(date)" | tee -a "$LOG_FILE"

if [ ! -d "$IMAGE_DIR" ]; then
  report_fail "image_dir 不存在: $IMAGE_DIR"
  echo "[$ID] missing image_dir: $IMAGE_DIR" | tee -a "$LOG_FILE"
  exit 1
fi

STAMP="$(date +%Y-%m-%d_%H%M)"
ARCHIVE="$BACKUP_DIR/images-$STAMP.tar.gz"
echo "[$ID] >>> tar -czf $ARCHIVE (src=$IMAGE_DIR)" | tee -a "$LOG_FILE"
if ! tar -czf "$ARCHIVE" -C "$(dirname "$IMAGE_DIR")" "$(basename "$IMAGE_DIR")" >> "$LOG_FILE" 2>&1; then
  rm -f "$ARCHIVE"
  report_fail "tar 打包失败"
  echo "[$ID] FAILED tar" | tee -a "$LOG_FILE"
  tail -n 20 "$LOG_FILE"
  exit 1
fi

SIZE="$(python3 -c "import os,sys; print(os.path.getsize(sys.argv[1]))" "$ARCHIVE" 2>/dev/null || echo 0)"

# 图库为单份增量镜像（只增不减的当前状态），每次打包都是同一状态的快照，
# 只保留最新一个 images-*.tar.gz，避免冗余堆积
ls -1t "$BACKUP_DIR"/images-*.tar.gz 2>/dev/null | tail -n +2 | xargs -r rm -f 2>/dev/null || true

report_progress "完成"
report_done "\"archive\":\"$(basename "$ARCHIVE")\",\"archive_size\":$SIZE"
echo "[$ID] done: archive=$(basename "$ARCHIVE") size=$SIZE" | tee -a "$LOG_FILE"
exit 0
