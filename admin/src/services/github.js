import { getGithubToken } from './supabase'

export const REPO_OWNER = 'laurenszero'
export const REPO_NAME = 'goods_app'
export const WEB_BUNDLE_WORKFLOW = 'publish-web-bundle.yml'
export const APK_WORKFLOW = 'build-apk.yml'

export async function requestGitHubApi(url, token = getGithubToken()) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(url, { method: 'GET', headers })
  if (!response.ok) throw new Error(`GitHub API 请求失败（${response.status}）。`)
  return response.json()
}

export async function dispatchWorkflow(workflowId, inputs = {}, token = getGithubToken()) {
  if (!token) throw new Error('请先填写 GitHub Token（需要 repo/workflow 权限）。')
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowId}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main', inputs })
    }
  )
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`触发失败：${response.status}${detail ? `，${detail}` : ''}`)
  }
}

export function workflowUrl(workflowId = WEB_BUNDLE_WORKFLOW) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowId}`
}

// ── beta 更新日志预览 ──

export function isLikelyNonUserFacingCommitTitle(title) {
  const lower = String(title || '').trim().toLowerCase()
  if (!lower) return true
  if (lower.startsWith('merge ')) return true
  if (lower.startsWith('chore:') || lower.startsWith('chore ') || lower.startsWith('chore(')) return true
  if (lower.includes('workflow') || lower.includes('.github/workflows')) return true
  return false
}

export function formatBetaNotesFromCommits(commits) {
  const entries = Array.isArray(commits) ? commits : []
  const lines = []
  entries.forEach((commit) => {
    const title = String(commit?.commit?.message || '').split('\n')[0].trim()
    if (isLikelyNonUserFacingCommitTitle(title)) return
    lines.push(`- ${title}`)
    const body = String(commit?.commit?.message || '')
      .split('\n')
      .slice(1)
      .map((line) => line.trimEnd())
      .filter(Boolean)
    body.forEach((line) => {
      lines.push(`  ${line}`)
    })
  })
  if (!lines.length) lines.push('- 本次更新无可用变更说明')
  return lines.join('\n')
}

export async function fetchRecentCommits(token = getGithubToken()) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=main&per_page=30`
  return requestGitHubApi(url, token)
}

// ── GitHub Actions 实时运行状态 ──

export async function listWorkflowDispatchRuns(workflowId, token = getGithubToken(), perPage = 10) {
  // 不带 order：GitHub 该接口默认按 created_at desc
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowId}/runs?event=workflow_dispatch&per_page=${perPage}`
  const data = await requestGitHubApi(url, token)
  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : []
}

/** dispatch 前取当前最新 run_number，之后用 > baseline 定位本次 run（比时间窗稳）。 */
export async function getLatestWorkflowRunNumber(workflowId, token = getGithubToken()) {
  const runs = await listWorkflowDispatchRuns(workflowId, token, 1)
  return Number(runs[0]?.run_number || 0)
}

export async function getWorkflowRun(runId, token = getGithubToken()) {
  return requestGitHubApi(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}`,
    token
  )
}

