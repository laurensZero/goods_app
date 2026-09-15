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

function normalizeReleaseTarget(platform = '') {
  const value = String(platform || '').trim().toLowerCase()
  if (!value) return ''

  if (value.includes('android')) return 'android'
  if (value.includes('win')) return 'windows'
  if (value.includes('mac') || value.includes('darwin') || value.includes('osx')) return 'darwin'
  if (value.includes('linux')) return 'linux'
  return value
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

export function resolveReleaseTargetUrl(release, platform = '') {
  const preferredAsset = resolveReleaseAsset(release, platform)

  return preferredAsset?.browser_download_url || release?.html_url || ''
}

export function resolveReleaseAsset(release, platform = '') {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  const normalizedTarget = normalizeReleaseTarget(platform)

  const preferredPatterns = normalizedTarget === 'android'
    ? [/\.(apk|aab)$/i, /\.(exe|msi|msix|zip)$/i, /\.(appimage|AppImage|deb|rpm|dmg|pkg|tar\.gz|tgz)$/i]
    : normalizedTarget === 'windows'
      ? [/\.(exe|msi|msix|zip)$/i, /\.(apk|aab)$/i, /\.(appimage|AppImage|deb|rpm|dmg|pkg|tar\.gz|tgz)$/i]
      : normalizedTarget === 'darwin'
        ? [/\.(dmg|pkg|app\.tar\.gz|tar\.gz|tgz|zip)$/i, /\.(exe|msi|msix)$/i, /\.(apk|aab)$/i]
        : normalizedTarget === 'linux'
          ? [/\.(appimage|AppImage|deb|rpm|tar\.gz|tgz|zip)$/i, /\.(exe|msi|msix)$/i, /\.(apk|aab)$/i]
          : [/\.(apk|aab)$/i, /\.(exe|msi|msix|zip)$/i, /\.(appimage|AppImage|deb|rpm|dmg|pkg|tar\.gz|tgz)$/i]

  for (const pattern of preferredPatterns) {
    const match = assets.find((asset) => pattern.test(asset?.name || ''))
    if (match) return match
  }

  return assets.find((asset) => !/\.(sig|json)$/i.test(asset?.name || '')) || assets[0]
}

export function buildReleaseNotesPreview(body, lineLimit = 0) {
  const text = String(body || '').trim()
  if (!text) return ''

  const normalizedLimit = Number(lineLimit)

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    // 过滤 release body 顶部的元数据行（update_level / apk_sha256），不作为更新说明展示
    .filter((line) => !/^(?:update[_-]?level|apk[_-]?sha256|更新级别)\s*[:=]/i.test(line.trim()))
    .filter((line, index, source) => line || (index > 0 && source[index - 1]))

  if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
    return lines.slice(0, normalizedLimit).join('\n').trim()
  }

  return lines.join('\n').trim()
}
