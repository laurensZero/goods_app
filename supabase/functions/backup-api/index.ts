// supabase/functions/backup-api/index.ts
// 备份管理 API：管理台 → Edge Function → VPS webhook 的桥接层。
//
// 架构：
//   实际备份/回档重活在 VPS 上执行（现有 supabase-backup.sh + supabase-image-backup.sh），
//   本函数只做「校验管理身份 → 转发指令到 VPS webhook → 读取/签发状态」。
//   VPS 侧由 backup_server.py 提供 HTTP 监听（见 scripts/vps/）。
//
// 鉴权：
//   - 本函数 verify_jwt=false（config.toml），调用方必须携带
//     `Authorization: Bearer <serviceKey>`，且等于配置的
//     LEGACY_SERVICE_ROLE_KEY（或 SUPABASE_SERVICE_ROLE_KEY）。
//     与管理台 admin-login 下发到浏览器的 serviceKey 一致。
//   - 转发到 VPS 时附加 `X-Backup-Secret` 头（BACKUP_WEBHOOK_SECRET 环境变量）。
//
// 环境变量（supabase secrets set）：
//   BACKUP_VPS_URL          VPS webhook 基地址（公网地址，如 http://<VPS_IP>/backup-webhook）
//   BACKUP_WEBHOOK_SECRET   与 VPS config.json 中 secret 相同的共享密钥
//   BACKUP_RESTORE_PASSWORD 回档二级密码（回档操作必须携带，默认未设置则拒绝回档）
//   （LEGACY_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY 由平台注入）
//
// 接口：
//   GET  /health               健康检查（无需鉴权，仅报告配置是否就绪）
//   POST /trigger  {kind?}      触发备份 kind: all|db|images，默认 all
//   POST /restore  {archive, includeImages?, password}  回档（需二级密码）
//   POST /image-export          打包下载图库（VPS 把本地图库镜像打成 tar.gz）
//   POST /delete    {archive}   删除 VPS 上的归档文件（backup_logs 历史行保留）
//   GET  /files                 列出 VPS 上全部备份归档（名称/大小/时间）
//   GET  /download?archive=xxx  签发短时效下载 URL
//   GET  /logs?limit=50         读取 backup_logs 备份历史

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

const VPS_URL = (Deno.env.get("BACKUP_VPS_URL") || "").replace(/\/+$/, "")
const WEBHOOK_SECRET = Deno.env.get("BACKUP_WEBHOOK_SECRET") || ""
const RESTORE_PASSWORD = Deno.env.get("BACKUP_RESTORE_PASSWORD") || ""
const ADMIN_KEY =
  Deno.env.get("LEGACY_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  ""

const DOWNLOAD_TTL_MS = 60 * 60 * 1000 // 下载链接 1 小时有效

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function error(code: string, message: string, status = 400): Response {
  return json({ error: code, message }, status)
}

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") || ""
  const key = header.replace(/^Bearer\s+/i, "").trim()
  return ADMIN_KEY !== "" && key !== "" && key === ADMIN_KEY
}

function notConfigured(): boolean {
  return !VPS_URL || !WEBHOOK_SECRET
}

