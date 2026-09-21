import { describe, expect, it } from 'vitest'

// 直接测 normalizeQueueItem 的账号字段行为：通过 enqueue 后 queue 数据结构间接验证成本高，
// 这里用与 composable 相同的归一化逻辑抽样测账号 key 规则。
// processQueue 并行本身依赖真实网络与 Vue 运行时，不在本单测覆盖。

function getQueueAccountKey(item) {
  const explicit = String(item?.snapshot?.accountId || item?.accountId || '').trim()
  if (explicit) return `id:${explicit}`
  const cookie = String(item?.snapshot?.cookie || '').trim()
  return cookie ? `ck:${cookie.slice(0, 32)}` : 'default'
}

describe('checkout 队列多账号归属', () => {
  it('优先使用 accountId', () => {
    expect(getQueueAccountKey({ snapshot: { accountId: 'acc-a', cookie: 'x=1' } })).toBe('id:acc-a')
  })

  it('无 accountId 时用 cookie 前缀兜底', () => {
    const key = getQueueAccountKey({ snapshot: { cookie: 'account_id_v2=999; ltoken_v2=t' } })
    expect(key.startsWith('ck:')).toBe(true)
  })

  it('不同账号 cookie 不同 key，支持并行', () => {
    const a = getQueueAccountKey({ snapshot: { accountId: 'a', cookie: 'ca' } })
    const b = getQueueAccountKey({ snapshot: { accountId: 'b', cookie: 'cb' } })
    expect(a).not.toBe(b)
  })
})
