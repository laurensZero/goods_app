const DAY_MS = 86400000

export const COUNTDOWN_STATUS = {
  ONGOING: 'ongoing',
  UPCOMING: 'upcoming',
  PAST: 'past',
  UNDATED: 'undated'
}

const DATE_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})/

export function parseEventDate(dateStr) {
  const value = String(dateStr || '').trim()
  const match = DATE_PATTERN.exec(value)
  if (!match) return null

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return null
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null
  }
  return date
}

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function diffInDays(earlier, later) {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS)
}

// 状态判定：今天 < start → upcoming；start ≤ 今天 ≤ end → ongoing；今天 > end → past
export function computeCountdown(event, now = new Date()) {
  const start = parseEventDate(event?.startDate)
  if (!start) {
    return { status: COUNTDOWN_STATUS.UNDATED, days: 0, endsInDays: -1 }
  }

  const end = parseEventDate(event?.endDate) || start
  const today = startOfToday(now)

  if (today.getTime() < start.getTime()) {
    return { status: COUNTDOWN_STATUS.UPCOMING, days: diffInDays(today, start), endsInDays: -1 }
  }

  if (today.getTime() > end.getTime()) {
    return { status: COUNTDOWN_STATUS.PAST, days: diffInDays(end, today), endsInDays: -1 }
  }

  return {
    status: COUNTDOWN_STATUS.ONGOING,
    days: diffInDays(start, today) + 1,
    endsInDays: diffInDays(today, end)
  }
}

function tierOf(status) {
  switch (status) {
    case COUNTDOWN_STATUS.ONGOING: return 0
    case COUNTDOWN_STATUS.UPCOMING: return 1
    case COUNTDOWN_STATUS.PAST: return 2
    default: return 3
  }
}

function compareById(a, b) {
  return String(a.event?.id || '').localeCompare(String(b.event?.id || ''))
}

function eventTimeMs(entry, field) {
  const date = parseEventDate(entry.event?.[field])
  return date ? date.getTime() : 0
}

// 智能排序：进行中(先结束在前) → 未开始(剩余少在前) → 已结束(刚结束在前) → 无日期垫底
export function compareCountdownEntries(a, b) {
  const tierDiff = tierOf(a.status) - tierOf(b.status)
  if (tierDiff !== 0) return tierDiff

  if (a.status === COUNTDOWN_STATUS.UNDATED) {
    const createdDiff = (b.event?.createdAt || 0) - (a.event?.createdAt || 0)
    if (createdDiff !== 0) return createdDiff
    return compareById(a, b)
  }

  if (a.status === COUNTDOWN_STATUS.UPCOMING) {
    const diff = eventTimeMs(a, 'startDate') - eventTimeMs(b, 'startDate')
    if (diff !== 0) return diff
  } else {
    const diff = eventTimeMs(b, 'endDate') - eventTimeMs(a, 'endDate')
    if (diff !== 0) return a.status === COUNTDOWN_STATUS.PAST ? diff : -diff
  }
  return compareById(a, b)
}

export function buildCountdownList(events, now = new Date()) {
  const list = (Array.isArray(events) ? events : []).map((event) => ({
    event,
    ...computeCountdown(event, now)
  }))
  return list.sort(compareCountdownEntries)
}
