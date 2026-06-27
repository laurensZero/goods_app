-- supabase-setup.sql
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本

-- goods 表（包含 trash，通过 trashed 列区分）
CREATE TABLE IF NOT EXISTS goods (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  category TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  goods_id TEXT DEFAULT '',
  is_wishlist INTEGER DEFAULT 0,
  trashed INTEGER DEFAULT 0,
  characters JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  storage_location TEXT DEFAULT '',
  variant TEXT DEFAULT '',
  price TEXT DEFAULT '',
  actual_price TEXT DEFAULT '',
  acquired_at TEXT DEFAULT '',
  sale_at TEXT DEFAULT '',
  sale_reminder_enabled INTEGER DEFAULT 0,
  sale_reminder_offsets JSONB DEFAULT '[]',
  unit_acquired_at_list JSONB DEFAULT '[]',
  unit_actual_price_list JSONB DEFAULT '[]',
  unit_character_list JSONB DEFAULT '[]',
  image TEXT DEFAULT '',
  images JSONB DEFAULT '[]',
  tracks JSONB DEFAULT '[]',
  note TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  points INTEGER,
  currency TEXT DEFAULT 'CNY',
  actual_price_currency TEXT DEFAULT 'CNY',
  collect_status TEXT DEFAULT '已拥有',
  shipping_fee TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- events 表
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  type TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  cover_image_data JSONB DEFAULT '{}',
  photos JSONB DEFAULT '[]',
  ticket_price TEXT DEFAULT '',
  ticket_type TEXT DEFAULT '',
  seat_info TEXT DEFAULT '',
  other_expenses JSONB DEFAULT '[]',
  tracks JSONB DEFAULT '[]',
  linked_goods_ids JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- recharge_records 表
CREATE TABLE IF NOT EXISTS recharge_records (
  id TEXT PRIMARY KEY,
  game TEXT DEFAULT '',
  item_name TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  charged_at TEXT DEFAULT '',
  note TEXT DEFAULT '',
  image TEXT DEFAULT '',
  deleted INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- manifest 表（存储同步元数据）
CREATE TABLE IF NOT EXISTS sync_manifest (
  id TEXT PRIMARY KEY DEFAULT 'default',
  device_id TEXT DEFAULT '',
  synced_at TIMESTAMPTZ DEFAULT now(),
  collection_count INTEGER DEFAULT 0,
  wishlist_count INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  goods_count INTEGER DEFAULT 0,
  trash_count INTEGER DEFAULT 0,
  recharge_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  recharge_updated_at TIMESTAMPTZ,
  event_updated_at TIMESTAMPTZ,
  image_bucket TEXT DEFAULT 'goods-images',
  budget_monthly REAL DEFAULT 0,
  budget_yearly REAL DEFAULT 0
);

-- presets 表（存储分类、IP、角色、存储位置）
CREATE TABLE IF NOT EXISTS sync_presets (
  id TEXT PRIMARY KEY DEFAULT 'default',
  categories JSONB DEFAULT '[]',
  ips JSONB DEFAULT '[]',
  characters JSONB DEFAULT '[]',
  storage_locations JSONB DEFAULT '[]'
);

-- goods_groups 表（谷子组）
CREATE TABLE IF NOT EXISTS goods_groups (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'collection',
  summary_mode TEXT DEFAULT 'auto',
  total_amount REAL DEFAULT 0,
  currency     TEXT DEFAULT 'CNY',
  cover_mode   TEXT DEFAULT 'auto',
  cover_item_id TEXT DEFAULT '',
  display_mode TEXT DEFAULT 'list',
  note         TEXT DEFAULT '',
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  synced_by    TEXT DEFAULT ''
);

-- goods_group_items 表（谷子组成员关系）
CREATE TABLE IF NOT EXISTS goods_group_items (
  id         TEXT PRIMARY KEY NOT NULL,
  group_id   TEXT NOT NULL REFERENCES goods_groups(id) ON DELETE CASCADE,
  goods_id   TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  synced_by  TEXT DEFAULT ''
);

-- Realtime: synced_by 列（标记写入设备，用于过滤自己的 Realtime 事件）
ALTER TABLE goods ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE goods ADD COLUMN IF NOT EXISTS sale_at TEXT DEFAULT '';
ALTER TABLE goods ADD COLUMN IF NOT EXISTS sale_reminder_enabled INTEGER DEFAULT 0;
ALTER TABLE goods ADD COLUMN IF NOT EXISTS sale_reminder_offsets JSONB DEFAULT '[]';
ALTER TABLE events ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE goods_groups ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE goods_group_items ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_expenses JSONB DEFAULT '[]';
ALTER TABLE goods_groups ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CNY';

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE goods;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE recharge_records;
ALTER PUBLICATION supabase_realtime ADD TABLE goods_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE goods_group_items;

-- 索引
CREATE INDEX IF NOT EXISTS idx_goods_updated_at ON goods(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events(updated_at);
CREATE INDEX IF NOT EXISTS idx_recharge_updated_at ON recharge_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_goods_groups_updated_at ON goods_groups(updated_at);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_group_id ON goods_group_items(group_id);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_goods_id ON goods_group_items(goods_id);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_updated_at ON goods_group_items(updated_at);

-- 禁用 RLS（用户自备项目，不需要行级安全）
ALTER TABLE goods DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE recharge_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_manifest DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_presets DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE goods_group_items DISABLE ROW LEVEL SECURITY;

-- Supabase Data API GRANT 权限配置（May 30, 2026 变更）
-- https://supabase.com/docs/guides/database/postgres/schema#access-control

-- goods 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods TO service_role;

-- events 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO service_role;

-- recharge_records 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_records TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_records TO service_role;

-- sync_manifest 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_manifest TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_manifest TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_manifest TO service_role;

-- sync_presets 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_presets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_presets TO service_role;

-- goods_groups 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_groups TO service_role;

-- goods_group_items 表权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_group_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_group_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_group_items TO service_role;

-- Storage RLS policy: allow anon full access to goods-images bucket
CREATE POLICY "Allow anon access to goods-images" ON storage.objects
  FOR ALL USING (bucket_id = 'goods-images')
  WITH CHECK (bucket_id = 'goods-images');

-- Storage RLS policy: allow anon full access to event-photos bucket
CREATE POLICY "Allow anon access to event-photos" ON storage.objects
  FOR ALL USING (bucket_id = 'event-photos')
  WITH CHECK (bucket_id = 'event-photos');

-- Storage bucket（需要在 Supabase Dashboard → Storage 中手动创建 bucket 名为 goods-images）
-- 或者通过 SQL 创建：
INSERT INTO storage.buckets (id, name, public)
VALUES ('goods-images', 'goods-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RPC: 由 Supabase 实时计算 manifest 中的 count 字段
-- SECURITY DEFINER 因为需要跨 schema 访问 storage.objects
CREATE OR REPLACE FUNCTION get_manifest_counts()
RETURNS jsonb AS $fn$
  SELECT jsonb_build_object(
    'collection_count', (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND (is_wishlist IS NULL OR is_wishlist = 0)),
    'wishlist_count',   (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND is_wishlist = 1),
    'goods_count',      (SELECT COUNT(*) FROM goods WHERE trashed IS NULL OR trashed = 0),
    'trash_count',      (SELECT COUNT(*) FROM goods WHERE trashed = 1),
    'recharge_count',   (SELECT COUNT(*) FROM recharge_records WHERE deleted IS NULL OR deleted != 1),
    'event_count',      (SELECT COUNT(*) FROM events),
    'image_count',      (SELECT COUNT(*) FROM storage.objects WHERE bucket_id IN ('goods-images', 'event-photos') AND name NOT LIKE '%/' AND name NOT LIKE '.emptyFolderPlaceholder')
  );
$fn$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_manifest_counts() TO anon;
GRANT EXECUTE ON FUNCTION get_manifest_counts() TO authenticated;
