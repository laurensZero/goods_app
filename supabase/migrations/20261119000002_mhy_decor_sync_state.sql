-- 头像挂件同步状态表（单行）：edge function sync-mhy-decor 每轮写入，
-- 供人工随时 `select * from mhy_decor_sync_state` 检查两个源的健康度——
-- 尤其是Cookie/stoken 失效时（ms_ok / hy_ok = false）一眼能看出来。

CREATE TABLE IF NOT EXISTS mhy_decor_sync_state (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  last_run_at   TIMESTAMPTZ,                 -- 最近一次运行（无论成败）
  ms_ok         BOOLEAN,                     -- 米游社本轮是否拉到清单
  hy_ok         BOOLEAN,                     -- HoYoLAB 本轮是否拉到清单
  ms_auth_mode  TEXT NOT NULL DEFAULT '',    -- stoken | cookie | skipped
  hy_auth_mode  TEXT NOT NULL DEFAULT '',
  ms_last_ok_at TIMESTAMPTZ,                 -- 最近一次成功拉取时间
  hy_last_ok_at TIMESTAMPTZ,
  last_error    TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mhy_decor_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mhy_decor_sync_state_select" ON mhy_decor_sync_state;
CREATE POLICY "mhy_decor_sync_state_select" ON mhy_decor_sync_state FOR SELECT
  USING (true);  -- 无敏感内容（不含凭证），公开只读便于诊断

DROP POLICY IF EXISTS "mhy_decor_sync_state_service_all" ON mhy_decor_sync_state;
CREATE POLICY "mhy_decor_sync_state_service_all" ON mhy_decor_sync_state FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO mhy_decor_sync_state (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