// ── 转发到 VPS webhook ──
async function forwardToVps(path: string, body?: unknown): Promise<{ data: unknown; status: number }> {
  const res = await fetch(`${VPS_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Backup-Secret": WEBHOOK_SECRET,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { data, status: res.status }
}

// ── HMAC-SHA256（URL-safe base64），用于签名下载链接 ──
async function hmacSign(message: string, ttlMs: number): Promise<string> {
  const exp = Date.now() + ttlMs
  const payload = `${message}:${exp}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  const base64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `${base64}:${exp}`
}

function readLogsClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, ADMIN_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const url = new URL(req.url)
  // Supabase Edge Function 运行时里 req.url 的 pathname 形态不固定，可能为：
  //   /health                                    （本地 serve）
  //   /backup-api/health                         （线上常见形态）
  //   /functions/v1/backup-api/health
  // 依次剥掉可能的前缀，只留子路径。
  let path = url.pathname
  path = path.replace(/^\/functions\/v1\/[^/]+/, "")
  path = path.replace(/^\/backup-api/, "")
  path = path.replace(/^\/+/, "")

  // 健康检查：不需要鉴权，方便运维排查配置是否就绪
  if (path === "health" && req.method === "GET") {
    return json({
      ok: true,
      configured: !notConfigured(),
      vpsUrl: VPS_URL || null,
      adminKeySet: ADMIN_KEY !== "",
      note: notConfigured()
        ? "缺少 BACKUP_VPS_URL 或 BACKUP_WEBHOOK_SECRET 环境变量"
        : "配置就绪",
    })
  }

  if (!isAuthorized(req)) {
    return error("unauthorized", "缺少有效管理凭据", 401)
  }

  if (notConfigured()) {
    return error("not_configured", "VPS 未配置（BACKUP_VPS_URL / BACKUP_WEBHOOK_SECRET）", 500)
  }

  try {
    // 触发备份
    if (path === "trigger" && req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      const kind = String(body?.kind || "all")
      if (!["all", "db", "images"].includes(kind)) {
        return error("invalid_kind", "kind 只能是 all / db / images")
      }
      const { data, status } = await forwardToVps("/api/backup/trigger", { kind })
      return json({ ok: status < 300, vps: data }, status < 300 ? 202 : status)
    }

    // 回档（需二级密码）
    if (path === "restore" && req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      const archive = String(body?.archive || "").trim()
      if (!archive) return error("missing_archive", "缺少 archive 参数")
      if (!RESTORE_PASSWORD || !safeEqual(String(body?.password || ""), RESTORE_PASSWORD)) {
        return error("restore_password_required", "二级密码错误", 403)
      }
      const includeImages = !!body?.includeImages
      const { data, status } = await forwardToVps("/api/backup/restore", {
        archive,
        includeImages,
      })
      return json({ ok: status < 300, vps: data }, status < 300 ? 202 : 502)
    }

    // 打包下载图库（VPS 把本地图库镜像打成 tar.gz，异步执行）
    if (path === "image-export" && req.method === "POST") {
      const { data, status } = await forwardToVps("/api/backup/image-export", {})
      return json({ ok: status < 300, vps: data }, status < 300 ? 202 : status)
    }

    // 删除归档（VPS 移除归档文件；backup_logs 历史行保留）
    if (path === "delete" && req.method === "POST") {
      const body = await req.json().catch(() => ({}))
      const archive = String(body?.archive || "").trim()
      if (!archive) return error("missing_archive", "缺少 archive 参数")
      // 防目录穿越：只允许合法的归档文件名
      if (!/^(backup|images)-[\w.-]+\.tar\.gz$/.test(archive)) {
        return error("invalid_archive", "非法归档文件名")
      }
      const { data, status } = await forwardToVps("/api/backup/delete", { archive })
      return json({ ok: status < 300, vps: data }, status < 300 ? 200 : 502)
    }

    // 归档列表（VPS 响应为 {files:[...]}，解包后回传数组）
    if (path === "files" && req.method === "GET") {
      const { data, status } = await forwardToVps("/api/backup/files")
      const files = Array.isArray(data?.files) ? data.files : []
      return json({ ok: status < 300, files }, status < 300 ? 200 : 502)
    }

    // 签发下载链接
    if (path === "download" && req.method === "GET") {
      const archive = String(url.searchParams.get("archive") || "").trim()
      if (!archive) return error("missing_archive", "缺少 archive 参数")
      // 防目录穿越：只允许合法的归档文件名
      if (!/^(backup|images)-[\w.-]+\.tar\.gz$/.test(archive)) {
        return error("invalid_archive", "非法归档文件名")
      }
      const token = await hmacSign(archive, DOWNLOAD_TTL_MS)
      return json({
        ok: true,
        url: `${VPS_URL}/files/${encodeURIComponent(archive)}?token=${token}`,
        expiresInMs: DOWNLOAD_TTL_MS,
      })
    }

    // 备份历史
    if (path === "logs" && req.method === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200)
      const client = readLogsClient()
      const { data, error: err } = await client
        .from("backup_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit)
      if (err) return error("db_error", err.message, 500)
      return json({ ok: true, logs: data })
    }

    return error("not_found", `未知接口: ${req.method} /${path}`, 404)
  } catch (e) {
    console.error("backup-api:error", e)
    return error("server_error", e instanceof Error ? e.message : "内部错误", 500)
  }
})
