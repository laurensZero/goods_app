import { describe, expect, it, vi } from 'vitest'

// trackSourceInput 会连带载入三个音源模块；这里只关心「字符串 → 音源 + id」的解析，
// 把 Capacitor 依赖 mock 掉，保证在 happy-dom 下可导入。
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web'
  },
  CapacitorHttp: { get: vi.fn() },
  registerPlugin: () => ({})
}))

vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: {
    openUrl: vi.fn(),
    canOpenUrl: vi.fn()
  }
}))

import { parseTrackSourceInput } from '@/utils/music/trackSourceInput'

describe('parseTrackSourceInput - B 站', () => {
  it('识别裸 BV 号', () => {
    expect(parseTrackSourceInput('BV1xx411c7mD')).toEqual({ source: 'bilibili', id: 'BV1xx411c7mD' })
  })

  it('识别视频链接（含分享参数）', () => {
    expect(parseTrackSourceInput('https://www.bilibili.com/video/BV1GJ411x7h7/?spm_id_from=333.999'))
      .toEqual({ source: 'bilibili', id: 'BV1GJ411x7h7' })
  })

  it('识别夹在分享文案里的链接', () => {
    expect(parseTrackSourceInput('【4K修复】官方MV https://www.bilibili.com/video/BV1xx411c7mD?share_source=copy_web 转发'))
      .toEqual({ source: 'bilibili', id: 'BV1xx411c7mD' })
  })

  it('BV 号不完整时不当作音源（回落到普通搜索）', () => {
    expect(parseTrackSourceInput('BVx')).toBeNull()
    expect(parseTrackSourceInput('BV 号怎么用')).toBeNull()
    expect(parseTrackSourceInput('https://i0.hdslb.com/bfs/archive/abc.jpg')).toBeNull()
  })
})

describe('parseTrackSourceInput - 网易云', () => {
  it('识别单曲链接', () => {
    expect(parseTrackSourceInput('https://music.163.com/song?id=186016&uct=abc'))
      .toEqual({ source: 'netease', id: '186016' })
  })

  it('识别 #/ 形式的分享链接', () => {
    expect(parseTrackSourceInput('https://music.163.com/#/song?id=186016'))
      .toEqual({ source: 'netease', id: '186016' })
  })

  it('识别分享文案', () => {
    expect(parseTrackSourceInput('分享周杰伦的单曲《晴天》: https://music.163.com/song?id=186016 (来自@网易云音乐)'))
      .toEqual({ source: 'netease', id: '186016' })
  })

  it('歌单 / 专辑链接不当作单曲', () => {
    expect(parseTrackSourceInput('https://music.163.com/playlist?id=123456')).toBeNull()
    expect(parseTrackSourceInput('https://music.163.com/album?id=18905')).toBeNull()
  })

  it('搜索框模式下不把裸数字当歌曲 id', () => {
    expect(parseTrackSourceInput('186016')).toBeNull()
    expect(parseTrackSourceInput('186016', { allowBareId: true })).toEqual({ source: 'netease', id: '186016' })
  })
})

describe('parseTrackSourceInput - QQ 音乐', () => {
  it('识别 songDetail 链接', () => {
    expect(parseTrackSourceInput('https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV'))
      .toEqual({ source: 'qq', id: '0039MnYb0qxYhV' })
  })

  it('识别 songmid 参数链接', () => {
    expect(parseTrackSourceInput('https://i.y.qq.com/v8/playsong.html?songmid=0039MnYb0qxYhV&songtype=0'))
      .toEqual({ source: 'qq', id: '0039MnYb0qxYhV' })
  })

  it('专辑链接不当作单曲', () => {
    expect(parseTrackSourceInput('https://y.qq.com/n/ryqq/albumDetail/002fRO0N4FftzY')).toBeNull()
  })

  it('裸 mid 只在绑定场景识别（避免抢走关键词搜索）', () => {
    expect(parseTrackSourceInput('0039MnYb0qxYhV')).toBeNull()
    expect(parseTrackSourceInput('0039MnYb0qxYhV', { allowBareId: true })).toEqual({ source: 'qq', id: '0039MnYb0qxYhV' })
  })
})

describe('parseTrackSourceInput - 应用内试听链接', () => {
  it('识别 app://play_music/<source>/<id>', () => {
    expect(parseTrackSourceInput('app://play_music/bilibili/BV1xx411c7mD'))
      .toEqual({ source: 'bilibili', id: 'BV1xx411c7mD' })
    expect(parseTrackSourceInput('app://play_music/netease/186016'))
      .toEqual({ source: 'netease', id: '186016' })
    expect(parseTrackSourceInput('app://play_music/qq/0039MnYb0qxYhV'))
      .toEqual({ source: 'qq', id: '0039MnYb0qxYhV' })
  })

  it('不支持的音源返回 null', () => {
    expect(parseTrackSourceInput('app://play_music/spotify/abc')).toBeNull()
  })
})

describe('parseTrackSourceInput - 普通关键词', () => {
  it('歌名 / 歌手名照常走搜索', () => {
    expect(parseTrackSourceInput('Never Gonna Give You Up')).toBeNull()
    expect(parseTrackSourceInput('周杰伦 晴天')).toBeNull()
    expect(parseTrackSourceInput('1234567890', { allowBareId: true })).toEqual({ source: 'netease', id: '1234567890' })
  })

  it('空输入返回 null', () => {
    expect(parseTrackSourceInput('')).toBeNull()
    expect(parseTrackSourceInput('   ')).toBeNull()
    expect(parseTrackSourceInput(undefined)).toBeNull()
  })
})
