// supabase/functions/resize-image/index.ts
// 服务端图片缩放 + 落盘复用（写入原图同桶的 <uid>/compressed/ 下）：
//  - 请求时先查 <uid>/compressed/<原文件名>__w<w>.webp 是否已存在，命中则纯读取返回（不重算）；
//  - 未命中才拉原图、用 imagescript（纯 WASM）缩放，并写回 <uid>/compressed/，供以后复用。
// 原图始终留在 <uid>/ 根目录（不做任何改动），compressed/ 仅存网格用缩略图。
// 仅接受本项目 Storage 公开 URL 作为缩放源，并限制 max 尺寸，防止被当开放代理。
//
// verify_jwt=false（见 config.toml）：缩略图走客户端自建三层缓存（fetch blob →
// URL.createObjectURL）直连本函数，无需登录 JWT。写回 compressed/ 用 service_role 绕过 RLS。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { Image } from "https://deno.land/x/imagescript@v1.2.13/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const STORAGE_HOST = "zvqzicimowfqshgjsrri.supabase.co"
const COMPRESSED_FOLDER = "compressed"
const MAX_DIM = 2000
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
])

const SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("LEGACY_SERVICE_ROLE_KEY") || ""

if (!SERVICE_ROLE_KEY) {
  console.error("resize-image:missing-service-role-key (checked SUPABASE_SERVICE_ROLE_KEY and LEGACY_SERVICE_ROLE_KEY)")
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function originalResponse(bytes: Uint8Array, contentType: string): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Thumb-Source": "original",
      "X-Thumb-Persisted": "false",
    },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "GET") {
    return jsonError("method_not_allowed", 405)
  }

  const url = new URL(req.url)
  const target = url.searchParams.get("url") || ""
  const rawW = Number(url.searchParams.get("w") || "400")
  const rawH = Number(url.searchParams.get("h") || "0")

  if (!target) return jsonError("missing_url", 400)

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return jsonError("bad_url", 400)
  }

  // 只允许缩放本项目 Storage 的公开图片，禁止任意外链（开放代理防护）
  if (parsed.protocol !== "https:" || parsed.hostname !== STORAGE_HOST) {
    return jsonError("forbidden_host", 403)
  }
  const pathMatch = parsed.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!pathMatch) return jsonError("forbidden_path", 403)
  const bucket = pathMatch[1]
  const objectPath = decodeURIComponent(pathMatch[2])

  // 原图在 <uid>/<file>，压缩图放到同桶的 <uid>/compressed/<file>__w<w>.jpeg
  const slashIdx = objectPath.indexOf("/")
  const uid = slashIdx > -1 ? objectPath.slice(0, slashIdx) : ""
  const rest = slashIdx > -1 ? objectPath.slice(slashIdx + 1) : objectPath
  if (!uid) return jsonError("invalid_path", 400)

  const width = Math.min(MAX_DIM, Math.max(16, Math.floor(Number.isFinite(rawW) ? rawW : 400)))
  const height = rawH > 0 ? Math.min(MAX_DIM, Math.max(16, Math.floor(rawH))) : 0
  const thumbKey = `${uid}/${COMPRESSED_FOLDER}/${rest}__w${width}${height ? `_h${height}` : ""}.jpeg`

  // 1) 命中已生成的缩略图：纯读取返回，不重算（原图同桶，service_role 可读）
  try {
    const { data, error } = await supabase.storage.from(bucket).download(thumbKey)
    if (data && !error) {
      const bytes = new Uint8Array(await data.arrayBuffer())
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Thumb-Source": "hit",
          "X-Thumb-Persisted": "true",
        },
      })
    }
  } catch {
    // 读取失败不致命，继续走生成逻辑
  }

  // 2) 未命中：拉原图、解码、缩放
  try {
    const upstream = await fetch(target)
    if (!upstream.ok) return jsonError("upstream_error", 502)
    const contentType = (upstream.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.has(contentType)) return jsonError("unsupported_type", 415)

    const input = new Uint8Array(await upstream.arrayBuffer())

    const image = await Image.decode(input).catch(() => null)
    // 解码失败（如 AVIF）或原图已足够小：返回原图，不落盘缩略图
    if (!image || (image.width <= width && (height === 0 || image.height <= height))) {
      return originalResponse(input, contentType)
    }

    const resized = image.resize(width, height || Image.RESIZE_AUTO)
    const out = await resized.encodeJPEG(82)

    // 3) 落盘缩略图到 <uid>/compressed/，供以后所有设备直接复用
    let persisted = false
    try {
      await supabase.storage.from(bucket).upload(thumbKey, out, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      })
      persisted = true
    } catch (e) {
      console.error("resize-image:upload-failed", bucket, thumbKey, e?.message || e)
      console.warn("resize-image:upload-failed-maybe-missing-secret", "ensure SUPABASE_SERVICE_ROLE_KEY or LEGACY_SERVICE_ROLE_KEY is set for this function")
    }

    return new Response(out, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Thumb-Source": "generated",
        "X-Thumb-Persisted": persisted ? "true" : "false",
      },
    })
  } catch (e) {
    console.error("resize-image:error", e)
    return jsonError("resize_failed", 500)
  }
})
