// supabase/functions/scan-mihoyo-stock/index.ts
// 米游铺库存有货监控：轮询用户加入监控（mihoyo_monitor_goods）的商品 SKU 库存，
// 检测到缺货→有货时入 notification_jobs，由 notify-dispatch（每分钟 cron）投递 QQ。
//
// 触发：cron 每 1 分钟（config.toml schedule = "*/1 * * * *"，或网页端/pg_cron 等价注册）
//   GET .../scan-mihoyo-stock
//
// 自适应节奏（核心）：
// - 调度粒度 1 分钟，但每个商品按 next_check_at 决定是否真正请求米游铺。
// - 新添加/刚售罄：立即检（next_check_at = now()），间隔从 1 分钟起
// - 持续缺货：check_streak 计数，间隔 1 → 2 → 5 → 10 → 15 分钟爬坡
// - 有货（in_stock=true）：降频到 60 分钟复查，用于重新捕捉「售罄→再补货」，
//   售罄后翻回 in_stock=false 并立即检，保证补货第一时间提醒
// - 拉取失败：2 分钟后重试（不参与爬坡，避免瞬时故障拖慢后续）
//
// 有货判定：优先看 detail 返回的 quantity.sku_quantities（键=SKU 组合，值=库存数），
//   任一库存 > 0 即算有货；skus 缺库存映射时回退到 sku.stock/quantity/sku_stock。
//
// 幂等与去重：
// - 仅当「有货 且 该行此前记为缺货（in_stock=false）且用户 QQ 活跃」才入队；
//   入队前先删掉该商品旧的 mihoyo_stock 任务（event_key 复用 mihoyo_stock:<goods_id>），
//   保证商品缺货→补货的每一轮只提醒一次。
// - 用户未绑定/关闭 QQ 时不置 in_stock=true：5 分钟后复查，绑定后尽快补发。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MIHOYO_BASE = "https://api-mall.mihoyogift.com"
const GOODS_DETAIL_PATH = "/common/homeishop/v1/goods/detail"

const SHOP_HEADERS = {
  Referer: "https://www.mihoyogift.com/",
  Origin: "https://www.mihoyogift.com",
  "x-rpc-language": "zh-cn",
  "x-rpc-mall-platform": "web",
}

// 每轮处理的行数上限（同时压住对外请求量与运行时长）
const MAX_ITEMS = 12
const MAX_RESCAN = 5 // 有货商品低频复查（in_stock=true）每轮条数
const TIME_BUDGET_MS = 50_000
const FETCH_TIMEOUT_MS = 12_000

// 缺货爬坡间隔（分钟）：index = min(check_streak, len-1)
const RAMP_INTERVALS_MIN = [1, 2, 5, 10, 15]
const RETRY_MIN = 2              // 拉取失败后重试间隔
const UNBOUND_AVAILABLE_MIN = 5  // 有货但用户未绑定/关 QQ：复查间隔
const AVAILABLE_RECHECK_MIN = 60 // 有货后低频复查间隔（捕捉重新售罄）

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function nextAfterMin(minutes: number, base = Date.now()): string {
  return new Date(base + minutes * 60_000).toISOString()
}

