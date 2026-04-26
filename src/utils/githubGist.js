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

export async function deleteGistFile(token, gistId, filename) {
  return deleteGistFiles(token, gistId, [filename])
}

export async function deleteGistFiles(token, gistId, filenames) {
  const files = {}

  for (const filename of filenames || []) {
    if (!filename) continue
    files[filename] = null
  }

  if (Object.keys(files).length === 0) return null

  return request('PATCH', `/gists/${gistId}`, token, { files })
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

function buildPublicHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function requestPublic(method, path, token, body = null) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const options = {
    method,
    headers: buildPublicHeaders(token),
    signal: controller.signal
  }

  if (body !== null) {
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetchWithPlatformBridge(`${GITHUB_API_BASE}${path}`, options)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const rateLimitRemaining = response.headers?.get?.('x-ratelimit-remaining')
      const rateLimitReset = response.headers?.get?.('x-ratelimit-reset')
      const isRateLimited = response.status === 403 && (
        String(error?.message || '').toLowerCase().includes('rate limit')
        || rateLimitRemaining === '0'
      )

      if (isRateLimited) {
        let resetHint = ''
        const resetTs = Number(rateLimitReset || 0)
        if (Number.isFinite(resetTs) && resetTs > 0) {
          try {
            resetHint = `，可在 ${new Date(resetTs * 1000).toLocaleString('zh-CN')} 后重试`
          } catch {
            // ignore invalid date formatting
          }
        }
        throw new Error(`GitHub API 访问频率受限。请先在“云同步”里配置 GitHub Token 后重试${resetHint}`)
      }

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

/**
 * Create a public Gist for sharing.
 * Uses auth token if available (higher rate limit), otherwise anonymous.
 */
export async function createPublicGist(token, description, files) {
  const payload = {
    description,
    public: true,
    files
  }

  return requestPublic('POST', '/gists', token || '', payload)
}

/**
 * Read a public Gist without authentication.
 */
export async function getPublicGist(gistId, token = '') {
  try {
    return await requestPublic('GET', `/gists/${gistId}`, token)
  } catch (error) {
    if (error.message.includes('404')) return null
    throw error
  }
}

const SHARE_GIST_ID_KEY = 'goods_share_gist_id'

function getSavedShareGistId() {
  try {
    const id = localStorage.getItem(SHARE_GIST_ID_KEY)
    return id && /^[a-zA-Z0-9]+$/.test(id) ? id : ''
  } catch {
    return ''
  }
}

function saveShareGistId(gistId) {
  try {
    localStorage.setItem(SHARE_GIST_ID_KEY, gistId)
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Find an existing share Gist or create a new one.
 * Reuses a single Gist to avoid creating too many Gist files.
 *
 * Strategy (in order):
 * 1. localStorage saved ID — if we've created one before, reuse it
 * 2. API listGists — search by description as fallback
 * 3. Create new — first time or all lookups failed
 */
export async function findOrCreateShareGist(token, description, files) {
  // 1. Try localStorage saved ID first
  const savedId = getSavedShareGistId()
  if (savedId && token) {
    try {
      const result = await updateGist(token, savedId, files)
      return result
    } catch {
      // saved ID may be stale (gist deleted), fall through
    }
  }

  // 2. Try API list by description
  if (token) {
    try {
      const existing = await listGists(token, description)
      if (existing.length > 0) {
        const gistId = existing[0].id
        saveShareGistId(gistId)
        return updateGist(token, gistId, files)
      }
    } catch {
      // fall through to create new
    }
  }

  // 3. Create new
  const gist = await createPublicGist(token, description, files)
  if (gist?.id) {
    saveShareGistId(gist.id)
  }
  return gist
}

/**
 * Read-only lookup: find the existing share Gist.
 * Returns the Gist object or null.
 */
export async function getShareGist(token, description) {
  if (!token) return null

  const savedId = getSavedShareGistId()
  if (savedId) {
    try {
      const gist = await getGist(token, savedId)
      if (gist) return gist
    } catch {
      // saved ID may be stale
    }
  }

  try {
    const existing = await listGists(token, description)
    if (existing.length > 0) {
      saveShareGistId(existing[0].id)
      return existing[0]
    }
  } catch {
    // no gist found
  }

  return null
}

export function buildShareDescription() {
  return 'goods-app-share'
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
