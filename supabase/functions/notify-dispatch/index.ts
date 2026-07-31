// supabase/functions/notify-dispatch/index.ts
// 通知分发器：每分钟由 cron 触发，把 notification_jobs 里 pending 且已到期的
// 任务按 channel 投递出去。
//
// 渠道扩展点：往 CHANNEL_HANDLERS 里加一个 (job) => Promise<DispatchResult>
// 即可新增投递渠道（如 bark / email）。新渠道对应的绑定信息存哪张表、怎么取，
// 由处理器自己负责（参考 makeQQHandler 读 user_qq_bindings 的做法）。
//
// 重试策略：投递失败 → attempts + 1，due_at 顺延 1 分钟，最多 MAX_ATTEMPTS 次；
//   超限标记 failed。skipped 表示该任务不该再投（如用户已解绑/关开关），直接失败。
//
// 配置（verify_jwt=false）：config.toml 里 schedule = "*/1 * * * *"
//   需要 secrets：QQ_APP_ID、QQ_CLIENT_SECRET

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken"
const QQ_SEND_URL = "https://api.sgroup.qq.com/v2/users"

const MAX_BATCH = 50
const MAX_ATTEMPTS = 5
const RETRY_DELAY_MS = 60_000
const CLEANUP_OLDER_THAN_DAYS = 90

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type DispatchResult =
  | { ok: true }
  | { ok: false; skipped: boolean; error: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// ---------- QQ 渠道 ----------

async function getQQAccessToken(): Promise<string | null> {
  const appId = Deno.env.get("QQ_APP_ID") ?? ""
  const secret = Deno.env.get("QQ_CLIENT_SECRET") ?? ""
  if (!appId || !secret) return null
  try {
    const res = await fetch(QQ_TOKEN_URL, {
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

function makeQQHandler(admin: ReturnType<typeof createClient>) {
  return async (job: Record<string, any>): Promise<DispatchResult> => {
    // 投递前再确认绑定仍有效（用户可能已解绑/关开关，任务还在队列里）
    const { data: binding } = await admin
      .from("user_qq_bindings")
      .select("qq_openid")
      .eq("user_id", job.user_id)
      .eq("status", "active")
      .eq("enabled", true)
      .maybeSingle()

    if (!binding?.qq_openid) return { ok: false, skipped: true, error: "not_bound_or_disabled" }

    const token = await getQQAccessToken()
    if (!token) return { ok: false, skipped: false, error: "qq_token_failed" }

    try {
      // 主动推送不需要 msg_id（那是被动回复 5 分钟窗口内用的）
      const res = await fetch(`${QQ_SEND_URL}/${binding.qq_openid}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `QQBot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ msg_type: 0, content: job.content }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        // 把 QQ 平台返回的错误信息捕获下来，方便定位（如权限/频控/openid 无效）
        const errBody = await res.text().catch(() => "")
        const snippet = errBody ? ` ${errBody.slice(0, 200)}` : ""
        return { ok: false, skipped: false, error: `qq_api_${res.status}${snippet}` }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, skipped: false, error: e instanceof Error ? e.message : "qq_send_failed" }
    }
  }
}

// ---------- 主流程 ----------

async function cleanupOldJobs(admin: ReturnType<typeof createClient>) {
  const cutoff = new Date(Date.now() - CLEANUP_OLDER_THAN_DAYS * 86_400_000).toISOString()
  await admin
    .from("notification_jobs")
    .delete()
    .in("status", ["sent", "failed"])
    .lt("updated_at", cutoff)
}

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!serviceKey) return json({ error: "server config error" }, 500)

  const admin = createClient(supabaseUrl, serviceKey)

  // 1. 取一批待投递任务
  const { data: jobs, error: jErr } = await admin
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .limit(MAX_BATCH)

  if (jErr) return json({ error: jErr.message }, 500)
  if (!jobs?.length) {
    await cleanupOldJobs(admin)
    return json({ sent: 0, failed: 0, skipped: 0, reason: "no_jobs" })
  }

  // 2. 渠道处理器注册表 —— 新渠道在此扩展
  const handlers: Record<string, (job: Record<string, any>) => Promise<DispatchResult>> = {
    qq: makeQQHandler(admin),
  }

  let sent = 0, failed = 0, skipped = 0
  const details: string[] = []

  for (const job of jobs) {
    const handler = handlers[job.channel]
    if (!handler) {
      await admin
        .from("notification_jobs")
        .update({ status: "failed", last_error: `unknown_channel:${job.channel}` })
        .eq("id", job.id)
      failed++
      details.push(`#${job.id} unknown_channel:${job.channel}`)
      continue
    }

    const result = await handler(job)

    if (result.ok) {
      await admin
        .from("notification_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: "" })
        .eq("id", job.id)
      sent++
      details.push(`#${job.id} sent`)
    } else if (result.skipped) {
      await admin
        .from("notification_jobs")
        .update({ status: "failed", last_error: result.error })
        .eq("id", job.id)
      skipped++
      details.push(`#${job.id} skipped: ${result.error}`)
    } else {
      // 可重试失败：次数 +1、状态回 pending，顺延后再投
      const attempts = (job.attempts || 0) + 1
      const update = attempts >= MAX_ATTEMPTS
        ? { status: "failed", attempts, last_error: result.error }
        : { status: "pending", attempts, last_error: result.error, due_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString() }
      await admin.from("notification_jobs").update(update).eq("id", job.id)
      failed++
      details.push(`#${job.id} failed(${attempts}/${MAX_ATTEMPTS}): ${result.error}`)
    }
  }

  await cleanupOldJobs(admin)
  return json({ sent, failed, skipped, details })
})
