import { describe, it, expect } from 'vitest'
import {
  normalizeVersionTag,
  compareVersions,
  resolveReleaseAsset,
  buildReleaseNotesPreview
} from '../release'

describe('normalizeVersionTag', () => {
  it('removes v prefix', () => {
    expect(normalizeVersionTag('v1.0.0')).toBe('1.0.0')
  })

  it('removes V prefix', () => {
    expect(normalizeVersionTag('V1.0.0')).toBe('1.0.0')
  })

  it('removes refs/tags/ prefix', () => {
    expect(normalizeVersionTag('refs/tags/v1.0.0')).toBe('1.0.0')
  })

  it('handles plain version', () => {
    expect(normalizeVersionTag('1.0.0')).toBe('1.0.0')
  })

  it('trims whitespace', () => {
    expect(normalizeVersionTag('  v1.0.0  ')).toBe('1.0.0')
  })

  it('returns empty for null', () => {
    expect(normalizeVersionTag(null)).toBe('')
  })

  it('returns empty for empty string', () => {
    expect(normalizeVersionTag('')).toBe('')
  })
})

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns 1 when left is greater (major)', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
  })

  it('returns -1 when left is less (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('compares minor versions', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1)
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1)
  })

  it('compares patch versions', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1)
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1)
  })

  it('handles versions with v prefix', () => {
    expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1)
  })

  it('stable > prerelease', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
  })

  it('prerelease < stable', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
  })

  it('compares prerelease strings', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })

  it('handles different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBe(1)
  })

  it('handles two-part versions', () => {
    expect(compareVersions('1.2', '1.1')).toBe(1)
  })
})

describe('resolveReleaseAsset', () => {
  it('prefers .apk for android', () => {
    const release = {
      assets: [
        { name: 'app.exe', browser_download_url: 'exe-url' },
        { name: 'app.apk', browser_download_url: 'apk-url' }
      ]
    }
    const asset = resolveReleaseAsset(release, 'android')
    expect(asset.name).toBe('app.apk')
  })

  it('prefers .exe for windows', () => {
    const release = {
      assets: [
        { name: 'app.apk', browser_download_url: 'apk-url' },
        { name: 'app.exe', browser_download_url: 'exe-url' }
      ]
    }
    const asset = resolveReleaseAsset(release, 'windows')
    expect(asset.name).toBe('app.exe')
  })

  it('finds matching asset by platform pattern', () => {
    // For any platform, at least one asset should be returned
    const release = {
      assets: [
        { name: 'app.apk', browser_download_url: 'apk-url' },
        { name: 'app.dmg', browser_download_url: 'dmg-url' }
      ]
    }
    const asset = resolveReleaseAsset(release, 'darwin')
    expect(asset).toBeTruthy()
    expect(['app.apk', 'app.dmg']).toContain(asset.name)
  })

  it('returns undefined for empty assets', () => {
    // find returns undefined when no match
    expect(resolveReleaseAsset({ assets: [] }, 'android')).toBeUndefined()
  })

  it('returns undefined for missing assets', () => {
    expect(resolveReleaseAsset({}, 'android')).toBeUndefined()
  })

  it('falls back to first non-sig asset', () => {
    const release = {
      assets: [
        { name: 'app.sig', browser_download_url: 'sig-url' },
        { name: 'app.json', browser_download_url: 'json-url' },
        { name: 'app.bin', browser_download_url: 'bin-url' }
      ]
    }
    const asset = resolveReleaseAsset(release, 'unknown')
    expect(asset.name).toBe('app.bin')
  })
})

describe('buildReleaseNotesPreview', () => {
  it('returns trimmed text', () => {
    expect(buildReleaseNotesPreview('  hello  ')).toBe('hello')
  })

  it('limits lines when specified', () => {
    const body = 'line1\nline2\nline3\nline4'
    expect(buildReleaseNotesPreview(body, 2)).toBe('line1\nline2')
  })

  it('returns all lines when limit is 0', () => {
    const body = 'line1\nline2\nline3'
    expect(buildReleaseNotesPreview(body, 0)).toBe('line1\nline2\nline3')
  })

  it('collapses blank lines', () => {
    const body = 'line1\n\n\nline2'
    expect(buildReleaseNotesPreview(body)).toBe('line1\n\nline2')
  })

  it('returns empty for null', () => {
    expect(buildReleaseNotesPreview(null)).toBe('')
  })

  it('returns empty for empty string', () => {
    expect(buildReleaseNotesPreview('')).toBe('')
  })
})
