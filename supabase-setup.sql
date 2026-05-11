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
  image_count INTEGER DEFAULT 0,
  goods_count INTEGER DEFAULT 0,
  trash_count INTEGER DEFAULT 0,
  recharge_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  image_bucket TEXT DEFAULT 'goods-images'
);

-- presets 表（存储分类、IP、角色、存储位置）
CREATE TABLE IF NOT EXISTS sync_presets (
  id TEXT PRIMARY KEY DEFAULT 'default',
  categories JSONB DEFAULT '[]',
  ips JSONB DEFAULT '[]',
  characters JSONB DEFAULT '[]',
  storage_locations JSONB DEFAULT '[]'
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_goods_updated_at ON goods(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events(updated_at);
CREATE INDEX IF NOT EXISTS idx_recharge_updated_at ON recharge_records(updated_at);

-- 禁用 RLS（用户自备项目，不需要行级安全）
ALTER TABLE goods DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE recharge_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_manifest DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_presets DISABLE ROW LEVEL SECURITY;

-- 授予 anon 角色访问权限
GRANT ALL ON goods TO anon;
GRANT ALL ON events TO anon;
GRANT ALL ON recharge_records TO anon;
GRANT ALL ON sync_manifest TO anon;
GRANT ALL ON sync_presets TO anon;
GRANT ALL ON storage.objects TO anon;

-- Storage RLS policy: allow anon full access to goods-images bucket
CREATE POLICY "Allow anon access to goods-images" ON storage.objects
  FOR ALL USING (bucket_id = 'goods-images')
  WITH CHECK (bucket_id = 'goods-images');

-- Storage bucket（需要在 Supabase Dashboard → Storage 中手动创建 bucket 名为 goods-images）
-- 或者通过 SQL 创建：
INSERT INTO storage.buckets (id, name, public)
VALUES ('goods-images', 'goods-images', true)
ON CONFLICT (id) DO NOTHING;
