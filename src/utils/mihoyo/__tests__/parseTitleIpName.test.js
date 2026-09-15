import { describe, expect, it } from 'vitest'
import { cleanGoodsName, parseTitleIpName } from '../index'

describe('parseTitleIpName', () => {
  it('extracts a real IP from bracket prefix', () => {
    expect(parseTitleIpName('【原神】芙宁娜立牌')).toEqual({
      ip: '原神',
      name: '芙宁娜立牌',
    })
  })

  it('does not treat 特典 as IP', () => {
    expect(parseTitleIpName('【特典】流萤亚克力立牌')).toEqual({
      ip: '',
      name: '【特典】流萤亚克力立牌',
    })
  })

  it('does not treat other marketing prefixes as IP', () => {
    for (const prefix of ['赠品', '满赠', '预售', '现货', '包邮', '周边', '限定', '福袋']) {
      const result = parseTitleIpName(`【${prefix}】某周边`)
      expect(result.ip).toBe('')
    }
  })

  it('keeps quote-style IP extraction', () => {
    expect(parseTitleIpName('「崩坏：星穹铁道」星琼')).toEqual({
      ip: '崩坏：星穹铁道',
      name: '星琼',
    })
  })
})

describe('cleanGoodsName + parseTitleIpName mihoyo flow', () => {
  it('strips noise prefix after pseudo-IP rejection', () => {
    const { ip, name: rawName } = parseTitleIpName('【特典】流萤亚克力立牌')
    expect(ip).toBe('')
    expect(cleanGoodsName(rawName)).toBe('流萤亚克力立牌')
  })

  it('strips batch presale tags from product names', () => {
    expect(cleanGoodsName('【二批次预售】流萤立牌')).toBe('流萤立牌')
    expect(cleanGoodsName('【一批次预售】流萤立牌')).toBe('流萤立牌')
    expect(cleanGoodsName('流萤立牌【二批次预售】')).toBe('流萤立牌')
    expect(cleanGoodsName('流萤立牌一批次预售')).toBe('流萤立牌')
  })
})