export async function listWorkflowRunJobs(runId, token = getGithubToken()) {
  const data = await requestGitHubApi(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}/jobs?per_page=20`,
    token
  )
  return Array.isArray(data?.jobs) ? data.jobs : []
}

/** dispatch 之后定位刚创建的 run：优先 run_number > baseline，回退时间窗。 */
export async function findWorkflowRunAfter(workflowId, { sinceMs = null, afterRunNumber = null } = {}, token = getGithubToken()) {
  const runs = await listWorkflowDispatchRuns(workflowId, token, 20)
  if (afterRunNumber != null && afterRunNumber > 0) {
    const newer = runs
      .filter((r) => Number(r.run_number) > Number(afterRunNumber))
      .sort((a, b) => Number(a.run_number) - Number(b.run_number))
    if (newer.length) return newer[0]
    return null
  }
  if (sinceMs == null) return runs[0] || null
  const slackMs = 120 * 1000
  const matched = runs.filter((r) => new Date(r.created_at).getTime() >= sinceMs - slackMs)
  if (!matched.length) return null
  matched.sort((a, b) => Number(b.run_number) - Number(a.run_number))
  return matched[0]
}

export function isPostStepName(name) {
  return /^Post\s/i.test(String(name || '').trim())
}

export function jobProgress(job) {
  const steps = (job?.steps || []).filter((s) => !isPostStepName(s.name))
  if (!steps.length) return { done: 0, total: 0, failed: 0, active: '' }
  let done = 0
  let failed = 0
  let active = ''
  steps.forEach((s) => {
    if (s.conclusion === 'success' || s.conclusion === 'skipped') done += 1
    else if (s.conclusion === 'failure' || s.conclusion === 'timed_out') failed += 1
    else if (s.status === 'in_progress') active = s.name
  })
  return { done, total: steps.length, failed, active }
}

/** run 已 completed 时，把 job/step 对齐到终态，避免 job 仍显示「进行中」。 */
export function normalizeJobsForRun(run, jobs = []) {
  const list = Array.isArray(jobs) ? jobs : []
  if (!run || run.status !== 'completed') return list
  const runConclusion = run.conclusion || 'success'
  return list.map((job) => {
    const steps = (job.steps || []).map((step) => {
      if (step.status === 'completed') return step
      const conclusion = step.conclusion || (runConclusion === 'success' ? 'success' : runConclusion)
      return { ...step, status: 'completed', conclusion }
    })
    const conclusion = job.conclusion || (runConclusion === 'success' ? 'success' : runConclusion)
    return { ...job, status: 'completed', conclusion, steps }
  })
}

/** 拉取 job 完整日志（浏览器可能因 CORS 失败，失败返回 null）。 */
export async function fetchJobLogs(jobId, token = getGithubToken()) {
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/jobs/${jobId}/logs`,
      { headers, redirect: 'follow' }
    )
    if (!res.ok) return null
    const text = await res.text()
    return text || ''
  } catch {
    return null
  }
}

/** 日志展示用：按 step 标记切分 + 保留错误行；取末尾避免过长。 */
export function formatJobLogsForDisplay(raw, { maxLines = 80 } = {}) {
  if (!raw) return { text: '', errors: [] }
  const lines = String(raw).split(/\r?\n/)
  const errors = extractErrorLines(raw)
  // 去掉 GitHub 日志里冗长的时间戳前缀，保留 step 分组标题
  const cleaned = lines
    .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z\s/, ''))
    .filter((line) => line.trim() !== '')
  const tail = cleaned.slice(-maxLines)
  return { text: tail.join('\n'), errors }
}

export function extractErrorLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const hits = []
  for (const line of lines) {
    if (/##\[error\]/i.test(line) || /::error::/.test(line)) {
      const msg = line
        .replace(/^.*##\[error\]\s*/i, '')
        .replace(/^.*::error::\s*/, '')
        .trim()
      if (msg) hits.push(msg)
    }
  }
  if (hits.length) return [...new Set(hits)].slice(0, 6)
  return lines.slice(-4)
}

export function summarizeWorkflowFailures(jobs, annotationsByJob = {}, logErrorsByJob = {}) {
  const failed = (jobs || []).filter(
    (j) => j.conclusion === 'failure' || j.conclusion === 'timed_out' || j.conclusion === 'cancelled'
  )
  return failed.map((job) => {
    const steps = (job.steps || [])
      .filter((s) => s.conclusion === 'failure' || s.conclusion === 'timed_out')
      .map((s) => s.name)
      .filter(Boolean)
    const anns = annotationsByJob[job.name] || []
    const annMsgs = anns
      .filter((a) => a && (a.annotation_level === 'failure' || a.annotation_level === 'warning'))
      .map((a) => String(a.message || '').trim())
      .filter(Boolean)
    const logMsgs = logErrorsByJob[job.id] || []
    const messages = [...new Set([...annMsgs, ...logMsgs])].slice(0, 6)
    return {
      jobId: job.id,
      job: job.name || `Job ${job.id}`,
      conclusion: job.conclusion || '',
      steps,
      messages,
      htmlUrl: job.html_url || ''
    }
  })
}

