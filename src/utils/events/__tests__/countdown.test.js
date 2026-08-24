import { describe, expect, it } from 'vitest'
import {
  buildCountdownList,
  compareCountdownEntries,
  computeCountdown,
  COUNTDOWN_STATUS,
  diffInDays,
  parseEventDate,
  startOfToday
} from '../countdown'

function at(y, m, d) {
  return new Date(y, m - 1, d)
}

// 固定「今天」为 2026-08-24
const NOW = at(2026, 8, 24)

describe('parseEventDate', () => {
  it('解析标准日期并归一到本地零点', () => {
    const date = parseEventDate('2026-08-24')
    expect(date).toEqual(at(2026, 8, 24))
  })

  it('忽略时间后缀', () => {
    expect(parseEventDate('2026-01-02T12:00:00Z')).toEqual(at(2026, 1, 2))
  })

  it('空值与非法格式返回 null', () => {
    expect(parseEventDate('')).toBeNull()
    expect(parseEventDate(null)).toBeNull()
    expect(parseEventDate('not-a-date')).toBeNull()
    expect(parseEventDate('2026/08/24')).toBeNull()
  })

  it('溢出日期返回 null', () => {
    expect(parseEventDate('2026-02-30')).toBeNull()
    expect(parseEventDate('2026-13-01')).toBeNull()
  })
})

describe('startOfToday / diffInDays', () => {
  it('startOfToday 归零时分秒', () => {
    const today = startOfToday(new Date(2026, 7, 24, 15, 42, 9))
    expect(today).toEqual(at(2026, 8, 24))
  })

  it('diffInDays 计算自然日差', () => {
    expect(diffInDays(at(2026, 8, 24), at(2026, 8, 31))).toBe(7)
    expect(diffInDays(at(2026, 8, 31), at(2026, 8, 24))).toBe(-7)
    // 跨夏令时风险用 Math.round 兜底，这里验证普通跨月
    expect(diffInDays(at(2026, 8, 1), at(2026, 9, 1))).toBe(31)
  })
})

describe('computeCountdown', () => {
  it('未来活动：还有 N 天', () => {
    const event = { startDate: '2026-09-01', endDate: '2026-09-03' }
    expect(computeCountdown(event, NOW)).toEqual({
      status: COUNTDOWN_STATUS.UPCOMING,
      days: 8,
      endsInDays: -1
    })
  })

  it('明天开始 days=1，今天开始且无结束日为进行中第 1 天', () => {
    expect(computeCountdown({ startDate: '2026-08-25' }, NOW).days).toBe(1)
    expect(computeCountdown({ startDate: '2026-08-24' }, NOW)).toEqual({
      status: COUNTDOWN_STATUS.ONGOING,
      days: 1,
      endsInDays: 0
    })
  })

  it('进行中：startDate 记第 1 天，endDate 当天 endsInDays=0', () => {
    const event = { startDate: '2026-08-22', endDate: '2026-08-26' }
    expect(computeCountdown(event, NOW)).toEqual({
      status: COUNTDOWN_STATUS.ONGOING,
      days: 3,
      endsInDays: 2
    })
    expect(computeCountdown({ startDate: '2026-08-24', endDate: '2026-08-24' }, NOW)).toEqual({
      status: COUNTDOWN_STATUS.ONGOING,
      days: 1,
      endsInDays: 0
    })
  })

  it('已结束：昨天结束 days=1', () => {
    expect(computeCountdown({ startDate: '2026-08-20', endDate: '2026-08-23' }, NOW)).toEqual({
      status: COUNTDOWN_STATUS.PAST,
      days: 1,
      endsInDays: -1
    })
  })

  it('endDate 缺失或非法时回退 startDate', () => {
    expect(computeCountdown({ startDate: '2026-08-20', endDate: '' }, NOW).status).toBe(
      COUNTDOWN_STATUS.PAST
    )
    expect(computeCountdown({ startDate: '2026-08-28', endDate: 'bad-date' }, NOW).status).toBe(
      COUNTDOWN_STATUS.UPCOMING
    )
  })

  it('无日期或非法日期为 undated', () => {
    expect(computeCountdown({}, NOW).status).toBe(COUNTDOWN_STATUS.UNDATED)
    expect(computeCountdown({ startDate: '' }, NOW).status).toBe(COUNTDOWN_STATUS.UNDATED)
    expect(computeCountdown({ startDate: '2026-02-31' }, NOW).status).toBe(COUNTDOWN_STATUS.UNDATED)
  })
})

describe('compareCountdownEntries / buildCountdownList', () => {
  const entries = (specs) =>
    specs.map(([id, startDate, endDate, createdAt]) => ({
      id,
      startDate,
      endDate,
      createdAt: createdAt || 0
    }))

  function ids(list) {
    return list.map((item) => item.event.id)
  }

  it('分层排序：进行中 → 未开始 → 已结束 → 无日期', () => {
    const list = buildCountdownList(
      entries([
        ['past', '2026-07-01', '2026-07-10'],
        ['undated', '', ''],
        ['upcoming', '2026-09-01', ''],
        ['ongoing', '2026-08-20', '2026-08-30']
      ]),
      NOW
    )
    expect(ids(list)).toEqual(['ongoing', 'upcoming', 'past', 'undated'])
  })

  it('进行中按结束日升序（先结束在前）', () => {
    const list = buildCountdownList(
      entries([
        ['ends-late', '2026-08-20', '2026-09-05'],
        ['ends-soon', '2026-08-18', '2026-08-25']
      ]),
      NOW
    )
    expect(ids(list)).toEqual(['ends-soon', 'ends-late'])
  })

  it('未开始按开始日升序', () => {
    const list = buildCountdownList(
      entries([
        ['far', '2026-12-01', ''],
        ['near', '2026-08-30', '']
      ]),
      NOW
    )
    expect(ids(list)).toEqual(['near', 'far'])
  })

  it('已结束按刚结束在前', () => {
    const list = buildCountdownList(
      entries([
        ['old', '2026-06-01', '2026-06-30'],
        ['recent', '2026-08-01', '2026-08-20']
      ]),
      NOW
    )
    expect(ids(list)).toEqual(['recent', 'old'])
  })

  it('同层并列时按 id 稳定排序', () => {
    const list = buildCountdownList(
      entries([
        ['b', '2026-09-01', ''],
        ['a', '2026-09-01', '']
      ]),
      NOW
    )
    expect(ids(list)).toEqual(['a', 'b'])
  })

  it('compareCountdownEntries 不修改入参顺序', () => {
    const events = entries([
      ['past', '2026-07-01', '2026-07-10'],
      ['upcoming', '2026-09-01', '']
    ])
    const withStatus = events.map((event) => ({ event, ...computeCountdown(event, NOW) }))
    compareCountdownEntries(withStatus[0], withStatus[1])
    expect(events[0].id).toBe('past')
  })
})
