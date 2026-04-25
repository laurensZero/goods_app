import { fetchWithPlatformBridge } from '@/utils/platformHttp'

const GITHUB_API_BASE = 'https://api.github.com'

function buildHeaders(token, includeContentType = true) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}

const REQUEST_TIMEOUT_MS = 30000

async function request(method, path, token, body = null) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const options = {
    method,
    headers: buildHeaders(token),
    signal: controller.signal
  }

  if (body !== null) {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetchWithPlatformBridge(`${GITHUB_API_BASE}${path}`, options)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const message = error?.message || `GitHub API error: ${response.status}`
      throw new Error(message)
    }

    if (response.status === 204) return null
    return response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function validateToken(token) {
  try {
    const user = await request('GET', '/user', token)
    return { valid: true, login: user.login }
  } catch {
    return { valid: false, login: '' }
  }
}

export async function createGist(token, description, files) {
  const payload = {
    description,
    public: false,
    files
  }

  return request('POST', '/gists', token, payload)
}

export async function getGist(token, gistId) {
  try {
    return await request('GET', `/gists/${gistId}`, token)
  } catch (error) {
    if (error.message.includes('404')) return null
    throw error
  }
}

export async function updateGist(token, gistId, files) {
  const payload = { files }
  return request('PATCH', `/gists/${gistId}`, token, payload)
}

export async function listGists(token, description = '') {
  const gists = await request('GET', '/gists?per_page=100', token)
  if (!description) return gists
  return gists.filter((gist) => gist.description?.includes(description))
}

function buildFallbackRawUrl(gist, filename) {
  const gistId = String(gist?.id || '').trim()
  const owner = String(gist?.owner?.login || '').trim()
  const resolvedName = String(filename || '').trim()
  if (!gistId || !owner || !resolvedName) return ''
  return `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${encodeURIComponent(resolvedName)}`
}

async function readRawText(url) {
  if (!url) return null
  const response = await fetchWithPlatformBridge(url, {
    method: 'GET',
    headers: {
      Accept: 'text/plain'
    }
  })

  if (!response.ok) return null
  return response.text()
}

export async function getGistFileContent(token, gist, filename) {
  const file = gist?.files?.[filename]
  if (!file) {
    return readRawText(buildFallbackRawUrl(gist, filename))
  }
  if (typeof file.content === 'string' && !file.truncated) return file.content
  if (!file.raw_url) {
    return (await readRawText(buildFallbackRawUrl(gist, filename)))
      || (typeof file.content === 'string' ? file.content : null)
  }

  const rawText = await readRawText(file.raw_url)
  if (rawText != null) return rawText

  const fallbackText = await readRawText(buildFallbackRawUrl(gist, filename))
  if (fallbackText != null) return fallbackText

  throw new Error(`Gist file read failed: ${filename}`)
}

export function buildSyncDescription(deviceId, kind = 'data') {
  if (kind === 'image') {
    return `goods-app-images-${deviceId}`
  }

  if (kind === 'recharge') {
    return `goods-app-recharge-sync-${deviceId}`
  }

  if (kind === 'events') {
    return `goods-app-events-sync-${deviceId}`
  }

  return `goods-app-sync-${deviceId}`
}
