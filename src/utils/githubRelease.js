const GITHUB_API_BASE = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 15000

function buildHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function normalizeBaseVersionPart(value) {
  const sanitized = String(value || '')
    .trim()
    .replace(/^[^\d]*/, '')
    .replace(/[^\d.]/g, '.')

  return sanitized
    .split('.')
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment))
}

function parseVersion(version) {
  const normalized = normalizeVersionTag(version)
  const [base = '', prerelease = ''] = normalized.split('-', 2)

  return {
    raw: normalized,
    baseParts: normalizeBaseVersionPart(base),
    prerelease: prerelease.trim().toLowerCase()
  }
}

async function request(path) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method: 'GET',
      headers: buildHeaders(),
      signal: controller.signal
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const message = error?.message || `GitHub API error: ${response.status}`
      throw new Error(message)
    }

    return response.json()
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('检查更新超时，请稍后再试。')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function normalizeVersionTag(version) {
  return String(version || '')
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^[vV]/, '')
}

export function compareVersions(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion)
  const right = parseVersion(rightVersion)
  const maxLength = Math.max(left.baseParts.length, right.baseParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left.baseParts[index] ?? 0
    const rightValue = right.baseParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  if (!left.prerelease && right.prerelease) return 1
  if (left.prerelease && !right.prerelease) return -1

  if (left.prerelease || right.prerelease) {
    return left.prerelease.localeCompare(right.prerelease, undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  }

  if (!left.baseParts.length && !right.baseParts.length) {
    return left.raw.localeCompare(right.raw, undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  }

  return 0
}

export async function getLatestRelease(owner, repo) {
  if (!owner || !repo) {
    throw new Error('缺少 GitHub 仓库信息，无法检查更新。')
  }

  try {
    return await request(`/repos/${owner}/${repo}/releases/latest`)
  } catch (error) {
    if (String(error?.message || '').includes('404')) {
      throw new Error('当前仓库还没有可用的 Release。')
    }
    throw error
  }
}

export function resolveReleaseTargetUrl(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const preferredAsset = assets.find((asset) => /\.apk$/i.test(asset?.name || ''))
    || assets.find((asset) => /\.aab$/i.test(asset?.name || ''))
    || assets[0]

  return preferredAsset?.browser_download_url || release?.html_url || ''
}

export function buildReleaseNotesPreview(body, lineLimit = 8) {
  const text = String(body || '').trim()
  if (!text) return ''

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, source) => line || (index > 0 && source[index - 1]))
    .slice(0, lineLimit)

  return lines.join('\n').trim()
}
