import { describe, it, expect } from 'vitest'
import {
  normalizeVersionTag,
  compareVersions,
  proxyGitHubDownloadUrl,
  buildReleaseNotesPreview,
  resolveReleaseAsset,
  resolveReleaseTargetUrl
} from '../release'

describe('normalizeVersionTag', () => {
  it('strips v prefix and refs/tags/', () => {
    expect(normalizeVersionTag('v1.2.3')).toBe('1.2.3')
    expect(normalizeVersionTag('V2.0.0')).toBe('2.0.0')
    expect(normalizeVersionTag('refs/tags/v3.1')).toBe('3.1')
  })

  it('returns empty for nullish', () => {
    expect(normalizeVersionTag('')).toBe('')
    expect(normalizeVersionTag(null)).toBe('')
  })
})

describe('compareVersions', () => {
  it('orders major/minor/patch', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1)
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
  })

  it('treats missing parts as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBe(-1)
  })

  it('prerelease ranks below release', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
  })

  it('compares prerelease tags numerically', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
  })

  it('accepts v-prefixed input', () => {
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0)
  })
})

describe('proxyGitHubDownloadUrl', () => {
  it('proxies github.com URLs', () => {
    expect(proxyGitHubDownloadUrl('https://github.com/o/r/releases/download/v1/app.apk'))
      .toBe('https://gh-proxy.com/https://github.com/o/r/releases/download/v1/app.apk')
  })

  it('leaves non-github URLs alone', () => {
    expect(proxyGitHubDownloadUrl('https://example.com/a.apk')).toBe('https://example.com/a.apk')
    expect(proxyGitHubDownloadUrl('')).toBe('')
    expect(proxyGitHubDownloadUrl(null)).toBe(null)
  })
})

describe('buildReleaseNotesPreview', () => {
  it('returns empty for blank body', () => {
    expect(buildReleaseNotesPreview('')).toBe('')
    expect(buildReleaseNotesPreview(null)).toBe('')
  })

  it('filters metadata lines', () => {
    const body = 'update_level: major\napk_sha256: abc\n\n新增功能'
    expect(buildReleaseNotesPreview(body)).toBe('新增功能')
  })

  it('limits lines when requested', () => {
    expect(buildReleaseNotesPreview('a\nb\nc', 2)).toBe('a\nb')
  })
})

describe('resolveReleaseAsset / resolveReleaseTargetUrl', () => {
  const release = {
    html_url: 'https://github.com/o/r/releases/tag/v1',
    assets: [
      { name: 'checksums.sig', browser_download_url: 'https://x/sig' },
      { name: 'app-windows.exe', browser_download_url: 'https://x/exe' },
      { name: 'app.apk', browser_download_url: 'https://x/apk' }
    ]
  }

  it('prefers apk for android', () => {
    expect(resolveReleaseAsset(release, 'android')?.name).toBe('app.apk')
    expect(resolveReleaseTargetUrl(release, 'android')).toBe('https://x/apk')
  })

  it('prefers exe for windows', () => {
    expect(resolveReleaseAsset(release, 'windows')?.name).toBe('app-windows.exe')
  })

  it('falls back to html_url when no assets match preferred and all filtered', () => {
    const onlyMeta = { html_url: 'https://github.com/o/r/tag', assets: [{ name: 'a.sig' }, { name: 'b.json' }] }
    expect(resolveReleaseTargetUrl(onlyMeta, 'android')).toBe('https://github.com/o/r/tag')
  })
})
