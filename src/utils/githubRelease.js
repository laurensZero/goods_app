const GITHUB_API_BASE = 'https://api.github.com'
const GITEE_API_BASE = 'https://gitee.com/api/v5'
const REQUEST_TIMEOUT_MS = 15000

function buildGitHubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function buildGiteeHeaders() {
  return {
    Accept: 'application/json'
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

function normalizeReleaseAsset(asset) {
  if (!asset || typeof asset !== 'object') return null

  const browserDownloadUrl = asset.browser_download_url || asset.browserDownloadUrl || asset.download_url || ''
  return {
    ...asset,
    browser_download_url: String(browserDownloadUrl || '').trim(),
    name: String(asset.name || asset.file_name || '').trim()
  }
}

function normalizeRelease(release, source = 'github') {
  if (!release || typeof release !== 'object') return null

  const assets = Array.isArray(release.assets)
    ? release.assets.map((item) => normalizeReleaseAsset(item)).filter(Boolean)
    : []

  const fallbackHtmlUrl = source === 'gitee'
    ? (release.html_url || release.url || release.tag_name ? `https://gitee.com/${release?.namespace || ''}` : '')
    : ''

  return {
    ...release,
    assets,
    html_url: String(release.html_url || release.target_url || fallbackHtmlUrl || '').trim(),
    tag_name: String(release.tag_name || release.tag || '').trim(),
    body: String(release.body || release.description || '').trim(),
    source
  }
}

async function request(baseUrl, path, headers) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers,
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
    const release = await request(
      GITHUB_API_BASE,
      `/repos/${owner}/${repo}/releases/latest`,
      buildGitHubHeaders()
    )
    return normalizeRelease(release, 'github')
  } catch (error) {
    if (String(error?.message || '').includes('404')) {
      throw new Error('当前仓库还没有可用的 Release。')
    }
    throw error
  }
}

export async function getLatestReleaseFromGitee(owner, repo) {
  if (!owner || !repo) {
    throw new Error('缺少 Gitee 仓库信息，无法检查更新。')
  }

  try {
    const release = await request(
      GITEE_API_BASE,
      `/repos/${owner}/${repo}/releases/latest`,
      buildGiteeHeaders()
    )
    const normalized = normalizeRelease(release, 'gitee')
    if (normalized && !normalized.html_url) {
      normalized.html_url = `https://gitee.com/${owner}/${repo}/releases`
    }
    return normalized
  } catch (error) {
    if (String(error?.message || '').includes('404')) {
      throw new Error('当前 Gitee 仓库还没有可用的 Release。')
    }
    throw error
  }
}

export function resolveReleaseTargetUrl(release) {
  const preferredAsset = resolveReleaseAsset(release)

  return preferredAsset?.browser_download_url || release?.html_url || ''
}

export function resolveReleaseAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return assets.find((asset) => /\.apk$/i.test(asset?.name || ''))
    || assets.find((asset) => /\.aab$/i.test(asset?.name || ''))
    || assets[0]
}

export function buildReleaseNotesPreview(body, lineLimit = 0) {
  const text = String(body || '').trim()
  if (!text) return ''

  const normalizedLimit = Number(lineLimit)

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, source) => line || (index > 0 && source[index - 1]))

  if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
    return lines.slice(0, normalizedLimit).join('\n').trim()
  }

  return lines.join('\n').trim()
}
