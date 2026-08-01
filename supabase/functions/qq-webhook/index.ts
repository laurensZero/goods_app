// supabase/functions/qq-webhook/index.ts
// QQ 机器人 webhook：接收 QQ 平台推送的事件，处理「私聊绑定码 → 激活绑定」
//                    以及用户查询库存/心愿单/统计信息
//
// 配置（verify_jwt=false，QQ 平台调用，非登录用户）：
//   在 QQ 开放平台机器人的「回调地址」填：
//     https://<project-ref>.supabase.co/functions/v1/qq-webhook
//   （必须是 HTTPS，端口 443，符合平台要求）
//
// 需要 secrets：
//   QQ_CLIENT_SECRET —— 机器人 Client Secret。既用于获取 access_token，
//       也作为 webhook 签名 seed 的默认来源。
//   QQ_WEBHOOK_SECRET —— 可选。若 QQ 平台回调配置里单独提供了「签名密钥」，
//       用它当 seed（优先级高于 QQ_CLIENT_SECRET）。
//
// 协议（参考 tencent-connect/bot-docs 官方文档）：
//   - op=13：URL 验证挑战。请求体 d 含 plain_token / event_ts。
//     用 ed25519 对「event_ts + plain_token」签名，返回
//     { "plain_token": ..., "signature": <hex> }。
//   - op=0 实时事件：验签消息体 = X-Signature-Timestamp 头 + 原始请求体，
//     用同一 ed25519 公钥验签；处理完回包 { "op": 12 }（HTTP 回调 ACK）。
//   - 密钥派生：Bot Secret 字符串重复拼到 32 字节作为 ed25519 seed。
//   - 事件：只关心 C2C_MESSAGE_CREATE（用户私聊机器人），content 里的
//     6 位数字即绑定码，匹配后把对应用户的绑定置为 active。
//   - 支持用户查询命令：库存/收藏/心愿/统计/帮助

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nacl from "https://esm.sh/tweetnacl@1.0.3"

// ---------- 查询命令处理 ----------

// 查询命令关键词映射
const QUERY_COMMANDS = new Map([
  ["库存", "collection"],
  ["收藏", "collection"],
  ["心愿", "wishlist"],
  ["心愿单", "wishlist"],
  ["统计", "stats"],
  ["数据", "stats"],
  ["帮助", "help"],
  ["帮助", "help"],
  ["?", "help"],
  ["？", "help"],
])

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

// ---------- ed25519 签名（seed = 重复 Bot Secret 到 32 字节） ----------

function getSignKeypair(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
  const secret = Deno.env.get("QQ_WEBHOOK_SECRET") || Deno.env.get("QQ_CLIENT_SECRET") || ""
  if (!secret) return null
  const raw = new TextEncoder().encode(secret)
  const seed = new Uint8Array(32)
  for (let i = 0; i < 32; i++) seed[i] = raw[i % raw.length]
  return nacl.sign.keyPair.fromSeed(seed)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim()
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function verifyEd25519(kp: { publicKey: Uint8Array }, msg: Uint8Array, sigHex: string): boolean {
  try {
    const sig = hexToBytes(sigHex)
    if (sig.length !== 64) return false
    return nacl.sign.detached.verify(msg, sig, kp.publicKey)
  } catch {
    return false
  }
}

function signEd25519(kp: { secretKey: Uint8Array }, msg: Uint8Array): string {
  return bytesToHex(nacl.sign.detached(msg, kp.secretKey))
}

// ---------- 给用户回消息（被动回复，5 分钟内有效） ----------

async function getQQAccessToken(): Promise<string | null> {
  const appId = Deno.env.get("QQ_APP_ID") ?? ""
  const secret = Deno.env.get("QQ_CLIENT_SECRET") ?? ""
  if (!appId || !secret) return null
  try {
    const res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret: secret }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string }
    return data.access_token || null
  } catch {
    return null
  }
}

