-- ============================================================
-- 米游社评论装扮（reply_bubble，评论气泡）公开只读表
--
-- 数据源：GET bbs-api.miyoushe.com/pendant/api/assets/getMyBackpackAssets?assets_type=4
--   （App 背包接口，必须 stoken 登录态；网页 Cookie 不认，见 supabase/functions/sync-mhy-decor）
--   assets_list = 已拥有，unowned_assets_list = 未拥有（两者合起来 = 全量目录）
--   每条 resource.reply_bubble = { url 静态底图, bg_color 底色,
--     animation_effects_gif_url 动图, animation_effects_pag_url PAG 视频格式,
--     game_id/game_name IP 归属 }——game_name 官方直接给，IP 筛选不用猜。
--
-- 图片不落库，只存米哈游 CDN 原始地址；mirror_url/thumb_url 与挂件表同义
-- （Storage 桶同为 mhy-decor，子路径 bubbles/）。
-- pag_url 是米哈游私有 PAG 视频格式，Web 端无法播放，仅存档备查。
-- ============================================================

CREATE TABLE IF NOT EXISTS mhy_reply_bubbles (
  id          TEXT PRIMARY KEY,              -- 'msb:<assets_id>'
  source      TEXT NOT NULL DEFAULT 'miyoushe',
  game        TEXT NOT NULL DEFAULT '',      -- 官方 game_name，IP 筛选直接用
  name        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL,                 -- 静态底图（米哈游 CDN 原始地址）
  bg_color    TEXT NOT NULL DEFAULT '',      -- 装扮底色（如 'e6e1f5'，无 #）
  gif_url     TEXT NOT NULL DEFAULT '',      -- 动图地址（有值 = 可播动图）
  pag_url     TEXT NOT NULL DEFAULT '',      -- PAG 视频地址（Web 放不了，存档）
  animated    BOOLEAN NOT NULL DEFAULT false,
  sort        INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  mirror_url  TEXT NOT NULL DEFAULT '',
  thumb_url   TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mhy_reply_bubbles_group
  ON mhy_reply_bubbles (game, sort);

ALTER TABLE mhy_reply_bubbles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mhy_reply_bubbles_select" ON mhy_reply_bubbles;
CREATE POLICY "mhy_reply_bubbles_select" ON mhy_reply_bubbles FOR SELECT
  USING (enabled = true);

DROP POLICY IF EXISTS "mhy_reply_bubbles_service_all" ON mhy_reply_bubbles;
CREATE POLICY "mhy_reply_bubbles_service_all" ON mhy_reply_bubbles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
