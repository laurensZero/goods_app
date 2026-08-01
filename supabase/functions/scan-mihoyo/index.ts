// supabase/functions/scan-mihoyo/index.ts
// 米游铺上新扫描器：轮询米游铺 API → 与轻量去重表 mihoyo_monitor_seen diff →
// 当轮新出现的 goods_id 聚合为一则消息入 notification_jobs，
// notify-dispatch（每分钟 cron）负责投递 QQ。
//
// 触发方式（两套调度，见 docs/mihoyo-new-arrival-monitor-plan.md）：
//   GET .../scan-mihoyo?catalog=shop    商店「即将上架」(show_sale_type=2) —— 每天 6 次
//   GET .../scan-mihoyo?catalog=point   积分商城（7 店，需手机头）          —— 每小时
//   GET .../scan-mihoyo?catalog=all     全量（手动/补数据）
//
// 去重：seen 表按 (catalog, shop_code, goods_id) 记录已见，已通知商品不再通知；
//       开售后/下架商品从列表消失，>7 天未再出现即清理，之后重新出现会再通知。
// 通知：每轮每目录聚合一条消息，发给 active+enabled 且开启了 mihoyo_enabled 的用户；
//       消息内容按用户自选的店铺集合（user_qq_bindings.mihoyo_shops，空=全不选）过滤——
//       用户只收到所选店铺的新品；同店铺集合的用户共用同一份消息。
//       事件键 mihoyo:<catalog>:<批次时间> 兜底防重（ON CONFLICT DO NOTHING）。
//
// 依赖表：mihoyo_monitor_seen（去重）、notification_jobs（队列）、user_qq_bindings（广播对象）
// 依赖 secrets：无（service_role 由平台注入）

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MIHOYO_BASE = "https://api-mall.mihoyogift.com"
const SHOP_LIST_PATH = "/common/homeishop/v1/goods/search_goods_spu_list"
const POINT_LIST_PATH = "/common/hm_app/v1/goods/point_goods_list"

const SHOP_HEADERS = { Referer: "https://www.mihoyogift.com/", "x-rpc-language": "zh-cn" }
const POINT_HEADERS = {
  Referer: "https://mihoyogift.com/m/point",
  "x-rpc-language": "zh-cn",
  "x-rpc-client_type": "5",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
}

// 商店「即将上架」与积分商城监听店铺：原神 / 星穹铁道 / 崩坏3 / 绝区零
const SHOP_CODES = ["ys", "xqtd", "bh3", "zzz"]
const POINT_SHOP_CODES = ["ys", "xqtd", "bh3", "zzz"]

const PAGE_SIZE = 50
const MAX_EMPTY_PAGES = 5
const MAX_MESSAGE_ITEMS = 40
const MAX_MESSAGE_CHARS = 1500
const SEEN_TTL_DAYS = 7 // 商品从列表消失超过 7 天即清理去重记录

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

// ---------- 米游铺 API ----------

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`http_${res.status}`)
  return await res.json()
}

// 拉取某 (catalog, shop_code) 的完整列表（按 data.count 翻页）
async function fetchCatalogItems(catalog: string, shopCode: string): Promise<Record<string, any>[]> {
  const isPoint = catalog === "point"
  const baseUrl = `${MIHOYO_BASE}${isPoint ? POINT_LIST_PATH : SHOP_LIST_PATH}`
  const headers = isPoint ? POINT_HEADERS : SHOP_HEADERS

  const items: Record<string, any>[] = []
  let page = 1
  let emptyPages = 0
  let count = Infinity

  while (items.length < count && emptyPages < MAX_EMPTY_PAGES) {
    const q = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(page),
      shop_code: shopCode,
    })
    if (!isPoint) {
      q.set("category_id", "0")
      q.set("order_by", "online_time")
      q.set("show_sale_type", "2")
    }

    const data = await fetchJson(`${baseUrl}?${q.toString()}`, headers)
    if (data.retcode !== 0) throw new Error(`retcode_${data.retcode}_${data.message || ""}`)
    const list = Array.isArray(data?.data?.list) ? data.data.list : []
    const c = Number(data?.data?.count)
    if (Number.isFinite(c) && c > 0) count = c

    if (!list.length) {
      emptyPages++
      break
    }
    items.push(...list)
    if (list.length < PAGE_SIZE) break
    page++
  }
  return items
}

// ---------- 消息拼装 ----------

