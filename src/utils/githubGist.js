const GITHUB_API_BASE = 'https://api.github.com'

function buildHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
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
    const response = await fetch(`${GITHUB_API_BASE}${path}`, options)

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

export function extractGistFileContent(gist, filename) {
  const file = gist?.files?.[filename]
  if (!file) return null

  // 如果文件被截断但有 raw_url，返回已有的内容（可能是部分数据）
  // GitHub API 在小文件时会直接返回完整内容
  return file.content
}

export function buildSyncDescription(deviceId) {
  return `goods-app-sync-${deviceId}`
}
