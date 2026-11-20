-- ============================================================
-- 米游社 / HoYoLAB 头像挂件清单（公开只读表）
--
-- 目的：挂件图鉴放云端，新增挂件只要往表里插一行，App 不用发版。
-- 图片不落库，只存米哈游 CDN 原始地址（不带 x-oss-process）；
-- 客户端用 utils/mhyDecor/cdn.js 拼缩放参数。
--
-- 写入只允许 service_role（后台/脚本），客户端 anon key 只能读。
-- 种子/更新：node scripts/sync-mhy-decor.mjs（见 --emit-sql / 直推 Supabase）。
-- ============================================================

CREATE TABLE IF NOT EXISTS mhy_decor_pendants (
  id          TEXT PRIMARY KEY,              -- 'ms:10309' / 'hy:2048'
  source      TEXT NOT NULL DEFAULT 'miyoushe',  -- miyoushe | hoyolab
  game        TEXT NOT NULL DEFAULT '',      -- 原神 / 崩坏：星穹铁道 / 绝区零 …
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL,                 -- 米哈游 CDN 原始地址
  animated    BOOLEAN NOT NULL DEFAULT false,
  sort        INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mhy_decor_pendants_group
  ON mhy_decor_pendants (source, game, sort);

ALTER TABLE mhy_decor_pendants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mhy_decor_pendants_select" ON mhy_decor_pendants;
CREATE POLICY "mhy_decor_pendants_select" ON mhy_decor_pendants FOR SELECT
  USING (enabled = true);

DROP POLICY IF EXISTS "mhy_decor_pendants_service_all" ON mhy_decor_pendants;
CREATE POLICY "mhy_decor_pendants_service_all" ON mhy_decor_pendants FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
