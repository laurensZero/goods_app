// supabase/functions/admin-login/index.ts
// 管理台登录：复用 feature_whitelist 表做管理员授权。
// 登录账号即 Supabase Auth 用户（邮箱 + 密码），凭据校验成功后检查该用户是否被授予 feature='admin' 白名单。
// verify_jwt=false（见 config.toml）：客户端直接 POST { username, password }。
//
// 用法：
//   POST https://<project-ref>.supabase.co/functions/v1/admin-login
//   body: { "username": "admin@example.com", "password": "xxx" }
//   成功返回：
//   {
//     "admin": { "id": "...", "username": "admin@example.com", "role": "admin" },
//     "tokens": {
//       "github":        "ghp_xxx（触发 GitHub Actions 工作流）",
//       "supabaseUrl":   "<SUPABASE_URL>",
//       "supabaseKey":   "<SUPABASE_ANON_KEY>",
//       "serviceKey":    "<LEGACY_SERVICE_ROLE_KEY，浏览器可直连的 legacy JWT>"
//     }
//   }
//
// 注意：Supabase 环境变量 SUPABASE_SERVICE_ROLE_KEY 现在是新版 sb_secret_ 前缀的
// secret key，浏览器直连会被网关 401 拦截。因此优先使用自定义 secret
// LEGACY_SERVICE_ROLE_KEY（Dashboard 的 legacy service_role JWT，无浏览器限制），
// 未配置时回退到自动注入的 SUPABASE_SERVICE_ROLE_KEY。
//
// 首次授权（尚无任何管理员时）：在 SQL Editor 里执行
//   INSERT INTO feature_whitelist (feature, user_id)
//   VALUES ('admin', '<该用户的 auth.users.id>');
// 之后即可在管理台「功能白名单」分区自助授权 / 撤销其他管理员。
//
// 安全说明：
//   - 密码由 Supabase Auth 校验（signInWithPassword），不落库
//   - 白名单表 RLS 全拒，客户端不可读写，仅本函数经 service_role 校验 feature='admin'
//   - GitHub Token 从环境变量 GITHUB_TOKEN 读取：`supabase secrets set GITHUB_TOKEN=xxx`
//   - 非管理员 / 凭据错误统一返回 invalid_credentials（401），避免枚举账号是否存在
//   - 内置简单内存滑动窗口限速，缓解暴力破解

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ADMIN_FEATURE = "admin"

const RATE_WINDOW_MS = 60_000
const RATE_MAX_ATTEMPTS = 10
const attempts = new Map<string, { count: number; windowStart: number }>()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function rateLimitReached(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > RATE_MAX_ATTEMPTS
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid_json" }, 400)
  }

  const username = String(body?.username || "").trim().toLowerCase()
  const password = String(body?.password || "")

  if (!username || !password) {
    return json({ error: "missing_credentials" }, 400)
  }

  if (rateLimitReached(clientIp)) {
    return json({ error: "rate_limited" }, 429)
  }

  try {
    // 1. 用 anon key 校验邮箱 + 密码，拿到登录用户
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: username,
      password,
    })
    if (signInError || !signIn.user) {
      return json({ error: "invalid_credentials" }, 401)
    }
    const userId = signIn.user.id

    // 2. 用 service_role 校验该用户是否被授予 'admin' 白名单
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: granted, error: whitelistError } = await admin
      .from("feature_whitelist")
      .select("feature")
      .eq("feature", ADMIN_FEATURE)
      .eq("user_id", userId)
      .maybeSingle()

    if (whitelistError || !granted) {
      console.error("admin-login:whitelist-error", whitelistError?.message || "not_admin")
      return json({ error: "invalid_credentials" }, 401)
    }

    return json({
      admin: {
        id: userId,
        username: signIn.user.email || username,
        role: ADMIN_FEATURE,
      },
      tokens: {
        github: Deno.env.get("GITHUB_TOKEN") || "",
        supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
        supabaseKey: Deno.env.get("SUPABASE_ANON_KEY") || "",
        serviceKey:
          Deno.env.get("LEGACY_SERVICE_ROLE_KEY") ||
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
          "",
      },
    })
  } catch (e) {
    console.error("admin-login:error", e)
    return json({ error: "server_error" }, 500)
  }
})
