import { onBeforeUnmount, reactive } from 'vue'
import {
  WEB_BUNDLE_WORKFLOW,
  APK_WORKFLOW,
  fetchWorkflowRunSnapshot,
  formatWorkflowStatus,
  formatFailureSummary,
  workflowRunUrl,
  isPostStepName,
  fetchJobLogs,
  formatJobLogsForDisplay
} from '../services/github'

const FIND_POLL_MS = 1500
const RUN_POLL_MS = 2500
const FIND_MAX_MS = 2 * 60 * 1000
const RUN_MAX_MS = 25 * 60 * 1000

function emptyLive(label) {
  return {
    label,
    active: false,
    phase: 'idle',
    runId: null,
    runNumber: '',
    statusLabel: '',
    statusTone: 'default',
    statusDetail: '',
    conclusion: '',
    jobs: [],
    failures: [],
    failureText: '',
    htmlUrl: '',
    error: '',
    startedAt: 0,
    expanded: {},
    logsByJob: {},
    logsLoading: {}
  }
}

function mapJobs(jobs) {
  return (jobs || []).map((j) => ({
    id: j.id,
    name: j.name || `Job ${j.id}`,
    status: j.status || '',
    conclusion: j.conclusion || '',
    htmlUrl: j.html_url || '',
    isPost: isPostStepName(j.name),
    steps: (j.steps || []).map((s) => ({
      name: s.name || `Step ${s.number}`,
      status: s.status || '',
      conclusion: s.conclusion || '',
      number: s.number,
      isPost: isPostStepName(s.name)
    }))
  }))
}

