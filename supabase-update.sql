-- ============================================================
-- 增量更新脚本（2026-07）—— 在 Supabase Dashboard → SQL Editor 整段执行
-- 内容：
--   1. sync_manifest / sync_presets 改为每用户一行（修复多用户互相覆盖）
--   2. sync_manifest.synced_at 强制服务器时间（触发器）
--   3. Storage RLS 按 "<userId>/" 目录隔离写权限（修复任意登录用户可写/删整桶）
--   4. upsert_manifest / sync_pull / sync_push 重建
--      （sync_push 返回 { synced_at: 服务器时间 } 作为客户端水位线）
-- 脚本幂等，重复执行无副作用。
-- ============================================================

-- ── 1. sync_manifest / sync_presets 改为每用户一行 ──
-- 历史 schema 以 id='default' 为主键，全体用户共享一行互相覆盖。
-- 直接删除 id 列（连带自动删除旧主键约束），改为 user_id 唯一；
-- 既有 'default' 行归最后写入者所有。已经没有 id 列的实例跳过（IF EXISTS）
DELETE FROM sync_manifest WHERE user_id IS NULL;
ALTER TABLE sync_manifest DROP COLUMN IF EXISTS id;
CREATE UNIQUE INDEX IF NOT EXISTS sync_manifest_user_id_key ON sync_manifest(user_id);

DELETE FROM sync_presets WHERE user_id IS NULL;
ALTER TABLE sync_presets DROP COLUMN IF EXISTS id;
CREATE UNIQUE INDEX IF NOT EXISTS sync_presets_user_id_key ON sync_presets(user_id);

-- ── 2. sync_manifest.synced_at 强制服务器时间 ──
-- 客户端水位线取自它（sync_push 返回值 / sync_pull 的 manifest），
-- 全链路统一到服务器时间域，消除设备时钟偏移
CREATE OR REPLACE FUNCTION set_manifest_synced_at() RETURNS TRIGGER AS $fn6$
BEGIN
  NEW.synced_at = now();
  RETURN NEW;
END;
$fn6$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_manifest_synced_at ON sync_manifest;
CREATE TRIGGER sync_manifest_synced_at BEFORE INSERT OR UPDATE ON sync_manifest FOR EACH ROW EXECUTE FUNCTION set_manifest_synced_at();

-- ── 3. Storage RLS：写操作按 "<userId>/" 一级目录隔离 ──
-- 新文件一律上传到自己的目录，任意登录用户不得写/覆盖/删他人目录的文件。
-- 读保持全桶（桶本身 public，迁移前根目录平铺的旧文件行内 URL 需继续可读/可回捞）。
-- DELETE 对根目录旧文件保留 owner 兜底（孤儿图片回收可清理历史文件）
DROP POLICY IF EXISTS "auth_full_goods_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_full_event_photos" ON storage.objects;
DROP POLICY IF EXISTS "auth_select_goods_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_insert_goods_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_goods_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_goods_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_select_event_photos" ON storage.objects;
DROP POLICY IF EXISTS "auth_insert_event_photos" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_event_photos" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_event_photos" ON storage.objects;

CREATE POLICY "auth_select_goods_images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'goods-images');

CREATE POLICY "auth_insert_goods_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'goods-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_update_goods_images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'goods-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'goods-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_delete_goods_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'goods-images' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (position('/' in name) = 0 AND (owner_id = auth.uid()::text OR owner_id IS NULL))
  ));

CREATE POLICY "auth_select_event_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'event-photos');

CREATE POLICY "auth_insert_event_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_update_event_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'event-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'event-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "auth_delete_event_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (position('/' in name) = 0 AND (owner_id = auth.uid()::text OR owner_id IS NULL))
  ));

-- ── 4a. upsert_manifest 重建（ON CONFLICT (user_id)，image_count 只算自己目录 + 根目录旧文件）──
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
    user_id, device_id, synced_at, image_bucket,
    recharge_updated_at, event_updated_at, budget_monthly, budget_yearly,
    collection_count, wishlist_count, goods_count, trash_count,
    recharge_count, event_count, image_count
  ) VALUES (
    auth.uid(), p_device_id, p_synced_at, p_image_bucket,
    p_recharge_updated_at, p_event_updated_at, p_budget_monthly, p_budget_yearly,
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND (is_wishlist IS NULL OR is_wishlist = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND is_wishlist = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE trashed = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM recharge_records WHERE (deleted IS NULL OR deleted != 1) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM events WHERE (deleted IS NULL OR deleted != 1) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM storage.objects WHERE bucket_id IN ('goods-images', 'event-photos')
      AND name NOT LIKE '%.emptyFolderPlaceholder'
      AND (position('/' in name) = 0 OR (storage.foldername(name))[1] = auth.uid()::text))
  )
  ON CONFLICT (user_id) DO UPDATE SET
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

