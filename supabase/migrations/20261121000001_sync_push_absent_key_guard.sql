-- sync_push 键缺失保护：旧版本客户端不能再把云端新字段洗掉
--
-- 背景：客户端加新同步列（如 events.day_locations）后，未更新的旧 app 的
-- normalize* 白名单不认识该列：拉取→本地剥掉→内容指纹变化→diff 推送缺键行。
-- 服务端 ON CONFLICT DO UPDATE 原来生成 `col = EXCLUDED.col`，而
-- jsonb_populate_recordset 对行里缺失的键填 NULL → 云端新列被清成 NULL。
--
-- 修复：动态生成的 SET 改为 `col = coalesce(EXCLUDED.col, 表.col)`——
--   - 缺键（NULL）→ 保留云端现值（旧 app 对新列「不可见也不可破坏」）；
--   - 客户端显式传值 → 照常覆盖（新客户端所有列都带键，'[]'/'' 语义不受影响）。
-- 例外：客户端合法用 NULL 表示「清除」的列按原样覆盖（目前只有 goods.points），
--   以后新增有 NULL 语义的列必须登记进 v_explicit_null_cols。
--
-- 行为不变项：updated_at 水位门（WHERE 表.updated_at <= EXCLUDED.updated_at）、
-- delete_* 分支、manifest 计数与 ACL 均与原函数一致。
-- 新建行（INSERT 分支）缺键仍为 NULL，读侧 normalize 归一为空值，后续推送自愈。

