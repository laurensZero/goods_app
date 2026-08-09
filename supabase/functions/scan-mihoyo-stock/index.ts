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
// 有货判定：优先看 detail 返回的 quantity.sku_quantities（键=SKU 组合，值=库存数）。
//   - sku_key 为空（整件商品）：任一库存 > 0 即算有货。
//   - 指定 sku_key：只盯该 SKU —— 精确命中 key 优先，未命中按 key 的部分组合模糊匹配，
//     仍无则回退 detail.skus 中该 SKU（按 key/id 匹配）的 stock 字段。
//
// 每次扫描回写：
// - stock_count：当前可售库存数（有货 > 0，缺货 0），供 App 列表直接展示
// - sku_name：按 sku_key 从 sale_attrs 重新解析当前展示名并覆盖（SKU 文案会改款变化，
//   如「流萤【二批次预售】」→「流萤【预售】」→「流萤」，key 稳定、文案易变）
//
// 幂等与去重：
// - 仅当「有货 且 该行此前记为缺货（in_stock=false）且用户 QQ 活跃」才入队；
//   入队前先删掉该行旧的 mihoyo_stock 任务（event_key 复用
//   mihoyo_stock:<goods_id> 或 mihoyo_stock:<goods_id>:<sku_key>），
//   保证同商品同 SKU 缺货→补货的每一轮只提醒一次。
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

// 找出「只有单个可选项」的维度组 key（如发货时间），这类 key 可能随批次文案变化：
// 匹配时只要求非噪音（多选项）的 key 部分命中，避免噪音 key 变化导致误判缺货。
function buildNoiseKeys(detail: Record<string, any>): Set<string> {
  const noise = new Set<string>()
  for (const group of Array.isArray(detail?.sale_attrs) ? detail.sale_attrs : []) {
    const content = Array.isArray(group?.content) ? group.content : []
    if (content.length <= 1) {
      for (const item of content) {
        const ik = String(item?.key || "")
        if (ik) noise.add(ik)
      }
    }
  }
  return noise
}

// sku_key 中需要真正参与匹配的部分：排除单选项噪音 key
function requiredKeyParts(skuKey: string, noiseKeys: Set<string>): string[] {
  return String(skuKey || "").split("_").filter((p) => p && !noiseKeys.has(p))
}

// 计算当前可售库存数量（判定范围与 resolveAvailability 一致）：
// - 指定 skuKey：取该 SKU 库存，未精确命中则聚合匹配的部分组合；
// - 整件商品：聚合所有正库存之和。
function resolveStock(
  skuQuantities: Record<string, unknown>,
  skus: Record<string, any>,
  skuKey: string,
  noiseKeys: Set<string> = new Set(),
): number {
  const entries = Object.entries(skuQuantities)

  if (skuKey) {
    if (skuQuantities[skuKey] != null) return Math.max(0, Number(skuQuantities[skuKey]) || 0)

    const skuParts = requiredKeyParts(skuKey, noiseKeys)
    if (skuParts.length) {
      const partial = entries.filter(([k]) => {
        const parts = String(k).split("_").filter(Boolean)
        return skuParts.every((p) => parts.includes(p))
      })
      if (partial.length) {
        return partial.reduce((sum, [, v]) => sum + Math.max(0, Number(v) || 0), 0)
      }
    }

    const matched = Object.entries(skus).find(
      ([k, s]) => String(k) === skuKey || String(s?.id) === skuKey
    )
    if (matched) {
      return Math.max(0, Number(matched[1]?.stock ?? matched[1]?.quantity ?? matched[1]?.sku_stock ?? 0) || 0)
    }
    return 0
  }

  if (entries.length > 0) {
    return entries.reduce((sum, [, v]) => sum + Math.max(0, Number(v) || 0), 0)
  }
  return Object.values(skus).reduce((sum, s) => {
    const st = Number(s?.stock ?? s?.quantity ?? s?.sku_stock ?? 0)
    return sum + (st > 0 ? st : 0)
  }, 0)
}

