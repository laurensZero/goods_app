// supabase/functions/scan-mihoyo/index.ts
// 米游铺上新扫描器：轮询米游铺 API → 与轻量去重表 mihoyo_monitor_seen diff →
// 当轮新出现的 goods_id 聚合为消息入 notification_jobs（若条数超限则分多条），
// notify-dispatch（每分钟 cron）负责投递 QQ。
//
// 触发方式（两套调度，见 docs/mihoyo-new-arrival-monitor-plan.md）：
//   GET .../scan-mihoyo?catalog=shop    商店「即将上架」(show_sale_type=2) —— 全天每 20 分钟
//                                          + 北京 12:01-12:05 / 18:01-18:05 每分钟补扫
//                                          （补扫从 1 分起，避开与常规扫整点双开）
//   GET .../scan-mihoyo?catalog=point   积分商城（7 店，需手机头）          —— 每小时
//   GET .../scan-mihoyo?catalog=gift    满赠复核（12 点 / 18 点上新波次）
//   GET .../scan-mihoyo?catalog=all     全量（手动/补数据）
//
// 满赠目录（修 bug：上新商品当时没挂满赠，过后才补 activity）：
//   在 12/18 上新扫描里复核即将上架商品的 detail.promotion.gift_activities，
//   按 activity_id 入 seen（catalog='gift'，goods_id 存 activity_id）→ 新活动才通知。
//   已见过的商品仍会复核活动列表，后补的满赠不会漏。
//
// 去重：seen 表按 (catalog, shop_code, goods_id) 记录已见，已通知商品不再通知；
//       TTL 按目录区分——商店「即将上架」7 天（开售后从列表消失，重新出现视为重新上架可再通知），
//       积分商城 90 天（售罄商品会被列表接口摘下、补货后原样放回，生命周期按月计，短 TTL 会误清），
//       满赠 30 天（按 activity_id 去重，活动周期通常数周）。
// 通知：每轮每目录聚合消息，发给 active+enabled 且开启了 mihoyo_enabled 的用户；
//       消息内容按用户自选的店铺集合（user_qq_bindings.mihoyo_shops，空=全不选）过滤——
//       用户只收到所选店铺的新品；同店铺集合的用户共用同一份消息，条数超限则分多条发送。
//       事件键 mihoyo:<catalog>:<批次哈希>:<序号> 兜底防重（ON CONFLICT DO NOTHING）。
//
// 依赖表：mihoyo_monitor_seen（去重）、notification_jobs（队列）、user_qq_bindings（广播对象）
// 依赖 secrets：无（service_role 由平台注入）

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MIHOYO_BASE = "https://api-mall.mihoyogift.com"
const SHOP_LIST_PATH = "/common/homeishop/v1/goods/search_goods_spu_list"
const POINT_LIST_PATH = "/common/hm_app/v1/goods/point_goods_list"
const GOODS_DETAIL_PATH = "/common/homeishop/v1/goods/detail"
const GIFT_ACTIVITY_PATH = "/common/homeishop/v1/activity/gift"

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
const MAX_MESSAGE_CHARS = 1500
const SEEN_TTL_DAYS = 7 // 商店目录：商品从列表消失超过 7 天即清理去重记录
const POINT_SEEN_TTL_DAYS = 90 // 积分目录：售罄摘下→补货放回很常见，TTL 放宽避免误清
const GIFT_SEEN_TTL_DAYS = 30 // 满赠目录：按 activity_id 去重，活动周期通常数周
// 满赠复核：每店最多查多少条商品的 gift_activities（上新列表本就几十条）
const GIFT_PROBE_LIMIT = 50

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
// showSaleType：商店目录默认 2（即将上架）；满赠发现传 3 覆盖最近上架现货
async function fetchCatalogItems(
  catalog: string,
  shopCode: string,
  showSaleType = "2",
  limit = PAGE_SIZE,
  maxPages = MAX_EMPTY_PAGES,
): Promise<Record<string, any>[]> {
  const isPoint = catalog === "point"
  const baseUrl = `${MIHOYO_BASE}${isPoint ? POINT_LIST_PATH : SHOP_LIST_PATH}`
  const headers = isPoint ? POINT_HEADERS : SHOP_HEADERS

  const items: Record<string, any>[] = []
  let page = 1
  let emptyPages = 0
  let count = Infinity

  while (items.length < count && emptyPages < MAX_EMPTY_PAGES && page <= maxPages) {
    const q = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      shop_code: shopCode,
    })
    if (!isPoint) {
      q.set("category_id", "0")
      q.set("order_by", "online_time")
      q.set("show_sale_type", String(showSaleType))
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

// ---------- 满赠 API ----------

/** 商品详情里的 promotion.gift_activities → [{activity_id, promotion_text}] */
async function fetchGoodsGiftActivityIds(goodsId: string): Promise<{ activity_id: string; promotion_text: string }[]> {
  const id = String(goodsId || "").trim()
  if (!id) return []
  try {
    const json = await fetchJson(
      `${MIHOYO_BASE}${GOODS_DETAIL_PATH}?goods_id=${encodeURIComponent(id)}`,
      SHOP_HEADERS,
    )
    const promotion =
      json?.data?.goods?.promotion ||
      json?.data?.promotion ||
      json?.data?.goods?.detail?.promotion ||
      {}
    const list = Array.isArray(promotion.gift_activities) ? promotion.gift_activities : []
    return list
      .map((item: Record<string, any>) => ({
        activity_id: String(item?.activity_id || "").trim(),
        promotion_text: String(item?.promotion_text || "").trim(),
      }))
      .filter((item: { activity_id: string }) => item.activity_id)
  } catch {
    return []
  }
}

/** 公开拉取满赠活动详情（giveaway 页 ID 即 activity_id） */
async function fetchGiftActivityDetail(activityId: string): Promise<{
  ok: boolean
  activityId: string
  name: string
  shopCode: string
  gifts: { goods_id: string; name: string }[]
}> {
  const id = String(activityId || "").trim()
  const empty = { ok: false, activityId: id, name: "", shopCode: "", gifts: [] as { goods_id: string; name: string }[] }
  if (!id) return empty
  try {
    const json = await fetchJson(`${MIHOYO_BASE}${GIFT_ACTIVITY_PATH}?activity_id=${encodeURIComponent(id)}`, SHOP_HEADERS)
    if (json.retcode !== 0) return empty
    const data = json?.data || {}
    const byGoodsId = new Map<string, { goods_id: string; name: string }>()
    for (const stage of (Array.isArray(data.stages) ? data.stages : [])) {
      for (const gift of (Array.isArray(stage?.gifts) ? stage.gifts : [])) {
        const goodsId = String(gift?.goods_id || "").trim()
        if (!goodsId || byGoodsId.has(goodsId)) continue
        byGoodsId.set(goodsId, {
          goods_id: goodsId,
          name: String(gift?.name || "").trim(),
        })
      }
    }
    return {
      ok: true,
      activityId: id,
      name: String(data.name || "").trim(),
      shopCode: String(data.shop?.shop_code || "").trim(),
      gifts: [...byGoodsId.values()],
    }
  } catch {
    return empty
  }
}

// 赠品 A/B 变体去重键：去掉尾款/预售噪音括号与末尾款式字母（镭射卡A / 镭射卡B → 同一条）
export function giftDedupeKey(name: string): string {
  let s = String(name || "").trim()
  s = s.replace(/【[^】]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^】]*】/g, "")
  s = s.replace(/（[^）]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^）]*）/g, "")
  s = s.replace(/\([^)]*(?:预售|预计|现货|补款|尾款|发货|到仓|开售)[^)]*\)/g, "")
  s = s.replace(
    /\s*(?:(?:第?\d+|[一二三四五六七八九十两]+)\s*(?:批|批次|期)\s*)?(?:预售|预计|现货|补款|尾款|发货|到仓|开售)(?:[^\s（）()【】\[\]]*)?$/g,
    "",
  )
  s = s.replace(/[A-E]$/, "")
  return s.trim()
}

