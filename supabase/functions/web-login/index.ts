// supabase/functions/web-login/index.ts
// 网页版扫码登录：
//   create  → 网页生成挑战码（无需登录）
//   status  → 网页轮询状态（无需登录，挑战码为随机 UUID）
//   approve → App 已登录用户扫码确认（需 Bearer access_token）
//   consume → 网页用 status 返回的 session_payload 完成登录后作废（无需登录）
//
// 会话签发：generateLink(type=magiclink) 取 email_otp，再调 GoTrue /verify
// 直接换 access_token/refresh_token（比跟随重定向稳），暂存到挑战行。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function extractBearer(req: Request): string {
  const raw = req.headers.get("authorization") || ""
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return (match?.[1] || "").trim()
}

type SessionTokens = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

/**
 * generateLink(magiclink) → OTP → /verify 换会话。
 * 不用 recovery：recovery 验证成功会按项目设置回收该用户其它设备的 session。
 */
async function issueSessionViaMagicOtp(email: string): Promise<{ session: SessionTokens | null; debug: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })
  if (linkError || !linkData) {
    const msg = linkError?.message || "no_link_data"
    console.error("web-login:generate-link", msg)
    return { session: null, debug: `generate_link:${msg}` }
  }

  const linkObj = linkData as Record<string, unknown>
  // 不同版本 supabase-js 可能是扁平字段，或嵌在 properties 下
  const nested = (linkObj.properties || linkObj) as Record<string, unknown>
  const keys = Object.keys(linkObj).join(",")
  const nestedKeys = Object.keys(nested || {}).join(",")
  console.error("web-login:generate-link-keys", keys, "nested:", nestedKeys)

  let token = String(nested?.email_otp || linkObj.email_otp || "").trim()
  let actionLink = String(nested?.action_link || linkObj.action_link || "").trim()
  if (!token && actionLink) {
    try {
      const actionUrl = new URL(actionLink)
      token = (actionUrl.searchParams.get("token") || "").trim()
    } catch {
      token = ""
    }
  }
  if (!token) {
    // 有时 hashed_token 就是 verify token
    token = String(nested?.hashed_token || linkObj.hashed_token || "").trim()
  }
  if (!token) {
    console.error("web-login:missing-otp", nestedKeys)
    return {
      session: null,
      debug: `missing_otp keys=${keys} nested=${nestedKeys} link=${actionLink.slice(0, 120)}`,
    }
  }

  // GoTrue 对 generateLink 返回的 OTP：verify 用 type=email + email + token
  // （magiclink/recovery 类型 verify 需要额外 redirect 参数，且 recovery 会回收 session）
  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
    },
    body: JSON.stringify({
      type: "email",
      email,
      token,
      create_user: false,
    }),
  })

  const payload = await verifyRes.json().catch(() => ({}))
  if (!verifyRes.ok) {
    const msg = String(payload?.msg || payload?.error_description || payload?.error || verifyRes.status)
    console.error("web-login:verify-failed", verifyRes.status, msg)
    return { session: null, debug: `verify:${verifyRes.status}:${msg}` }
  }

  const access_token = String(payload?.access_token || "")
  const refresh_token = String(payload?.refresh_token || "")
  if (!access_token || !refresh_token) {
    const keys = Object.keys(payload || {}).join(",")
    console.error("web-login:verify-missing-tokens", keys)
    return { session: null, debug: `verify_missing_tokens:${keys}` }
  }

  return {
    session: {
      access_token,
      refresh_token,
      expires_in: Number(payload?.expires_in || 3600),
      token_type: String(payload?.token_type || "bearer"),
    },
    debug: "ok",
  }
}

async function expireIfNeeded(admin: ReturnType<typeof getServiceClient>, id: string) {
  const { data } = await admin
    .from("web_login_challenges")
    .select("id, status, expires_at, session_payload")
    .eq("id", id)
    .maybeSingle()

  if (!data) return null
  if (data.status === "pending" && new Date(data.expires_at).getTime() < Date.now()) {
    await admin
      .from("web_login_challenges")
      .update({ status: "expired" })
      .eq("id", id)
      .eq("status", "pending")
    return { ...data, status: "expired" }
  }
  return data
}

