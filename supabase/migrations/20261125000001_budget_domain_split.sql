-- 预算域拆分：sync_push 未携带预算字段时保留云端现值。
-- 商品同步与预算同步由两个独立入口完成；这里仅修正现有 sync_push 的清单合并行为。
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'sync_push'
     AND pg_get_function_identity_arguments(p.oid) = 'payload jsonb';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'public.sync_push(jsonb) not found';
  END IF;

  v_definition := replace(
    v_definition,
    $$coalesce((payload->>'budget_monthly')::real, 0)$$,
    $$coalesce((payload->>'budget_monthly')::real, (SELECT budget_monthly FROM sync_manifest WHERE user_id = v_uid), 0)$$
  );
  v_definition := replace(
    v_definition,
    $$coalesce((payload->>'budget_yearly')::real, 0)$$,
    $$coalesce((payload->>'budget_yearly')::real, (SELECT budget_yearly FROM sync_manifest WHERE user_id = v_uid), 0)$$
  );

  EXECUTE v_definition;
END
$migration$;
