-- supabase-setup.sql
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本
-- 多用户版本：按 user_id 隔离数据，RPC 函数仅允许已登录用户调用

-- ============================================================
-- 1. 数据表
-- ============================================================

-- goods 表（包含 trash，通过 trashed 列区分）
CREATE TABLE IF NOT EXISTS goods (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
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
  unit_collect_status_list JSONB DEFAULT '[]',
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
  status_timeline JSONB DEFAULT '[]',
  synced_by TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- events 表
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
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
  synced_by TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- recharge_records 表
CREATE TABLE IF NOT EXISTS recharge_records (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  game TEXT DEFAULT '',
  item_name TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  charged_at TEXT DEFAULT '',
  note TEXT DEFAULT '',
  image TEXT DEFAULT '',
  deleted INTEGER DEFAULT 0,
  synced_by TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- sync_manifest 表（存储同步元数据）
CREATE TABLE IF NOT EXISTS sync_manifest (
  id TEXT PRIMARY KEY DEFAULT 'default',
  user_id UUID REFERENCES auth.users(id),
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

-- sync_presets 表（存储分类、IP、角色、存储位置）
CREATE TABLE IF NOT EXISTS sync_presets (
  id TEXT PRIMARY KEY DEFAULT 'default',
  user_id UUID REFERENCES auth.users(id),
  categories JSONB DEFAULT '[]',
  ips JSONB DEFAULT '[]',
  characters JSONB DEFAULT '[]',
  storage_locations JSONB DEFAULT '[]'
);

-- goods_groups 表（谷子组）
CREATE TABLE IF NOT EXISTS goods_groups (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  name         TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'collection',
  summary_mode TEXT DEFAULT 'auto',
  total_amount REAL DEFAULT 0,
  currency     TEXT DEFAULT 'CNY',
  cover_mode   TEXT DEFAULT 'auto',
  cover_item_id TEXT DEFAULT '',
  display_mode TEXT DEFAULT 'list',
  note         TEXT DEFAULT '',
  synced_by    TEXT DEFAULT '',
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- goods_group_items 表（谷子组成员关系）
CREATE TABLE IF NOT EXISTS goods_group_items (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  group_id   TEXT NOT NULL REFERENCES goods_groups(id) ON DELETE CASCADE,
  goods_id   TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  synced_by  TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. 存量列补充（向前兼容）
-- ============================================================
ALTER TABLE goods ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE goods ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE goods ADD COLUMN IF NOT EXISTS sale_at TEXT DEFAULT '';
ALTER TABLE goods ADD COLUMN IF NOT EXISTS sale_reminder_enabled INTEGER DEFAULT 0;
ALTER TABLE goods ADD COLUMN IF NOT EXISTS sale_reminder_offsets JSONB DEFAULT '[]';
ALTER TABLE goods ADD COLUMN IF NOT EXISTS unit_collect_status_list JSONB DEFAULT '[]';
ALTER TABLE goods ADD COLUMN IF NOT EXISTS status_timeline JSONB DEFAULT '[]';

ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS other_expenses JSONB DEFAULT '[]';

ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;

ALTER TABLE sync_manifest ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE sync_presets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE goods_groups ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE goods_groups ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;
ALTER TABLE goods_groups ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CNY';

ALTER TABLE goods_group_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE goods_group_items ADD COLUMN IF NOT EXISTS synced_by TEXT DEFAULT NULL;

-- ============================================================
-- 3. Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE goods;
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE recharge_records;
ALTER PUBLICATION supabase_realtime ADD TABLE goods_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE goods_group_items;

-- ============================================================
-- 4. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_goods_updated_at ON goods(updated_at);
CREATE INDEX IF NOT EXISTS idx_goods_user_id ON goods(user_id);
CREATE INDEX IF NOT EXISTS idx_events_updated_at ON events(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_updated_at ON recharge_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_recharge_user_id ON recharge_records(user_id);
CREATE INDEX IF NOT EXISTS idx_goods_groups_updated_at ON goods_groups(updated_at);
CREATE INDEX IF NOT EXISTS idx_goods_groups_user_id ON goods_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_group_id ON goods_group_items(group_id);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_goods_id ON goods_group_items(goods_id);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_user_id ON goods_group_items(user_id);
CREATE INDEX IF NOT EXISTS idx_goods_group_items_updated_at ON goods_group_items(updated_at);

-- ============================================================
-- 5. updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION set_goods_updated_at() RETURNS TRIGGER AS $fn1$
BEGIN
  IF current_setting('app.is_sync_push', true) = 'true' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.updated_at = now(); RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.ip IS DISTINCT FROM OLD.ip
    OR NEW.goods_id IS DISTINCT FROM OLD.goods_id
    OR NEW.is_wishlist IS DISTINCT FROM OLD.is_wishlist
    OR NEW.trashed IS DISTINCT FROM OLD.trashed
    OR NEW.characters IS DISTINCT FROM OLD.characters
    OR NEW.tags IS DISTINCT FROM OLD.tags
    OR NEW.storage_location IS DISTINCT FROM OLD.storage_location
    OR NEW.variant IS DISTINCT FROM OLD.variant
    OR NEW.price IS DISTINCT FROM OLD.price
    OR NEW.actual_price IS DISTINCT FROM OLD.actual_price
    OR NEW.acquired_at IS DISTINCT FROM OLD.acquired_at
    OR NEW.sale_at IS DISTINCT FROM OLD.sale_at
    OR NEW.sale_reminder_enabled IS DISTINCT FROM OLD.sale_reminder_enabled
    OR NEW.sale_reminder_offsets IS DISTINCT FROM OLD.sale_reminder_offsets
    OR NEW.unit_acquired_at_list IS DISTINCT FROM OLD.unit_acquired_at_list
    OR NEW.unit_actual_price_list IS DISTINCT FROM OLD.unit_actual_price_list
    OR NEW.unit_character_list IS DISTINCT FROM OLD.unit_character_list
    OR NEW.unit_collect_status_list IS DISTINCT FROM OLD.unit_collect_status_list
    OR NEW.images IS DISTINCT FROM OLD.images
    OR NEW.tracks IS DISTINCT FROM OLD.tracks
    OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.points IS DISTINCT FROM OLD.points
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.actual_price_currency IS DISTINCT FROM OLD.actual_price_currency
    OR NEW.collect_status IS DISTINCT FROM OLD.collect_status
    OR NEW.shipping_fee IS DISTINCT FROM OLD.shipping_fee
    OR NEW.status_timeline IS DISTINCT FROM OLD.status_timeline
  THEN NEW.updated_at = now();
  ELSE NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$fn1$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_events_updated_at() RETURNS TRIGGER AS $fn2$
BEGIN
  IF current_setting('app.is_sync_push', true) = 'true' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.updated_at = now(); RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.cover_image IS DISTINCT FROM OLD.cover_image
    OR NEW.cover_image_data IS DISTINCT FROM OLD.cover_image_data
    OR NEW.photos IS DISTINCT FROM OLD.photos
    OR NEW.tracks IS DISTINCT FROM OLD.tracks
    OR NEW.linked_goods_ids IS DISTINCT FROM OLD.linked_goods_ids
    OR NEW.tags IS DISTINCT FROM OLD.tags
  THEN NEW.updated_at = now();
  ELSE NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$fn2$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_recharge_updated_at() RETURNS TRIGGER AS $fn3$
BEGIN
  IF current_setting('app.is_sync_push', true) = 'true' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.updated_at = now(); RETURN NEW; END IF;
  IF NEW.game IS DISTINCT FROM OLD.game
    OR NEW.item_name IS DISTINCT FROM OLD.item_name
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.charged_at IS DISTINCT FROM OLD.charged_at
    OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.image IS DISTINCT FROM OLD.image
    OR NEW.deleted IS DISTINCT FROM OLD.deleted
  THEN NEW.updated_at = now();
  ELSE NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$fn3$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_groups_updated_at() RETURNS TRIGGER AS $fn4$
BEGIN
  IF current_setting('app.is_sync_push', true) = 'true' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.updated_at = now(); RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.summary_mode IS DISTINCT FROM OLD.summary_mode
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.cover_mode IS DISTINCT FROM OLD.cover_mode
    OR NEW.cover_item_id IS DISTINCT FROM OLD.cover_item_id
    OR NEW.display_mode IS DISTINCT FROM OLD.display_mode
    OR NEW.note IS DISTINCT FROM OLD.note
  THEN NEW.updated_at = now();
  ELSE NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$fn4$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_group_items_updated_at() RETURNS TRIGGER AS $fn5$
BEGIN
  IF current_setting('app.is_sync_push', true) = 'true' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.updated_at = now(); RETURN NEW; END IF;
  IF NEW.group_id IS DISTINCT FROM OLD.group_id
    OR NEW.goods_id IS DISTINCT FROM OLD.goods_id
    OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
  THEN NEW.updated_at = now();
  ELSE NEW.updated_at = OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$fn5$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goods_updated_at ON goods;
CREATE TRIGGER goods_updated_at BEFORE INSERT OR UPDATE ON goods FOR EACH ROW EXECUTE FUNCTION set_goods_updated_at();

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at BEFORE INSERT OR UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_events_updated_at();

DROP TRIGGER IF EXISTS recharge_records_updated_at ON recharge_records;
CREATE TRIGGER recharge_records_updated_at BEFORE INSERT OR UPDATE ON recharge_records FOR EACH ROW EXECUTE FUNCTION set_recharge_updated_at();

DROP TRIGGER IF EXISTS goods_groups_updated_at ON goods_groups;
CREATE TRIGGER goods_groups_updated_at BEFORE INSERT OR UPDATE ON goods_groups FOR EACH ROW EXECUTE FUNCTION set_groups_updated_at();

DROP TRIGGER IF EXISTS goods_group_items_updated_at ON goods_group_items;
CREATE TRIGGER goods_group_items_updated_at BEFORE INSERT OR UPDATE ON goods_group_items FOR EACH ROW EXECUTE FUNCTION set_group_items_updated_at();

-- ============================================================
-- 6. RLS & 权限 —— 仅允许已登录用户访问自己的数据
-- ============================================================

-- 启用 RLS
ALTER TABLE goods ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recharge_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_group_items ENABLE ROW LEVEL SECURITY;

-- 删除旧的宽松 policy（如果存在）
DROP POLICY IF EXISTS "auth_only_select" ON goods;
DROP POLICY IF EXISTS "auth_only_insert" ON goods;
DROP POLICY IF EXISTS "auth_only_update" ON goods;
DROP POLICY IF EXISTS "auth_only_delete" ON goods;
DROP POLICY IF EXISTS "auth_only_select" ON events;
DROP POLICY IF EXISTS "auth_only_insert" ON events;
DROP POLICY IF EXISTS "auth_only_update" ON events;
DROP POLICY IF EXISTS "auth_only_delete" ON events;
DROP POLICY IF EXISTS "auth_only_select" ON recharge_records;
DROP POLICY IF EXISTS "auth_only_insert" ON recharge_records;
DROP POLICY IF EXISTS "auth_only_update" ON recharge_records;
DROP POLICY IF EXISTS "auth_only_delete" ON recharge_records;
DROP POLICY IF EXISTS "auth_only_select" ON sync_manifest;
DROP POLICY IF EXISTS "auth_only_insert" ON sync_manifest;
DROP POLICY IF EXISTS "auth_only_update" ON sync_manifest;
DROP POLICY IF EXISTS "auth_only_delete" ON sync_manifest;
DROP POLICY IF EXISTS "auth_only_select" ON sync_presets;
DROP POLICY IF EXISTS "auth_only_insert" ON sync_presets;
DROP POLICY IF EXISTS "auth_only_update" ON sync_presets;
DROP POLICY IF EXISTS "auth_only_delete" ON sync_presets;
DROP POLICY IF EXISTS "auth_only_select" ON goods_groups;
DROP POLICY IF EXISTS "auth_only_insert" ON goods_groups;
DROP POLICY IF EXISTS "auth_only_update" ON goods_groups;
DROP POLICY IF EXISTS "auth_only_delete" ON goods_groups;
DROP POLICY IF EXISTS "auth_only_select" ON goods_group_items;
DROP POLICY IF EXISTS "auth_only_insert" ON goods_group_items;
DROP POLICY IF EXISTS "auth_only_update" ON goods_group_items;
DROP POLICY IF EXISTS "auth_only_delete" ON goods_group_items;

-- 为每张表创建按 user_id 过滤的 RLS policy
CREATE POLICY "user_select_own" ON goods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON goods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON goods FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON goods FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_select_own" ON events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON events FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_select_own" ON recharge_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON recharge_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON recharge_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON recharge_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_select_own" ON sync_manifest FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON sync_manifest FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON sync_manifest FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON sync_manifest FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_select_own" ON sync_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON sync_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON sync_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON sync_presets FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_select_own" ON goods_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON goods_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON goods_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON goods_groups FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_select_own" ON goods_group_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own" ON goods_group_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_update_own" ON goods_group_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_delete_own" ON goods_group_items FOR DELETE USING (auth.uid() = user_id);

-- 表级权限：撤回 anon，仅给 authenticated
REVOKE ALL ON public.goods FROM anon;
REVOKE ALL ON public.events FROM anon;
REVOKE ALL ON public.recharge_records FROM anon;
REVOKE ALL ON public.sync_manifest FROM anon;
REVOKE ALL ON public.sync_presets FROM anon;
REVOKE ALL ON public.goods_groups FROM anon;
REVOKE ALL ON public.goods_group_items FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recharge_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_manifest TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_group_items TO authenticated;

-- ============================================================
-- 7. Storage 配置
-- ============================================================

-- 删除旧的 anon 全部放行 policy
DROP POLICY IF EXISTS "Allow anon access to goods-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon access to event-photos" ON storage.objects;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('goods-images', 'goods-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS：已登录用户对自己的 bucket 有完全权限
CREATE POLICY "auth_full_goods_images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'goods-images')
  WITH CHECK (bucket_id = 'goods-images');

CREATE POLICY "auth_full_event_photos" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'event-photos')
  WITH CHECK (bucket_id = 'event-photos');

-- ============================================================
-- 8. RPC 函数（SECURITY DEFINER + 入口 auth.uid() 检查）
-- ============================================================

-- 撤回所有旧授权
REVOKE ALL ON FUNCTION upsert_manifest(TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, REAL, REAL) FROM anon, authenticated;
REVOKE ALL ON FUNCTION sync_pull(TIMESTAMPTZ) FROM anon, authenticated;
REVOKE ALL ON FUNCTION sync_push(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text[], text[], text[], text[], text[], text, timestamptz, text, real, real, timestamptz, timestamptz) FROM anon, authenticated;

-- upsert_manifest（user-scoped 计数）
CREATE OR REPLACE FUNCTION upsert_manifest(
  p_device_id TEXT,
  p_synced_at TIMESTAMPTZ,
  p_image_bucket TEXT,
  p_recharge_updated_at TIMESTAMPTZ,
  p_event_updated_at TIMESTAMPTZ,
  p_budget_monthly REAL,
  p_budget_yearly REAL
)
RETURNS void AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO sync_manifest (
    id, user_id, device_id, synced_at, image_bucket,
    recharge_updated_at, event_updated_at, budget_monthly, budget_yearly,
    collection_count, wishlist_count, goods_count, trash_count,
    recharge_count, event_count, image_count
  ) VALUES (
    'default', auth.uid(), p_device_id, p_synced_at, p_image_bucket,
    p_recharge_updated_at, p_event_updated_at, p_budget_monthly, p_budget_yearly,
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND (is_wishlist IS NULL OR is_wishlist = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND is_wishlist = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE trashed = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM recharge_records WHERE (deleted IS NULL OR deleted != 1) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM events WHERE user_id = auth.uid()),
    (SELECT COUNT(*) FROM storage.objects WHERE bucket_id IN ('goods-images', 'event-photos') AND name NOT LIKE '%/' AND name NOT LIKE '.emptyFolderPlaceholder')
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    device_id = EXCLUDED.device_id,
    synced_at = EXCLUDED.synced_at,
    image_bucket = EXCLUDED.image_bucket,
    recharge_updated_at = EXCLUDED.recharge_updated_at,
    event_updated_at = EXCLUDED.event_updated_at,
    budget_monthly = EXCLUDED.budget_monthly,
    budget_yearly = EXCLUDED.budget_yearly,
    collection_count = EXCLUDED.collection_count,
    wishlist_count = EXCLUDED.wishlist_count,
    goods_count = EXCLUDED.goods_count,
    trash_count = EXCLUDED.trash_count,
    recharge_count = EXCLUDED.recharge_count,
    event_count = EXCLUDED.event_count,
    image_count = EXCLUDED.image_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION upsert_manifest(TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, REAL, REAL) TO authenticated;

-- sync_pull（按 user_id 过滤，拒绝未登录）
CREATE OR REPLACE FUNCTION sync_pull(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS jsonb AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'manifest',     (SELECT to_jsonb(m) FROM sync_manifest m WHERE m.id = 'default'),
      'goods',        (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM goods g WHERE (p_since IS NULL OR g.updated_at > p_since) AND (g.trashed IS NULL OR g.trashed = 0) AND g.user_id = auth.uid()),
      'goods_trash',  (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM goods g WHERE (p_since IS NULL OR g.updated_at > p_since) AND g.trashed = 1 AND g.user_id = auth.uid()),
      'groups',       (SELECT COALESCE(jsonb_agg(to_jsonb(gg)), '[]'::jsonb) FROM goods_groups gg WHERE (p_since IS NULL OR gg.updated_at > p_since) AND gg.user_id = auth.uid()),
      'group_items',  (SELECT COALESCE(jsonb_agg(to_jsonb(ggi)), '[]'::jsonb) FROM goods_group_items ggi WHERE (p_since IS NULL OR ggi.updated_at > p_since) AND ggi.user_id = auth.uid()),
      'recharge',     (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM recharge_records r WHERE (p_since IS NULL OR r.updated_at > p_since) AND (r.deleted IS NULL OR r.deleted != 1) AND r.user_id = auth.uid()),
      'recharge_trash',(SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM recharge_records r WHERE (p_since IS NULL OR r.updated_at > p_since) AND r.deleted = 1 AND r.user_id = auth.uid()),
      'events',       (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM events e WHERE (p_since IS NULL OR e.updated_at > p_since) AND e.user_id = auth.uid()),
      'presets',      (SELECT to_jsonb(p) FROM sync_presets p WHERE p.id = 'default')
    )
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_pull(TIMESTAMPTZ) TO authenticated;

-- sync_push（入口 auth 检查，写入数据含 user_id）
CREATE OR REPLACE FUNCTION sync_push(
  p_goods            jsonb DEFAULT '[]',
  p_goods_trash      jsonb DEFAULT '[]',
  p_groups           jsonb DEFAULT '[]',
  p_group_items      jsonb DEFAULT '[]',
  p_recharge         jsonb DEFAULT '[]',
  p_recharge_trash   jsonb DEFAULT '[]',
  p_events           jsonb DEFAULT '[]',
  p_presets          jsonb DEFAULT '{}',
  p_delete_goods     text[] DEFAULT '{}',
  p_delete_groups    text[] DEFAULT '{}',
  p_delete_group_items text[] DEFAULT '{}',
  p_delete_recharge  text[] DEFAULT '{}',
  p_delete_events    text[] DEFAULT '{}',
  p_device_id        text DEFAULT '',
  p_synced_at        timestamptz DEFAULT now(),
  p_image_bucket     text DEFAULT 'goods-images',
  p_budget_monthly   real DEFAULT 0,
  p_budget_yearly    real DEFAULT 0,
  p_recharge_updated_at timestamptz DEFAULT NULL,
  p_event_updated_at timestamptz DEFAULT NULL
)
RETURNS void AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM set_config('app.is_sync_push', 'true', true);

  -- 1. Delete
  IF array_length(p_delete_goods, 1) > 0 THEN
    DELETE FROM goods WHERE id = ANY(p_delete_goods);
  END IF;
  IF array_length(p_delete_groups, 1) > 0 THEN
    DELETE FROM goods_groups WHERE id = ANY(p_delete_groups);
  END IF;
  IF array_length(p_delete_group_items, 1) > 0 THEN
    DELETE FROM goods_group_items WHERE id = ANY(p_delete_group_items);
  END IF;
  IF array_length(p_delete_recharge, 1) > 0 THEN
    DELETE FROM recharge_records WHERE id = ANY(p_delete_recharge);
  END IF;
  IF array_length(p_delete_events, 1) > 0 THEN
    DELETE FROM events WHERE id = ANY(p_delete_events);
  END IF;

  -- 2. Upsert goods
  IF jsonb_array_length(p_goods) > 0 THEN
    INSERT INTO goods
    SELECT * FROM jsonb_populate_recordset(null::goods, p_goods)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, category = EXCLUDED.category, ip = EXCLUDED.ip,
      goods_id = EXCLUDED.goods_id, is_wishlist = EXCLUDED.is_wishlist,
      trashed = EXCLUDED.trashed, characters = EXCLUDED.characters, tags = EXCLUDED.tags,
      storage_location = EXCLUDED.storage_location, variant = EXCLUDED.variant,
      price = EXCLUDED.price, actual_price = EXCLUDED.actual_price,
      acquired_at = EXCLUDED.acquired_at, sale_at = EXCLUDED.sale_at,
      sale_reminder_enabled = EXCLUDED.sale_reminder_enabled,
      sale_reminder_offsets = EXCLUDED.sale_reminder_offsets,
      unit_acquired_at_list = EXCLUDED.unit_acquired_at_list,
      unit_actual_price_list = EXCLUDED.unit_actual_price_list,
      unit_character_list = EXCLUDED.unit_character_list,
      unit_collect_status_list = EXCLUDED.unit_collect_status_list,
      image = EXCLUDED.image, images = EXCLUDED.images,
      tracks = EXCLUDED.tracks, note = EXCLUDED.note,
      quantity = EXCLUDED.quantity, points = EXCLUDED.points,
      currency = EXCLUDED.currency, actual_price_currency = EXCLUDED.actual_price_currency,
      collect_status = EXCLUDED.collect_status, shipping_fee = EXCLUDED.shipping_fee,
      status_timeline = EXCLUDED.status_timeline,
      updated_at = EXCLUDED.updated_at, synced_by = EXCLUDED.synced_by,
      user_id = EXCLUDED.user_id;
  END IF;

  -- 3. Upsert goods_trash
  IF jsonb_array_length(p_goods_trash) > 0 THEN
    INSERT INTO goods
    SELECT * FROM jsonb_populate_recordset(null::goods, p_goods_trash)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, category = EXCLUDED.category, ip = EXCLUDED.ip,
      goods_id = EXCLUDED.goods_id, is_wishlist = EXCLUDED.is_wishlist,
      trashed = EXCLUDED.trashed, characters = EXCLUDED.characters, tags = EXCLUDED.tags,
      storage_location = EXCLUDED.storage_location, variant = EXCLUDED.variant,
      price = EXCLUDED.price, actual_price = EXCLUDED.actual_price,
      acquired_at = EXCLUDED.acquired_at, sale_at = EXCLUDED.sale_at,
      sale_reminder_enabled = EXCLUDED.sale_reminder_enabled,
      sale_reminder_offsets = EXCLUDED.sale_reminder_offsets,
      unit_acquired_at_list = EXCLUDED.unit_acquired_at_list,
      unit_actual_price_list = EXCLUDED.unit_actual_price_list,
      unit_character_list = EXCLUDED.unit_character_list,
      unit_collect_status_list = EXCLUDED.unit_collect_status_list,
      image = EXCLUDED.image, images = EXCLUDED.images,
      tracks = EXCLUDED.tracks, note = EXCLUDED.note,
      quantity = EXCLUDED.quantity, points = EXCLUDED.points,
      currency = EXCLUDED.currency, actual_price_currency = EXCLUDED.actual_price_currency,
      collect_status = EXCLUDED.collect_status, shipping_fee = EXCLUDED.shipping_fee,
      status_timeline = EXCLUDED.status_timeline,
      updated_at = EXCLUDED.updated_at, synced_by = EXCLUDED.synced_by,
      user_id = EXCLUDED.user_id;
  END IF;

  -- 4. Upsert groups
  IF jsonb_array_length(p_groups) > 0 THEN
    INSERT INTO goods_groups
    SELECT * FROM jsonb_populate_recordset(null::goods_groups, p_groups)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, type = EXCLUDED.type, summary_mode = EXCLUDED.summary_mode,
      total_amount = EXCLUDED.total_amount, currency = EXCLUDED.currency,
      cover_mode = EXCLUDED.cover_mode, cover_item_id = EXCLUDED.cover_item_id,
      display_mode = EXCLUDED.display_mode, note = EXCLUDED.note,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 5. Upsert group_items
  IF jsonb_array_length(p_group_items) > 0 THEN
    INSERT INTO goods_group_items
    SELECT * FROM jsonb_populate_recordset(null::goods_group_items, p_group_items)
    ON CONFLICT (id) DO UPDATE SET
      group_id = EXCLUDED.group_id, goods_id = EXCLUDED.goods_id,
      sort_order = EXCLUDED.sort_order,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 6. Upsert recharge
  IF jsonb_array_length(p_recharge) > 0 THEN
    INSERT INTO recharge_records
    SELECT * FROM jsonb_populate_recordset(null::recharge_records, p_recharge)
    ON CONFLICT (id) DO UPDATE SET
      game = EXCLUDED.game, item_name = EXCLUDED.item_name, amount = EXCLUDED.amount,
      charged_at = EXCLUDED.charged_at, note = EXCLUDED.note, image = EXCLUDED.image,
      deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, synced_by = EXCLUDED.synced_by,
      user_id = EXCLUDED.user_id;
  END IF;

  -- 7. Upsert recharge_trash
  IF jsonb_array_length(p_recharge_trash) > 0 THEN
    INSERT INTO recharge_records
    SELECT * FROM jsonb_populate_recordset(null::recharge_records, p_recharge_trash)
    ON CONFLICT (id) DO UPDATE SET
      game = EXCLUDED.game, item_name = EXCLUDED.item_name, amount = EXCLUDED.amount,
      charged_at = EXCLUDED.charged_at, note = EXCLUDED.note, image = EXCLUDED.image,
      deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, synced_by = EXCLUDED.synced_by,
      user_id = EXCLUDED.user_id;
  END IF;

  -- 8. Upsert events
  IF jsonb_array_length(p_events) > 0 THEN
    INSERT INTO events
    SELECT * FROM jsonb_populate_recordset(null::events, p_events)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, type = EXCLUDED.type,
      start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
      location = EXCLUDED.location, description = EXCLUDED.description,
      cover_image = EXCLUDED.cover_image, cover_image_data = EXCLUDED.cover_image_data,
      photos = EXCLUDED.photos, ticket_price = EXCLUDED.ticket_price,
      ticket_type = EXCLUDED.ticket_type, seat_info = EXCLUDED.seat_info,
      other_expenses = EXCLUDED.other_expenses, tracks = EXCLUDED.tracks,
      linked_goods_ids = EXCLUDED.linked_goods_ids, tags = EXCLUDED.tags,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 9. Upsert presets
  IF p_presets != '{}'::jsonb THEN
    INSERT INTO sync_presets (id, user_id, categories, ips, characters, storage_locations)
    VALUES ('default', auth.uid(),
      COALESCE((p_presets->>'categories')::jsonb, '[]'::jsonb),
      COALESCE((p_presets->>'ips')::jsonb, '[]'::jsonb),
      COALESCE((p_presets->>'characters')::jsonb, '[]'::jsonb),
      COALESCE((p_presets->>'storage_locations')::jsonb, '[]'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      categories = EXCLUDED.categories, ips = EXCLUDED.ips,
      characters = EXCLUDED.characters, storage_locations = EXCLUDED.storage_locations,
      user_id = EXCLUDED.user_id;
  END IF;

  -- 10. Upsert manifest
  INSERT INTO sync_manifest (
    id, user_id, device_id, synced_at, image_bucket,
    recharge_updated_at, event_updated_at, budget_monthly, budget_yearly,
    collection_count, wishlist_count, goods_count, trash_count,
    recharge_count, event_count, image_count
  ) VALUES (
    'default', auth.uid(), p_device_id, p_synced_at, p_image_bucket,
    p_recharge_updated_at, p_event_updated_at, p_budget_monthly, p_budget_yearly,
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND (is_wishlist IS NULL OR is_wishlist = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND is_wishlist = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE trashed = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM recharge_records WHERE (deleted IS NULL OR deleted != 1) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM events WHERE user_id = auth.uid()),
    (SELECT COUNT(*) FROM storage.objects WHERE bucket_id IN ('goods-images', 'event-photos') AND name NOT LIKE '%/' AND name NOT LIKE '.emptyFolderPlaceholder')
  ) ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    device_id = EXCLUDED.device_id,
    synced_at = EXCLUDED.synced_at,
    image_bucket = EXCLUDED.image_bucket,
    recharge_updated_at = EXCLUDED.recharge_updated_at,
    event_updated_at = EXCLUDED.event_updated_at,
    budget_monthly = EXCLUDED.budget_monthly,
    budget_yearly = EXCLUDED.budget_yearly,
    collection_count = EXCLUDED.collection_count,
    wishlist_count = EXCLUDED.wishlist_count,
    goods_count = EXCLUDED.goods_count,
    trash_count = EXCLUDED.trash_count,
    recharge_count = EXCLUDED.recharge_count,
    event_count = EXCLUDED.event_count,
    image_count = EXCLUDED.image_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_push(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  text[], text[], text[], text[], text[],
  text, timestamptz, text, real, real, timestamptz, timestamptz
) TO authenticated;


-- ============================================================
-- SHARES TABLE (Supabase-based sharing, replaces Gist sharing)
-- ============================================================

CREATE TABLE IF NOT EXISTS shares (
  share_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(user_id);
CREATE INDEX IF NOT EXISTS idx_shares_created_at ON shares(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_shares_updated_at() RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shares_updated_at ON shares;
CREATE TRIGGER trg_shares_updated_at
  BEFORE INSERT OR UPDATE ON shares
  FOR EACH ROW EXECUTE FUNCTION set_shares_updated_at();

-- RLS: public read, owner write
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "share_public_select" ON shares
  FOR SELECT USING (true);

CREATE POLICY "share_insert_own" ON shares
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "share_update_own" ON shares
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "share_delete_own" ON shares
  FOR DELETE USING (auth.uid() = user_id);


-- ============================================================
-- REALTIME: Enable REPLICA IDENTITY for targeted Realtime
-- ============================================================
-- Required for Supabase Realtime to filter by RLS (only send
-- changes to users who own the row). Without this, all
-- subscribers receive all changes regardless of user_id.

ALTER TABLE goods REPLICA IDENTITY FULL;
ALTER TABLE events REPLICA IDENTITY FULL;
ALTER TABLE recharge_records REPLICA IDENTITY FULL;
ALTER TABLE goods_groups REPLICA IDENTITY FULL;
ALTER TABLE goods_group_items REPLICA IDENTITY FULL;
