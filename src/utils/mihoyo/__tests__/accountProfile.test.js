import { describe, expect, it } from 'vitest'
import { pickProfile } from '../accountProfile'
import {
  formatMihoyoAccountLabel,
  isAutoMihoyoAccountLabel,
  parseMihoyoAccountId,
} from '../cookie'

describe('米游铺账号昵称/头像标签', () => {
  it('解析 UID 并识别自动标签', () => {
    const cookie = 'account_id_v2=301532617; ltoken_v2=x'
    const uid = parseMihoyoAccountId(cookie)
    expect(uid).toBe('301532617')
    expect(formatMihoyoAccountLabel(uid)).toBe('账号 3015…2617')
    expect(isAutoMihoyoAccountLabel(formatMihoyoAccountLabel(uid), uid)).toBe(true)
    expect(isAutoMihoyoAccountLabel('laurensZero', uid)).toBe(false)
  })
})

describe('user/info 响应解析', () => {
  it('提取 nickname 与 avatar_url', () => {
    const profile = pickProfile({
      retcode: 0,
      message: 'OK',
      data: {
        uid: '301532617',
        nickname: 'laurensZero',
        avatar_url: 'https://bbs-static.miyoushe.com/static/demo.png',
        introduce: '这个人很懒'
      }
    })
    expect(profile).toEqual({
      nickname: 'laurensZero',
      avatarUrl: 'https://bbs-static.miyoushe.com/static/demo.png',
      uid: '301532617'
    })
  })

  it('retcode 非 0 或空 data 时返回 null', () => {
    expect(pickProfile({ retcode: -100, message: '登录失效' })).toBeNull()
  })
})
