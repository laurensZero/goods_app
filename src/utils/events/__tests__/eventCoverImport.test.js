// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/config/supabase', () => ({
  AUTH_WEB_ORIGIN: 'https://goodsapp.de5.net'
}))

import {
  extractShareUrl,
  isSupportedShareHost,
  parseEventCoverFromShareText
} from '../eventCoverImport'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractShareUrl', () => {
  it('从会员购分享文本中提取链接', () => {
    const text = '《ANIME LOVERS 03漫展》火热进行中！ https://show.bilibili.com/platform/detail.html?id=89746&share_source=copy'
    expect(extractShareUrl(text)).toBe('https://show.bilibili.com/platform/detail.html?id=89746&share_source=copy')
  })

  it('提取大麦中文顿号夹着的链接并去掉尾部标点', () => {
    const text = '【大麦】蝎子乐队2026演唱会，https://m.damai.cn/shows/item.html?itemId=1089296611479，速来！'
    expect(extractShareUrl(text)).toBe('https://m.damai.cn/shows/item.html?itemId=1089296611479')
  })

  it('猫眼 App 分享的 hash 路由链接原样返回', () => {
    const url = 'https://show.maoyan.com/qqw?share=Android&utm_source=maoyan_appShare#/detail/265844?fromTag=myshare&isNewPage=false'
    expect(extractShareUrl(`《原神☆FES》 ${url}`)).toBe(url)
  })

  it('b23.tv 短链原样返回', () => {
    expect(extractShareUrl('https://b23.tv/cfL2CqB')).toBe('https://b23.tv/cfL2CqB')
  })

  it('无链接返回空串', () => {
    expect(extractShareUrl('这是一段没有链接的文本')).toBe('')
    expect(extractShareUrl('')).toBe('')
  })
})

describe('isSupportedShareHost', () => {
  it('识别三平台域名与短链域', () => {
    expect(isSupportedShareHost('https://show.bilibili.com/platform/detail.html?id=1')).toBe(true)
    expect(isSupportedShareHost('https://mall.bilibili.com/neul-next/ticket-renovation/detail.html?id=1006859')).toBe(true)
    expect(isSupportedShareHost('https://b23.tv/cfL2CqB')).toBe(true)
    expect(isSupportedShareHost('https://u.damai.cn/abc123')).toBe(true)
    expect(isSupportedShareHost('https://m.damai.cn/shows/item.html?itemId=1')).toBe(true)
    expect(isSupportedShareHost('https://show.maoyan.com/qqw?share=Android#/detail/265844')).toBe(true)
  })

  it('拒绝其它域名与非法输入', () => {
    expect(isSupportedShareHost('https://example.com/detail/1')).toBe(false)
    expect(isSupportedShareHost('不是链接')).toBe(false)
    expect(isSupportedShareHost('')).toBe(false)
  })
})

describe('parseEventCoverFromShareText（node 环境非原生 → 走代理）', () => {
  it('解析成功返回平台、标题、地点与封面地址', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      platform: 'bilibili',
      id: '89746',
      title: '太原·ANIME LOVERS 03漫展',
      location: '太原东大盛世华庭',
      coverUrl: 'https://i0.hdslb.com/bfs/openplatform/cover.jpeg',
      finalUrl: 'https://show.bilibili.com/platform/detail.html?id=89746'
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await parseEventCoverFromShareText('https://show.bilibili.com/platform/detail.html?id=89746')
    expect(result.ok).toBe(true)
    expect(result.platform).toBe('bilibili')
    // 「城市·」前缀被清洗
    expect(result.title).toBe('ANIME LOVERS 03漫展')
    expect(result.location).toBe('太原东大盛世华庭')
    expect(result.coverUrl).toBe('https://i0.hdslb.com/bfs/openplatform/cover.jpeg')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/event-cover/parse?url='),
      expect.any(Object)
    )
  })

  it('清洗标题开头的【城市】标签（大麦风格）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      platform: 'damai',
      id: '738213223755',
      title: '【上海】原神交响音乐会2023',
      location: '梅赛德斯-奔驰文化中心 世博大道1200号',
      coverUrl: 'https://img.alicdn.com/cover.jpg'
    }), { status: 200 })))

    const result = await parseEventCoverFromShareText('https://m.damai.cn/shows/item.html?itemId=738213223755')
    expect(result.ok).toBe(true)
    expect(result.title).toBe('原神交响音乐会2023')
    expect(result.location).toBe('梅赛德斯-奔驰文化中心 世博大道1200号')
  })

  it('清洗组合前缀：【城市】+ 城市·', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      platform: 'bilibili',
      id: '1006859',
      title: '【杭州】杭州·绝区零 2026FES 布梦嘉年华',
      location: '杭州大会展中心',
      coverUrl: 'https://i0.hdslb.com/cover.jpg'
    }), { status: 200 })))

    const result = await parseEventCoverFromShareText('https://b23.tv/cfL2CqB')
    expect(result.ok).toBe(true)
    expect(result.title).toBe('绝区零 2026FES 布梦嘉年华')
    expect(result.location).toBe('杭州大会展中心')
  })

  it('清洗保留正文里没有前缀标签的标题', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      platform: 'maoyan',
      id: '265844',
      title: '原神☆FES 2023',
      location: '',
      coverUrl: 'https://p0.meituan.net/cover.jpg'
    }), { status: 200 })))

    const result = await parseEventCoverFromShareText('https://show.maoyan.com/qqw#/detail/265844')
    expect(result.ok).toBe(true)
    expect(result.title).toBe('原神☆FES 2023')
  })

  it('无链接返回 noUrl', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await parseEventCoverFromShareText('没有链接')
    expect(result).toEqual({ ok: false, reason: 'noUrl' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('非平台域名返回 unsupported 且不发起请求', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await parseEventCoverFromShareText('https://example.com/detail/123')
    expect(result).toEqual({ ok: false, reason: 'unsupported' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('服务端 422 透传 unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unsupported' }), { status: 422 })))
    const result = await parseEventCoverFromShareText('https://u.damai.cn/unknown-short')
    expect(result).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('服务端解析失败归为 network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'upstream' }), { status: 502 })))
    const result = await parseEventCoverFromShareText('https://show.maoyan.com/qqw/detail/367730')
    expect(result).toEqual({ ok: false, reason: 'network' })
  })

  it('解析成功但无封面返回 noCover', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      platform: 'damai', id: '1', title: 'x', coverUrl: ''
    }), { status: 200 })))
    const result = await parseEventCoverFromShareText('https://m.damai.cn/shows/item.html?itemId=1')
    expect(result).toEqual({ ok: false, reason: 'noCover' })
  })
})
