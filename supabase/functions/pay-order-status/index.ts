// supabase/functions/pay-order-status/index.ts
// 订单查询 + 惰性关单 + 权益列表。verify_jwt=true（必须登录）。
//
// 学习要点：
//   1. **同步跳转（return_url）只是给用户看的，异步通知（notify）才是唯一权威**。
//      用户支付后浏览器返回 App 只是 UX；App 必须回头查单/等回调确认，才能发货。
//      本函数就是「查单」这一环：支付页返回后 App 轮询它拿最终状态。
//   2. **惰性关单**：真实系统有定时任务批量关单。这里省掉定时器，在查询时顺手把
//      已过期还是 pending 的单 CAS 成 expired —— 读到即修正，无需 cron。
//   3. **权益以 feature_whitelist 为准**，不是以订单 status 为准。
//      订单 paid 但白名单写入失败时（极罕见），granted=false 会暴露出来，便于补单。
//   4. 只能查自己的订单（user_id 过滤），越权查不到。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import {
  adminClient,
  corsHeaders,
  formatYuan,
  getUserFromRequest,
  json,
} from "../_shared/pay.ts"

const ORDER_COLUMNS =
  "out_trade_no, product, feature, status, amount, currency, subject, channel, created_at, expires_at, paid_at, trade_no"

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const user = await getUserFromRequest(req)
  if (!user) return json({ error: "unauthorized" }, 401)

  const url = new URL(req.url)
  const outTradeNo = url.searchParams.get("out_trade_no")
  const admin = adminClient()

  try {
    // 1) 惰性关单：pending 且已过期 → expired（CAS：只改仍为 pending 的行）
    let expire = admin
      .from("payment_orders")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
    if (outTradeNo) expire = expire.eq("out_trade_no", outTradeNo)
    const { error: expireError } = await expire
    if (expireError) console.warn("pay-order-status:expire-failed", expireError)

    // 2) 查询订单（指定单号查一条，否则列最近 20 条）
    let query = admin
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(outTradeNo ? 1 : 20)
    if (outTradeNo) query = query.eq("out_trade_no", outTradeNo)

    const { data: orders, error: queryError } = await query
    if (queryError) {
      console.error("pay-order-status:query-error", queryError)
      return json({ error: "query_failed" }, 500)
    }

    // 3) 权益列表（发货结果，唯一权威）
    const { data: whitelist, error: wlError } = await admin
      .from("feature_whitelist")
      .select("feature")
      .eq("user_id", user.id)

    if (wlError) console.warn("pay-order-status:whitelist-error", wlError)
    const entitlements = (whitelist || []).map((row) => row.feature)

    const shaped = (orders || []).map((order) => ({
      ...order,
      amount_yuan: formatYuan(order.amount),
      // granted = 订单已支付 且 权益确实已发放（两者都成立才算真正到账）
      granted: order.status === "paid" && entitlements.includes(order.feature),
    }))

    if (outTradeNo) {
      return json({ order: shaped[0] ?? null, entitlements })
    }
    return json({ orders: shaped, entitlements })
  } catch (e) {
    console.error("pay-order-status:error", e)
    return json({ error: "server_error" }, 500)
  }
})
