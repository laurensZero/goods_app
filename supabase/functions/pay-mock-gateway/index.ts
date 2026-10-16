// supabase/functions/pay-mock-gateway/index.ts
// 模拟「第三方网关的服务器端 API」：扮演支付宝/微信服务端的角色，
// 接收 App 收银台的支付/取消动作，然后**服务端**给商户的 pay-notify 发异步通知。
//
// verify_jwt=true：本函数由我们自己的 App 收银台页面调用，必须确认调用者
// 就是订单所属用户（下方校验 user_id），防止别人拿单号去触发别人的单。
// （真实网关不校验商户用户 JWT，而是校验 app_id + 密钥；这里为安全起见收紧。）
//
// 为什么需要这个函数？因为回调必须是**服务端对服务端**的：
//   - 浏览器不能持有 MOCK_NOTIFY_SECRET（会泄露）
//   - 浏览器也不能伪造出网关签名
// 所以「点一下支付」这个动作，由浏览器发起、本函数带密钥去真正通知商户。
// 这正是真实世界的形状：用户在支付宝收银台点支付 → 支付宝服务器 → 你的 notify_url。
//
// 真实接入时这个函数会被删掉：改成 pay-create-order 调支付宝统一下单 API，
// 收银台换成支付宝自己的页面/SDK。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import {
  adminClient,
  corsHeaders,
  formatYuan,
  generateOutTradeNo,
  getUserFromRequest,
  json,
  signParams,
} from "../_shared/pay.ts"

interface OrderRow {
  out_trade_no: string
  user_id: string
  feature: string
  amount: number
  currency: string
  status: string
  trade_no: string | null
}

/** 给商户 pay-notify 发一次带签名的异步通知，返回商户的 ack 文本。 */
async function sendNotify(
  order: OrderRow,
  tradeStatus: "TRADE_SUCCESS" | "TRADE_CLOSED",
): Promise<{ ok: boolean; status: number; ack: string }> {
  const secret = Deno.env.get("MOCK_NOTIFY_SECRET")
  if (!secret) return { ok: false, status: 500, ack: "MOCK_NOTIFY_SECRET 未配置" }

  // 同一笔交易 trade_no 保持不变（重放也复用），模拟网关重试行为
  const tradeNo = order.trade_no || `MOCK${generateOutTradeNo().slice(3, 17)}`

  const params: Record<string, string> = {
    out_trade_no: order.out_trade_no,
    trade_no: tradeNo,
    trade_status: tradeStatus,
    total_amount: String(order.amount),
    currency: order.currency,
    app_id: "mock-gateway",
    timestamp: String(Date.now()),
  }

  const signature = await signParams(secret, params)
  const notifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pay-notify`

  try {
    const res = await fetch(notifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pay-Signature": signature,
        "X-Pay-Timestamp": params.timestamp,
      },
      body: JSON.stringify(params),
    })
    return { ok: res.ok, status: res.status, ack: await res.text() }
  } catch (e) {
    return { ok: false, status: 0, ack: String((e as Error)?.message || e) }
  }
}

const ADMIN_FEATURE = "admin"

/**
 * 是否允许调用本模拟网关（默认拒绝）。
 *
 * 放行两条途径，任一命中即可：
 *   1. feature_whitelist 里 (user_id=<调用者>, feature='admin') —— 项目**既有的**
 *      管理员体系，与 admin-login / 管理台同一套授权，不需要任何 secret；
 *   2. 环境变量 PAY_MOCK_ADMIN_IDS 显式点名（可选的临时逃生口）。
 *
 * 查表失败一律当作「不是管理员」（fail closed），避免异常时意外放行。
 */
async function isMockGatewayAllowed(userId: string): Promise<boolean> {
  const envIds = (Deno.env.get("PAY_MOCK_ADMIN_IDS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (envIds.includes(userId)) return true

  try {
    const { data, error } = await adminClient()
      .from("feature_whitelist")
      .select("feature")
      .eq("feature", ADMIN_FEATURE)
      .eq("user_id", userId)
      .maybeSingle()
    if (error) {
      console.error("pay-mock-gateway:admin-check-error", error.message)
      return false
    }
    return Boolean(data)
  } catch (e) {
    console.error("pay-mock-gateway:admin-check-throw", e)
    return false
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const user = await getUserFromRequest(req)
  if (!user) return json({ error: "unauthorized" }, 401)

  // ── 「仅自己可见」开关（默认关闭）──
  // 本函数握着 MOCK_NOTIFY_SECRET，能给 pay-notify 签出合法的支付成功通知，
  // 也就是一条「免费给自己发付费权益（remove_bg / beta）」的通道。
  // 而 payment_orders 的写权限只在这里，feature_whitelist 又只由 pay-notify 写，
  // 所以本函数就是整个权益体系唯一的攻击面 —— 因此只对「管理员」开放。
  //
  // 「管理员」= feature_whitelist 里 feature='admin' 那一行，与 admin-login /
  // 管理台是同一套授权。授权一次即可（Supabase SQL Editor）：
  //   insert into feature_whitelist (user_id, feature, note)
  //   values ('<你的-uuid>', 'admin', '管理员')
  //   on conflict (user_id, feature) do nothing;
  // PAY_MOCK_ADMIN_IDS 仍可用作临时逃生口，但非必需。详见
  // docs/payment-mock-gateway.md §7.4
  if (!(await isMockGatewayAllowed(user.id))) {
    console.warn("pay-mock-gateway:blocked-non-admin", user.id)
    return json({ error: "mock_gateway_disabled", hint: "admin_grant_required" }, 403)
  }

  let body: { out_trade_no?: string; action?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: "bad_payload" }, 400)
  }

  const outTradeNo = String(body?.out_trade_no || "")
  const action = String(body?.action || "pay")
  if (!outTradeNo) return json({ error: "missing_out_trade_no" }, 400)

  const admin = adminClient()
  try {
    const { data: order, error } = await admin
      .from("payment_orders")
      .select("out_trade_no, user_id, feature, amount, currency, status, trade_no")
      .eq("out_trade_no", outTradeNo)
      .maybeSingle()

    if (error) {
      console.error("pay-mock-gateway:query-error", error)
      return json({ error: "query_failed" }, 500)
    }
    // 越权防护：只能操作自己的订单
    if (!order || order.user_id !== user.id) return json({ error: "order_not_found" }, 404)

    if (action === "replay") {
      if (order.status !== "paid") return json({ error: "order_not_paid" }, 409)
      const result = await sendNotify(order, "TRADE_SUCCESS")
      return json({ action, ...result })
    }

    if (order.status !== "pending") {
      return json({ action, ok: true, status: 200, ack: "ignored", note: `order_${order.status}` })
    }

    const tradeStatus = action === "cancel" ? "TRADE_CLOSED" : "TRADE_SUCCESS"
    const result = await sendNotify(order, tradeStatus)

    // 回读最新订单状态，方便收银台立即展示结果
    const { data: latest } = await admin
      .from("payment_orders")
      .select("out_trade_no, status, amount, currency, subject, feature, paid_at, trade_no")
      .eq("out_trade_no", outTradeNo)
      .maybeSingle()

    return json({
      action,
      ...result,
      order: latest ? { ...latest, amount_yuan: formatYuan(latest.amount) } : null,
    })
  } catch (e) {
    console.error("pay-mock-gateway:error", e)
    return json({ error: "server_error" }, 500)
  }
})