function formatItemLine(catalog: string, it: Record<string, any>): string {
  const name = String(it.name || "未知商品")
  if (catalog === "gift") {
    // 与商品一致：一行一个赠品，不列满减档位
    return `· ${name}`
  }
  if (catalog === "point") {
    const point = Number(it.point) || 0
    const price = Number(it.price) > 0
      ? `+${(Number(it.price) / 100).toFixed(Number(it.price) % 100 === 0 ? 0 : 2)}元`
      : ""
    const time = it.sale_time ? ` ｜ ${formatBeijing(Number(it.sale_time))} 开售` : ""
    return `· ${name}${time} ｜ ${point}积分${price}`
  }
  const time = it.sale_time ? ` ｜ ${formatBeijing(Number(it.sale_time))} 开售` : ""
  const price = Number(it.price) > 0
    ? ` ｜ ${(Number(it.price) / 100).toFixed(Number(it.price) % 100 === 0 ? 0 : 2)}元`
    : ""
  return `· ${name}${time}${price}`
}

function buildMessages(catalog: string, newItems: Record<string, any>[]): string[] {
  const label = catalog === "gift" ? "满赠" : catalog === "point" ? "积分兑换" : "即将上架"
  const header = `【米游铺上新】${label}`
  const lines = newItems.map((it) => formatItemLine(catalog, it))
  if (lines.length === 0) return []
  const messages: string[] = []
  let currentLines = [lines[0]]
  for (let i = 1; i < lines.length; i++) {
    const candidate = `${header}\n${currentLines.join("\n")}\n${lines[i]}`
    if (candidate.length > MAX_MESSAGE_CHARS) {
      messages.push(`${header}\n${currentLines.join("\n")}`)
      currentLines = [lines[i]]
    } else {
      currentLines.push(lines[i])
    }
  }
  messages.push(`${header}\n${currentLines.join("\n")}`)
  return messages
}

