// src/stores/survey.js
// Pinia store for survey state — fetch from Supabase, track completion locally

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { fetchSurveys, normalizeSurvey, hasCompletedSurvey, evaluateConditions } from '@/services/surveyService'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import packageJson from '../../package.json'
import { compareVersions, normalizeVersionTag } from '@/utils/github/release'

const COMPLETED_STORAGE_KEY = 'goods_survey_completed'

const FALLBACK_VERSION = normalizeVersionTag(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')

function readCompletedIds() {
  try {
    const raw = localStorage.getItem(COMPLETED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

function persistCompletedIds(ids) {
  try {
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function todayKey(date = new Date()) {
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const POPUP_RECORD_KEY = 'goods_survey_popup_record'

function readPopupRecord() {
  try {
    const raw = localStorage.getItem(POPUP_RECORD_KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch { return {} }
}

function persistPopupRecord(record) {
  try { localStorage.setItem(POPUP_RECORD_KEY, JSON.stringify(record || {})) } catch {}
}

function matchesVersion(current, rule) {
  if (!rule?.hasConstraint) return true
  const normalized = normalizeVersionTag(current || '')
  if (!normalized) return false
  if (rule.exact && compareVersions(normalized, rule.exact) !== 0) return false
  if (rule.min && compareVersions(normalized, rule.min) < 0) return false
  if (rule.max && compareVersions(normalized, rule.max) > 0) return false
  return true
}

export const useSurveyStore = defineStore('survey', () => {
  const surveys = ref([])
  const completedIds = ref(readCompletedIds())
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const error = ref('')

  const availableSurveys = computed(() =>
    surveys.value.filter(s => s.enabled && !completedIds.value.has(s.id))
  )

  const completedSurveys = computed(() =>
    surveys.value.filter(s => completedIds.value.has(s.id))
  )

  function getSurveyById(id) {
    return surveys.value.find(s => s.id === id) || null
  }

  function isCompleted(surveyId) {
    return completedIds.value.has(surveyId)
  }

  function markCompleted(surveyId) {
    completedIds.value = new Set([...completedIds.value, surveyId])
    persistCompletedIds(completedIds.value)
  }

  async function loadSurveys() {
    if (isLoading.value) return
    isLoading.value = true
    error.value = ''

    try {
      const raw = await fetchSurveys()
      const normalized = raw.map(normalizeSurvey).filter(Boolean)
      surveys.value = normalized
      isLoaded.value = true

      // Background: check remote completion status for surveys we think are completed
      checkRemoteCompletion(normalized)
    } catch (e) {
      error.value = e?.message || 'Failed to load surveys'
      console.error('[survey] loadSurveys failed:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function checkRemoteCompletion(allSurveys) {
    for (const survey of allSurveys) {
      if (completedIds.value.has(survey.id)) continue
      try {
        const done = await hasCompletedSurvey(survey.id)
        if (done) {
          markCompleted(survey.id)
        }
      } catch (e) {
        console.warn('[survey] remote check failed for', survey.id, e?.message)
      }
    }
  }

  async function evaluateShowRules() {
    let appVersion = FALLBACK_VERSION
    let bundleVersion = ''
    let channel = 'stable'

    try {
      if (Capacitor.isNativePlatform()) {
        const info = await CapacitorApp.getInfo()
        appVersion = normalizeVersionTag(info?.version || FALLBACK_VERSION) || FALLBACK_VERSION
        try {
          const bundleInfo = await CapacitorUpdater.current()
          bundleVersion = normalizeVersionTag(bundleInfo?.bundle?.version || '')
        } catch { /* ignore */ }
      } else {
        bundleVersion = FALLBACK_VERSION
      }
    } catch { /* ignore */ }

    try {
      const raw = localStorage.getItem('goods_web_update_channel')
      if (raw === 'beta') channel = 'beta'
    } catch { /* ignore */ }

    const now = Date.now()
    const today = todayKey(new Date(now))

    return surveys.value.filter(survey => {
      if (!survey.enabled) return false
      if (completedIds.value.has(survey.id)) return false

      const rule = survey.showRule
      if (rule.startAt > 0 && now < rule.startAt) return false
      if (rule.endAt > 0 && now > rule.endAt) return false
      if (rule.channels.length > 0 && !rule.channels.includes(channel)) return false

      const showMode = rule.showMode || 'once'
      if (showMode === 'once') {
        return true
      }
      if (showMode === 'every_enter') return true
      return true
    })
  }

  // ── Popup support ──
  // Once a user closes the popup for a survey, it never pops up again.
  // They can still access it from the manage page.
  async function getPopupSurveys() {
    const popupRecord = readPopupRecord()
    const now = Date.now()

    const candidates = []
    for (const survey of surveys.value) {
      if (!survey.enabled) continue
      if (completedIds.value.has(survey.id)) continue
      if (popupRecord[survey.id]?.dismissed) continue

      const rule = survey.showRule
      if (rule.startAt > 0 && now < rule.startAt) continue
      if (rule.endAt > 0 && now > rule.endAt) continue

      // Evaluate conditions
      if (rule.conditions.length > 0) {
        const met = await evaluateConditions(rule.conditions, rule.logic)
        if (!met) continue
      }

      candidates.push(survey)
    }
    return candidates
  }

  function markPopupShown(surveyId) {
    if (!surveyId) return
    const record = readPopupRecord()
    const currentVersion = FALLBACK_VERSION
    record[surveyId] = {
      ...record[surveyId],
      lastShownAt: new Date().toISOString(),
      lastShownDay: todayKey(),
      version: currentVersion,
      dismissed: true
    }
    persistPopupRecord(record)
  }

  return {
    surveys,
    completedIds,
    isLoading,
    isLoaded,
    error,
    availableSurveys,
    completedSurveys,
    getSurveyById,
    isCompleted,
    markCompleted,
    loadSurveys,
    evaluateShowRules,
    getPopupSurveys,
    markPopupShown
  }
})
