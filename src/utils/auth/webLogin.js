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

/**
 * 构造扫码登录二维码内容。
 * @param {string} challengeId
 * @param {'web'|'tablet'} [deviceType]
 * @param {string} [deviceName] 展示用设备名
 */
export function buildWebLoginQrContent(challengeId, deviceType = 'web', deviceName = '') {
  const params = new URLSearchParams()
  params.set('d', deviceType === 'tablet' ? 'tablet' : 'web')
  const name = String(deviceName || '').trim().slice(0, 64)
  if (name) params.set('n', name)
  return `goodsapp://web-login/${challengeId}?${params.toString()}`
}

/**
 * 解析扫码内容。
 * @returns {{ challengeId: string, deviceType: 'web'|'tablet', deviceName: string }}
 */
export function parseWebLoginQrContent(text) {
  const raw = String(text || '').trim()
  const match = raw.match(/^goodsapp:\/\/web-login\/([0-9a-f-]{36})(\?(.*))?$/i)
  if (!match) return { challengeId: '', deviceType: 'web', deviceName: '' }

  const challengeId = match[1]
  const query = new URLSearchParams(match[3] || '')
  const deviceType = query.get('d') === 'tablet' ? 'tablet' : 'web'
  const deviceName = String(query.get('n') || '').trim().slice(0, 64)
  return { challengeId, deviceType, deviceName }
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

/**
 * 将 Edge Function 签发的 session 写入本机 Supabase Auth。
 * JWT 自签 token 无 refresh token；服务端签发约 100 年有效期（实际不过期）。
 */
export async function applyWebLoginSession(session) {
  const client = getSupabaseClient()
  const expiresIn = Number(session.expires_in) || (100 * 365 * 24 * 60 * 60)
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
  const user = session.user || null

  // supabase-js v2 会话存储格式（storageKey: sb-main-auth-token）
  const storageKey = 'sb-main-auth-token'
  const nextSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token || '',
    expires_at: expiresAt,
    expires_in: expiresIn,
    token_type: session.token_type || 'bearer',
    user
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(nextSession))
  } catch {
    // quota / private mode — 仍尝试 setSession
  }

  // setSession 会触发 onAuthStateChange；无 refresh 时依赖未过期 access_token
  const { error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token || '',
    expires_in: expiresIn,
    token_type: session.token_type || 'bearer'
  })

  // setSession 可能因空 refresh 失败；本地已写入则再 getSession 校验
  if (error) {
    const { data, error: getSessionError } = await client.auth.getSession()
    if (getSessionError || !data?.session?.access_token) {
      throw new Error(error.message || '扫码登录会话应用失败')
    }
  }

  return true
}