async function fetchCheckRunAnnotationsByJob(headSha, token) {
  const byJob = {}
  if (!headSha) return byJob
  try {
    const data = await requestGitHubApi(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${headSha}/check-runs?per_page=100`,
      token
    )
    const runs = Array.isArray(data?.check_runs) ? data.check_runs : []
    for (const cr of runs) {
      if (!cr.conclusion || cr.conclusion === 'success') continue
      if (!cr.annotations_url) continue
      try {
        const anns = await requestGitHubApi(cr.annotations_url, token)
        if (Array.isArray(anns) && anns.length) {
          const key = cr.name || 'unknown'
          byJob[key] = (byJob[key] || []).concat(anns)
        }
      } catch {
        // annotations 拉取失败不影响主流程
      }
    }
  } catch {
    // check-runs 不可用时退化为步骤名
  }
  return byJob
}

async function fetchJobLogErrors(jobId, token) {
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/jobs/${jobId}/logs`,
      { headers, redirect: 'follow' }
    )
    // 日志重定向到对象存储时可能因 CORS 失败；失败则静默降级
    if (!res.ok) return []
    const text = await res.text()
    return extractErrorLines(text)
  } catch {
    return []
  }
}

/**
 * 拉取 run 的实时快照：状态 + 各 job/step + 失败原因。
 * 失败原因优先 annotations（::error::），再尝试 job logs，最后退化为失败步骤名。
 */
export async function fetchWorkflowRunSnapshot(
  workflowId,
  { runId = null, sinceMs = null, afterRunNumber = null } = {},
  token = getGithubToken()
) {
  if (!token) throw new Error('请先填写 GitHub Token（需要 workflow/actions 读取权限）。')

  let run = null
  if (runId) {
    run = await getWorkflowRun(runId, token)
  } else if (afterRunNumber != null || sinceMs != null) {
    run = await findWorkflowRunAfter(workflowId, { sinceMs, afterRunNumber }, token)
  } else {
    const runs = await listWorkflowDispatchRuns(workflowId, token, 1)
    run = runs[0] || null
  }
  if (!run) return { found: false, run: null, jobs: [], failures: [] }

  let jobs = await listWorkflowRunJobs(run.id, token)
  jobs = normalizeJobsForRun(run, jobs)

  let failures = []
  if (run.status === 'completed' && run.conclusion && run.conclusion !== 'success') {
    const annotationsByJob = await fetchCheckRunAnnotationsByJob(run.head_sha, token)
    const logErrorsByJob = {}
    const failedJobs = jobs.filter((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out' || j.conclusion === 'cancelled')
    await Promise.all(
      failedJobs.map(async (job) => {
        const errs = await fetchJobLogErrors(job.id, token)
        if (errs.length) logErrorsByJob[job.id] = errs
      })
    )
    failures = summarizeWorkflowFailures(jobs, annotationsByJob, logErrorsByJob)
  }

  return { found: true, run, jobs, failures }
}

export function formatWorkflowStatus(run, jobs = []) {
  if (!run) return { label: '等待触发', tone: 'default', detail: '' }
  if (run.status === 'queued' || run.status === 'waiting' || run.status === 'requested') {
    return { label: '排队中', tone: 'warn', detail: `Run #${run.run_number}` }
  }
  if (run.status === 'in_progress') {
    const active = (jobs || []).find((j) => j.status === 'in_progress' && !isPostStepName(j.name))
      || (jobs || []).find((j) => j.status === 'in_progress')
    const detail = active?.name ? `当前：${active.name}` : `Run #${run.run_number}`
    return { label: '进行中', tone: 'warn', detail }
  }
  if (run.status === 'completed') {
    const map = {
      success: { label: '成功', tone: 'ok' },
      failure: { label: '失败', tone: 'error' },
      cancelled: { label: '已取消', tone: 'error' },
      timed_out: { label: '超时', tone: 'error' },
      action_required: { label: '需操作', tone: 'warn' },
      skipped: { label: '已跳过', tone: 'info' },
      neutral: { label: '完成', tone: 'info' }
    }
    const hit = map[run.conclusion] || { label: run.conclusion || '完成', tone: 'default' }
    return { ...hit, detail: `Run #${run.run_number}` }
  }
  return { label: run.status || '未知', tone: 'default', detail: `Run #${run.run_number}` }
}

export function formatFailureSummary(failures = []) {
  if (!failures.length) return '构建失败，请打开 Actions 查看完整日志。'
  const parts = failures.map((f) => {
    const stepPart = f.steps?.length ? `步骤「${f.steps.join('、')}」` : `任务「${f.job}」`
    const msgPart = f.messages?.length ? `：${f.messages[0]}` : ''
    return `${stepPart}${msgPart}`
  })
  return parts.join('；')
}

export function workflowRunUrl(run) {
  return run?.html_url || ''
}