async function makeBatchKey(catalog: string, newItems: Record<string, any>[]): Promise<string> {
  const itemKeys = newItems
    .map((it) => `${it.shop_code}:${it.goods_id}`)
    .sort()
    .join("|")
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${catalog}|${itemKeys}`),
  )
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `${catalog}:${hash}`
}

// ---------- 入队（广播给所有活跃 QQ 绑定用户，一目录可多条消息） ----------

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

    const messages = buildMessages(catalog, filtered)
    for (let mi = 0; mi < messages.length; mi++) {
      const content = messages[mi]
      const rows = userIds.map((uid) => ({
        user_id: uid,
        channel: "qq",
        source: "mihoyo",
        event_key: `mihoyo:${catalog}:${batchKey}:${mi}`,
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
        // 并发扫描时只让成功插入 seen 的调用认领该商品；冲突行不能再进入通知。
        // cron 已错峰（补扫从 1 分起）降低并发概率，这里兜底防丢/防重。
        const { data: claimed, error: insertError } = await admin
          .from("mihoyo_monitor_seen")
          .insert(
            {
              catalog,
              shop_code: shopCode,
              goods_id: goodsId,
              first_seen_at: nowIso,
              last_seen_at: nowIso,
            },
            { onConflict: "catalog,shop_code,goods_id", ignoreDuplicates: true },
          )
          .select("goods_id")
          .maybeSingle()
        if (insertError && insertError.code !== "23505") throw insertError

        if (claimed) {
          // 附上 shop_code，后续按用户自选店铺过滤用
          newItems.push({ ...it, shop_code: shopCode })
        } else {
          await admin
            .from("mihoyo_monitor_seen")
            .update({ last_seen_at: nowIso })
            .eq("catalog", catalog)
            .eq("shop_code", shopCode)
            .eq("goods_id", goodsId)
        }
      }
    }
  }

  // 清理：商店目录开售后/下架商品从「即将上架」消失，>7 天未再出现即删去重记录；
  // 积分目录放宽到 90 天。两目录各清各的（cutoff 不同，不能跨目录删）。
  const ttlDays = catalog === "point" ? POINT_SEEN_TTL_DAYS : SEEN_TTL_DAYS
  const cutoff = new Date(Date.now() - ttlDays * 86_400_000).toISOString()
  await admin
    .from("mihoyo_monitor_seen")
    .delete()
    .eq("catalog", catalog)
    .lt("last_seen_at", cutoff)

  let enqueued = { users: 0, jobs: 0 }
  if (newItems.length > 0) {
    // 按认领集合生成键：正常一轮全部合并；并发子集各入队，不丢商品
    const batchKey = await makeBatchKey(catalog, newItems)
    enqueued = await enqueueBatch(admin, catalog, newItems, batchKey)
  }

  return { catalog, shops: shopCodes.length, scanned, new_items: newItems.length, errors, enqueued }
}

// ---------- 满赠复核扫描 ----------
// 场景：上新商品开售前常先空挂、过一阵才补满赠。
//   商品 goods_id 在 12/18 上新那波已进 shop seen；后补的 activity 只能靠
//   复核 detail.gift_activities 才能发现——按 activity_id 去重，不按商品。
// 调度：只在 12 点 / 18 点上新波次跑，不必全时段扫。

async function scanGiftCatalog(
  admin: ReturnType<typeof createClient>,
  shopCodes: string[],
) {
  const nowIso = new Date().toISOString()
  const newActivities: Record<string, any>[] = []
  const errors: string[] = []
  let probed = 0
  // 跨活动 A/B 去重：镭射卡A / 镭射卡B 只出一行
  const giftKeySeen = new Set<string>()

  for (const shopCode of shopCodes) {
    // 只看「即将上架」——上新商品的主列表；开售后再补的满赠
    // 在下一轮活动详情回访里也能从已见 activity 维度兜住
    let candidates: Record<string, any>[] = []
    try {
      candidates = await fetchCatalogItems("shop", shopCode, "2", PAGE_SIZE, 1)
    } catch (e) {
      errors.push(`${shopCode}:${e instanceof Error ? e.message : "fetch_failed"}`)
      continue
    }

    const seenGoods = new Set<string>()
    for (const it of candidates) {
      const goodsId = String(it.goods_id || "")
      if (!goodsId || seenGoods.has(goodsId)) continue
      seenGoods.add(goodsId)
      if (seenGoods.size > GIFT_PROBE_LIMIT) break

      probed++
      let acts: { activity_id: string; promotion_text: string }[] = []
      try {
        acts = await fetchGoodsGiftActivityIds(goodsId)
      } catch {
        // 单商品 detail 失败跳过，不中断本轮
        continue
      }

      for (const act of acts) {
        const actId = act.activity_id
        if (!actId) continue

        // 按 activity_id 去重：已见活动只刷 last_seen，不重复通知
        const { data: existing } = await admin
          .from("mihoyo_monitor_seen")
          .select("goods_id")
          .eq("catalog", "gift")
          .eq("shop_code", shopCode)
          .eq("goods_id", actId)
          .maybeSingle()

        if (existing) {
          await admin
            .from("mihoyo_monitor_seen")
            .update({ last_seen_at: nowIso })
            .eq("catalog", "gift")
            .eq("shop_code", shopCode)
            .eq("goods_id", actId)
          continue
        }

        const { data: claimed, error: insertError } = await admin
          .from("mihoyo_monitor_seen")
          .insert(
            {
              catalog: "gift",
              shop_code: shopCode,
              goods_id: actId,
              first_seen_at: nowIso,
              last_seen_at: nowIso,
            },
            { onConflict: "catalog,shop_code,goods_id", ignoreDuplicates: true },
          )
          .select("goods_id")
          .maybeSingle()
        if (insertError && insertError.code !== "23505") throw insertError
        if (!claimed) {
          await admin
            .from("mihoyo_monitor_seen")
            .update({ last_seen_at: nowIso })
            .eq("catalog", "gift")
            .eq("shop_code", shopCode)
            .eq("goods_id", actId)
          continue
        }

        // 新活动：拆成一行一个赠品（A/B 去重），与商品通知形态一致
        const detail = await fetchGiftActivityDetail(actId)
        const shop = detail.shopCode || shopCode
        for (const g of detail.gifts) {
          const rawName = String(g.name || "").trim()
          if (!rawName) continue
          const gKey = giftDedupeKey(rawName) || rawName
          if (giftKeySeen.has(gKey)) continue
          giftKeySeen.add(gKey)
          newActivities.push({
            goods_id: g.goods_id || `${actId}:${gKey}`,
            name: gKey,
            shop_code: shop,
          })
        }
        // 活动详情异常时兜底一行，避免整条通知丢失
        if (!detail.gifts.length) {
          const fallbackName = detail.name || act.promotion_text || "满赠活动"
          const fallbackKey = giftDedupeKey(fallbackName) || fallbackName
          if (!giftKeySeen.has(fallbackKey)) {
            giftKeySeen.add(fallbackKey)
            newActivities.push({
              goods_id: actId,
              name: fallbackKey,
              shop_code: shop,
            })
          }
        }
      }
    }
  }

  // TTL：满赠活动 30 天未再出现即清理
  const cutoff = new Date(Date.now() - GIFT_SEEN_TTL_DAYS * 86_400_000).toISOString()
  await admin
    .from("mihoyo_monitor_seen")
    .delete()
    .eq("catalog", "gift")
    .lt("last_seen_at", cutoff)

  let enqueued = { users: 0, jobs: 0 }
  if (newActivities.length > 0) {
    const batchKey = await makeBatchKey("gift", newActivities)
    enqueued = await enqueueBatch(admin, "gift", newActivities, batchKey)
  }

  return {
    catalog: "gift",
    shops: shopCodes.length,
    scanned: probed,
    new_items: newActivities.length,
    errors,
    enqueued,
  }
}
// ---------- 入口 ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const url = new URL(req.url)
  const p = (url.searchParams.get("catalog") || "all").toLowerCase()
  const catalogs = p === "all"
    ? ["shop", "point", "gift"]
    : p === "shop" || p === "point" || p === "gift"
      ? [p]
      : []
  if (!catalogs.length) return json({ error: "catalog must be shop|point|gift|all" }, 400)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!serviceKey) return json({ error: "server config error" }, 500)

  const admin = createClient(supabaseUrl, serviceKey)

  const results = []
  for (const catalog of catalogs) {
    if (catalog === "gift") {
      results.push(await scanGiftCatalog(admin, SHOP_CODES))
      continue
    }
    results.push(await scanCatalog(admin, catalog, catalog === "point" ? POINT_SHOP_CODES : SHOP_CODES))
  }
  return json({ ok: true, results })
})
