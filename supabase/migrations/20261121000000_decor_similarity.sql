-- 装扮目录相似度标注列
--   content_key：URL 内容键（CDN 文件名 hash 前缀），同步入库时由 edge function 写入，
--                同文件不同 id 的重复靠它挡
--   pixel_hash：感知哈希（dhash，本地脚本 scripts/decor-similarity.py 离线计算），
--               同图不同文件的重复靠它标
-- 两列只作管理台标注与脚本输入，客户端不读。

ALTER TABLE mhy_decor_pendants
  ADD COLUMN IF NOT EXISTS content_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pixel_hash  TEXT NOT NULL DEFAULT '';

ALTER TABLE mhy_reply_bubbles
  ADD COLUMN IF NOT EXISTS content_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pixel_hash  TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_mhy_decor_pendants_pixel
  ON mhy_decor_pendants (pixel_hash) WHERE pixel_hash <> '';
CREATE INDEX IF NOT EXISTS idx_mhy_reply_bubbles_pixel
  ON mhy_reply_bubbles (pixel_hash) WHERE pixel_hash <> '';