// 有货判定（见文件头注释）：优先 sku_quantities，回退 detail.skus。
function resolveAvailability(
  skuQuantities: Record<string, unknown>,
  skus: Record<string, any>,
  skuKey: string,
  noiseKeys: Set<string> = new Set(),
): boolean {
  if (skuKey) {
    if (skuQuantities[skuKey] != null) return Number(skuQuantities[skuKey]) > 0

    const skuParts = requiredKeyParts(skuKey, noiseKeys)
    if (skuParts.length) {
      const partial = Object.entries(skuQuantities).filter(([k]) => {
        const parts = String(k).split("_").filter(Boolean)
        return skuParts.every((p) => parts.includes(p))
      })
      if (partial.length) return partial.some(([, v]) => Number(v) > 0)
    }

    const matched = Object.entries(skus).find(
      ([k, s]) => String(k) === skuKey || String(s?.id) === skuKey
    )
    if (matched) {
      const stock = Number(matched[1]?.stock ?? matched[1]?.quantity ?? matched[1]?.sku_stock ?? -1)
      return stock > 0
    }
    return false
  }

  // 整件商品：任一 SKU 库存 > 0 即可下单
  const entries = Object.entries(skuQuantities)
  if (entries.length > 0) {
    return entries.some(([, v]) => Number(v) > 0)
  }
  return Object.values(skus).some((s) => {
    const st = Number(s?.stock ?? s?.quantity ?? s?.sku_stock ?? -1)
    return st > 0
  })
}

// 按 sku_key 重新解析当前 SKU 展示名（sale_attrs 的文案会随商品改款变化，key 稳定）。
// 返回空字符串表示整件商品或无法解析（调用方不改 sku_name）。
function resolveSkuName(detail: Record<string, any>, skuKey: string): string {
  const key = String(skuKey || "").trim()
  if (!key) return ""
  const keyToText = new Map<string, string>()
  // 排除只有单个可选项的维度组（与客户端 buildSkuVariantsFromDetail 一致，
  // 避免「发货时间」这类固定段出现在款式名里，保证名称刷新与客户端一致）
  for (const group of Array.isArray(detail?.sale_attrs) ? detail.sale_attrs : []) {
    const content = Array.isArray(group?.content) ? group.content : []
    if (content.length <= 1) continue
    for (const item of content) {
      const itemKey = String(item?.key || "")
      if (itemKey) keyToText.set(itemKey, String(item?.text || "").trim())
    }
  }
  return key
    .split("_")
    .map((p) => keyToText.get(p))
    .filter((x): x is string => !!x)
    .join(" / ")
}

// 仅当解析出新的 SKU 名且与库中不同才产生更新补丁（避免无关写入）
function skuNamePatch(current: string, resolved: string): Record<string, string> {
  const next = String(resolved || "").trim()
  if (next && next !== String(current || "")) return { sku_name: next }
  return {}
}

// 拉取商品详情并判定指定 SKU（或整件）是否有货；失败返回 null（调用方跳过，不动状态）
async function fetchAvailability(goodsId: string, skuKey = ""): Promise<{ available: boolean; priceCents: number; stock: number; skuName: string } | null> {
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
    const noiseKeys = buildNoiseKeys(detail)

    const available = resolveAvailability(skuQuantities, detail?.skus ?? {}, String(skuKey || ""), noiseKeys)
    const stock = resolveStock(skuQuantities, detail?.skus ?? {}, String(skuKey || ""), noiseKeys)
    const priceCents = Number(detail?.price) > 0 ? Number(detail.price) : 0
    const skuName = resolveSkuName(detail, String(skuKey || ""))
    return { available, stock, priceCents, skuName }
  } catch {
    return null
  }
}

function formatPrice(cents: number): string {
  if (!cents || cents <= 0) return ""
  const yuan = cents / 100
  return (yuan % 1 === 0 ? yuan.toFixed(0) : yuan.toFixed(2)) + " 元"
}

