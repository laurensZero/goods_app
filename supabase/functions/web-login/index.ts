// supabase/functions/web-login/index.ts
// 网页版扫码登录：
//   create  → 网页生成挑战码（无需登录）
//   status  → 网页轮询状态（无需登录，挑战码为随机 UUID）
//   approve → App 已登录用户扫码确认（需 Bearer access_token）
//   consume → 网页用 status 返回的 session_payload 完成登录后作废（无需登录）
//
// 会话签发：App 确认后，用 service_role generateLink 拿 magiclink，
// 跟随 verify 重定向解析 access_token/refresh_token，暂存到挑战行，
// 网页轮询取走后标记 consumed。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000

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

async function parseTokensFromVerifyRedirect(actionLink: string) {
  // GoTrue verify 会 302/303 到 redirect_to#access_token=...&refresh_token=...
  const res = await fetch(actionLink, { redirect: "manual" })
  const location =
    res.headers.get("location") ||
    res.headers.get("Location") ||
    ""

  if (!location) {
    // 部分部署把 token 放在 HTML meta refresh 或 body，兜底再试一次跟随
    const followed = await fetch(actionLink, { redirect: "follow" })
    const finalUrl = followed.url || ""
    const fromFinal = parseTokensFromUrl(finalUrl)
    if (fromFinal) return fromFinal
    const html = await followed.text()
    return parseTokensFromHtml(html)
  }

  const fromLocation = parseTokensFromUrl(location)
  if (fromLocation) return fromLocation
  return parseTokensFromHtml(await res.text())
}

function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string; expires_in: number; token_type: string } | null {
  try {
    const u = new URL(url, "https://example.invalid")
    const hash = u.hash.replace(/^#/, "")
    const search = u.search.replace(/^\?/, "")
    const params = new URLSearchParams(`${hash}&${search}`)
    const access_token = params.get("access_token") || ""
    const refresh_token = params.get("refresh_token") || ""
    if (!access_token || !refresh_token) return null
    return {
      access_token,
      refresh_token,
      expires_in: Number(params.get("expires_in") || 3600),
      token_type: params.get("token_type") || "bearer",
    }
  } catch {
    return null
  }
}

function parseTokensFromHtml(html: string): { access_token: string; refresh_token: string; expires_in: number; token_type: string } | null {
  const accessMatch = html.match(/access_token=([^&"'\s]+)/)
  const refreshMatch = html.match(/refresh_token=([^&"'\s]+)/)
  if (!accessMatch || !refreshMatch) return null
  const expiresInMatch = html.match(/expires_in=(\d+)/)
  return {
    access_token: decodeURIComponent(accessMatch[1]),
    refresh_token: decodeURIComponent(refreshMatch[1]),
    expires_in: Number(expiresInMatch?.[1] || 3600),
    token_type: "bearer",
  }
}

async function expireIfNeeded(admin: ReturnType<typeof getServiceClient>, id: string) {
  const { data } = await admin
    .from("web_login_challenges")
    .select("id, status, expires_at")
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
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { shouldCreateUser: false },
      })
      if (linkError || !linkData?.action_link) {
        console.error("web-login:generate-link", linkError?.message)
        return json({ error: "session_issue_failed" }, 502)
      }

      const session = await parseTokensFromVerifyRedirect(linkData.action_link)
      if (!session?.access_token || !session?.refresh_token) {
        console.error("web-login:parse-session-failed")
        return json({ error: "session_parse_failed" }, 502)
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
