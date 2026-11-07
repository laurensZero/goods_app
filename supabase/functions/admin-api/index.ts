// supabase/functions/admin-api/index.ts
// 管理台 privileged 数据面通用代理：浏览器不再把服务端 key 打到数据面。
// 背景：legacy service_role JWT 2027 年初退役，而新版 sb_secret_ key 会被
// Supabase 数据面网关对浏览器请求（Origin/UA 检测）一律 401。面板的
// PostgREST（/rest/v1）、GoTrue Admin（/auth/v1）、Storage（/storage/v1）
// 管理调用统一改走本函数，由服务端用平台注入的 SUPABASE_SERVICE_ROLE_KEY
// （sb_secret_，自动迁移）转发到数据面。
//
// verify_jwt=false（config.toml）：调用方必须携带
//   Authorization: Bearer <ADMIN_PANEL_SECRET>
// 与 admin-login 下发到浏览器的 serviceKey 一致（backup-api/storage-admin 同链）。
// 过渡期同时接受 LEGACY_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY，
// 让存量登录会话（缓存的 legacy JWT）在面板重新登录前不掉线。
//
// 路径映射（前缀白名单原样透传，method/query/body 均不解析不改写）：
//   POST   /functions/v1/admin-api/rest/v1/announcements?select=...    → <SUPABASE_URL>/rest/v1/...
//   DELETE /functions/v1/admin-api/auth/v1/admin/users/<id>            → <SUPABASE_URL>/auth/v1/...
//   DELETE /functions/v1/admin-api/storage/v1/object/ota-releases/<p>  → <SUPABASE_URL>/storage/v1/...
// 响应原样透传 status/body，并透传 Content-Range（面板 returnCount 依赖）与 Content-Type。
//
// 部署：supabase secrets set ADMIN_PANEL_SECRET=<openssl rand -base64 32 生成的随机串>

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer, range",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
}

// 允许代理的数据面服务前缀（均为管理台运维用途，不含 /functions 二次代理）
const ALLOWED_PREFIXES = ["/rest/v1/", "/auth/v1/", "/storage/v1/"]

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""

// 鉴权口令链：新随机口令优先，legacy JWT / 平台 sb_secret_ 兼容存量会话
const AUTHORIZED_KEYS = [
  Deno.env.get("ADMIN_PANEL_SECRET") || "",
  Deno.env.get("LEGACY_SERVICE_ROLE_KEY") || "",
  SERVICE_ROLE_KEY,
].filter((k) => k !== "")

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") || ""
  const key = header.replace(/^Bearer\s+/i, "").trim()
  return key !== "" && AUTHORIZED_KEYS.includes(key)
}

function targetPath(pathname: string): string | null {
  // req.url 的 pathname 形态不固定（与 backup-api 同款处理）：可能为
  //   /admin-api/rest/v1/...      （本地 serve / 线上常见形态）
  //   /functions/v1/admin-api/rest/v1/...
  // 依次剥掉可能的前缀，只留数据面子路径
  let path = pathname
  path = path.replace(/^\/functions\/v1\/[^/]+/, "")
  path = path.replace(/^\/admin-api/, "")
  return ALLOWED_PREFIXES.some((p) => path.startsWith(p)) ? path : null
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server_not_configured" }, 500)
  }
  if (!isAuthorized(req)) {
    return json({ error: "unauthorized", message: "缺少有效管理凭据" }, 401)
  }

  const incoming = new URL(req.url)
  const path = targetPath(incoming.pathname)
  if (!path) {
    return json({ error: "forbidden_path", message: `不允许代理的路径：${incoming.pathname}` }, 400)
  }

  // 透传对 PostgREST / GoTrue / Storage 语义有影响的请求头
  const upstreamHeaders = new Headers({
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  })
  for (const name of ["prefer", "range", "accept-profile", "content-profile", "accept"]) {
    const value = req.headers.get(name)
    if (value) upstreamHeaders.set(name, value)
  }
  if (req.body !== null) {
    upstreamHeaders.set("Content-Type", req.headers.get("content-type") || "application/json")
  }

  const upstream = await fetch(`${SUPABASE_URL}${path}${incoming.search}`, {
    method: req.method,
    headers: upstreamHeaders,
    body: req.body !== null ? await req.text() : undefined,
  })

  // 响应头只回传面板依赖的几个，避免把上游的 per-request 头原样外泄
  const responseHeaders = new Headers(corsHeaders)
  for (const name of ["content-type", "content-range", "location"]) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  })
})
