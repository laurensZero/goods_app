// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildImportFormPatch,
  collectSessionSelection,
  consumeImportPrefill,
  EVENT_IMPORT_PREFILL_KEY,
  saveImportPrefill
} from '../eventImportPrefill'

afterEach(() => {
  sessionStorage.clear()
})

describe('saveImportPrefill / consumeImportPrefill', () => {
  it('存取往返一致，读取后即删除', () => {
    const payload = { title: 'x', dates: ['2026-11-27'], dayTickets: {} }
    saveImportPrefill(payload)
    expect(JSON.parse(sessionStorage.getItem(EVENT_IMPORT_PREFILL_KEY))).toEqual(payload)
    expect(consumeImportPrefill()).toEqual(payload)
    expect(sessionStorage.getItem(EVENT_IMPORT_PREFILL_KEY)).toBeNull()
    expect(consumeImportPrefill()).toBeNull()
  })

  it('损坏的 JSON 返回 null 并清理', () => {
    sessionStorage.setItem(EVENT_IMPORT_PREFILL_KEY, '{broken')
    expect(consumeImportPrefill()).toBeNull()
    expect(sessionStorage.getItem(EVENT_IMPORT_PREFILL_KEY)).toBeNull()
  })
})

describe('collectSessionSelection', () => {
  const rows = [
    {
      date: '2026-11-27',
      tickets: [{ name: '普通席', price: '598.00' }, { name: '内场席', price: '798.00' }],
      ticketIndex: 1
    },
    {
      date: '2026-11-28',
      tickets: [{ name: '普通席', price: '598.00' }],
      ticketIndex: -1
    },
    {
      date: '2026-11-29',
      tickets: [],
      ticketIndex: -1
    }
  ]

  it('选了票档就导入该日期，未选的不导入', () => {
    const { dates, dayTickets } = collectSessionSelection(rows)
    expect(dates).toEqual(['2026-11-27', '2026-11-29'])
    expect(dayTickets).toEqual({ '2026-11-27': { price: '798.00', ticketType: '内场席' } })
  })

  it('取消票档后该日期不再导入', () => {
    const { dates } = collectSessionSelection([{ ...rows[0], ticketIndex: -1 }])
    expect(dates).toEqual([])
  })

  it('无票档数据的场次只填日期；非法行被忽略', () => {
    const { dates, dayTickets } = collectSessionSelection([
      { date: '2026-11-30', tickets: [] },
      { date: 'bad-date', tickets: [{ name: 'x', price: '1' }], ticketIndex: 0 },
      null
    ])
    expect(dates).toEqual(['2026-11-30'])
    expect(dayTickets).toEqual({})
  })
})

describe('buildImportFormPatch', () => {
  it('无有效内容返回 null', () => {
    expect(buildImportFormPatch(null)).toBeNull()
    expect(buildImportFormPatch({})).toBeNull()
    expect(buildImportFormPatch({ dates: [], dayTickets: {} })).toBeNull()
  })

  it('未选场次时只填名称/地点/封面', () => {
    const patch = buildImportFormPatch({ title: '音乐会', location: '文化中心', coverUrl: 'https://cdn/c.jpg' })
    expect(patch).toEqual({ name: '音乐会', location: '文化中心', coverImage: 'https://cdn/c.jpg' })
  })

  it('单天活动：票价走 ticketPrice + ticketType', () => {
    const patch = buildImportFormPatch({
      title: '音乐会',
      dates: ['2026-11-27'],
      dayTickets: { '2026-11-27': { price: 198, ticketType: '快速入场券' } }
    })
    expect(patch.dates).toEqual(['2026-11-27'])
    expect(patch.ticketPrice).toBe('198')
    expect(patch.ticketType).toBe('快速入场券')
    expect(patch.dayTicketList).toBeUndefined()
  })

  it('单天活动未选票种：只填日期', () => {
    const patch = buildImportFormPatch({ dates: ['2026-11-27'], dayTickets: {} })
    expect(patch.dates).toEqual(['2026-11-27'])
    expect(patch.ticketPrice).toBeUndefined()
  })

  it('多天活动：dayTicketList 与 dates 下标对齐，未选票种留空行', () => {
    const patch = buildImportFormPatch({
      dates: ['2026-11-29', '2026-11-27', '2026-11-27'],
      dayTickets: { '2026-11-27': { price: '198.5', ticketType: '普通入场券' } }
    })
    // 去重 + 升序
    expect(patch.dates).toEqual(['2026-11-27', '2026-11-29'])
    expect(patch.dayTicketList).toEqual([
      { price: '198.5', ticketType: '普通入场券' },
      { price: '', ticketType: '' }
    ])
    expect(patch.ticketPrice).toBeUndefined()
  })

  it('非法价格/日期被过滤，日期截断到 31 天', () => {
    const dates = Array.from({ length: 40 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    const dayTickets = Object.fromEntries(dates.map((d) => [d, { price: -5, ticketType: 'x' }]))
    const patch = buildImportFormPatch({ dates, dayTickets })
    expect(patch.dates).toHaveLength(31)
    // 非法价格归一为空
    expect(patch.dayTicketList.every((row) => row.price === '' && row.ticketType === 'x')).toBe(true)
  })
})
