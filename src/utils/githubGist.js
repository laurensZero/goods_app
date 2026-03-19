const GITHUB_API_BASE = 'https://api.github.com'

function buildHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
}

async function request(method, path, token, body = null) {
  const options = {
    method,
    headers: buildHeaders(token)
  }

  if (body !== null) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${GITHUB_API_BASE}${path}`, options)

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const message = error?.message || `GitHub API error: ${response.status}`
    throw new Error(message)
  }

  if (response.status === 204) return null
  return response.json()
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

  if (file.truncated && file.raw_url) {
    return null
  }

  return file.content
}

export function buildSyncDescription(deviceId) {
  return `goods-app-sync-${deviceId}`
}
