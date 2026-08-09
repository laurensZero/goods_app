// supabase/functions/geocode-address/index.ts
// 地址 → 城市 地理编码（高德 Web 服务）。
// verify_jwt=true（见 config.toml）：必须携带登录 JWT，防止匿名刷高德配额。
//
// 用法（客户端 supabase.functions.invoke 会自动带上 Authorization: Bearer <access_token>）：
//   POST https://<project-ref>.supabase.co/functions/v1/geocode-address
//   body: { "address": "国家会展中心(上海)" }
//   返回：{ province, city, district, adcode, location } 或 { error: <code> }
//
// 识别策略（见 _shared/amapCity.ts）：
//   place/text POI 关键词搜索优先——对场馆级关键词，geocode/geo 经常错配
//   （实测「国家会展中心(上海)」被解析成天津市津南区地铁站），而 POI 搜索
//   返回真实场馆且省/市/区正确。POI 无匹配再退回 geocode + regeo 两步法。
//
// 依赖 secrets：AMAP_WEB_API_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { AmapUpstreamError, lookupCity } from "../_shared/amapCity.ts"

const MAX_ADDRESS_LENGTH = 200

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const apiKey = Deno.env.get("AMAP_WEB_API_KEY")
  if (!apiKey) {
    console.error("geocode-address:missing-secret", "AMAP_WEB_API_KEY")
    return json({ error: "server_misconfigured" }, 500)
  }

  let address = ""
  try {
    const body = await req.json()
    address = String(body?.address || "").trim()
  } catch {
    return json({ error: "invalid_body" }, 400)
  }

  if (!address) return json({ error: "address_required" }, 400)
  if (address.length > MAX_ADDRESS_LENGTH) return json({ error: "address_too_long" }, 400)

  let result
  try {
    result = await lookupCity(apiKey, address)
  } catch (e) {
    if (e instanceof AmapUpstreamError) {
      console.error("geocode-address:upstream-failed", e.status, e.reason, address)
      return json({ error: "upstream_unreachable", detail: e.reason }, 502)
    }
    console.error("geocode-address:unexpected", String(e?.message || e), address)
    return json({ error: "internal_error" }, 500)
  }

  if (!result) {
    // 无匹配地址：返回空字段（客户端据此把城市留空），与上游错误区分
    return json({ province: "", city: "", district: "", adcode: "", location: "" })
  }

  return json({
    province: result.province,
    city: result.city,
    district: result.district,
    adcode: result.adcode,
    location: result.location,
  })
})