// 监控任务去重键：整件商品沿用 mihoyo_stock:<goods_id>（兼容旧数据），指定 SKU 追加 sku_key
function monitorEventKey(goodsId: string, skuKey: string): string {
  return skuKey ? `mihoyo_stock:${goodsId}:${skuKey}` : `mihoyo_stock:${goodsId}`
}

// 通知文案里的商品显示名：指定 SKU 时附上 SKU 名
function monitorDisplayName(name: string, skuName: string, skuKey: string): string {
  if (skuKey && skuName) return `${name || "商品"} · ${skuName}`
  return name || "商品"
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

    const skuKey = String(row.sku_key || "")
    const result = await fetchAvailability(String(row.goods_id || ""), skuKey)
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
          stock_count: 0,
          next_check_at: nextAfterMin(intervalMin),
          ...skuNamePatch(row.sku_name, result.skuName),
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
          stock_count: Number(result.stock) || 0,
          next_check_at: nextAfterMin(UNBOUND_AVAILABLE_MIN),
          ...skuNamePatch(row.sku_name, result.skuName),
        })
        .eq("id", row.id)
      continue
    }

    // 入队前先清掉该行旧的 mihoyo_stock 任务（含已发送），保证每轮补货只提醒一次
    const eventKey = monitorEventKey(String(row.goods_id || ""), skuKey)
    await admin
      .from("notification_jobs")
      .delete()
      .eq("user_id", row.user_id)
      .eq("source", "mihoyo_stock")
      .eq("event_key", eventKey)

    const priceText = formatPrice(Number(result.priceCents) > 0 ? Number(result.priceCents) : Number(row.price_cents || 0))
    const priceLine = priceText ? `价格：${priceText}\n` : ""
    const stockLine = Number(result.stock) > 0 ? `库存：${result.stock} 件\n` : ""
    // 通知用本轮解析出的最新 SKU 名（文案会随商品改款变化）
    const displayName = monitorDisplayName(row.name, result.skuName || row.sku_name, skuKey)
    const content = `【米游铺有货提醒】\n「${displayName}」已补货有货！\n${stockLine}${priceLine}https://www.mihoyogift.com/goods/${row.goods_id}`

    const { error: insErr } = await admin.from("notification_jobs").insert({
      user_id: row.user_id,
      channel: "qq",
      source: "mihoyo_stock",
      event_key: eventKey,
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
        stock_count: Number(result.stock) || 0,
        next_check_at: nextAfterMin(AVAILABLE_RECHECK_MIN),
        ...skuNamePatch(row.sku_name, result.skuName),
      })
      .eq("id", row.id)
    stats.notified++
  }

  // ---------- 批次 2：有货行低频复查（捕捉重新售罄 → 翻回 in_stock=false 并立即检） ----------
  const { data: stockedRows, error: stockedErr } = await admin
    .from("mihoyo_monitor_goods")
    .select("id, goods_id, user_id, sku_key, sku_name")
    .eq("in_stock", true)
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(MAX_RESCAN)
  if (stockedErr) return json({ error: stockedErr.message }, 500)

  for (const row of stockedRows ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break

    const skuKey = String(row.sku_key || "")
    const result = await fetchAvailability(String(row.goods_id || ""), skuKey)
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
          stock_count: 0,
          next_check_at: new Date().toISOString(),
          ...skuNamePatch(row.sku_name, result.skuName),
        })
        .eq("id", row.id)
      continue
    }

    // 仍是有货：60 分钟后复查
    await admin
      .from("mihoyo_monitor_goods")
      .update({
        last_checked_at: new Date().toISOString(),
        stock_count: Number(result.stock) || 0,
        next_check_at: nextAfterMin(AVAILABLE_RECHECK_MIN),
        ...skuNamePatch(row.sku_name, result.skuName),
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
