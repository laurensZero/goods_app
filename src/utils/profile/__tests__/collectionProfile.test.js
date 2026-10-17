import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_ROTATION,
  PROFILE_GRADIENT_PRESETS,
  buildCharacterProfileKey,
  collectProfileSetLocalPaths,
  accentContrastColor,
  ensureReadableAccent,
  getGradientAccent,
  hydrateProfileMapFromSync,
  isUsableProfileItem,
  normalizeBackgroundSet,
  normalizeProfileItem,
  normalizeProfileMap,
  normalizeProfileRotation,
  normalizeProfileTheme,
  resolveProfileAccent,
  resolveProfileBackground,
  serializeProfileMapForSync
} from '@/utils/profile/collectionProfile'

const gradient = () => [PROFILE_GRADIENT_PRESETS[0][0], PROFILE_GRADIENT_PRESETS[0][1]]

function imageSet(ids) {
  return {
    items: ids.map((id) => normalizeProfileItem({ id, kind: 'image', uri: `local://${id}` })),
    rotation: { ...DEFAULT_PROFILE_ROTATION }
  }
}

describe('normalizeProfileItem', () => {
  it('infers kind from uri presence', () => {
    expect(normalizeProfileItem({ uri: 'local://a' }).kind).toBe('image')
    expect(normalizeProfileItem({}).kind).toBe('gradient')
  })

  it('clamps numeric fields into their allowed ranges', () => {
    const item = normalizeProfileItem({
      uri: 'local://a',
      focalY: 9,
      scale: 40,
      blur: 999,
      overlay: -3
    })
    expect(item.focalY).toBe(1)
    expect(item.scale).toBe(2.2)
    expect(item.blur).toBe(24)
    expect(item.overlay).toBe(0)
  })

  it('falls back to defaults for garbage input', () => {
    const item = normalizeProfileItem({ kind: 'image', uri: 'x', focalY: 'abc', scale: null, overlay: undefined })
    expect(item.focalY).toBe(0.5)
    expect(item.scale).toBe(1)
    expect(item.overlay).toBe(0.32)
    expect(item.gradient).toEqual(gradient())
  })

  it('rejects malformed hex colors and keeps a valid pair', () => {
    expect(normalizeProfileItem({ gradient: ['#FF0000', 'nope'] }).gradient).toEqual(['#ff0000', PROFILE_GRADIENT_PRESETS[0][1]])
    expect(normalizeProfileItem({ gradient: 'nope' }).gradient).toEqual(gradient())
  })

  it('keeps an existing id and generates one when missing', () => {
    expect(normalizeProfileItem({ id: 'keep-me' }).id).toBe('keep-me')
    expect(normalizeProfileItem({}).id).toMatch(/^bg_/)
  })
})

describe('isUsableProfileItem', () => {
  it('requires a uri for image items but not for gradients', () => {
    expect(isUsableProfileItem({ kind: 'image', uri: 'local://a' })).toBe(true)
    expect(isUsableProfileItem({ kind: 'image', uri: '  ' })).toBe(false)
    expect(isUsableProfileItem({ kind: 'gradient' })).toBe(true)
    expect(isUsableProfileItem(null)).toBe(false)
  })
})

describe('normalizeProfileRotation', () => {
  it('defaults to visit / sequential / fade', () => {
    expect(normalizeProfileRotation()).toEqual({
      mode: 'visit',
      intervalSec: 8,
      order: 'seq',
      transition: 'fade'
    })
  })

  it('rejects unknown enum values', () => {
    const rotation = normalizeProfileRotation({ mode: 'nope', order: 'nope', transition: 'nope' })
    expect(rotation.mode).toBe('visit')
    expect(rotation.order).toBe('seq')
    expect(rotation.transition).toBe('fade')
  })

  it('clamps the interval into 3..120 seconds and falls back on invalid input', () => {
    expect(normalizeProfileRotation({ intervalSec: 1 }).intervalSec).toBe(3)
    expect(normalizeProfileRotation({ intervalSec: 999 }).intervalSec).toBe(120)
    expect(normalizeProfileRotation({ intervalSec: 0 }).intervalSec).toBe(8)
    expect(normalizeProfileRotation({ intervalSec: 'not-a-number' }).intervalSec).toBe(8)
  })
})