/** 顺手清理历史挑战，避免表膨胀；不影响进行中的 pending */
async function cleanupOldChallenges(admin: ReturnType<typeof getServiceClient>) {
  const now = Date.now()
  const terminalCutoff = new Date(now - 15 * 60 * 1000).toISOString()
  const orphanCutoff = new Date(now - 60 * 60 * 1000).toISOString()

  try {
    // 终态超过 15 分钟：consumed / denied / expired
    await admin
      .from("web_login_challenges")
      .delete()
      .in("status", ["consumed", "denied", "expired"])
      .lt("created_at", terminalCutoff)

    // 超过 1 小时仍未消费的残留（含 pending 超时、approved 未被网页取走）
    await admin
      .from("web_login_challenges")
      .delete()
      .lt("created_at", orphanCutoff)
  } catch (e) {
    console.error("web-login:cleanup", e)
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  let body: {
    action?: string
    id?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid_json" }, 400)
  }

  const action = String(body?.action || "").trim()
  const admin = getServiceClient()

  try {
    if (action === "create") {
      await cleanupOldChallenges(admin)
      const { data, error } = await admin
        .from("web_login_challenges")
        .insert({ status: "pending" })
        .select("id, expires_at, created_at")
        .single()

      if (error || !data) {
        console.error("web-login:create", error?.message)
        return json({ error: "create_failed" }, 500)
      }
      return json({ id: data.id, expires_at: data.expires_at })
    }

    if (action === "status") {
      const id = String(body?.id || "").trim()
      if (!id) return json({ error: "missing_id" }, 400)

      const row = await expireIfNeeded(admin, id)
      if (!row) return json({ error: "not_found" }, 404)

      if (row.status === "approved" && row.session_payload) {
        return json({
          status: "approved",
          session: row.session_payload,
        })
      }
      return json({ status: row.status })
    }

    if (action === "consume") {
      const id = String(body?.id || "").trim()
      if (!id) return json({ error: "missing_id" }, 400)

      const { data: row } = await admin
        .from("web_login_challenges")
        .update({ status: "consumed", consumed_at: new Date().toISOString(), session_payload: null })
        .eq("id", id)
        .eq("status", "approved")
        .select("id")
        .maybeSingle()

      return json({ ok: !!row })
    }

    if (action === "approve") {
      const id = String(body?.id || "").trim()
      const token = extractBearer(req)
      if (!id) return json({ error: "missing_id" }, 400)
      if (!token) return json({ error: "missing_token" }, 401)

      // 校验 App 侧登录态
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      )
      const { data: userData, error: userError } = await userClient.auth.getUser()
      if (userError || !userData?.user) {
        return json({ error: "unauthorized" }, 401)
      }
      const user = userData.user
      const email = String(user.email || "").trim()
      if (!email) {
        return json({ error: "user_missing_email" }, 400)
      }

      const current = await expireIfNeeded(admin, id)
      if (!current) return json({ error: "not_found" }, 404)
      if (current.status !== "pending") {
        return json({ error: `invalid_status:${current.status}` }, 409)
      }

      // 签发独立会话给网页（不复用手机 token）
      const issued = await issueSessionViaMagicOtp(email)
      const session = issued.session
      if (!session?.access_token || !session?.refresh_token) {
        console.error("web-login:session-issue-failed", issued.debug)
        return json({ error: "session_issue_failed", debug: issued.debug }, 502)
      }

      const { data: updated, error: updateError } = await admin
        .from("web_login_challenges")
        .update({
          status: "approved",
          user_id: user.id,
          approved_at: new Date().toISOString(),
          session_payload: session,
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("id, status")
        .single()

      if (updateError || !updated) {
        console.error("web-login:approve-update", updateError?.message)
        return json({ error: "approve_failed" }, 500)
      }

      return json({
        ok: true,
        user: { id: user.id, email },
      })
    }

    return json({ error: "unknown_action" }, 400)
  } catch (e) {
    console.error("web-login:error", e)
    return json({ error: "server_error" }, 500)
  }
})
