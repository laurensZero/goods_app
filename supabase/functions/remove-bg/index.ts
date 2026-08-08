// supabase/functions/remove-bg/index.ts
// 云端智能抠图（FAPIhub）—— 白名单校验 + 图片转发
// verify_jwt=true（见 config.toml）：必须携带登录用户的 JWT，函数内解析 user_id
// 查询 feature_whitelist 表（feature='remove_bg'），判断该用户是否有抠图权限
//
// 用法（客户端 supabase.functions.invoke）：
//   GET https://<project-ref>.supabase.co/functions/v1/remove-bg
//     返回：{ allowed: boolean, reason?: string } 白名单权限探测
//   POST https://<project-ref>.supabase.co/functions/v1/remove-bg
//     请求体：multipart/form-data，字段 image=<图片文件>，可选 model=falcon|aurora|ghost
//     响应体：200 → PNG 图片（binary）
//             403 → { error: 'forbidden' } 白名单外用户
//
// 安全说明：
//   - FAPIhub API key 只存于函数环境变量 FAPIHUB_API_KEY，客户端不可见
//   - 白名单表默认 RLS 全拒，客户端无法直接读写，只能经本函数用 service_role 查询
//   - 未登录 / 无 token / 非白名单 → 一律返回 403（GET 探测返回 allowed:false）
//
// 部署前需在 Supabase 设置 Secrets：FAPIHUB_API_KEY=<你的 key>

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const FAPIHUB_ENDPOINT = "https://fapihub.com/v2/rembg/"

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

// 统一使用二进制 MIME 返回，避免 Supabase/Android WebView 链路将 PNG
// 当作 UTF-8 文本处理。否则 PNG 签名中的 0x89 会被替换成 EF BF BD，
// 最终得到损坏的 PNG（客户端会看到 efbfbd504e47...）。
function binaryResponse(bytes: Uint8Array): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-store",
    },
  })
}

// 某些上游/代理链路会把 PNG 签名首字节 0x89 按 UTF-8 解码成
// U+FFFD（EF BF BD）。只修复这个明确的签名损坏，不对其他图片字节做猜测。
function repairReplacementPngHeader(bytes: Uint8Array): Uint8Array {
  const hasReplacementPngHeader = bytes.length >= 11
    && bytes[0] === 0xef && bytes[1] === 0xbf && bytes[2] === 0xbd
    && bytes[3] === 0x50 && bytes[4] === 0x4e && bytes[5] === 0x47
    && bytes[6] === 0x0d && bytes[7] === 0x0a && bytes[8] === 0x1a && bytes[9] === 0x0a
  if (!hasReplacementPngHeader) return bytes

  const repaired = new Uint8Array(bytes.length - 2)
  repaired[0] = 0x89
  repaired.set(bytes.subarray(3), 1)
  console.warn("remove-bg:repaired-utf8-png-header", {
    originalBytes: bytes.length,
    repairedBytes: repaired.length,
  })
  return repaired
}

// 解析 JWT 并校验白名单；返回 { allowed, user } 或 { allowed:false, reason }
async function authorizeUser(token: string): Promise<
  | { allowed: true; user: { id: string } }
  | { allowed: false; reason: string; status: number }
> {
  if (!token) return { allowed: false, reason: "no_token", status: 401 }

  let user
  try {
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: { user: parsedUser }, error: userError } = await anon.auth.getUser(token)
    if (userError || !parsedUser) {
      return { allowed: false, reason: "unauthorized", status: 401 }
    }
    user = parsedUser
  } catch {
    return { allowed: false, reason: "server_error", status: 500 }
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await admin
      .from("feature_whitelist")
      .select("user_id")
      .eq("feature", "remove_bg")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("remove-bg:whitelist-query-error", error)
      return { allowed: false, reason: "server_error", status: 500 }
    }
    if (!data) {
      return { allowed: false, reason: "forbidden", status: 403 }
    }
  } catch (e) {
    console.error("remove-bg:whitelist-error", e)
    return { allowed: false, reason: "server_error", status: 500 }
  }

  return { allowed: true, user: { id: user.id } }
}

// 解析请求体 multipart/form-data，取出 image 文件与可选 model
async function parseRequestBody(req: Request): Promise<{ image?: File; model?: string } | null> {
  try {
    const formData = await req.formData()
    const image = formData.get("image")
    const model = formData.get("model")
    return {
      image: image instanceof File ? image : undefined,
      model: typeof model === "string" && model ? model : undefined,
    }
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  const auth = await authorizeUser(token)

  if (!auth.allowed) {
    if (req.method === "GET") {
      return json({ allowed: false, reason: auth.reason })
    }
    return json({ error: auth.reason }, auth.status)
  }

  if (req.method === "GET") {
    return json({ allowed: true })
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405)
  }

  const apiKey = Deno.env.get("FAPIHUB_API_KEY")
  if (!apiKey) {
    console.error("remove-bg:missing-fapihub-api-key")
    return json({ error: "server_error" }, 500)
  }

  const parsed = await parseRequestBody(req)
  if (!parsed?.image) {
    return json({ error: "invalid_image", message: "缺少 image 文件" }, 400)
  }

  try {
    // 转发到 FAPIhub，保留图片原始文件名与类型
    const upstream = new FormData()
    upstream.append("image", parsed.image, parsed.image.name || "image.png")
    if (parsed.model) {
      upstream.append("model", parsed.model)
    }

    const upstreamRes = await fetch(FAPIHUB_ENDPOINT, {
      method: "POST",
      headers: { ApiKey: apiKey },
      body: upstream,
    })

    if (!upstreamRes.ok) {
      console.error("remove-bg:upstream-error", upstreamRes.status, upstreamRes.statusText)
      return json(
        { error: "upstream_error", status: upstreamRes.status },
        upstreamRes.status >= 500 ? 502 : 422,
      )
    }

    // FAPIhub 对无法解码的源图可能返回 200 + JSON 错误体，
    // 必须按 Content-Type 区分，否则会把 JSON 当图片回传
    const upstreamType = (upstreamRes.headers.get("content-type") || "").toLowerCase()
    if (!upstreamType.startsWith("image/")) {
      let message = "upstream_non_image_response"
      try {
        const errBody = await upstreamRes.clone().json()
        if (errBody?.error && typeof errBody.error === "string") message = errBody.error
      } catch {
        const text = await upstreamRes.clone().text()
        if (text && text.length < 500) message = text
      }
      console.error("remove-bg:upstream-non-image", upstreamType, message)
      return json({ error: message, status: 422 }, 422)
    }

    const bytes = repairReplacementPngHeader(new Uint8Array(await upstreamRes.arrayBuffer()))
    return binaryResponse(bytes)
  } catch (e) {
    console.error("remove-bg:upstream-fetch-error", e)
    return json({ error: "upstream_network_error" }, 502)
  }
})
