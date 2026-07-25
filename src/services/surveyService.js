// src/services/surveyService.js
// Supabase-based survey CRUD, response submission, and condition evaluation

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { getDeviceId } from '@/utils/feedbackDevice'
import { readPersisted } from '@/utils/platform/storage'

const SURVEYS_TABLE = 'surveys'
const RESPONSES_TABLE = 'survey_responses'

function db() {
  return getSupabaseClient()
}

async function getRespondentId() {
  // Try to get user ID from Supabase auth (for cross-device tracking)
  try {
    const { data } = await db().auth.getSession()
    const userId = data?.session?.user?.id
    if (userId) return `user:${userId}`
  } catch {}
  // Fallback to device ID
  return `device:${getDeviceId()}`
}

/**
 * Fetch all enabled surveys from Supabase.
 */
export async function fetchSurveys() {
  const { data, error } = await db()
    .from(SURVEYS_TABLE)
    .select('id, title, description, questions, enabled, show_rule, created_at, updated_at')
    .eq('enabled', true)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to fetch surveys')
  return data || []
}

/**
 * Normalize a raw survey row from Supabase.
 */
export function normalizeSurvey(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '').trim()
  if (!id) return null

  const showRule = row.show_rule && typeof row.show_rule === 'object' ? row.show_rule : {}
  const questions = Array.isArray(row.questions) ? row.questions : []

  return {
    id,
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim(),
    image: String(row.image || '').trim(),
    questions: questions.map(normalizeQuestion).filter(Boolean),
    enabled: row.enabled !== false,
    showRule: {
      showMode: normalizeShowMode(showRule.showMode),
      startAt: parseTime(showRule.startAt),
      endAt: parseTime(showRule.endAt),
      channels: Array.isArray(showRule.channels)
        ? showRule.channels.map(c => String(c || '').trim().toLowerCase()).filter(Boolean)
        : ['stable', 'beta'],
      logic: ['and', 'or'].includes(showRule.logic) ? showRule.logic : 'and',
      conditions: Array.isArray(showRule.conditions)
        ? showRule.conditions.map(c => {
            if (typeof c === 'string') return { type: c }
            if (c && typeof c === 'object' && c.type) return { type: c.type, ...c }
            return null
          }).filter(Boolean)
        : []
    },
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  }
}

function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null
  const id = String(q.id || '').trim()
  if (!id) return null

  return {
    id,
    type: normalizeQuestionType(q.type),
    title: String(q.title || '').trim(),
    description: String(q.description || '').trim(),
    image: String(q.image || '').trim(),
    required: q.required === true,
    options: Array.isArray(q.options) ? q.options.filter(o => o && o.id) : [],
    minSelect: Number(q.minSelect) || 0,
    maxSelect: Number(q.maxSelect) || 0,
    placeholder: String(q.placeholder || '').trim(),
    maxLength: Number(q.maxLength) || 0,
    multiline: q.multiline === true,
    maxRating: Number(q.maxRating) || 5,
    labels: q.labels && typeof q.labels === 'object' ? q.labels : {},
    matrixType: normalizeMatrixType(q.matrixType),
    rows: Array.isArray(q.rows) ? q.rows.filter(r => r && r.id) : [],
    columns: Array.isArray(q.columns) ? q.columns.filter(c => c && c.id) : []
  }
}

function normalizeQuestionType(type) {
  const t = String(type || '').trim().toLowerCase()
  if (['single_choice', 'multiple_choice', 'text', 'rating', 'matrix'].includes(t)) return t
  return 'text'
}

function normalizeMatrixType(type) {
  const t = String(type || '').trim().toLowerCase()
  if (t === 'single_choice') return 'single_choice'
  return 'rating'
}

function normalizeShowMode(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['daily', 'per_version', 'every_enter'].includes(normalized)) return normalized
  return 'once'
}

function parseTime(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return timestamp
}

// ── Condition evaluation (same as announcements) ──

const EXECUTORS = {
  local: async (cond) => {
    try {
      const key = cond.key || ''
      if (!key) return false
      const stored = await readPersisted(key)
      if (cond.exists === false) return stored === null
      if (cond.exists === true) return stored !== null
      if (cond.equals !== undefined) return stored === String(cond.equals)
      return stored !== null
    } catch { return false }
  },

  sync_configured: async () => {
    try {
      const url = await readPersisted('sync_supabase_url')
      const key = await readPersisted('sync_supabase_anon_key')
      return !!(url && key)
    } catch { return false }
  },

  db: async (cond) => {
    try {
      const table = cond.table || ''
      if (!table) return false
      const client = getSupabaseClient()
      const op = cond.op || 'count>='
      const value = Number(cond.value) || 0

      const { count } = await client.from(table).select('id', { count: 'exact', head: true })
      const n = count || 0

      if (op === 'exists') return n > 0
      if (op === 'empty') return n === 0
      if (op === 'count>=') return n >= value
      if (op === 'count>') return n > value
      if (op === 'count=') return n === value
      if (op === 'count<') return n < value
      if (op === 'count<=') return n <= value
      return false
    } catch { return false }
  },

  flag: async (cond) => {
    try {
      const key = cond.key || ''
      if (!key) return false
      const stored = await readPersisted(key)
      return stored === String(cond.value)
    } catch { return false }
  }
}

export async function evaluateConditions(conditions, logic = 'and') {
  if (!conditions || !conditions.length) return true
  const results = await Promise.all(
    conditions.map(async (cond) => {
      const executor = EXECUTORS[cond.type]
      if (!executor) return true
      return executor(cond)
    })
  )
  if (logic === 'or') return results.some(Boolean)
  return results.every(Boolean)
}

/**
 * Submit a survey response to Supabase.
 */
export async function submitSurveyResponse(surveyId, answers) {
  const respondentId = await getRespondentId()
  const id = crypto.randomUUID()

  const row = {
    id,
    survey_id: surveyId,
    device_id: respondentId,
    answers: answers || [],
    submitted_at: new Date().toISOString()
  }

  const { data, error } = await db()
    .from(RESPONSES_TABLE)
    .insert(row)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to submit response')
  return data
}

/**
 * Check if the current device has already completed a survey.
 */
export async function hasCompletedSurvey(surveyId) {
  const respondentId = await getRespondentId()

  const { count, error } = await db()
    .from(RESPONSES_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('survey_id', surveyId)
    .eq('device_id', respondentId)

  if (error) return false
  return (count || 0) > 0
}
