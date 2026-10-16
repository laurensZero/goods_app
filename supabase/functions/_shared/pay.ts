// supabase/functions/_shared/pay.ts
// 支付域共享工具：响应助手、商品目录、回调签名/验签、service_role 客户端。
//
// 为什么单独抽出来：签名与验签必须**由同一份代码**生成和校验，否则
// canonical 字符串一旦两侧写得不一样，回调永远验签失败（真实网关踩坑第一名）。
//
// 设计目标：这套「下单 → 收银台 → 异步通知 → 验签 → 发货 → 幂等」骨架
// 与真实网关（支付宝/微信）同构。阶段二接支付宝沙箱时，只需：
//   - pay-create-order 改为调用支付宝「统一下单」并返回 payUrl / 支付参数；
//   - 客户端 openCashier 改为跳转 payUrl 或把参数交给原生 SDK；
//   - pay-notify 的解析层换成支付宝验签（RSA2）；
// 状态机、幂等、发货逻辑不动。届时 pay-mock-gateway 整个删除。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─────────────────────────── 响应助手 ───────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id, x-pay-signature, x-pay-timestamp",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  })
}

/** 纯文本响应：模拟网关对回调的 ack 约定（支付宝要求商户返回字符串 success）。 */
export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  })
}

// ── 为什么不在这里直出 HTML 收银台页面？ ──
//
// 官方文档明确：Edge Function **不能**在 *.supabase.co 共享域名上直出 HTML。
//   - guides/functions/limits：Serving of HTML content is only supported with
//     custom domains (Otherwise GET requests that return text/html will be
//     rewritten to text/plain).
//   - guides/functions/http-methods：HTML content is not supported. GET requests
//     that return text/html will be rewritten to text/plain. Edge Functions are
//     designed for APIs and data processing, not serving web pages.
//
// 也就是说：你在函数里设 Content-Type: text/html，会被平台**改回** text/plain，
// 浏览器永远只显示源码。这是平台级 rewrite，设响应头解决不了。
// （另一个独立的坑：verify_jwt 默认 true，请求在进入你代码前就被平台 401 拦掉，
//  你拿到的是 JSON 而不是页面。两者都对，但都不能靠响应头解决 HTML 问题。）
//
// 不过这**不影响真实支付**：真实收银台由支付宝/微信自己的域名或原生 App 渲染，
// 我们只提供 JSON API（下单/查单）并接收异步回调。所以本项目的模拟收银台
// 放在 App 内页面里（见 src/views/pay/PayCheckoutView.vue），Edge Function 只做数据。
// 若确实需要外部 HTML 页，可启用 Supabase Custom Domain 或用 Cloudflare Pages Function。
//
// 另外，Edge Function 默认 content-type 仍是 text/plain;charset=UTF-8，json() / text()
// 已显式声明各自的 Content-Type。

// ─────────────────────────── 商品目录 ───────────────────────────
//
// product  = 用户实际购买的商品（收银台展示用）
// feature  = 支付成功后写入 feature_whitelist 的权益名（发货结果）
// amount   = 金额，单位「分」（整数，避免浮点误差 —— 真实支付系统一律用最小货币单位）
//
// feature 值必须与 check-feature-permission / remove-bg / webUpdate 里使用的
// feature 名一致，付款后现有权限校验无需改动即可识别新权益。

export interface PayProduct {
  product: string
  feature: string
  amount: number
  subject: string
}

export const PAY_CATALOG: Record<string, PayProduct> = {
  // ¥6.00 → 授予云端抠图权限（remove-bg 函数按 feature='remove_bg' 放行）
  remove_bg: {
    product: "remove_bg",
    feature: "remove_bg",
    amount: 600,
    subject: "云端智能抠图",
  },
  // ¥1.00 → 授予 Beta 更新通道（webUpdate 按 feature='beta' 放行）
  beta_channel: {
    product: "beta_channel",
    feature: "beta",
    amount: 100,
    subject: "Beta 更新通道",
  },
}

/** 订单有效期：15 分钟（超过后收银台不再允许支付，由 pay-order-status 惰性关单）。 */
export const ORDER_TTL_MS = 15 * 60 * 1000

export function formatYuan(fen: number): string {
  return (Number(fen) / 100).toFixed(2)
}

// ─────────────────────────── 签名 / 验签 ───────────────────────────

/**
 * 生成规范化字符串：**按 key 字典序排序**，空值剔除，k=v 用 & 连接。
 *
 * 这是签名最容易出错的地方：网关按自己的顺序拼接，商户必须用完全一致的规则
 * 重算，任何顺序/空值/编码差异都会导致验签失败。所以生产环境要用官方 SDK
 * 里的签名函数，不要自己手写拼接。
 */
export function canonicalString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${key}=${params[key]}`)
    .join("&")
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** 对参数集合签名（HMAC-SHA256 → 十六进制小写）。 */
export function signParams(secret: string, params: Record<string, string>): Promise<string> {
  return hmacHex(secret, canonicalString(params))
}

/**
 * 常数时间字符串比较，防时序侧信道。
 * 注意：HMAC 十六进制固定 64 字符，长度不等时提前返回不泄漏内容信息。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  if (bufA.length !== bufB.length) return false
  let diff = 0
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i]
  return diff === 0
}

// ─────────────────────────── 数据访问 ───────────────────────────

/** service_role 客户端：绕过 RLS。payment_orders 对客户端只读，写全在此完成。 */
export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** 从 Authorization: Bearer <jwt> 解析登录用户；无 token / token 无效返回 null。 */
export async function getUserFromRequest(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!token) return null
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: { user }, error } = await anon.auth.getUser(token)
  if (error) return null
  return user ?? null
}

/** 商户订单号：PAY + UTC 时间戳 + 随机串。真实系统用雪花 ID / 数据库序列，不用随机数。 */
export function generateOutTradeNo(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const stamp =
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  const rand = Math.random().toString(36).slice(2, 10)
  return `PAY${stamp}${rand}`.toUpperCase()
}
