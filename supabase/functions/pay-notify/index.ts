// supabase/functions/pay-notify/index.ts
// 异步通知（支付回调）：模拟第三方网关服务器 → 商户服务器 的服务端通知。
// verify_jwt=false：网关服务器无法携带用户 JWT，鉴权靠 HMAC 验签。
//
// 这是整个支付功能里**最需要认真对待**的一环。学习要点：
//
//   1. **回调是唯一权威**：用户可能付完款直接关掉页面（同步跳转丢失），
//      所以「支付成功」必须以收到并验签通过的回调为准，不能靠前端回调。
//   2. **必须先验签再处理**：接口公网可达，任何人可 POST。验签保证请求来自网关。
//   3. **防重放**：带时间戳，超过窗口（5 分钟）直接拒绝；生产还要校验 nonce 一次性。
//   4. **幂等**：网关会重试（你 5xx / 超时它就重发，可能连续发几十次）。
//      同一笔单号重复回调必须返回成功、且不能重复发货 —— 靠 CAS 更新 + upsert 保证。
//   5. **金额以本地订单为准**：绝不信任回调里的金额，防篡改。
//   6. **ack 协议**：处理成功必须返回网关约定的字符串（这里 success，支付宝同款），
//      否则网关认为失败会一直重试。
//   7. **发货与改单要能自愈**：改单成功但发货失败时返回 5xx，让网关重试；
//      重试进来时 upsert 幂等，不会重复发。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import {
  adminClient,
  corsHeaders,
  signParams,
  text,
  timingSafeEqual,
} from "../_shared/pay.ts"

// 重放窗口：回调时间戳与服务器时间偏差超过该值即拒绝
const REPLAY_WINDOW_MS = 5 * 60 * 1000

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return text("method not allowed", 405)

  const secret = Deno.env.get("MOCK_NOTIFY_SECRET")
  if (!secret) {
    console.error("pay-notify:MOCK_NOTIFY_SECRET missing")
    return text("server misconfigured", 500)
  }

  // 读原始 body（验签必须用原文，不能读成对象再字符串化）
  const rawBody = await req.text()

  let params: Record<string, string>
  try {
    const parsed = JSON.parse(rawBody)
    params = Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")]),
    )
  } catch {
    return text("bad payload", 400)
  }

  // ── 1) 防重放：时间戳必须在窗口内 ──
  const timestamp = Number(params.timestamp || 0)
  if (!timestamp || Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) {
    console.warn("pay-notify:expired-timestamp", { timestamp })
    return text("expired", 401)
  }

  // ── 2) 验签：用与收银台完全相同的 canonical 规则重算，常数时间比较 ──
  const signature = req.headers.get("x-pay-signature") || ""
  const expected = await signParams(secret, params)
  if (!signature || !timingSafeEqual(signature, expected)) {
    console.warn("pay-notify:invalid-signature", { out_trade_no: params.out_trade_no })
    return text("invalid signature", 401)
  }

  const outTradeNo = params.out_trade_no
  const tradeStatus = params.trade_status
  if (!outTradeNo) return text("missing out_trade_no", 400)

  const admin = adminClient()

  try {
    const { data: order, error: findError } = await admin
      .from("payment_orders")
      .select("out_trade_no, user_id, feature, amount, status, trade_no")
      .eq("out_trade_no", outTradeNo)
      .maybeSingle()

    if (findError) {
      console.error("pay-notify:find-error", findError)
      return text("query failed", 500)
    }
    if (!order) return text("order not found", 404)

    // ── 3) 关闭类通知（未支付超时/用户取消）：pending → cancelled ──
    if (tradeStatus !== "TRADE_SUCCESS") {
      await admin
        .from("payment_orders")
        .update({ status: "cancelled", notify_raw: params })
        .eq("out_trade_no", outTradeNo)
        .eq("status", "pending") // CAS：只关还没支付的单
      return text("success")
    }

    // ── 4) 金额校验：以本地订单为准，绝不信任回调金额 ──
    const amount = Number(params.total_amount)
    if (!Number.isFinite(amount) || amount !== order.amount) {
      console.error("pay-notify:amount-mismatch", {
        out_trade_no: outTradeNo,
        got: params.total_amount,
        expect: order.amount,
      })
      return text("amount mismatch", 400)
    }

    // ── 5) 状态 CAS：pending → paid。第一次命中即完成状态流转；
    // 重复回调命中 0 行是正常的（说明之前已支付，或订单已被关闭）。
    const { error: updateError } = await admin
      .from("payment_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        trade_no: params.trade_no ?? order.trade_no ?? null,
        notify_raw: params,
      })
      .eq("out_trade_no", outTradeNo)
      .eq("status", "pending")

    if (updateError) {
      console.error("pay-notify:update-error", updateError)
      return text("update failed", 500)
    }

    // ── 6) 只有订单确实处于 paid 才发货（防止给已关闭/已过期的单发货）。
    // 先落状态再发货，是为了让「发货失败 → 网关重试」能自愈：
    // 重试时 CAS 命中 0 行，但状态已是 paid，于是重新执行下面的幂等发货。
    const { data: latest, error: rereadError } = await admin
      .from("payment_orders")
      .select("status")
      .eq("out_trade_no", outTradeNo)
      .maybeSingle()

    if (rereadError) {
      console.error("pay-notify:reread-error", rereadError)
      return text("query failed", 500)
    }

    if (latest?.status !== "paid") {
      // 已关闭的订单又收到支付成功：真实系统应触发退款 / 人工对账，
      // 这里只告警并 ack，避免网关无限重试。
      console.warn("pay-notify:payment-on-closed-order", {
        out_trade_no: outTradeNo,
        status: latest?.status,
      })
      return text("success")
    }

    // ── 7) 发货（幂等）：付款后写 feature_whitelist 授予权益。
    // upsert 保证重复回调不会重复发货、不会因唯一键冲突报错。
    const { error: grantError } = await admin
      .from("feature_whitelist")
      .upsert(
        { user_id: order.user_id, feature: order.feature, note: `mock pay ${outTradeNo}` },
        { onConflict: "user_id,feature" },
      )

    if (grantError) {
      console.error("pay-notify:grant-failed", grantError)
      // 返回非 2xx：网关会重试，下次进来 upsert 仍幂等
      return text("grant failed", 500)
    }

    // ── 8) ack：网关照这个字符串判断成功；失败会重试到成功为止 ──
    return text("success")
  } catch (e) {
    console.error("pay-notify:error", e)
    return text("server error", 500)
  }
})
