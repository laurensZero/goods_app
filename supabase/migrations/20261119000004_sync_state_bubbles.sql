-- 同步健康度表补评论装扮状态列（edge function sync-mhy-decor 每轮写入）

ALTER TABLE mhy_decor_sync_state
  ADD COLUMN IF NOT EXISTS bubbles_ok         BOOLEAN,
  ADD COLUMN IF NOT EXISTS bubbles_last_ok_at TIMESTAMPTZ;