describe('normalizeBackgroundSet', () => {
  it('drops unusable image items', () => {
    const set = normalizeBackgroundSet({
      items: [
        { kind: 'image', uri: 'local://ok' },
        { kind: 'image', uri: '' },
        { kind: 'gradient' }
      ]
    })
    expect(set.items).toHaveLength(2)
    expect(set.rotation).toEqual(DEFAULT_PROFILE_ROTATION)
  })

  it('tolerates a non-array items field', () => {
    expect(normalizeBackgroundSet({ items: 'nope' }).items).toEqual([])
    expect(normalizeBackgroundSet().items).toEqual([])
  })
})

describe('normalizeProfileMap', () => {
  it('drops empty sets and trims keys', () => {
    const map = normalizeProfileMap({
      ' 明日方舟 ': imageSet(['a']),
      '空集': { items: [] },
      '': imageSet(['b'])
    })
    expect(Object.keys(map)).toEqual(['明日方舟'])
  })

  it('returns an empty object for non-objects', () => {
    expect(normalizeProfileMap(null)).toEqual({})
    expect(normalizeProfileMap('nope')).toEqual({})
  })
})

describe('buildCharacterProfileKey', () => {
  it('namespaces the character by its IP', () => {
    expect(buildCharacterProfileKey('明日方舟', '能天使')).toBe('明日方舟::能天使')
    expect(buildCharacterProfileKey(undefined, ' 能天使 ')).toBe('::能天使')
  })
})

describe('resolveProfileBackground', () => {
  const ipProfiles = { '明日方舟': imageSet(['ip-1', 'ip-2']) }
  const characterProfiles = { '明日方舟::能天使': imageSet(['char-1']) }

  it('prefers the character own set over the IP set', () => {
    const resolved = resolveProfileBackground({
      ip: '明日方舟',
      character: '能天使',
      ipProfiles,
      characterProfiles
    })
    expect(resolved.owner).toBe('character')
    expect(resolved.key).toBe('明日方舟::能天使')
    expect(resolved.set.items[0].id).toBe('char-1')
  })

  it('falls back to the IP set, keyed by the IP so rotation is shared with the IP page', () => {
    const resolved = resolveProfileBackground({
      ip: '明日方舟',
      character: '银灰',
      ipProfiles,
      characterProfiles
    })
    expect(resolved.owner).toBe('ip')
    expect(resolved.key).toBe('明日方舟')
    expect(resolved.set.items[0].id).toBe('ip-1')
  })

  it('reports none when nothing is configured', () => {
    expect(resolveProfileBackground({ ip: '不存在' }).owner).toBe('none')
    expect(resolveProfileBackground({}).owner).toBe('none')
    expect(resolveProfileBackground({ ip: '明日方舟' }).owner).toBe('none')
  })

  it('ignores a character override belonging to another IP', () => {
    const resolved = resolveProfileBackground({
      ip: '其他 IP',
      character: '能天使',
      ipProfiles,
      characterProfiles
    })
    expect(resolved.owner).toBe('none')
  })

  it('treats an empty character set as no override', () => {
    const resolved = resolveProfileBackground({
      ip: '明日方舟',
      character: '能天使',
      ipProfiles,
      characterProfiles: { '明日方舟::能天使': { items: [], rotation: DEFAULT_PROFILE_ROTATION } }
    })
    expect(resolved.owner).toBe('ip')
  })
})
function imageItem(id, { local = `user-images/${id}.jpg`, cloud = true, width = 1600, height = 1200 } = {}) {
  return normalizeProfileItem({
    id,
    kind: 'image',
    uri: local,
    localPath: local,
    cloudFileName: cloud ? `profile-bg__${id}__main.jpg` : '',
    width,
    height,
    mimeType: 'image/jpeg',
    fileSize: 100
  })
}

describe('单图背景条目', () => {
  it('collectProfileSetLocalPaths 汇总本机文件路径', () => {
    const set = normalizeBackgroundSet({
      items: [imageItem('a'), normalizeProfileItem({ id: 'g', kind: 'gradient' })]
    })
    expect(collectProfileSetLocalPaths(set)).toEqual(['user-images/a.jpg'])
  })

  it('云端只有 cloudFileName 的条目也算可用', () => {
    const item = normalizeProfileItem({ kind: 'image', cloudFileName: 'profile-bg__x__main.jpg' })
    expect(isUsableProfileItem(item)).toBe(true)
  })

  it('方形图与长条图只影响展示，不影响数据形状', () => {
    const square = imageItem('sq', { width: 1000, height: 1000 })
    const strip = imageItem('strip', { width: 3000, height: 1000 })
    expect(square.width / square.height).toBe(1)
    expect(strip.width / strip.height).toBe(3)
  })
})

