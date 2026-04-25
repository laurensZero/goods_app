import { fetchWithPlatformBridge } from '@/utils/platformHttp'

const GITHUB_API_BASE = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 30000

function buildHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
}

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

export async function createIssue(token, owner, repo, payload) {
  return request('POST', `/repos/${owner}/${repo}/issues`, token, payload)
}
