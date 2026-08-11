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