describe('同步序列化 / 回填', () => {
  const set = () => normalizeBackgroundSet({ items: [imageItem('a')] })

  it('序列化剥离本机 uri/localPath，只保留 cloudFileName 与元信息', () => {
    const serialized = serializeProfileMapForSync({ 明日方舟: set() })
    const item = serialized['明日方舟'].items[0]
    expect(item.cloudFileName).toBe('profile-bg__a__main.jpg')
    expect(item.uri).toBeUndefined()
    expect(item.localPath).toBeUndefined()
    expect(item.width).toBe(1600)
    expect(item.height).toBe(1200)
  })

  it('键顺序稳定：本机插入顺序不同但序列化结果逐字节相等（jsonb 会重排键）', () => {
    const first = serializeProfileMapForSync({ b: set(), a: set() })
    const second = serializeProfileMapForSync({ a: set(), b: set() })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('回填时本机已有同 cloudFileName 的文件保留本地路径，否则用云端公开 URL', () => {
    const remote = serializeProfileMapForSync({ 明日方舟: set() })
    const previous = { 明日方舟: set() }

    const hydrated = hydrateProfileMapFromSync(remote, {
      resolveImageUrl: (name) => `https://cdn/${name}`,
      previous
    })
    expect(hydrated['明日方舟'].items[0].uri).toBe('user-images/a.jpg')
    expect(hydrated['明日方舟'].items[0].localPath).toBe('user-images/a.jpg')

    const fresh = hydrateProfileMapFromSync(remote, {
      resolveImageUrl: (name) => `https://cdn/${name}`
    })
    expect(fresh['明日方舟'].items[0].uri).toBe('https://cdn/profile-bg__a__main.jpg')
    expect(fresh['明日方舟'].items[0].localPath).toBe('')
  })
})

describe('收藏馆主题色', () => {
  it('normalizeProfileTheme 对非法值回落默认（按背景取色）', () => {
    expect(normalizeProfileTheme()).toEqual({ source: 'background', customColor: '#8ec5fc' })
    expect(normalizeProfileTheme({ source: 'nope', customColor: 'red' }))
      .toEqual({ source: 'background', customColor: '#8ec5fc' })
    expect(normalizeProfileTheme({ source: 'custom', customColor: '#ABCDEF' }))
      .toEqual({ source: 'custom', customColor: '#abcdef' })
  })

  it('渐变卡从两个颜色里取更鲜艳的一档，并拉进可读区间', () => {
    const accent = getGradientAccent(['#E0E0E0', '#FF3300'])
    expect(accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(accent).not.toBe('')
    expect(getGradientAccent(['#808080', '#999999'])).toBe('')
  })

  it('resolveProfileAccent 按来源返回：app 为空、custom 用自选、background 用当前条目', () => {
    const image = imageItem('a', { width: 1000, height: 1000 })
    image.accent = '#3366ff'
    expect(resolveProfileAccent({ source: 'app' }, image)).toBe('')
    expect(resolveProfileAccent({ source: 'custom', customColor: '#112233' }, image)).toBe('#112233')
    expect(resolveProfileAccent({ source: 'background' }, image)).toMatch(/^#[0-9a-f]{6}$/)

    const gradient = normalizeProfileItem({ id: 'g', kind: 'gradient', gradient: ['#E0C3FC', '#8EC5FC'] })
    expect(resolveProfileAccent({ source: 'background' }, gradient)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('ensureReadableAccent 丢掉灰色、保留彩色并控制亮度', () => {
    expect(ensureReadableAccent('#888888')).toBe('')
    const accent = ensureReadableAccent('#0000ff')
    expect(accent).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('accentContrastColor 深色配白字、浅色配近黑字', () => {
    expect(accentContrastColor('#1a1a1a')).toBe('#ffffff')
    expect(accentContrastColor('#f0e68c')).toBe('#141416')
  })

  it('theme 随背景集一起序列化并回填', () => {
    const set = normalizeBackgroundSet({
      items: [imageItem('a')],
      theme: { source: 'custom', customColor: '#123456' }
    })
    const serialized = serializeProfileMapForSync({ 明日方舟: set })
    expect(serialized['明日方舟'].theme).toEqual({ source: 'custom', customColor: '#123456' })

    const hydrated = hydrateProfileMapFromSync(serialized)
    expect(hydrated['明日方舟'].theme).toEqual({ source: 'custom', customColor: '#123456' })
  })
})