// msgId 是收到的那条消息的 id（d.id），带上才能走被动回复；失败静默，不阻塞绑定
async function replyToUser(openid: string, msgId: string, content: string): Promise<void> {
  if (!openid || !msgId) return
  const token = await getQQAccessToken()
  if (!token) return
  try {
    await fetch(`https://api.sgroup.qq.com/v2/users/${openid}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ msg_type: 0, content, msg_id: msgId }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // 回复失败不阻塞绑定流程
  }
}

// 注：QQ 官方 API 拿不到 C2C 用户昵称/真实 QQ 号（隐私限制，实测为空），
// 且抓取会拖慢 ACK 触发 QQ 平台重试，故不在此获取。qq_nickname 保留字段
// 供将来让用户自定义备注名时使用。

// ---------- 查询功能处理函数 ----------

// 与 App 端 EXCLUDED_VALUE_STATUSES 保持一致
const EXCLUDED_COLLECT_STATUSES = ["已赠出", "已出", "丢失"]

// 与 App 端 FALLBACK_RATES 一致（1 外币 ≈ ? CNY）
const FALLBACK_RATES: Record<string, number> = {
  CNY: 1,
  USD: 7.1,
  JPY: 0.048,
  EUR: 7.8,
  GBP: 9.0,
  HKD: 0.91,
  TWD: 0.22,
  KRW: 0.0052,
}

// 汇率缓存（进程生命周期内复用）
let cachedRates: Record<string, number> | null = null
let ratesFetchedAt = 0
const RATES_TTL = 24 * 60 * 60 * 1000 // 24 小时

/**
 * 获取汇率（外币→CNY），与 App 端 exchangeRate store 对齐
 */
async function getExchangeRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - ratesFetchedAt < RATES_TTL) {
    return cachedRates
  }
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=CNY", {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const rates: Record<string, number> = { CNY: 1 }
    if (data.rates) {
      for (const [code, rate] of Object.entries(data.rates)) {
        if (typeof rate === "number" && rate > 0) {
          rates[code] = 1 / rate
        }
      }
    }
    cachedRates = rates
    ratesFetchedAt = Date.now()
    return rates
  } catch {
    return FALLBACK_RATES
  }
}

function convertToCNY(amount: number, currency: string | null | undefined, rates: Record<string, number>): number {
  if (!currency || currency === "CNY") return amount
  const rate = rates[currency]
  if (rate > 0) return amount * rate
  const fallback = FALLBACK_RATES[currency]
  if (fallback > 0) return amount * fallback
  return amount
}

/**
 * 解析查询命令，返回命令类型或 null
 */
function parseQueryCommand(content: string): string | null {
  const trimmed = content.trim().toLowerCase()
  
  // 精确匹配
  if (QUERY_COMMANDS.has(trimmed)) {
    return QUERY_COMMANDS.get(trimmed)
  }
  
  // 包含匹配（支持 "帮我查库存" 等）
  for (const [keyword, command] of QUERY_COMMANDS) {
    if (trimmed.includes(keyword)) {
      return command
    }
  }
  
  return null
}

/**
 * 获取帮助信息
 */
function getHelpMessage(): string {
  return `📚 谷子收纳机器人

可用命令：
• 库存 / 收藏 - 查看库存概览
• 心愿 / 心愿单 - 查看心愿单
• 统计 / 数据 - 查看统计数据
• 帮助 / ? - 显示此帮助

💡 直接发送关键词即可查询`
}

/**
 * 与 App 端 resolveCollectionTotalValue 对齐的价格计算（原始币种）
 * - 有 actualPrice 时：actualPrice + shippingFee（actualPrice 已含全部份数总价）
 * - 无 actualPrice 时：price × quantity + shippingFee
 */
function calcItemValueLocal(item: Record<string, any>): number {
  const shipping = Number(item.shipping_fee) || 0
  const actual = Number(item.actual_price) || 0
  if (actual > 0) {
    return actual + shipping
  }
  const qty = Math.max(1, Number(item.quantity) || 1)
  const basePrice = Number(item.price) || 0
  return basePrice * qty + shipping
}

/**
 * 判断是否应排除（与 App 端 EXCLUDED_VALUE_STATUSES 一致）
 */
function isExcludedStatus(status: string | null | undefined): boolean {
  const s = String(status || "").trim()
  return EXCLUDED_COLLECT_STATUSES.includes(s)
}

/**
 * 查询用户库存概览
 */
async function queryCollection(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: items, error } = await admin
    .from("goods")
    .select("id, name, category, quantity, actual_price, price, shipping_fee, is_wishlist, collect_status, currency")
    .eq("user_id", userId)

  if (error) {
    return "❌ 查询库存失败，请稍后再试"
  }

  if (!items || items.length === 0) {
    return "📦 库存为空"
  }

  // 与 App 对齐：非心愿单 + collectStatus 不在排除列表
  const collection = items.filter(item =>
    !item.is_wishlist &&
    !isExcludedStatus(item.collect_status)
  )

  if (collection.length === 0) {
    return "📦 库存为空"
  }

  // 获取汇率（外币→CNY）
  const rates = await getExchangeRates()

  // 按分类统计
  const categoryMap = new Map<string, number>()
  let totalQuantity = 0
  let totalValueCNY = 0

  for (const item of collection) {
    const qty = Math.max(1, Number(item.quantity) || 1)
    totalQuantity += qty
    const localValue = calcItemValueLocal(item)
    totalValueCNY += convertToCNY(localValue, item.currency, rates)
    
    const cat = item.category || "未分类"
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + qty)
  }

  // 获取分类排名（前5）
  const categoryRanking = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => `  ${cat}: ${count}件`)
    .join("\n")

  return `📦 库存概览

总件数: ${collection.length}
总数量: ${totalQuantity}
总价值: ¥${totalValueCNY.toFixed(0)}
分类数: ${categoryMap.size}

📊 分类排名（前5）:
${categoryRanking}`
}

/**
 * 查询用户心愿单
 */
async function queryWishlist(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: items, error } = await admin
    .from("goods")
    .select("id, name, category, price, currency")
    .eq("user_id", userId)
    .eq("is_wishlist", 1)
    .limit(50)

  if (error) {
    return "❌ 查询心愿单失败，请稍后再试"
  }

  if (!items || items.length === 0) {
    return "💝 心愿单为空"
  }

  // 获取汇率
  const rates = await getExchangeRates()

  // 按分类统计
  const categoryMap = new Map<string, number>()
  let totalValueCNY = 0

  for (const item of items) {
    const localPrice = Number(item.price) || 0
    totalValueCNY += convertToCNY(localPrice, item.currency, rates)
    const cat = item.category || "未分类"
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1)
  }

  // 获取分类排名（前5）
  const categoryRanking = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => `  ${cat}: ${count}件`)
    .join("\n")

  // 获取心愿单列表（前10个）
  const itemList = items
    .slice(0, 10)
    .map((item, idx) => {
      const price = item.price ? `¥${item.price}` : ""
      return `${idx + 1}. ${item.name} ${price}`
    })
    .join("\n")

  const hasMore = items.length > 10 ? `\n... 还有 ${items.length - 10} 件` : ""

  return `💝 心愿单

总数: ${items.length}件
总价值: ¥${totalValueCNY.toFixed(0)}

📋 心愿列表（前10）:
${itemList}${hasMore}

📊 分类统计:
${categoryRanking}`
}

/**
 * 查询用户统计信息
 */
async function queryStats(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: items, error } = await admin
    .from("goods")
    .select("id, name, quantity, actual_price, price, shipping_fee, currency, acquired_at, is_wishlist, collect_status, unit_acquired_at_list")
    .eq("user_id", userId)

  if (error) {
    return "❌ 查询统计数据失败，请稍后再试"
  }

  if (!items || items.length === 0) {
    return "📊 暂无数据"
  }

  // 与 App 对齐：排除已赠出/已出/丢失
  const collection = items.filter(item =>
    !item.is_wishlist &&
    !isExcludedStatus(item.collect_status)
  )
  const wishlist = items.filter(item => item.is_wishlist)

  // 获取汇率
  const rates = await getExchangeRates()

  // 计算收藏统计
  let collectionQuantity = 0
  let collectionValueCNY = 0

  for (const item of collection) {
    const qty = Math.max(1, Number(item.quantity) || 1)
    collectionQuantity += qty
    const localValue = calcItemValueLocal(item)
    collectionValueCNY += convertToCNY(localValue, item.currency, rates)
  }

  const avgPriceCNY = collection.length > 0 ? collectionValueCNY / collection.length : 0

  // 计算持有天数统计
  let totalHoldingDays = 0
  let holdingCount = 0
  const now = new Date()

  for (const item of collection) {
    if (item.acquired_at) {
      const acquiredDate = new Date(item.acquired_at)
      const days = Math.floor((now.getTime() - acquiredDate.getTime()) / (1000 * 60 * 60 * 24))
      totalHoldingDays += days
      holdingCount++
    }
  }

  const avgHoldingDays = holdingCount > 0 ? Math.round(totalHoldingDays / holdingCount) : 0

  return `📊 数据统计

收藏:
• 件数: ${collection.length}
• 总数量: ${collectionQuantity}
• 总价值: ¥${collectionValueCNY.toFixed(0)}
• 平均价: ¥${avgPriceCNY.toFixed(0)}
• 平均持有: ${avgHoldingDays}天

心愿单:
• 总数: ${wishlist.length}件

💰 总投入: ¥${collectionValueCNY.toFixed(0)}`
}

// ---------- 主流程 ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const kp = getSignKeypair()
  if (!kp) {
    return json({ code: 500, message: "missing secret" }, 500)
  }

  // GET：仅健康检查（旧式 echostr 回显已不需要）
  if (req.method === "GET") {
    const url = new URL(req.url)
    return new Response(url.searchParams.get("echostr") || "ok", { headers: corsHeaders })
  }

  // POST：先取原始请求体（验签依赖原文，不能重新序列化）
  const rawBody = await req.text()
  let body: Record<string, any>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ code: 1, message: "invalid json" }, 400)
  }

  // ---- op=13：URL 验证挑战 ----
  if (body.op === 13) {
    const d = (body.d ?? {}) as Record<string, any>
    const plainToken = String(d.plain_token || "")
    const eventTs = String(d.event_ts || "")
    if (!plainToken || !eventTs) return json({ code: 1, message: "bad challenge" }, 400)
    const msg = new TextEncoder().encode(eventTs + plainToken)
    return json({ plain_token: plainToken, signature: signEd25519(kp, msg) })
  }

  // ---- 实时事件：验签（timestamp 头 + 原始 body） ----
  const sigHeader = req.headers.get("X-Signature-Ed25519") || ""
  const tsHeader = req.headers.get("X-Signature-Timestamp") || ""
  if (!verifyEd25519(kp, new TextEncoder().encode(tsHeader + rawBody), sigHeader)) {
    return json({ code: 401, message: "invalid signature" }, 401)
  }

  const eventType = body.t as string
  const d = (body.d ?? {}) as Record<string, any>

  if (eventType === "C2C_MESSAGE_CREATE") {
    // 用户私聊消息：author.user_openid 是用户在平台下的唯一 ID；d.id 是这条消息的 id（被动回复要用）
    const openid = String(d.author?.user_openid || d.author?.id || "").trim()
    const content = String(d.content || "").trim()
    const msgId = String(d.id || "").trim()
    if (!openid || !content) return json({ op: 12 })

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!serviceKey) return json({ code: 500, message: "server config error" }, 500)
    const admin = createClient(supabaseUrl, serviceKey)

    // 1. 先检查是否是绑定码（6位数字）
    const codeMatch = content.match(/\d{6}/)
    const code = codeMatch ? codeMatch[0] : ""
    
    if (code) {
      // 处理绑定码
      const { data: row } = await admin
        .from("user_qq_bindings")
        .select("user_id")
        .eq("bind_code", code)
        .eq("status", "pending")
        .maybeSingle()

      if (!row) {
        // 绑定码无效/已过期：回一条提示（不暴露具体原因），也回 ACK
        await replyToUser(openid, msgId, "绑定码无效或已过期，请打开 App 重新生成。")
        return json({ op: 12 })
      }

      await admin
        .from("user_qq_bindings")
        .update({
          status: "active",
          qq_openid: openid,
          bound_at: new Date().toISOString(),
        })
        .eq("user_id", row.user_id)

      // 补扫存量提醒（先设提醒、后绑 QQ 的场景），失败不阻塞激活
      await admin.rpc("backfill_qq_reminders", { p_user_id: row.user_id }).catch(() => {})

      await replyToUser(openid, msgId, "绑定成功！开售提醒会推送到此 QQ。")
      return json({ op: 12 })
    }

    // 2. 检查是否是查询命令
    const queryCommand = parseQueryCommand(content)
    if (queryCommand) {
      // 通过 openid 找到绑定用户
      const { data: binding } = await admin
        .from("user_qq_bindings")
        .select("user_id")
        .eq("qq_openid", openid)
        .eq("status", "active")
        .maybeSingle()

      if (!binding) {
        await replyToUser(openid, msgId, "请先在 App 内绑定 QQ 机器人")
        return json({ op: 12 })
      }

      let replyContent = ""
      
      switch (queryCommand) {
        case "collection":
          replyContent = await queryCollection(admin, binding.user_id)
          break
        case "wishlist":
          replyContent = await queryWishlist(admin, binding.user_id)
          break
        case "stats":
          replyContent = await queryStats(admin, binding.user_id)
          break
        case "help":
          replyContent = getHelpMessage()
          break
        default:
          replyContent = getHelpMessage()
      }

      await replyToUser(openid, msgId, replyContent)
      return json({ op: 12 })
    }

    // 3. 其他消息：不处理，返回 ACK
    return json({ op: 12 })
  }

  // 其它事件类型：ACK
  return json({ op: 12 })
})
