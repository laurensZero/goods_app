// supabase/functions/check-checkout-permission/index.ts
// 米游铺自助下单功能白名单校验
// verify_jwt=true（见 config.toml）：必须携带登录用户的 JWT，函数内解析 user_id
// 查询 checkout_whitelist 表，判断该用户是否有下单权限
//
// 用法（客户端 supabase.functions.invoke 会自动带上 Authorization: Bearer <access_token>）：
//   GET https://<project-ref>.supabase.co/functions/v1/check-checkout-permission
//   返回：{ allowed: boolean, reason?: string }
//
// 安全说明：
//   - 白名单表默认 RLS 全拒，客户端无法直接读写，只能经本函数用 service_role 查询
//   - 未登录 / 无 token / 查询异常 → 一律返回 allowed:false

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (!token) {
    return json({ allowed: false, reason: "no_token" })
  }

  try {
    // 校验 JWT 并解析当前登录用户
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: { user }, error: userError } = await anon.auth.getUser(token)
    if (userError || !user) {
      return json({ allowed: false, reason: "unauthorized" })
    }

    // 用 service_role 查白名单表（绕过 RLS，表本身对客户端不可见）
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await admin
      .from("checkout_whitelist")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("check-checkout-permission:query-error", error)
      return json({ allowed: false, reason: "query_error" })
    }

    return json({ allowed: !!data })
  } catch (e) {
    console.error("check-checkout-permission:error", e)
    return json({ allowed: false, reason: "server_error" })
  }
})
