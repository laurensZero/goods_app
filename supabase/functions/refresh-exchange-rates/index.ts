// supabase/functions/refresh-exchange-rates/index.ts
// 汇率权威源刷新器：从 Frankfurter API 拉取人民币基准汇率，换算成
// 「1 外币 = ? CNY」写入 exchange_rates 单行表（id=1）。
// 所有设备从这张表读取同一份快照，避免各设备本地缓存时效不同
// 导致总额折算出现偏差。
//
// 触发方式（两套，互为兜底）：
//   config.toml schedule 每日定时
//   GET .../refresh-exchange-rates?force=1   手动强制刷新（首次部署/数据异常时）
//
// 幂等：非 force 且远端快照 < 6h 新时直接跳过，节省配额。
// 依赖表：exchange_rates（RLS 只读开放给 anon/authenticated，写仅 service_role）
// 依赖 secrets：无（service_role 由平台注入）

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=CNY"
const SKIP_FRESHER_THAN_MS = 6 * 60 * 60 * 1000

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

  const url = new URL(req.url)
  const force = url.searchParams.get("force") === "1"
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  )

  // 非 force 且远端已有较新数据时跳过（幂等）
  if (!force) {
    const { data } = await admin.from("exchange_rates").select("updated_at").eq("id", 1).maybeSingle()
    const ageMs = Date.now() - new Date(String(data?.updated_at || 0)).getTime()
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < SKIP_FRESHER_THAN_MS) {
      return json({ ok: true, skipped: "fresh" })
    }
  }

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
