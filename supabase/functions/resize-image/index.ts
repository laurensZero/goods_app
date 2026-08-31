// supabase/functions/resize-image/index.ts
// 服务端图片缩放 + 落盘复用（写入原图同桶的 <uid>/compressed/ 下）：
//  - 请求时先查 <uid>/compressed/<原文件名>__w<w>.jpeg 是否已存在，命中则纯读取返回（不重算）；
//  - 未命中才拉原图、用 imagescript（纯 WASM）缩放，并写回 <uid>/compressed/，供以后复用。
// 原图始终留在 <uid>/ 根目录（不做任何改动），compressed/ 仅存网格用缩略图。
//
// 防滥用（verify_jwt=false，函数自行把关，见 config.toml）：
//  - apikey 头必须等于本项目公开 anon key（随 app 分发，不是机密；用于挡无 key 的盗用/扫描）；
//  - bucket 白名单 + uid 必须 UUID + 文件名单段白名单字符：
//    落盘路径被限定为 <uuid>/compressed/<安全文件名>__w<w>.jpeg，无法构造任意路径；
//  - 宽度仅接受离散档位（WIDTH_TIERS）：杜绝「任意宽度 × 每原图」的落盘写放大；
//  - 每 isolate 固定窗口限流（尽力而为：无全局状态，重启即清零）；
//  - 上游拉取带超时与声明大小上限。
// 注意：旧版本 app 不发送 apikey 头，本函数会 401，客户端按设计回退到原图加载（功能不中断）。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { Image } from "https://deno.land/x/imagescript@v1.2.13/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const STORAGE_HOST = "zvqzicimowfqshgjsrri.supabase.co"
// 公开的 anon key，与 src/config/supabase.js 保持一致；优先读环境变量（托管环境通常自动注入），
// 缺失时用硬编码兜底。轮换时需同步更新客户端并重新发版。
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cXppY2ltb3dmcXNoZ2pzcnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE3NzEsImV4cCI6MjA5Mzk5Nzc3MX0.AZQhPIv79WKtF1bhreMhM89CvOJ8p-1wizNiRgmnRzI"
const ALLOWED_BUCKETS = new Set(["goods-images", "event-photos"])
// 客户端实际使用的缩放档位（见 src/utils/image/thumbUrl.js 调用方）；新增档位需同步客户端
const WIDTH_TIERS = new Set([200, 400, 800, 1200])
const COMPRESSED_FOLDER = "compressed"
const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 8000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 单段文件名（无路径分隔符），限定 App 自管图片的命名形态（前缀 __ id __ updatedAt . 扩展名）
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png|webp|gif|avif)$/i
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
  // 浏览器对带自定义头（apikey）的跨域请求会预检，缓存预检结果避免每图一次 OPTIONS
  "Access-Control-Max-Age": "86400",
}

// --- 每 isolate 固定窗口限流（尽力而为） ---
const RATE_WINDOW_MS = 60_000
const MAX_REQ_PER_WINDOW = 120
const MAX_GENERATE_PER_WINDOW = 20
const rateBuckets = new Map<string, { start: number; req: number; gen: number }>()

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || ""
  return fwd.split(",")[0].trim() || "unknown"
}

// kind=req 对每个请求计数；kind=gen 仅在缓存未命中、真正要生成时计数（生成成本远高于命中读取）
function bumpRate(ip: string, kind: "req" | "gen"): boolean {
  const now = Date.now()
  let entry = rateBuckets.get(ip)
  if (!entry || now - entry.start >= RATE_WINDOW_MS) {
    entry = { start: now, req: 0, gen: 0 }
    rateBuckets.set(ip, entry)
    // 顺带清理过期项，防 Map 无限增长
    if (rateBuckets.size > 10_000) {
      for (const [key, value] of rateBuckets) {
        if (now - value.start >= RATE_WINDOW_MS) rateBuckets.delete(key)
      }
    }
  }
  entry[kind] += 1
  return entry.req <= MAX_REQ_PER_WINDOW && entry.gen <= MAX_GENERATE_PER_WINDOW
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

  if (ANON_KEY && req.headers.get("apikey") !== ANON_KEY) {
    return jsonError("missing_or_invalid_apikey", 401)
  }
  const ip = clientIp(req)
  if (!bumpRate(ip, "req")) {
    return jsonError("rate_limited", 429)
  }

  const url = new URL(req.url)
  const target = url.searchParams.get("url") || ""
  const rawW = Number(url.searchParams.get("w") || "400")

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

  // 写路径白名单：bucket 受限 + uid 必须是 auth UUID + 文件名必须单段安全形态，
  // 保证落盘路径只能是 <uuid>/compressed/<安全文件名>__w<w>.jpeg
  if (!ALLOWED_BUCKETS.has(bucket)) return jsonError("forbidden_bucket", 403)
  if (!UUID_RE.test(uid)) return jsonError("invalid_path", 400)
  if (!SAFE_FILENAME_RE.test(rest)) return jsonError("invalid_path", 400)

  // 仅接受离散宽度档位，杜绝「任意宽度 × 每原图」的落盘写放大
  const width = Math.floor(rawW)
  if (!WIDTH_TIERS.has(width)) return jsonError("unsupported_width", 400)
  const thumbKey = `${uid}/${COMPRESSED_FOLDER}/${rest}__w${width}.jpeg`

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

  // 2) 未命中：生成路径单独限流
  if (!bumpRate(ip, "gen")) {
    return jsonError("rate_limited", 429)
  }

  // 拉原图、解码、缩放
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    if (!upstream.ok) return jsonError("upstream_error", 502)
    const declaredLength = Number(upstream.headers.get("content-length") || 0)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ORIGINAL_BYTES) {
      return jsonError("upstream_too_large", 413)
    }
    const contentType = (upstream.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.has(contentType)) return jsonError("unsupported_type", 415)

    const input = new Uint8Array(await upstream.arrayBuffer())

    const image = await Image.decode(input).catch(() => null)
    // 解码失败（如 AVIF）或原图已足够小：返回原图，不落盘缩略图
    if (!image || (image.width <= width)) {
      return originalResponse(input, contentType)
    }

    const resized = image.resize(width, Image.RESIZE_AUTO)
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