export function useWorkflowLive() {
  const bundle = reactive(emptyLive('Web Bundle'))
  const apk = reactive(emptyLive('APK'))
  const timers = { bundle: null, apk: null }

  function targetOf(kind) {
    return kind === 'apk' ? apk : bundle
  }

  function ensureJobUi(target, jobs, { autoOpen = true } = {}) {
    const expanded = { ...target.expanded }
    jobs.forEach((job) => {
      if (!autoOpen) return
      if (expanded[job.id] !== undefined) return
      const failed = job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'cancelled'
      const running = job.status === 'in_progress'
      expanded[job.id] = Boolean(failed || running)
    })
    target.expanded = expanded
  }

  function applyLive(target, snapshot, startedAt, { requireRecent = true } = {}) {
    const { found, run, jobs, failures } = snapshot
    if (!found) {
      if (!requireRecent || Date.now() - startedAt > FIND_MAX_MS) {
        target.phase = 'done'
        target.active = false
        target.error = requireRecent
          ? '未能在 Actions 中定位到本次运行，请打开 workflow 页面确认。'
          : '该 workflow 暂无 workflow_dispatch 运行记录。'
        target.statusLabel = requireRecent ? '未找到' : '暂无'
        target.statusTone = requireRecent ? 'error' : 'default'
        return { stop: true }
      }
      target.phase = 'finding'
      target.statusLabel = '等待调度'
      target.statusTone = 'warn'
      target.statusDetail = '正在定位本次 run…'
      return { stop: false }
    }

    const mapped = mapJobs(jobs)
    target.runId = run.id
    target.runNumber = String(run.run_number || '')
    target.htmlUrl = workflowRunUrl(run)
    target.conclusion = run.conclusion || ''
    target.jobs = mapped
    ensureJobUi(target, mapped, { autoOpen: run.status !== 'completed' })

    const status = formatWorkflowStatus(run, jobs)
    target.statusLabel = status.label
    target.statusTone = status.tone
    target.statusDetail = status.detail

    if (run.status === 'completed') {
      target.phase = 'done'
      target.active = false
      target.failures = failures || []
      target.failureText = run.conclusion === 'success' ? '' : formatFailureSummary(failures)
      target.error = ''
      const expanded = {}
      mapped.forEach((job) => {
        const failed = job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'cancelled'
        // 用户手动展开过的保持展开；否则失败展开、成功收起
        expanded[job.id] = target.expanded[job.id] === true ? true : failed
      })
      target.expanded = expanded
      return { stop: true }
    }

    target.phase = 'running'
    if (requireRecent && Date.now() - startedAt > RUN_MAX_MS) {
      target.phase = 'done'
      target.active = false
      target.error = '轮询超时，构建可能仍在运行，请打开 Actions 确认。'
      return { stop: true }
    }
    return { stop: false }
  }

  function stop(kind) {
    if (timers[kind]) {
      clearTimeout(timers[kind])
      timers[kind] = null
    }
  }

  function reset(kind) {
    stop(kind)
    Object.assign(targetOf(kind), emptyLive(targetOf(kind).label))
  }

  function toggleJob(kind, jobId) {
    const target = targetOf(kind)
    target.expanded = { ...target.expanded, [jobId]: !target.expanded[jobId] }
  }

  async function loadJobLogs(kind, jobId) {
    const target = targetOf(kind)
    target.logsLoading = { ...target.logsLoading, [jobId]: true }
    try {
      const raw = await fetchJobLogs(jobId)
      if (raw == null) {
        target.logsByJob = {
          ...target.logsByJob,
          [jobId]: { unavailable: true, text: '', errors: [] }
        }
      } else {
        target.logsByJob = {
          ...target.logsByJob,
          [jobId]: { unavailable: false, ...formatJobLogsForDisplay(raw) }
        }
      }
    } catch {
      target.logsByJob = {
        ...target.logsByJob,
        [jobId]: { unavailable: true, text: '', errors: [] }
      }
    } finally {
      target.logsLoading = { ...target.logsLoading, [jobId]: false }
    }
  }

  async function tick(kind, workflowId, startedAt, options = {}) {
    const target = targetOf(kind)
    if (!target.active) return
    try {
      const hasRun = Boolean(target.runId || options.runId)
      const snapshot = await fetchWorkflowRunSnapshot(workflowId, {
        runId: options.runId || target.runId,
        sinceMs: hasRun || options.afterRunNumber != null ? null : startedAt,
        afterRunNumber: options.afterRunNumber ?? null
      })
      const result = applyLive(target, snapshot, startedAt)
      if (typeof options.onUpdate === 'function') {
        options.onUpdate({ kind, live: target, snapshot })
      }
      if (result.stop) {
        stop(kind)
        if (typeof options.onDone === 'function') {
          options.onDone({ kind, live: target, snapshot })
        }
        return
      }
    } catch (e) {
      target.error = e?.message || '轮询失败'
    }
    if (!target.active) return
    const delay = !target.runId ? FIND_POLL_MS : RUN_POLL_MS
    timers[kind] = setTimeout(() => tick(kind, workflowId, startedAt, options), delay)
  }

  function start(kind, { workflowId, runId = null, afterRunNumber = null, onUpdate, onDone } = {}) {
    const wf = workflowId || (kind === 'apk' ? APK_WORKFLOW : WEB_BUNDLE_WORKFLOW)
    const target = targetOf(kind)
    stop(kind)
    Object.assign(target, emptyLive(target.label), {
      active: true,
      phase: 'finding',
      statusLabel: afterRunNumber != null ? '定位中' : '触发中',
      statusTone: 'warn',
      statusDetail:
        afterRunNumber != null
          ? `dispatch 已提交，等待 Run #>${afterRunNumber}…`
          : '已提交 workflow_dispatch',
      runId,
      startedAt: Date.now(),
      htmlUrl: '',
      expanded: {},
      logsByJob: {},
      logsLoading: {}
    })
    tick(kind, wf, target.startedAt, { runId, afterRunNumber, onUpdate, onDone })
  }

  async function loadLatestRun(kind, { onUpdate, onDone } = {}) {
    const wf = kind === 'apk' ? APK_WORKFLOW : WEB_BUNDLE_WORKFLOW
    const target = targetOf(kind)
    stop(kind)
    Object.assign(target, emptyLive(target.label), {
      active: true,
      phase: 'finding',
      statusLabel: '查询中',
      statusTone: 'warn',
      startedAt: Date.now(),
      expanded: {},
      logsByJob: {},
      logsLoading: {}
    })
    try {
      const snapshot = await fetchWorkflowRunSnapshot(wf, {
        runId: null,
        sinceMs: null,
        afterRunNumber: null
      })
      applyLive(target, snapshot, target.startedAt, { requireRecent: false })
      if (typeof onUpdate === 'function') onUpdate({ kind, live: target, snapshot })
      if (typeof onDone === 'function') onDone({ kind, live: target, snapshot })
    } catch (e) {
      target.phase = 'done'
      target.active = false
      target.statusLabel = '查询失败'
      target.statusTone = 'error'
      target.error = e?.message || '查询失败'
    }
  }

  onBeforeUnmount(() => {
    stop('bundle')
    stop('apk')
  })

  return { bundle, apk, start, stop, reset, loadLatestRun, toggleJob, loadJobLogs }
}
