import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../mtop', () => ({ mtopCall: vi.fn() }))
vi.mock('@/utils/platform/storage', () => ({
  readSecret: vi.fn(async () => null),
  writeSecret: vi.fn(async () => {}),
  removeSecret: vi.fn(async () => {}),
}))

import { mtopCall } from '../mtop'
import {
  nickFromCookie,
  buildTaobaoAvatarUrl,
  profileFromCookie,
  pickNickname,
  fetchTaobaoAccountProfile,
} from '../accountProfile'

describe('nickFromCookie', () => {
  it('优先当前展示昵称 dnk，忽略 _nk_/tracknick/lgc 旧名（实测改名场景）', () => {
    const cookie = 'aui=3411676469; _nk_=ruirui9265; tracknick=ruirui9265; lgc=ruirui9265; dnk=laurens_zero'
    expect(nickFromCookie(cookie)).toBe('laurens_zero')
  })

  it('无 dnk 时退回 _nk_', () => {
    expect(nickFromCookie('_nk_=%E5%B0%8F%E6%98%8E; tracknick=tb168334051115')).toBe('小明')
  })

  it('tracknick 登录名不被采用，退回 lgc', () => {
    expect(nickFromCookie('tracknick=tb168334051115; lgc=%E5%B0%8F%E6%98%8E')).toBe('小明')
  })

  it('所有来源都是登录名时兜底返回（不丢字段）', () => {
    expect(nickFromCookie('dnk=tb168334051115; _nk_=tb168334051115')).toBe('tb168334051115')
  })

  it('空 Cookie 返回空串', () => {
    expect(nickFromCookie('')).toBe('')
    expect(nickFromCookie('aui=3411676469')).toBe('')
  })
})

describe('buildTaobaoAvatarUrl', () => {
  it('优先用 userId（改名后仍返回真实头像），无 uid 时退回昵称', () => {
    expect(buildTaobaoAvatarUrl('laurens_zero', '3411676469')).toContain('userId=3411676469')
    expect(buildTaobaoAvatarUrl('laurens_zero', '3411676469')).not.toContain('userNick=')
    expect(buildTaobaoAvatarUrl('小明')).toContain('userNick=%E5%B0%8F%E6%98%8E')
    expect(buildTaobaoAvatarUrl('', '')).toBe('')
    expect(buildTaobaoAvatarUrl(null, null)).toBe('')
  })
})

describe('pickNickname', () => {
  it('个人中心 snsNick 是真实昵称，优先于会员名 nick（实测账号2）', () => {
    expect(pickNickname({
      snsNick: 'laurensZero',
      apiNick: 'tb168334051115',
      apiDisplayNick: 'tb168334051115',
      cookieNick: 'tb168334051115',
    })).toBe('laurensZero')
  })

  it('snsNick 也是登录名时跳过，退回接口 nick', () => {
    expect(pickNickname({ snsNick: 'tb168334051115', apiNick: 'laurens_zero' })).toBe('laurens_zero')
  })

  it('接口 nick 是当前昵称，优先于 Cookie（改名后 Cookie 仍是旧名）', () => {
    expect(pickNickname({
      apiNick: 'laurens_zero',
      apiDisplayNick: '',
      cookieNick: 'ruirui9265',
    })).toBe('laurens_zero')
  })

  it('接口 nick 是登录名时，退回 displayNick', () => {
    expect(pickNickname({
      apiNick: 'tb168334051115',
      apiDisplayNick: '小龙',
      cookieNick: '',
    })).toBe('小龙')
  })

  it('接口 nick 是登录名且无 displayNick 时，退回 Cookie', () => {
    expect(pickNickname({
      apiNick: 'tb168334051115',
      apiDisplayNick: '',
      cookieNick: '小明',
    })).toBe('小明')
  })

  it('所有来源都像登录名时才兜底返回', () => {
    expect(pickNickname({ apiNick: 'tb168334051115', apiDisplayNick: '', cookieNick: '' }))
      .toBe('tb168334051115')
  })

  it('接口完全没给时退回 Cookie', () => {
    expect(pickNickname({ cookieNick: '小明' })).toBe('小明')
  })

  it('全空返回空串', () => {
    expect(pickNickname({})).toBe('')
  })
})

describe('profileFromCookie', () => {
  it('昵称 + 头像（头像按 unb 生成 userId 直链）', () => {
    const profile = profileFromCookie('unb=2200123456789; _nk_=%E5%B0%8F%E6%98%8E')
    expect(profile.nickname).toBe('小明')
    expect(profile.avatarUrl).toContain('userId=2200123456789')
    expect(profile.uid).toBe('2200123456789')
  })

  it('无昵称时头像仍按 uid 生成', () => {
    const profile = profileFromCookie('unb=2200123456789')
    expect(profile.nickname).toBe('')
    expect(profile.avatarUrl).toContain('userId=2200123456789')
  })
})

describe('fetchTaobaoAccountProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const simple = {
    data: { nick: 'tb168334051115', displayNick: 'tb168334051115', userNumId: '2218719131333' },
  }
  const center = {
    data: {
      account: {
        nick: 'tb168334051115',
        snsNick: 'laurensZero',
        fullAvatar: 'https://img.alicdn.com/imgextra/i4/2218719131333/O1CN016R0HkksN7kB2BxHW_!!2218719131333-2-userheaderimgshow.png',
      },
    },
  }
  const isCenter = (api) => api === 'mtop.taobao.mclaren.personal.center.index'

  it('并发打两个接口，用 snsNick 覆盖会员名，头像按 uid 生成', async () => {
    mtopCall.mockImplementation(async ({ api }) => (isCenter(api) ? center : simple))
    const profile = await fetchTaobaoAccountProfile('unb=2218719131333')
    expect(profile.nickname).toBe('laurensZero')
    expect(profile.uid).toBe('2218719131333')
    expect(profile.avatarUrl).toContain('userId=2218719131333')
    expect(mtopCall).toHaveBeenCalledTimes(2)
  })

  it('个人中心失败时退回 getUserSimple 的昵称', async () => {
    mtopCall.mockImplementation(async ({ api }) => {
      if (isCenter(api)) throw new Error('center down')
      return { data: { nick: 'laurens_zero', displayNick: 'laurens_zero', userNumId: '3411676469' } }
    })
    const profile = await fetchTaobaoAccountProfile('unb=3411676469')
    expect(profile.nickname).toBe('laurens_zero')
    expect(profile.avatarUrl).toContain('userId=3411676469')
  })

  it('两个接口都失败时抛错（交给上层走 Cookie 兜底）', async () => {
    mtopCall.mockRejectedValue(new Error('boom'))
    await expect(fetchTaobaoAccountProfile('unb=2218719131333')).rejects.toThrow('boom')
  })

  it('无 uid 时用个人中心的 fullAvatar 兜底', async () => {
    mtopCall.mockImplementation(async ({ api }) => (
      isCenter(api)
        ? { data: { account: { snsNick: 'laurensZero', fullAvatar: '//img.alicdn.com/xx.png' } } }
        : { data: {} }
    ))
    const profile = await fetchTaobaoAccountProfile('')
    expect(profile.nickname).toBe('laurensZero')
    expect(profile.avatarUrl).toBe('https://img.alicdn.com/xx.png')
  })
})