// 拉取商品详情并判定是否有货；失败返回 null（调用方跳过，不动状态）
async function fetchAvailability(goodsId: string): Promise<{ available: boolean; priceCents: number } | null> {
  try {
    const res = await fetch(`${MIHOYO_BASE}${GOODS_DETAIL_PATH}?goods_id=${goodsId}`, {
      headers: SHOP_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = await res.json()
    if (body?.retcode !== 0) return null

    const detail = body?.data?.goods?.detail ?? {}
    const goodsQuantity = body?.data?.goods?.quantity ?? detail?.quantity ?? {}
    const skuQuantities = goodsQuantity?.sku_quantities || {}

    let available = false
    // 权威来源：SKU 库存映射，任一库存 > 0 即可下单
    const entries = Object.entries(skuQuantities) as [string, unknown][]
    if (entries.length > 0) {
      available = entries.some(([, v]) => Number(v) > 0)
    }
    // 回退：detail.skus 带 stock/quantity/sku_stock
    if (!available && detail?.skus && typeof detail.skus === "object") {
      const skus = Object.values(detail.skus) as Record<string, any>[]
      available = skus.some((s) => {
        const st = Number(s?.stock ?? s?.quantity ?? s?.sku_stock ?? -1)
        return st > 0
      })
    }

    const priceCents = Number(detail?.price) > 0 ? Number(detail.price) : 0
    return { available, priceCents }
  } catch {
    return null
  }
}

function formatPrice(cents: number): string {
  if (!cents || cents <= 0) return ""
  const yuan = cents / 100
  return (yuan % 1 === 0 ? yuan.toFixed(0) : yuan.toFixed(2)) + " 元"
}

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!serviceKey) return json({ error: "server config error" }, 500)

  const admin = createClient(supabaseUrl, serviceKey)
  const startedAt = Date.now()

  const stats = {
    scanned: 0,
    available: 0,
    sold_out: 0,
    skipped: 0,
    notified: 0,
    rearmed: 0,
    errors: 0,
    remaining: 0,
  }

  // ---------- 批次 1：缺货/未检测行（in_stock=false），按 next_check_at 升序 ----------
  const { data: rows, error: rowsErr } = await admin
    .from("mihoyo_monitor_goods")
    .select("*")
    .eq("in_stock", false)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(MAX_ITEMS)
  if (rowsErr) return json({ error: rowsErr.message }, 500)

  for (const row of rows ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break // 超预算，剩下的下一轮

    const result = await fetchAvailability(String(row.goods_id || ""))
    if (!result) {
      // 拉取失败：2 分钟后重试，不参与爬坡
      stats.skipped++
      await admin
        .from("mihoyo_monitor_goods")
        .update({ next_check_at: nextAfterMin(RETRY_MIN) })
        .eq("id", row.id)
      continue
    }
    stats.scanned++

    if (!result.available) {
      // 仍缺货：爬坡（间隔随连续缺货次数递增）
      stats.sold_out++
      const streak = Math.min(Number(row.check_streak || 0) + 1, RAMP_INTERVALS_MIN.length - 1)
      const intervalMin = RAMP_INTERVALS_MIN[streak]
      await admin
        .from("mihoyo_monitor_goods")
        .update({
          last_checked_at: new Date().toISOString(),
          check_streak: streak,
          next_check_at: nextAfterMin(intervalMin),
        })
        .eq("id", row.id)
      continue
    }

    // 有货：只有用户 QQ 活跃才入队并置 in_stock=true（绑定后尽快补发）
    const { data: binding } = await admin
      .from("user_qq_bindings")
      .select("user_id")
      .eq("user_id", row.user_id)
      .eq("status", "active")
      .eq("enabled", true)
      .maybeSingle()

    stats.available++
    if (!binding) {
      // 未绑定/关闭：保持 in_stock=false，5 分钟后复查，绑定后补发
      await admin
        .from("mihoyo_monitor_goods")
        .update({
          last_checked_at: new Date().toISOString(),
          check_streak: 0,
          next_check_at: nextAfterMin(UNBOUND_AVAILABLE_MIN),
        })
        .eq("id", row.id)
      continue
    }

    // 入队前先清掉该商品旧的 mihoyo_stock 任务（含已发送），保证每轮补货只提醒一次
    await admin
      .from("notification_jobs")
      .delete()
      .eq("user_id", row.user_id)
      .eq("source", "mihoyo_stock")
      .eq("event_key", `mihoyo_stock:${row.goods_id}`)

    const priceText = formatPrice(Number(result.priceCents) > 0 ? Number(result.priceCents) : Number(row.price_cents || 0))
    const priceLine = priceText ? `价格：${priceText}\n` : ""
    const content = `【米游铺有货提醒】\n「${row.name || "商品"}」已补货有货！\n${priceLine}https://www.mihoyogift.com/goods/${row.goods_id}`

    const { error: insErr } = await admin.from("notification_jobs").insert({
      user_id: row.user_id,
      channel: "qq",
      source: "mihoyo_stock",
      event_key: `mihoyo_stock:${row.goods_id}`,
      title: "米游铺有货提醒",
      content,
      due_at: new Date().toISOString(),
      status: "pending",
    })
    if (insErr) {
      stats.errors++
      continue
    }

    await admin
      .from("mihoyo_monitor_goods")
      .update({
        in_stock: true,
        notified_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        check_streak: 0,
        next_check_at: nextAfterMin(AVAILABLE_RECHECK_MIN),
      })
      .eq("id", row.id)
    stats.notified++
  }

  // ---------- 批次 2：有货行低频复查（捕捉重新售罄 → 翻回 in_stock=false 并立即检） ----------
  const { data: stockedRows, error: stockedErr } = await admin
    .from("mihoyo_monitor_goods")
    .select("id, goods_id, user_id")
    .eq("in_stock", true)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(MAX_RESCAN)
  if (stockedErr) return json({ error: stockedErr.message }, 500)

  for (const row of stockedRows ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break

    const result = await fetchAvailability(String(row.goods_id || ""))
    if (!result) {
      // 拉取失败：2 分钟后重试
      stats.skipped++
      await admin
        .from("mihoyo_monitor_goods")
        .update({ next_check_at: nextAfterMin(RETRY_MIN) })
        .eq("id", row.id)
      continue
    }
    stats.scanned++

    if (!result.available) {
      // 重新售罄：翻回缺货并立即检，补货时第一时间提醒
      stats.rearmed++
      await admin
        .from("mihoyo_monitor_goods")
        .update({
          in_stock: false,
          last_checked_at: new Date().toISOString(),
          check_streak: 0,
          next_check_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      continue
    }

    // 仍是有货：60 分钟后复查
    await admin
      .from("mihoyo_monitor_goods")
      .update({
        last_checked_at: new Date().toISOString(),
        next_check_at: nextAfterMin(AVAILABLE_RECHECK_MIN),
      })
      .eq("id", row.id)
  }

  // 统计还剩多少待检测行（缺货 + 到期的），便于观察追赶进度
  const { count } = await admin
    .from("mihoyo_monitor_goods")
    .select("id", { count: "exact", head: true })
    .eq("in_stock", false)
    .lte("next_check_at", new Date().toISOString())
  stats.remaining = count ?? 0

  return json({ ok: true, stats })
})