CREATE OR REPLACE FUNCTION sync_push(payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_synced_at timestamptz := coalesce((payload->>'synced_at')::timestamptz, now());
  v_uid uuid := auth.uid();
  v_manifest_synced_at timestamptz;
  v_set text;
  v_arr jsonb;
  v_table text;
  v_collection_count bigint;
  v_wishlist_count bigint;
  v_goods_count bigint;
  v_trash_count bigint;
  v_recharge_count bigint;
  v_event_count bigint;
  v_image_count bigint;
  v_keys text[] := ARRAY['goods','goods_trash','goods_groups','goods_groups_trash',
                         'goods_group_items','goods_group_items_trash',
                         'recharge_records','recharge_records_trash',
                         'events','events_trash','batch_drafts','batch_drafts_trash'];
  -- 客户端合法写 NULL 的列：显式 NULL = 用户「清除」语义，不参与键缺失保护
  -- （目前只有 goods.points；以后新增有 NULL 语义的列必须在此登记）
  v_explicit_null_cols text[] := ARRAY['points'];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  PERFORM set_config('app.is_sync_push', 'true', true);

  -- deletes
  IF coalesce(jsonb_array_length(payload->'delete_goods'), 0) > 0 THEN
    DELETE FROM goods WHERE id IN (SELECT jsonb_array_elements_text(payload->'delete_goods'));
  END IF;
  IF coalesce(jsonb_array_length(payload->'delete_groups'), 0) > 0 THEN
    DELETE FROM goods_groups WHERE id IN (SELECT jsonb_array_elements_text(payload->'delete_groups'));
  END IF;
  IF coalesce(jsonb_array_length(payload->'delete_group_items'), 0) > 0 THEN
    DELETE FROM goods_group_items WHERE id IN (SELECT jsonb_array_elements_text(payload->'delete_group_items'));
  END IF;
  IF coalesce(jsonb_array_length(payload->'delete_recharge'), 0) > 0 THEN
    DELETE FROM recharge_records WHERE id IN (SELECT jsonb_array_elements_text(payload->'delete_recharge'));
  END IF;
  IF coalesce(jsonb_array_length(payload->'delete_events'), 0) > 0 THEN
    DELETE FROM events WHERE id IN (SELECT jsonb_array_elements_text(payload->'delete_events'));
  END IF;
  IF coalesce(jsonb_array_length(payload->'delete_batch_drafts'), 0) > 0 THEN
    DELETE FROM batch_drafts WHERE id IN (SELECT jsonb_array_elements_text(payload->'delete_batch_drafts'));
  END IF;

  -- 业务行 upsert：payload 键 → 物理表；SET 列运行时生成，加列不用改这里
  -- 客户端 payload 键名（与 to*Rows 域一致）：
  --   goods / goods_trash / groups / groups_trash / group_items / group_items_trash
  --   recharge / recharge_trash / events / events_trash / batch_drafts / batch_drafts_trash
  FOR v_table, v_arr IN
    SELECT * FROM (VALUES
      ('goods',              payload->'goods'),
      ('goods',              payload->'goods_trash'),
      ('goods_groups',       payload->'groups'),
      ('goods_groups',       payload->'groups_trash'),
      ('goods_group_items',  payload->'group_items'),
      ('goods_group_items',  payload->'group_items_trash'),
      ('recharge_records',   payload->'recharge'),
      ('recharge_records',   payload->'recharge_trash'),
      ('events',             payload->'events'),
      ('events',             payload->'events_trash'),
      ('batch_drafts',       payload->'batch_drafts'),
      ('batch_drafts',       payload->'batch_drafts_trash')
    ) AS t(tab, arr)
  LOOP
    CONTINUE WHEN v_arr IS NULL OR jsonb_typeof(v_arr) IS DISTINCT FROM 'array' OR jsonb_array_length(v_arr) = 0;

    -- 键缺失保护：jsonb_populate_recordset 对行里缺失的键填 NULL。旧版本客户端的
    -- normalize* 白名单不认识新加的列（如 events.day_locations），拉取→剥字段→
    -- 内容指纹变化→diff 推送会把缺键的行盖回来，动态生成的 SET 若直接
    -- `col = EXCLUDED.col` 就会用 NULL 清掉云端新字段。改为 coalesce：缺键（NULL）
    -- 保留云端现值，客户端显式传的值照常覆盖（新客户端所有列都带键）。
    -- 例外的显式 NULL 语义列见 v_explicit_null_cols。
    SELECT string_agg(
             CASE
               WHEN c.column_name = ANY (v_explicit_null_cols)
                 THEN format('%I = EXCLUDED.%I', c.column_name, c.column_name)
               ELSE format('%I = coalesce(EXCLUDED.%I, %I.%I)', c.column_name, c.column_name, v_table, c.column_name)
             END,
             ', ')
      INTO v_set
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = v_table AND c.column_name <> 'id';

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(null::%I, $1)
       ON CONFLICT (id) DO UPDATE SET %s
       WHERE %I.updated_at <= EXCLUDED.updated_at',
      v_table, v_table, v_set, v_table
    ) USING v_arr;
  END LOOP;

  -- manifest 计数：goods 四个计数用一次扫描（FILTER 聚合），recharge/events 各取一次；
  -- storage.objects 的 image_count 拆成「uid 目录前缀」+「根目录 owner_id」两段可走
  -- 索引的计数再相加（与原 OR 条件语义等价，但避免对全桶做函数扫描）。
  SELECT count(*) FILTER (WHERE (trashed IS NULL OR trashed = 0) AND (is_wishlist IS NULL OR is_wishlist = 0)),
         count(*) FILTER (WHERE (trashed IS NULL OR trashed = 0) AND is_wishlist = 1),
         count(*) FILTER (WHERE (trashed IS NULL OR trashed = 0)),
         count(*) FILTER (WHERE trashed = 1)
    INTO v_collection_count, v_wishlist_count, v_goods_count, v_trash_count
    FROM goods
   WHERE user_id = v_uid;

  SELECT count(*) INTO v_recharge_count
    FROM recharge_records
   WHERE (deleted IS NULL OR deleted != 1) AND user_id = v_uid;

  SELECT count(*) INTO v_event_count
    FROM events
   WHERE (deleted IS NULL OR deleted != 1) AND user_id = v_uid;

  -- 第一段：uid 目录前缀；第二段：根目录文件按 owner_id 归属
  SELECT count(*) INTO v_image_count
    FROM storage.objects
   WHERE bucket_id IN ('goods-images', 'event-photos', 'profile-backgrounds')
     AND name LIKE v_uid::text || '/%'
     AND name NOT LIKE '%.emptyFolderPlaceholder';

  v_image_count := v_image_count + (
    SELECT count(*)
      FROM storage.objects
     WHERE bucket_id IN ('goods-images', 'event-photos', 'profile-backgrounds')
       AND position('/' IN name) = 0
       AND owner_id = v_uid::text
       AND name NOT LIKE '%.emptyFolderPlaceholder'
  );

  INSERT INTO sync_manifest (
    user_id, device_id, synced_at, image_bucket,
    recharge_updated_at, event_updated_at, budget_monthly, budget_yearly,
    collection_count, wishlist_count, goods_count, trash_count,
    recharge_count, event_count, image_count
  ) VALUES (
    v_uid,
    coalesce(payload->>'device_id', ''),
    v_synced_at,
    coalesce(payload->>'image_bucket', 'goods-images'),
    (payload->>'recharge_updated_at')::timestamptz,
    (payload->>'event_updated_at')::timestamptz,
    coalesce((payload->>'budget_monthly')::real, 0),
    coalesce((payload->>'budget_yearly')::real, 0),
    v_collection_count,
    v_wishlist_count,
    v_goods_count,
    v_trash_count,
    v_recharge_count,
    v_event_count,
    v_image_count
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
    image_count = EXCLUDED.image_count
  RETURNING synced_at INTO v_manifest_synced_at;

  -- 返回触发器实际写入的服务器时间：sync_manifest.synced_at 被 BEFORE 触发器
  -- set_manifest_synced_at() 强制为 now()，不能返回客户端 payload 里的 v_synced_at，
  -- 否则客户端水位线会落后于服务器，下次同步误判「远端领先」造成假冲突。
  RETURN jsonb_build_object('synced_at', v_manifest_synced_at);
END;
$fn$;

-- 函数重建后 ACL 重置，先撤回默认的 PUBLIC EXECUTE 再单独授权
REVOKE ALL ON FUNCTION sync_push(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_push(jsonb) TO authenticated;
