import { describe, it, expect } from 'vitest'
import {
  normalizeBirthdayKey,
  buildBirthdayIndex,
  matchBirthdayRow,
  isBirthdayOnDate
} from '../birthday'

const ROWS = [
  { name: '胡桃', ip: '原神', ipAliases: ['Genshin Impact'], aliases: ['Hu Tao'], month: 7, day: 15 },
  { name: '木之本樱', ip: '魔卡少女樱', ipAliases: ['Cardcaptor Sakura'], aliases: ['小樱'], month: 4, day: 1 },
  { name: '春野樱', ip: '火影忍者', ipAliases: ['NARUTO'], aliases: ['小樱'], month: 3, day: 28 },
  { name: '初音未来', ip: 'VOCALOID', ipAliases: ['初音家族'], aliases: ['初音ミク', 'Hatsune Miku'], month: 8, day: 31 }
]

describe('normalizeBirthdayKey', () => {
  it('小写并去除空白', () => {
    expect(normalizeBirthdayKey(' Hu Tao ')).toBe('hutao')
    expect(normalizeBirthdayKey('胡桃')).toBe('胡桃')
    expect(normalizeBirthdayKey('')).toBe('')
    expect(normalizeBirthdayKey(null)).toBe('')
  })
})

describe('matchBirthdayRow', () => {
  const index = buildBirthdayIndex(ROWS)

  it('本名 + IP 精确命中', () => {
    const row = matchBirthdayRow(index, { name: '胡桃', ip: '原神' })
    expect(row?.month).toBe(7)
  })

  it('别名命中（忽略大小写与空格）', () => {
    const row = matchBirthdayRow(index, { name: 'hu tao', ip: 'genshin impact' })
    expect(row?.name).toBe('胡桃')
  })

  it('IP 别名参与消歧', () => {
    const row = matchBirthdayRow(index, { name: '初音ミク', ip: '初音家族' })
    expect(row?.name).toBe('初音未来')
  })

  it('IP 不匹配时不命中', () => {
    expect(matchBirthdayRow(index, { name: '胡桃', ip: '崩坏3' })).toBeNull()
  })

  it('IP 为空且名字唯一时命中', () => {
    const row = matchBirthdayRow(index, { name: '胡桃', ip: '' })
    expect(row?.name).toBe('胡桃')
  })

  it('IP 为空且重名（别名歧义）时放弃匹配', () => {
    expect(matchBirthdayRow(index, { name: '小樱', ip: '' })).toBeNull()
  })

  it('重名别名可用 IP 消歧', () => {
    const row = matchBirthdayRow(index, { name: '小樱', ip: '火影忍者' })
    expect(row?.name).toBe('春野樱')
  })

  it('未知名字不命中', () => {
    expect(matchBirthdayRow(index, { name: '不存在', ip: '' })).toBeNull()
  })
})

describe('isBirthdayOnDate', () => {
  it('月日相同为生日', () => {
    expect(isBirthdayOnDate(7, 15, new Date(2026, 6, 15))).toBe(true)
    expect(isBirthdayOnDate(7, 15, new Date(2026, 6, 14))).toBe(false)
  })

  it('2/29 闰年当天触发', () => {
    expect(isBirthdayOnDate(2, 29, new Date(2028, 1, 29))).toBe(true)
    expect(isBirthdayOnDate(2, 29, new Date(2028, 1, 28))).toBe(false)
  })

  it('2/29 平年顺延到 2/28', () => {
    expect(isBirthdayOnDate(2, 29, new Date(2026, 1, 28))).toBe(true)
    expect(isBirthdayOnDate(2, 29, new Date(2026, 2, 1))).toBe(false)
  })

  it('世纪年闰年规则（2100 平年）', () => {
    expect(isBirthdayOnDate(2, 29, new Date(2100, 1, 28))).toBe(true)
    expect(isBirthdayOnDate(2, 29, new Date(2000, 1, 28))).toBe(false)
  })
})
