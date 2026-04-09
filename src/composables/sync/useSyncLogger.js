import { ref } from 'vue'

const MAX_SYNC_LOGS = 160

function createSyncLogId() {
  return `sync-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getSyncNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }

  return Date.now()
}

function normalizeSyncLogText(value) {
  return String(value ?? '').trim()
}

export function useSyncLogger() {
  const syncLogs = ref([])

  function clearSyncLogs() {
    syncLogs.value = []
  }

  function appendSyncLog(entry) {
    const nextEntry = {
      id: createSyncLogId(),
      timestamp: new Date().toISOString(),
      status: normalizeSyncLogText(entry?.status) || 'success',
      level: normalizeSyncLogText(entry?.level) || 'info',
      title: normalizeSyncLogText(entry?.title),
      detail: normalizeSyncLogText(entry?.detail),
      durationMs: Number.isFinite(Number(entry?.durationMs)) ? Math.max(0, Math.round(Number(entry.durationMs))) : null,
      category: normalizeSyncLogText(entry?.category),
      finishedAt: normalizeSyncLogText(entry?.finishedAt)
    }

    syncLogs.value = [...syncLogs.value, nextEntry].slice(-MAX_SYNC_LOGS)
    return nextEntry.id
  }

  function updateSyncLog(logId, patch = {}) {
    if (!logId) return

    syncLogs.value = syncLogs.value.map((entry) => {
      if (entry.id !== logId) return entry

      const nextEntry = { ...entry }
      if (patch.title !== undefined) nextEntry.title = normalizeSyncLogText(patch.title)
      if (patch.detail !== undefined) nextEntry.detail = normalizeSyncLogText(patch.detail)
      if (patch.status !== undefined) nextEntry.status = normalizeSyncLogText(patch.status) || nextEntry.status
      if (patch.level !== undefined) nextEntry.level = normalizeSyncLogText(patch.level) || nextEntry.level
      if (patch.category !== undefined) nextEntry.category = normalizeSyncLogText(patch.category)
      if (patch.durationMs !== undefined) {
        const numericDuration = Number(patch.durationMs)
        nextEntry.durationMs = Number.isFinite(numericDuration) ? Math.max(0, Math.round(numericDuration)) : null
      }
      if (patch.timestamp !== undefined) nextEntry.timestamp = normalizeSyncLogText(patch.timestamp)
      if (patch.finishedAt !== undefined) nextEntry.finishedAt = normalizeSyncLogText(patch.finishedAt)

      return nextEntry
    })
  }

  async function trackSyncStep(title, task, options = {}) {
    const startedAt = getSyncNow()
    const logId = appendSyncLog({
      status: 'running',
      level: options.startLevel || 'info',
      title,
      detail: options.startDetail || '处理中...',
      category: options.category || ''
    })

    try {
      const result = await task()
      const durationMs = Math.max(0, Math.round(getSyncNow() - startedAt))
      const detail = typeof options.successDetail === 'function'
        ? options.successDetail(result, durationMs)
        : options.successDetail

      updateSyncLog(logId, {
        status: 'success',
        level: options.successLevel || 'success',
        detail: detail !== undefined ? detail : '',
        durationMs,
        finishedAt: new Date().toISOString()
      })
      return result
    } catch (error) {
      const durationMs = Math.max(0, Math.round(getSyncNow() - startedAt))
      const detail = typeof options.errorDetail === 'function'
        ? options.errorDetail(error, durationMs)
        : options.errorDetail

      updateSyncLog(logId, {
        status: 'error',
        level: options.errorLevel || 'error',
        detail: detail !== undefined ? detail : (error?.message || '同步失败'),
        durationMs,
        finishedAt: new Date().toISOString()
      })
      throw error
    }
  }

  return {
    syncLogs,
    clearSyncLogs,
    trackSyncStep
  }
}