// sale_time 是北京墙钟对应的 unix 秒，+8h 后按 UTC 读即得北京时刻
function formatBeijing(unixSec: number): string {
  if (!unixSec) return ""
  const d = new Date(unixSec * 1000 + 8 * 3600_000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function formatItemLine(catalog: string, it: Record<string, any>): string {
  const name = String(it.name || "未知商品")
  if (catalog === "point") {
    return `· ${name} ｜ ${Number(it.point) || 0}积分`
  }
  const time = it.sale_time ? ` ｜ ${formatBeijing(Number(it.sale_time))} 开售` : ""
  const price = Number(it.price) > 0
    ? ` ｜ ${(Number(it.price) / 100).toFixed(Number(it.price) % 100 === 0 ? 0 : 2)}元`
    : ""
  return `· ${name}${time}${price}`
}

function buildMessage(catalog: string, newItems: Record<string, any>[]): string {
  const label = catalog === "point" ? "积分兑换" : "即将上架"
  const shown = newItems.slice(0, MAX_MESSAGE_ITEMS)
  let content = `【米游铺上新】${label}\n${shown.map((it) => formatItemLine(catalog, it)).join("\n")}`
  const remaining = newItems.length - shown.length
  if (remaining > 0) content += `\n…还有 ${remaining} 件新品`
  else if (newItems.length > 1) content += `\n（共 ${newItems.length} 件新品）`
  if (content.length > MAX_MESSAGE_CHARS) content = content.slice(0, MAX_MESSAGE_CHARS)
  return content
}

// ---------- 入队（广播给所有活跃 QQ 绑定用户，一目录一条消息） ----------

async function enqueueBatch(
  admin: ReturnType<typeof createClient>,
  catalog: string,
  newItems: Record<string, any>[],
  batchKey: string,
) {
  // 只推给主动开启了「米游铺上新」的用户（mihoyo_enabled，默认关闭），
  // 并按用户自选的店铺集合（mihoyo_shops，空 = 全不选）过滤新品
  const { data: users } = await admin
    .from("user_qq_bindings")
    .select("user_id, mihoyo_shops")
    .eq("status", "active")
    .eq("enabled", true)
    .eq("mihoyo_enabled", true)
  if (!users?.length) return { users: 0, notified_users: 0, jobs: 0 }

  // 按「所选店铺集合」分组，同一集合的用户共用同一份消息，避免逐用户重复拼
  const groups = new Map<string, { shops: Set<string>; userIds: string[] }>()
  for (const u of users) {
    const shops = Array.isArray(u.mihoyo_shops)
      ? u.mihoyo_shops.map(String).filter(Boolean)
      : []
    if (!shops.length) continue // 未选任何店铺 → 不发
    const key = [...shops].sort().join(",")
    let g = groups.get(key)
    if (!g) {
      g = { shops: new Set(shops), userIds: [] }
      groups.set(key, g)
    }
    g.userIds.push(u.user_id)
  }

  let jobs = 0
  let notifiedUsers = 0
  for (const { shops, userIds } of groups.values()) {
    const filtered = newItems.filter((it) => shops.has(String(it.shop_code)))
    if (!filtered.length) continue

    const content = buildMessage(catalog, filtered)
    const rows = userIds.map((uid) => ({
      user_id: uid,
      channel: "qq",
      source: "mihoyo",
      event_key: `mihoyo:${catalog}:${batchKey}`,
      title: "米游铺上新",
      content,
      due_at: new Date().toISOString(),
      status: "pending",
    }))
    const { error } = await admin
      .from("notification_jobs")
      .upsert(rows, { onConflict: "user_id,channel,event_key", ignoreDuplicates: true })
    if (error) throw new Error(`enqueue_failed:${error.message}`)
    jobs += rows.length
    notifiedUsers += userIds.length
  }
  return { users: users.length, notified_users: notifiedUsers, jobs }
}

// ---------- 单个目录扫描 ----------

async function scanCatalog(
  admin: ReturnType<typeof createClient>,
  catalog: string,
  shopCodes: string[],
) {
  const nowIso = new Date().toISOString()
  const newItems: Record<string, any>[] = []
  const errors: string[] = []
  let scanned = 0

  for (const shopCode of shopCodes) {
    let items: Record<string, any>[]
    try {
      items = await fetchCatalogItems(catalog, shopCode)
    } catch (e) {
      // 单店失败放弃本轮、不动 seen，避免网络抖动导致误判
      errors.push(`${shopCode}:${e instanceof Error ? e.message : "fetch_failed"}`)
      continue
    }
    scanned += items.length

    for (const it of items) {
      const goodsId = String(it.goods_id || "")
      if (!goodsId) continue

      const { data: existing } = await admin
        .from("mihoyo_monitor_seen")
        .select("goods_id")
        .eq("catalog", catalog)
        .eq("shop_code", shopCode)
        .eq("goods_id", goodsId)
        .maybeSingle()

      if (existing) {
        await admin
          .from("mihoyo_monitor_seen")
          .update({ last_seen_at: nowIso })
          .eq("catalog", catalog)
          .eq("shop_code", shopCode)
          .eq("goods_id", goodsId)
      } else {
        await admin
          .from("mihoyo_monitor_seen")
          .insert({
            catalog,
            shop_code: shopCode,
            goods_id: goodsId,
            first_seen_at: nowIso,
            last_seen_at: nowIso,
          })
        // 附上 shop_code，后续按用户自选店铺过滤用
        newItems.push({ ...it, shop_code: shopCode })
      }
    }
  }

  // 清理：开售后/下架商品从「即将上架」消失，>7 天未再出现即删去重记录
  const cutoff = new Date(Date.now() - SEEN_TTL_DAYS * 86_400_000).toISOString()
  await admin.from("mihoyo_monitor_seen").delete().lt("last_seen_at", cutoff)

  let enqueued = { users: 0, jobs: 0 }
  if (newItems.length > 0) {
    // 批次键 = 北京时刻到分钟，同一分钟内的重复触发被 notification_jobs UNIQUE 兜底拦截
    const batchKey = new Date(Date.now() + 8 * 3600_000).toISOString().replace(/[-:T]/g, "").slice(0, 12)
    enqueued = await enqueueBatch(admin, catalog, newItems, batchKey)
  }

  return { catalog, shops: shopCodes.length, scanned, new_items: newItems.length, errors, enqueued }
}

// ---------- 入口 ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const url = new URL(req.url)
  const p = (url.searchParams.get("catalog") || "all").toLowerCase()
  const catalogs = p === "all" ? ["shop", "point"] : p === "shop" || p === "point" ? [p] : []
  if (!catalogs.length) return json({ error: "catalog must be shop|point|all" }, 400)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!serviceKey) return json({ error: "server config error" }, 500)

  const admin = createClient(supabaseUrl, serviceKey)

  const results = []
  for (const catalog of catalogs) {
    results.push(await scanCatalog(admin, catalog, catalog === "point" ? POINT_SHOP_CODES : SHOP_CODES))
  }
  return json({ ok: true, results })
})
