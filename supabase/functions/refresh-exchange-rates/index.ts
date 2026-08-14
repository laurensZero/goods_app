// supabase/functions/refresh-exchange-rates/index.ts
// 汇率权威源刷新器：从 Frankfurter API 拉取人民币基准汇率，换算成
// 「1 外币 = ? CNY」写入 exchange_rates 单行表（id=1）。
// 所有设备从这张表读取同一份快照，避免各设备本地缓存时效不同
// 导致总额折算出现偏差。
//
// 触发方式（两套，互为兜底）：
//   config.toml schedule 每 6 小时定时（0 */6 * * *）
//   GET .../refresh-exchange-rates?force=1   手动强制刷新（首次部署/数据异常时）
//
// 幂等：每次定时都重新拉取并更新时间戳——不做「数据够新就跳过」的判断，
// 否则手动强刷/上次触发若紧邻定时槽位，会把当次的更新吃掉（快照超龄不刷新，
// 客户端会判定过期回退直连，失去全设备统一口径）。Frankfurter 免费且限流宽松，
// 每 6 小时一次拉取开销可忽略。
// 依赖表：exchange_rates（RLS 只读开放给 anon/authenticated，写仅 service_role）
// 依赖 secrets：无（service_role 由平台注入）

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=CNY"

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

// 把 Frankfurter 的「1 CNY = ? 外币」换算成客户端口径「1 外币 = ? CNY」
function toCnyPerForeign(rates: Record<string, number>): Record<string, number> | null {
  const out: Record<string, number> = { CNY: 1 }
  for (const [code, rate] of Object.entries(rates)) {
    if (code === "CNY") continue
    const n = Number(rate)
    if (Number.isFinite(n) && n > 0) {
      out[code] = 1 / n
    }
  }
  return Object.keys(out).length > 1 ? out : null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  )

  try {
    const res = await fetch(FRANKFURTER_URL, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`http_${res.status}`)
    const data = await res.json()
    const rates = toCnyPerForeign(data.rates ?? {})
    if (!rates) throw new Error("empty_rates")

    const { error } = await admin
      .from("exchange_rates")
      .upsert({ id: 1, rates, source: "frankfurter", updated_at: new Date().toISOString() })
    if (error) throw error

    return json({ ok: true, currencies: Object.keys(rates).length, updatedAt: new Date().toISOString() })
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500)
  }
})
