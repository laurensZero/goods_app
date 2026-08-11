-- backup-migration.sql
-- 备份管理：backup_logs 备份日志表
-- 在 Supabase Dashboard → SQL Editor 中执行一次即可（幂等，可重复执行）
--
-- 职责：
--   - VPS 备份脚本在开始/结束时写入本表（status: running/success/failed）
--   - 管理台读取本表展示备份历史
--   - 表级 RLS 开启且不建任何 policy → anon/authenticated 全拒；
--     service_role 绕过 RLS，供 VPS（service key）与管理台（service key）读写。

CREATE TABLE IF NOT EXISTS backup_logs (
  id TEXT PRIMARY KEY,                    -- 如 backup-20260811-120000
  kind TEXT NOT NULL DEFAULT 'all',       -- all / db / images / restore
  status TEXT NOT NULL DEFAULT 'running', -- running / success / failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  archive TEXT DEFAULT '',                -- 归档文件名（如 backup-xxx.tar.gz）
  archive_size BIGINT DEFAULT 0,          -- 归档字节数
  db_rows BIGINT DEFAULT 0,               -- 数据库导出总行数
  image_new INTEGER DEFAULT 0,            -- 图库本次新增
  image_skipped INTEGER DEFAULT 0,        -- 图库本次跳过（已存在）
  image_bytes BIGINT DEFAULT 0,           -- 图库本地累计字节数
  error TEXT DEFAULT '',
  detail JSONB DEFAULT '{}'
);

ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_backup_logs_started_at ON backup_logs(started_at DESC);