-- ── 4b. sync_pull 重建（manifest / presets 改为按 user_id 查询）──
CREATE OR REPLACE FUNCTION sync_pull(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS jsonb AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'manifest',     (SELECT to_jsonb(m) FROM sync_manifest m WHERE m.user_id = auth.uid()),
      'goods',        (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM goods g WHERE (p_since IS NULL OR g.updated_at > p_since) AND (g.trashed IS NULL OR g.trashed = 0) AND g.user_id = auth.uid()),
      'goods_trash',  (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM goods g WHERE (p_since IS NULL OR g.updated_at > p_since) AND g.trashed = 1 AND g.user_id = auth.uid()),
      'groups',       (SELECT COALESCE(jsonb_agg(to_jsonb(gg)), '[]'::jsonb) FROM goods_groups gg WHERE (p_since IS NULL OR gg.updated_at > p_since) AND (gg.deleted IS NULL OR gg.deleted != 1) AND gg.user_id = auth.uid()),
      'groups_trash', (SELECT COALESCE(jsonb_agg(to_jsonb(gg)), '[]'::jsonb) FROM goods_groups gg WHERE (p_since IS NULL OR gg.updated_at > p_since) AND gg.deleted = 1 AND gg.user_id = auth.uid()),
      'group_items',  (SELECT COALESCE(jsonb_agg(to_jsonb(ggi)), '[]'::jsonb) FROM goods_group_items ggi WHERE (p_since IS NULL OR ggi.updated_at > p_since) AND (ggi.deleted IS NULL OR ggi.deleted != 1) AND ggi.user_id = auth.uid()),
      'group_items_trash',(SELECT COALESCE(jsonb_agg(to_jsonb(ggi)), '[]'::jsonb) FROM goods_group_items ggi WHERE (p_since IS NULL OR ggi.updated_at > p_since) AND ggi.deleted = 1 AND ggi.user_id = auth.uid()),
      'recharge',     (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM recharge_records r WHERE (p_since IS NULL OR r.updated_at > p_since) AND (r.deleted IS NULL OR r.deleted != 1) AND r.user_id = auth.uid()),
      'recharge_trash',(SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM recharge_records r WHERE (p_since IS NULL OR r.updated_at > p_since) AND r.deleted = 1 AND r.user_id = auth.uid()),
      'events',       (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM events e WHERE (p_since IS NULL OR e.updated_at > p_since) AND (e.deleted IS NULL OR e.deleted != 1) AND e.user_id = auth.uid()),
      'events_trash', (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM events e WHERE (p_since IS NULL OR e.updated_at > p_since) AND e.deleted = 1 AND e.user_id = auth.uid()),
      'presets',      (SELECT to_jsonb(p) FROM sync_presets p WHERE p.user_id = auth.uid())
    )
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sync_pull(TIMESTAMPTZ) TO authenticated;

-- ── 4c. sync_push 重建（返回类型 void → jsonb，必须先 DROP）──
-- 实例上可能存在历史 ad-hoc 签名的同名函数，按名称清掉全部重载，避免残留旧版本
DO $drop_sync_push$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname = 'sync_push' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $drop_sync_push$;

