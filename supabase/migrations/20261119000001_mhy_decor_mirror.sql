-- 米游社 / HoYoLAB 头像挂件：镜像列 + 图片桶
--
-- mirror_url：HoYoLAB 图（fastcdn.hoyoverse.com 等海外 CDN，国内加载慢）在
--   Supabase Storage 的整图镜像；米游社源（bbs-static.miyoushe.com，阿里 OSS）
--   速度足够，不需要镜像，保持 ''。
-- thumb_url：预压缩 128px 静态 webp（动图压成首帧），列表/选择器缩略图专用；
--   米游社源可以走 x-oss-process 实时缩放，同样保持 ''。
-- 客户端取图顺序见 utils/mhyDecor/cdn.js resolvePendantSrc()。

ALTER TABLE mhy_decor_pendants
  ADD COLUMN IF NOT EXISTS mirror_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS thumb_url  TEXT NOT NULL DEFAULT '';

-- 公共只读桶：挂件镜像图。写入仅限 service_role（无 anon insert policy）。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mhy-decor', 'mhy-decor', true, 10485760,
        ARRAY['image/png', 'image/webp', 'image/gif', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;
