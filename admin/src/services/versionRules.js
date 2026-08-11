import { supabaseRequest } from './supabase'

export function normalizeHttpsUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return ''
    return parsed.href
  } catch {
    return ''
  }
}

export function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

// ── 版本比较 ──

export function compareAppVersionDesc(left, right) {
  const normalize = (value) => String(value || '').trim().replace(/^v/i, '')
  const leftParts = normalize(left).split(/[^0-9a-zA-Z]+/).filter(Boolean)
  const rightParts = normalize(right).split(/[^0-9a-zA-Z]+/).filter(Boolean)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftToken = leftParts[index] || '0'
    const rightToken = rightParts[index] || '0'
    const leftNumber = Number(leftToken)
    const rightNumber = Number(rightToken)
    const leftIsNumber = Number.isFinite(leftNumber)
    const rightIsNumber = Number.isFinite(rightNumber)

    if (leftIsNumber && rightIsNumber && leftNumber !== rightNumber) {
      return rightNumber - leftNumber
    }
    const textCompare = rightToken.localeCompare(leftToken, 'zh-CN', { sensitivity: 'base' })
    if (textCompare !== 0) return textCompare
  }
  return 0
}

export function compareBundleVersionDesc(left, right) {
  const parse = (value) => {
    const matched = String(value || '').trim().match(/(\d{8})\.(\d+)/)
    if (!matched) return { day: 0, seq: 0 }
    return { day: Number(matched[1]), seq: Number(matched[2]) }
  }
  const leftParsed = parse(left)
  const rightParsed = parse(right)
  if (leftParsed.day !== rightParsed.day) return rightParsed.day - leftParsed.day
  if (leftParsed.seq !== rightParsed.seq) return rightParsed.seq - leftParsed.seq
  return String(right || '').localeCompare(String(left || ''), 'zh-CN', { sensitivity: 'base' })
}

export function extractAppVersionCandidates(rawText) {
  const source = String(rawText || '')
  const matches = source.match(/\bv?\d+\.\d+\.\d+(?:[-+._][0-9A-Za-z]+)*\b/g) || []
  return matches
    .map((entry) => String(entry || '').trim().replace(/^v/i, ''))
    .filter(Boolean)
}

export function extractBundleVersionCandidates(rawText) {
  const source = String(rawText || '')
  const matches = source.match(/\b\d{8}\.\d+\b/g) || []
  return matches.map((entry) => String(entry || '').trim()).filter(Boolean)
}

// ── 版本条件（表单 <-> 存储）──

export function normalizeVersionRuleForForm(ruleSource, legacyExact, legacyMin, legacyMax) {
  const source = ruleSource && typeof ruleSource === 'object' ? ruleSource : {}
  const exact = String(source.exact || legacyExact || '').trim()
  const min = String(source.min || legacyMin || '').trim()
  const max = String(source.max || legacyMax || '').trim()
  if (exact) return { mode: 'exact', value: exact }
  if (min) return { mode: 'gte', value: min }
  if (max) return { mode: 'lte', value: max }
  return { mode: 'any', value: '' }
}

export function buildVersionRuleFromForm(mode, value, label) {
  const normalizedMode = String(mode || 'any').trim()
  const normalizedValue = String(value || '').trim()
  if (normalizedMode === 'any') return null
  if (normalizedMode === 'exact') {
    if (!normalizedValue) throw new Error(`${label} 条件选择为等于时，请选择一个版本。`)
    return { exact: normalizedValue }
  }
  if (normalizedMode === 'gte') {
    if (!normalizedValue) throw new Error(`${label} 条件选择为大于等于时，最小值不能为空。`)
    return { min: normalizedValue }
  }
  if (normalizedMode === 'lte') {
    if (!normalizedValue) throw new Error(`${label} 条件选择为小于等于时，最大值不能为空。`)
    return { max: normalizedValue }
  }
  throw new Error(`${label} 条件无效。`)
}

// ── 用户列表（供 target user 选择器）──

let cachedUsers = []
let usersFetchPromise = null

export async function fetchUsersList() {
  if (cachedUsers.length) return cachedUsers
  if (usersFetchPromise) return usersFetchPromise
  const { getSupabaseConfig } = await import('./supabase')
  const config = getSupabaseConfig()
  const serviceKey = config.serviceKey || config.key

  usersFetchPromise = (async () => {
    try {
      const res = await fetch(`${config.url}/auth/v1/admin/users?page=1&per_page=200`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`获取用户列表失败（${res.status}）${detail ? '：' + detail : ''}`)
      }
      const payload = await res.json()
      const list = Array.isArray(payload?.users) ? payload.users : []
      cachedUsers = list.map(u => ({
        id: u.id,
        email: u.email || '',
        phone: u.phone || '',
        display: String(u.email || u.phone || u.id || '')
      }))
      return cachedUsers
    } catch (e) {
      usersFetchPromise = null
      throw e
    }
  })()
  return usersFetchPromise
}

export function clearUsersCache() {
  cachedUsers = []
  usersFetchPromise = null
}