CREATE OR REPLACE FUNCTION sync_push(
  p_goods            jsonb DEFAULT '[]',
  p_goods_trash      jsonb DEFAULT '[]',
  p_groups           jsonb DEFAULT '[]',
  p_groups_trash     jsonb DEFAULT '[]',
  p_group_items      jsonb DEFAULT '[]',
  p_group_items_trash jsonb DEFAULT '[]',
  p_recharge         jsonb DEFAULT '[]',
  p_recharge_trash   jsonb DEFAULT '[]',
  p_events           jsonb DEFAULT '[]',
  p_events_trash     jsonb DEFAULT '[]',
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
RETURNS jsonb AS $fn$
DECLARE
  -- 服务器时间水位：与 sync_manifest 触发器写入的 synced_at 同为事务时间戳，二者一致
  v_synced_at TIMESTAMPTZ := now();
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
      deleted = EXCLUDED.deleted,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 4b. Upsert groups_trash
  IF jsonb_array_length(p_groups_trash) > 0 THEN
    INSERT INTO goods_groups
    SELECT * FROM jsonb_populate_recordset(null::goods_groups, p_groups_trash)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, type = EXCLUDED.type, summary_mode = EXCLUDED.summary_mode,
      total_amount = EXCLUDED.total_amount, currency = EXCLUDED.currency,
      cover_mode = EXCLUDED.cover_mode, cover_item_id = EXCLUDED.cover_item_id,
      display_mode = EXCLUDED.display_mode, note = EXCLUDED.note,
      deleted = EXCLUDED.deleted,
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
      deleted = EXCLUDED.deleted,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 5b. Upsert group_items_trash
  IF jsonb_array_length(p_group_items_trash) > 0 THEN
    INSERT INTO goods_group_items
    SELECT * FROM jsonb_populate_recordset(null::goods_group_items, p_group_items_trash)
    ON CONFLICT (id) DO UPDATE SET
      group_id = EXCLUDED.group_id, goods_id = EXCLUDED.goods_id,
      sort_order = EXCLUDED.sort_order,
      deleted = EXCLUDED.deleted,
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
      deleted = EXCLUDED.deleted,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 8b. Upsert events_trash
  IF jsonb_array_length(p_events_trash) > 0 THEN
    INSERT INTO events
    SELECT * FROM jsonb_populate_recordset(null::events, p_events_trash)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, type = EXCLUDED.type,
      start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
      location = EXCLUDED.location, description = EXCLUDED.description,
      cover_image = EXCLUDED.cover_image, cover_image_data = EXCLUDED.cover_image_data,
      photos = EXCLUDED.photos, ticket_price = EXCLUDED.ticket_price,
      ticket_type = EXCLUDED.ticket_type, seat_info = EXCLUDED.seat_info,
      other_expenses = EXCLUDED.other_expenses, tracks = EXCLUDED.tracks,
      linked_goods_ids = EXCLUDED.linked_goods_ids, tags = EXCLUDED.tags,
      deleted = EXCLUDED.deleted,
      updated_at = EXCLUDED.updated_at, created_at = EXCLUDED.created_at,
      synced_by = EXCLUDED.synced_by, user_id = EXCLUDED.user_id;
  END IF;

  -- 9. Upsert presets
  IF p_presets != '{}'::jsonb THEN
    INSERT INTO sync_presets (user_id, categories, ips, characters, storage_locations)
    VALUES (auth.uid(),
      COALESCE((p_presets->>'categories')::jsonb, '[]'::jsonb),
      COALESCE((p_presets->>'ips')::jsonb, '[]'::jsonb),
      COALESCE((p_presets->>'characters')::jsonb, '[]'::jsonb),
      COALESCE((p_presets->>'storage_locations')::jsonb, '[]'::jsonb)
    )
    ON CONFLICT (user_id) DO UPDATE SET
      categories = EXCLUDED.categories, ips = EXCLUDED.ips,
      characters = EXCLUDED.characters, storage_locations = EXCLUDED.storage_locations;
  END IF;

  -- 10. Upsert manifest（synced_at 用服务器时间；触发器亦会强制 now()，二者一致）
  INSERT INTO sync_manifest (
    user_id, device_id, synced_at, image_bucket,
    recharge_updated_at, event_updated_at, budget_monthly, budget_yearly,
    collection_count, wishlist_count, goods_count, trash_count,
    recharge_count, event_count, image_count
  ) VALUES (
    auth.uid(), p_device_id, v_synced_at, p_image_bucket,
    p_recharge_updated_at, p_event_updated_at, p_budget_monthly, p_budget_yearly,
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND (is_wishlist IS NULL OR is_wishlist = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND is_wishlist = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE (trashed IS NULL OR trashed = 0) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM goods WHERE trashed = 1 AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM recharge_records WHERE (deleted IS NULL OR deleted != 1) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM events WHERE (deleted IS NULL OR deleted != 1) AND user_id = auth.uid()),
    (SELECT COUNT(*) FROM storage.objects WHERE bucket_id IN ('goods-images', 'event-photos')
      AND name NOT LIKE '%.emptyFolderPlaceholder'
      AND (position('/' in name) = 0 OR (storage.foldername(name))[1] = auth.uid()::text))
  ) ON CONFLICT (user_id) DO UPDATE SET
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

  RETURN jsonb_build_object('synced_at', v_synced_at);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 函数重建后 ACL 重置，先撤回默认的 PUBLIC EXECUTE 再单独授权
REVOKE ALL ON FUNCTION sync_push(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  text[], text[], text[], text[], text[],
  text, timestamptz, text, real, real, timestamptz, timestamptz
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION sync_push(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  text[], text[], text[], text[], text[],
  text, timestamptz, text, real, real, timestamptz, timestamptz
) TO authenticated;
