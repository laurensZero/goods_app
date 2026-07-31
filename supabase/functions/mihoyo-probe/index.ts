// supabase/functions/mihoyo-probe/index.ts
// 最小探测函数：验证从 Supabase 云端（AWS IP）能否直连米游铺 API
// 用途：判断「米游铺上新监听」方案的可行性 —— 云端 IP 是否被米游铺风控拦截
//
// 用法（verify_jwt=false，无需登录）：
//   GET https://<project-ref>.supabase.co/functions/v1/mihoyo-probe?shop_code=xqtd
//   可选参数：
//     shop_code    店铺码，默认 xqtd（崩坏：星穹铁道）
//     show_sale_type  1=只现货 2=只预约/即将上架(booking) 3=现货+预约，默认 2
//     order_by     comprehensive|online_time|sold_num|price，默认 online_time
//   HTTP 头需要带 apikey 或 Authorization: Bearer <anon key>（网页端可用浏览器直接访问）

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const MIHOYO_BASE = "https://api-mall.mihoyogift.com"
const LIST_PATH = "/common/homeishop/v1/goods/search_goods_spu_list"

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const url = new URL(req.url)
  const shopCode = url.searchParams.get("shop_code") || "xqtd"
  const showSaleType = url.searchParams.get("show_sale_type") || "2"
  const orderBy = url.searchParams.get("order_by") || "online_time"

  const q = new URLSearchParams({
    limit: "10",
    page: "1",
    shop_code: shopCode,
    category_id: "0",
    order_by: orderBy,
    show_sale_type: showSaleType,
    random: "false",
  })

  // 记录来源 IP（用于确认确实走了云端网络）
  const cf = req.headers.get("x-forwarded-for") || "unknown"

  try {
    const res = await fetch(`${MIHOYO_BASE}${LIST_PATH}?${q.toString()}`, {
      headers: {
        "Referer": "https://www.mihoyogift.com/",
        "x-rpc-language": "zh-cn",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      // 限制总时长，避免云端超时挂起
      signal: AbortSignal.timeout(15000),
    })

    const status = res.status
    const text = await res.text()
    const contentType = res.headers.get("content-type") || ""

    // 尝试解析 JSON；解析失败说明可能返回了风控/反爬页面而非 API 数据
    let parsed: unknown = null
    let parseError = ""
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e)
    }

    // 只截取前几件，避免响应过大
    let sample: unknown[] = []
    if (parsed && typeof parsed === "object") {
      const data = (parsed as { data?: { list?: unknown[] } }).data
      sample = Array.isArray(data?.list) ? data.list.slice(0, 5) : []
    }

    return json({
      ok: status === 200 && parsed !== null && (parsed as { retcode?: number })?.retcode === 0,
      from: cf,
      mihoyoHttpStatus: status,
      contentType,
      isJson: parsed !== null,
      parseError: parseError || undefined,
      retcode: parsed ? (parsed as { retcode?: number }).retcode : undefined,
      message: parsed ? (parsed as { message?: string }).message : undefined,
      count: parsed ? (parsed as { data?: { count?: number } }).data?.count : undefined,
      sampleNames: sample.map((it) => (it as { name?: string }).name),
      sampleIds: sample.map((it) => (it as { goods_id?: string }).goods_id),
      // 未通过时给出 HTML 片段前 200 字，帮助判断是风控页还是网络问题
      preview: text.slice(0, 200),
    })
  } catch (e) {
    return json({
      ok: false,
      from: cf,
      error: e instanceof Error ? e.message : String(e),
      errorName: e instanceof Error ? e.name : "unknown",
    }, 200)
  }
})
