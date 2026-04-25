import { requestPlatformJson } from '@/utils/platformHttp'

const GITHUB_WEB_BASE = 'https://github.com'
const GITHUB_API_BASE = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 30000
const DEFAULT_GITHUB_SCOPE = 'gist public_repo read:user'

function resolveDeviceFlowBase() {
  const configuredBase = String(import.meta.env.VITE_GITHUB_DEVICE_FLOW_BASE || '').trim()
  if (configuredBase) return configuredBase
  if (import.meta.env.DEV) return '/github-oauth'
  return GITHUB_WEB_BASE
}

function buildFormHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
  }
}

function buildApiHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

function normalizeErrorMessage(error) {
  const code = String(error?.error || '').trim()
  const description = String(error?.error_description || '').trim()

  if (description) return description
  if (code === 'authorization_pending') return '正在等待你完成 GitHub 授权...'
  if (code === 'slow_down') return 'GitHub 授权轮询过快，请稍后重试'
  if (code === 'expired_token') return 'GitHub 授权已过期，请重新发起登录'
  if (code === 'access_denied') return 'GitHub 授权已被拒绝'
  if (code) return code
  return 'GitHub 请求失败'
}

async function requestJson(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const { headers = {}, body = null, method = 'GET', signal = null } = options

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      throw new Error('请求已取消')
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    return await requestPlatformJson(url, {
      method,
      headers,
      body,
      signal: controller.signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接')
    }
    if (error instanceof Error) {
      throw new Error(normalizeErrorMessage({ error_description: error.message }))
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeoutId)
      reject(new Error('请求已取消'))
    }

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId)
        reject(new Error('请求已取消'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function resolveOAuthClientId() {
  return String(import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID || '').trim()
}

export function getGitHubOAuthClientId() {
  return resolveOAuthClientId()
}

export function getGitHubDeviceFlowScope() {
  return DEFAULT_GITHUB_SCOPE
}

export async function requestGitHubDeviceCode(clientId, scope = DEFAULT_GITHUB_SCOPE, signal = null) {
  const normalizedClientId = String(clientId || '').trim()
  if (!normalizedClientId) {
    throw new Error('未配置 GitHub OAuth Client ID')
  }

  const baseUrl = resolveDeviceFlowBase()

  return requestJson(`${baseUrl}/login/device/code`, {
    method: 'POST',
    headers: buildFormHeaders(),
    body: new URLSearchParams({
      client_id: normalizedClientId,
      scope: String(scope || DEFAULT_GITHUB_SCOPE).trim() || DEFAULT_GITHUB_SCOPE
    }).toString(),
    signal
  })
}

export async function pollGitHubAccessToken({ clientId, deviceCode, interval = 5, expiresIn = 900, signal = null }) {
  const normalizedClientId = String(clientId || '').trim()
  const normalizedDeviceCode = String(deviceCode || '').trim()

  if (!normalizedClientId) {
    throw new Error('未配置 GitHub OAuth Client ID')
  }

  if (!normalizedDeviceCode) {
    throw new Error('缺少 GitHub 设备码')
  }

  const startedAt = Date.now()
  let delayMs = Math.max(1000, Number(interval) * 1000 || 5000)
  const deadlineMs = Math.max(0, Number(expiresIn) * 1000 || 0)
  const baseUrl = resolveDeviceFlowBase()

  while (!deadlineMs || Date.now() - startedAt < deadlineMs) {
    const result = await requestJson(`${baseUrl}/login/oauth/access_token`, {
      method: 'POST',
      headers: buildFormHeaders(),
      body: new URLSearchParams({
        client_id: normalizedClientId,
        device_code: normalizedDeviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }).toString(),
      signal
    })

    if (result?.access_token) {
      return result
    }

    const error = String(result?.error || '').trim()
    if (error === 'authorization_pending') {
      await delay(delayMs, signal)
      continue
    }

    if (error === 'slow_down') {
      delayMs += 5000
      await delay(delayMs, signal)
      continue
    }

    throw new Error(normalizeErrorMessage(result))
  }

  throw new Error('GitHub 授权等待超时，请重新发起登录')
}

export async function fetchGitHubUser(token, signal = null) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw new Error('缺少 GitHub 访问令牌')
  }

  return requestJson(`${GITHUB_API_BASE}/user`, {
    method: 'GET',
    headers: buildApiHeaders(normalizedToken),
    signal
  })
}

export async function startGitHubDeviceLogin({ clientId, scope = DEFAULT_GITHUB_SCOPE, signal = null }) {
  const device = await requestGitHubDeviceCode(clientId, scope, signal)
  const token = await pollGitHubAccessToken({
    clientId,
    deviceCode: device.device_code,
    interval: Number(device.interval) || 5,
    expiresIn: Number(device.expires_in) || 900,
    signal
  })
  const user = await fetchGitHubUser(token.access_token, signal)

  return {
    device,
    token,
    user
  }
}

export function getGitHubVerificationUrl(device) {
  const completeUrl = String(device?.verification_uri_complete || '').trim()
  if (completeUrl) return completeUrl

  const verificationUrl = String(device?.verification_uri || '').trim()
  return verificationUrl || ''
}
