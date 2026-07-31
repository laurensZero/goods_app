// supabase/functions/qq-webhook/index.ts
// QQ 机器人 webhook：接收 QQ 平台推送的事件，处理「私聊绑定码 → 激活绑定」
//
// 配置（verify_jwt=false，QQ 平台调用，非登录用户）：
//   在 QQ 开放平台机器人的「回调地址」填：
//     https://<project-ref>.supabase.co/functions/v1/qq-webhook
//   （必须是 HTTPS，端口 443，符合平台要求）
//
// 需要 secrets：
//   QQ_CLIENT_SECRET —— 机器人 Client Secret。既用于获取 access_token，
//       也作为 webhook 签名 seed 的默认来源。
//   QQ_WEBHOOK_SECRET —— 可选。若 QQ 平台回调配置里单独提供了「签名密钥」，
//       用它当 seed（优先级高于 QQ_CLIENT_SECRET）。
//
// 协议（参考 tencent-connect/bot-docs 官方文档）：
//   - op=13：URL 验证挑战。请求体 d 含 plain_token / event_ts。
//     用 ed25519 对「event_ts + plain_token」签名，返回
//     { "plain_token": ..., "signature": <hex> }。
//   - op=0 实时事件：验签消息体 = X-Signature-Timestamp 头 + 原始请求体，
//     用同一 ed25519 公钥验签；处理完回包 { "op": 12 }（HTTP 回调 ACK）。
//   - 密钥派生：Bot Secret 字符串重复拼到 32 字节作为 ed25519 seed。
//   - 事件：只关心 C2C_MESSAGE_CREATE（用户私聊机器人），content 里的
//     6 位数字即绑定码，匹配后把对应用户的绑定置为 active。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nacl from "https://esm.sh/tweetnacl@1.0.3"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// ---------- ed25519 签名（seed = 重复 Bot Secret 到 32 字节） ----------

function getSignKeypair(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
  const secret = Deno.env.get("QQ_WEBHOOK_SECRET") || Deno.env.get("QQ_CLIENT_SECRET") || ""
  if (!secret) return null
  const raw = new TextEncoder().encode(secret)
  const seed = new Uint8Array(32)
  for (let i = 0; i < 32; i++) seed[i] = raw[i % raw.length]
  return nacl.sign.keyPair.fromSeed(seed)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim()
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function verifyEd25519(kp: { publicKey: Uint8Array }, msg: Uint8Array, sigHex: string): boolean {
  try {
    const sig = hexToBytes(sigHex)
    if (sig.length !== 64) return false
    return nacl.sign.detached.verify(msg, sig, kp.publicKey)
  } catch {
    return false
  }
}

function signEd25519(kp: { secretKey: Uint8Array }, msg: Uint8Array): string {
  return bytesToHex(nacl.sign.detached(msg, kp.secretKey))
}

// ---------- 给用户回消息（被动回复，5 分钟内有效） ----------

async function getQQAccessToken(): Promise<string | null> {
  const appId = Deno.env.get("QQ_APP_ID") ?? ""
  const secret = Deno.env.get("QQ_CLIENT_SECRET") ?? ""
  if (!appId || !secret) return null
  try {
    const res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret: secret }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string }
    return data.access_token || null
  } catch {
    return null
  }
}

// msgId 是收到的那条消息的 id（d.id），带上才能走被动回复；失败静默，不阻塞绑定
async function replyToUser(openid: string, msgId: string, content: string): Promise<void> {
  if (!openid || !msgId) return
  const token = await getQQAccessToken()
  if (!token) return
  try {
    await fetch(`https://api.sgroup.qq.com/v2/users/${openid}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `QQBot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ msg_type: 0, content, msg_id: msgId }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // 回复失败不阻塞绑定流程
  }
}

// 注：QQ 官方 API 拿不到 C2C 用户昵称/真实 QQ 号（隐私限制，实测为空），
// 且抓取会拖慢 ACK 触发 QQ 平台重试，故不在此获取。qq_nickname 保留字段
// 供将来让用户自定义备注名时使用。

// ---------- 主流程 ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const kp = getSignKeypair()
  if (!kp) {
    return json({ code: 500, message: "missing secret" }, 500)
  }

  // GET：仅健康检查（旧式 echostr 回显已不需要）
  if (req.method === "GET") {
    const url = new URL(req.url)
    return new Response(url.searchParams.get("echostr") || "ok", { headers: corsHeaders })
  }

  // POST：先取原始请求体（验签依赖原文，不能重新序列化）
  const rawBody = await req.text()
  let body: Record<string, any>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ code: 1, message: "invalid json" }, 400)
  }

  // ---- op=13：URL 验证挑战 ----
  if (body.op === 13) {
    const d = (body.d ?? {}) as Record<string, any>
    const plainToken = String(d.plain_token || "")
    const eventTs = String(d.event_ts || "")
    if (!plainToken || !eventTs) return json({ code: 1, message: "bad challenge" }, 400)
    const msg = new TextEncoder().encode(eventTs + plainToken)
    return json({ plain_token: plainToken, signature: signEd25519(kp, msg) })
  }

  // ---- 实时事件：验签（timestamp 头 + 原始 body） ----
  const sigHeader = req.headers.get("X-Signature-Ed25519") || ""
  const tsHeader = req.headers.get("X-Signature-Timestamp") || ""
  if (!verifyEd25519(kp, new TextEncoder().encode(tsHeader + rawBody), sigHeader)) {
    return json({ code: 401, message: "invalid signature" }, 401)
  }

  const eventType = body.t as string
  const d = (body.d ?? {}) as Record<string, any>

  if (eventType === "C2C_MESSAGE_CREATE") {
    // 用户私聊消息：author.user_openid 是用户在平台下的唯一 ID；d.id 是这条消息的 id（被动回复要用）
    const openid = String(d.author?.user_openid || d.author?.id || "").trim()
    const content = String(d.content || "").trim()
    const msgId = String(d.id || "").trim()
    if (!openid || !content) return json({ op: 12 })

    // 从消息里提取 6 位绑定码（用户可能多打几个字，取第一个 6 位数字串）
    const codeMatch = content.match(/\d{6}/)
    const code = codeMatch ? codeMatch[0] : ""
    if (!code) return json({ op: 12 }) // 不是绑定码，不回复

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!serviceKey) return json({ code: 500, message: "server config error" }, 500)
    const admin = createClient(supabaseUrl, serviceKey)

    // 找这条 pending 绑定码对应的用户（绑定码随机且单次有效）
    const { data: row } = await admin
      .from("user_qq_bindings")
      .select("user_id")
      .eq("bind_code", code)
      .eq("status", "pending")
      .maybeSingle()

    if (!row) {
      // 绑定码无效/已过期：回一条提示（不暴露具体原因），也回 ACK
      await replyToUser(openid, msgId, "绑定码无效或已过期，请打开 App 重新生成。")
      return json({ op: 12 })
    }

    await admin
      .from("user_qq_bindings")
      .update({
        status: "active",
        qq_openid: openid,
        bound_at: new Date().toISOString(),
      })
      .eq("user_id", row.user_id)

    // 补扫存量提醒（先设提醒、后绑 QQ 的场景），失败不阻塞激活
    await admin.rpc("backfill_qq_reminders", { p_user_id: row.user_id }).catch(() => {})

    await replyToUser(openid, msgId, "绑定成功！开售提醒会推送到此 QQ。")
    return json({ op: 12 })
  }

  // 其它事件类型：ACK
  return json({ op: 12 })
})
