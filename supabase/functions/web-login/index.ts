// supabase/functions/web-login/index.ts
// 网页版扫码登录（业界 device-code 模型）：
//   create  → 网页生成短时 ticket（无需登录）
//   status  → 网页轮询；approved 时带回一次性 session
//   approve → 手机已登录用户「确认」后提交（Bearer = 手机 access_token）
//   consume → 网页取走 session 后作废 ticket
//
// 会话签发：用 SUPABASE_JWT_SECRET 自签 access_token（HS256），
// 不走 generateLink/verify —— 那条路可能回收同用户其它 session（手机会掉登录）。
// 签发的 token 约 100 年有效（实际不过期）；无 refresh token。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// 实际不过期：JWT 必须有 exp，设为约 100 年
const ACCESS_TOKEN_TTL_SECONDS = 100 * 365 * 24 * 60 * 60

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

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function signAccessToken(user: {
  id: string
  email?: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}): Promise<{ access_token: string; refresh_token: string; expires_in: number; debug?: string } | null> {
  const secret = Deno.env.get("AUTH_JWT_SECRET") || Deno.env.get("JWT_SECRET") || ""
  if (!secret) {
    console.error("web-login:missing-jwt-secret")
    return { access_token: "", refresh_token: "", expires_in: 0, debug: "missing_jwt_secret" }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const admin = getServiceClient()

  // 在 auth.sessions 建独立 session（不回收其它设备）
  const { data: created, error: rpcError } = await admin.rpc("create_web_login_session", {
    p_user_id: user.id,
  })
  if (rpcError || !created?.session_id || !created?.refresh_token) {
    const dbg = rpcError?.message || "no_session_fields"
    console.error("web-login:create-session-rpc", dbg)
    return { access_token: "", refresh_token: "", expires_in: 0, debug: `rpc:${dbg}` }
  }

  const now = Math.floor(Date.now() / 1000)
  const exp = now + ACCESS_TOKEN_TTL_SECONDS
  const header = { alg: "HS256", typ: "JWT" }
  const payload = {
    iss: `${supabaseUrl}/auth/v1`,
    sub: user.id,
    aud: "authenticated",
    exp,
    iat: now,
    email: user.email || "",
    phone: "",
    app_metadata: user.app_metadata || {},
    user_metadata: user.user_metadata || {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: created.session_id,
  }

  const enc = new TextEncoder()
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  const data = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data))
  const sigB64 = base64UrlEncode(new Uint8Array(sig))

  return {
    access_token: `${data}.${sigB64}`,
    refresh_token: String(created.refresh_token),
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  }
}

type SessionPayload = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  user: {
    id: string
    email: string
    app_metadata: Record<string, unknown>
    user_metadata: Record<string, unknown>
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

async function cleanupOldChallenges(admin: ReturnType<typeof getServiceClient>) {
  const now = Date.now()
  const terminalCutoff = new Date(now - 15 * 60 * 1000).toISOString()
  const orphanCutoff = new Date(now - 60 * 60 * 1000).toISOString()

  try {
    await admin
      .from("web_login_challenges")
      .delete()
      .in("status", ["consumed", "denied", "expired"])
      .lt("created_at", terminalCutoff)

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

  let body: { action?: string; id?: string }
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
        .update({
          status: "consumed",
          consumed_at: new Date().toISOString(),
          session_payload: null,
        })
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

      const current = await expireIfNeeded(admin, id)
      if (!current) return json({ error: "not_found" }, 404)
      if (current.status !== "pending") {
        return json({ error: `invalid_status:${current.status}` }, 409)
      }

      const signed = await signAccessToken({
        id: user.id,
        email: user.email || "",
        app_metadata: (user.app_metadata || {}) as Record<string, unknown>,
        user_metadata: (user.user_metadata || {}) as Record<string, unknown>,
      })
      if (!signed?.access_token) {
        return json({ error: "session_issue_failed", debug: signed?.debug || "sign_failed" }, 502)
      }

      const session: SessionPayload = {
        access_token: signed.access_token,
        refresh_token: signed.refresh_token,
        expires_in: signed.expires_in,
        token_type: "bearer",
        user: {
          id: user.id,
          email: String(user.email || ""),
          app_metadata: (user.app_metadata || {}) as Record<string, unknown>,
          user_metadata: (user.user_metadata || {}) as Record<string, unknown>,
        },
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
        user: { id: user.id, email: user.email || "" },
      })
    }

    return json({ error: "unknown_action" }, 400)
  } catch (e) {
    console.error("web-login:error", e)
    return json({ error: "server_error" }, 500)
  }
})
