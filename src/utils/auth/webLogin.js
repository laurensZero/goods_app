// src/utils/auth/webLogin.js
// 网页版扫码登录：创建挑战 / 轮询状态 / 消费会话

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config/supabase'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'

const FN = `${SUPABASE_URL}/functions/v1/web-login`

async function callWebLogin(body, { accessToken = '' } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const res = await fetch(FN, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    const message = String(payload?.error || `HTTP ${res.status}`)
    throw new Error(message)
  }
  return payload || {}
}

export function buildWebLoginQrContent(challengeId) {
  return `goodsapp://web-login/${challengeId}`
}

export function parseWebLoginQrContent(text) {
  const raw = String(text || '').trim()
  const match = raw.match(/^goodsapp:\/\/web-login\/([0-9a-f-]{36})$/i)
  return match?.[1] || ''
}

export async function createWebLoginChallenge() {
  return callWebLogin({ action: 'create' })
}

export async function getWebLoginChallengeStatus(challengeId) {
  return callWebLogin({ action: 'status', id: challengeId })
}

export async function approveWebLoginChallenge(challengeId, accessToken) {
  return callWebLogin(
    { action: 'approve', id: challengeId },
    { accessToken }
  )
}

export async function consumeWebLoginChallenge(challengeId) {
  return callWebLogin({ action: 'consume', id: challengeId })
}

/** 将 Edge Function 签发的 session 写入本机 Supabase Auth */
export async function applyWebLoginSession(session) {
  const client = getSupabaseClient()
  const { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: Number(session.expires_in) || 3600,
    token_type: session.token_type || 'bearer'
  })
  if (error) {
    throw new Error(error.message || '扫码登录会话应用失败')
  }
  return true
}
