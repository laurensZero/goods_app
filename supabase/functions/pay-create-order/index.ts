// supabase/functions/pay-create-order/index.ts
// 下单：校验登录用户 + 商品 → 生成/复用一条 pending 订单 → 返回订单信息。
// verify_jwt=true（见 config.toml）：必须携带登录用户的 JWT。
//
// 学习要点：
//   1. **金额只由服务端决定**。客户端只传商品 key，绝不接受客户端传价格 ——
//      否则前端改个数字就能 1 分钱买走权益（真实事故高发点）。
//   2. **下单幂等**：同一用户同一商品若已有未过期 pending 单，直接复用，
//      不重复建单。用户连点两次、网络重试都不会产生两条待支付订单。
//   3. **订单有有效期**：超时未支付由 pay-order-status 惰性置为 expired。
//   4. 订单数据客户端只读（RLS），写入只走本函数的 service_role。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import {
  adminClient,
  corsHeaders,
  formatYuan,
  generateOutTradeNo,
  getUserFromRequest,
  json,
  ORDER_TTL_MS,
  PAY_CATALOG,
} from "../_shared/pay.ts"

const ORDER_COLUMNS =
  "out_trade_no, product, feature, status, amount, currency, subject, created_at, expires_at, paid_at"

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const user = await getUserFromRequest(req)
  if (!user) return json({ error: "unauthorized" }, 401)

  let body: { product?: string } = {}
  try {
    body = await req.json()
  } catch {
    // 允许空 body，下面会当作 unknown_product 处理
  }

  const product = PAY_CATALOG[String(body?.product || "")]
  if (!product) return json({ error: "unknown_product" }, 400)

  const admin = adminClient()
  const now = Date.now()

  try {
    // 1) 幂等：复用未过期的同商品 pending 订单
    const { data: existing, error: findError } = await admin
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .eq("user_id", user.id)
      .eq("product", product.product)
      .eq("status", "pending")
      .gt("expires_at", new Date(now).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findError) {
      console.error("pay-create-order:find-error", findError)
      return json({ error: "query_failed" }, 500)
    }

    let order = existing

    // 2) 首次下单：金额、币种、subject 全部由服务端目录决定
    if (!order) {
      const outTradeNo = generateOutTradeNo()
      const { data: inserted, error: insertError } = await admin
        .from("payment_orders")
        .insert({
          out_trade_no: outTradeNo,
          user_id: user.id,
          product: product.product,
          feature: product.feature,
          amount: product.amount,
          currency: "CNY",
          channel: "mock",
          status: "pending",
          subject: product.subject,
          expires_at: new Date(now + ORDER_TTL_MS).toISOString(),
        })
        .select(ORDER_COLUMNS)
        .single()

      if (insertError) {
        console.error("pay-create-order:insert-error", insertError)
        return json({ error: "create_failed" }, 500)
      }
      order = inserted
    }

    // 3) 真实网关这一步会返回「支付链接 / 支付参数」。模拟网关下，收银台是
    //    App 内页面：客户端拿到 out_trade_no 后自行跳到 /pay/checkout/:outTradeNo。
    //    （Edge Function 不能直出 HTML —— 见 _shared/pay.ts 顶部说明。）
    return json({
      order: { ...order, amount_yuan: formatYuan(order.amount) },
      reused: !!existing,
    })
  } catch (e) {
    console.error("pay-create-order:error", e)
    return json({ error: "server_error" }, 500)
  }
})
