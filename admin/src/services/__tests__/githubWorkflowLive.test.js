import { describe, expect, it } from 'vitest'
import {
  extractErrorLines,
  summarizeWorkflowFailures,
  formatFailureSummary,
  normalizeJobsForRun,
  isPostStepName,
  jobProgress,
  formatJobLogsForDisplay
} from '../github'

describe('extractErrorLines', () => {
  it('提取 ##[error] 与 ::error:: 行', () => {
    const text = [
      'Setup Node.js',
      '##[error]Secret VITE_AMAP_KEY 未配置或读取为空！',
      '::error::Supabase rollback lookup failed: missing key',
      'done'
    ].join('\n')
    const lines = extractErrorLines(text)
    expect(lines).toContain('Secret VITE_AMAP_KEY 未配置或读取为空！')
    expect(lines).toContain('Supabase rollback lookup failed: missing key')
  })

  it('无 error 标记时回退到末尾日志', () => {
    const lines = extractErrorLines('a\nb\nfail here\n')
    expect(lines[lines.length - 1]).toBe('fail here')
  })
})

describe('summarizeWorkflowFailures', () => {
  const jobs = [
    {
      id: 1,
      name: 'publish',
      conclusion: 'failure',
      html_url: 'https://github.com/x/y/actions/runs/1',
      steps: [
        { name: 'Checkout', conclusion: 'success' },
        { name: 'Build web assets', conclusion: 'failure' }
      ]
    },
    {
      id: 2,
      name: 'build-release',
      conclusion: 'success',
      steps: [{ name: 'Build release APK', conclusion: 'success' }]
    }
  ]

  it('汇总失败 job 的步骤名与 annotations 消息', () => {
    const result = summarizeWorkflowFailures(jobs, {
      publish: [
        { annotation_level: 'failure', message: 'Secret VITE_AMAP_KEY 未配置或读取为空！' },
        { annotation_level: 'notice', message: '忽略这条' }
      ]
    })
    expect(result).toHaveLength(1)
    expect(result[0].job).toBe('publish')
    expect(result[0].steps).toEqual(['Build web assets'])
    expect(result[0].messages).toEqual(['Secret VITE_AMAP_KEY 未配置或读取为空！'])
    expect(formatFailureSummary(result)).toContain('Build web assets')
    expect(formatFailureSummary(result)).toContain('VITE_AMAP_KEY')
  })

  it('无 annotation 时仍返回失败步骤', () => {
    const result = summarizeWorkflowFailures(jobs)
    expect(result[0].steps).toContain('Build web assets')
    expect(result[0].messages).toEqual([])
  })

  it('成功 job 不进入失败摘要', () => {
    const result = summarizeWorkflowFailures([jobs[1]])
    expect(result).toEqual([])
  })
})

describe('formatFailureSummary', () => {
  it('空列表给出兜底文案', () => {
    expect(formatFailureSummary([])).toContain('Actions')
  })
})

describe('normalizeJobsForRun', () => {
  it('run 成功时把未完成 job/step 对齐为 success', () => {
    const run = { status: 'completed', conclusion: 'success', run_number: 376 }
    const jobs = [
      {
        id: 9,
        name: 'publish',
        status: 'in_progress',
        conclusion: '',
        steps: [
          { name: 'Build web assets', status: 'completed', conclusion: 'success' },
          { name: 'Prune old bundles', status: 'in_progress', conclusion: '' }
        ]
      }
    ]
    const [job] = normalizeJobsForRun(run, jobs)
    expect(job.status).toBe('completed')
    expect(job.conclusion).toBe('success')
    expect(job.steps.every((s) => s.conclusion === 'success')).toBe(true)
  })

  it('run 未完成时原样返回', () => {
    const run = { status: 'in_progress', conclusion: null }
    const jobs = [{ id: 1, status: 'in_progress', steps: [] }]
    expect(normalizeJobsForRun(run, jobs)).toEqual(jobs)
  })
})

describe('isPostStepName / jobProgress / formatJobLogsForDisplay', () => {
  it('识别 Post 步骤', () => {
    expect(isPostStepName('Post Setup Node.js')).toBe(true)
    expect(isPostStepName('Build web assets')).toBe(false)
  })

  it('进度统计忽略 Post 步骤', () => {
    const job = {
      steps: [
        { name: 'Checkout', status: 'completed', conclusion: 'success' },
        { name: 'Build', status: 'in_progress', conclusion: '' },
        { name: 'Post Checkout', status: 'queued', conclusion: '' }
      ]
    }
    const p = jobProgress(job)
    expect(p.total).toBe(2)
    expect(p.done).toBe(1)
    expect(p.active).toBe('Build')
  })

  it('日志格式化保留错误行并截断末尾', () => {
    const raw = ['2024-01-01T00:00:00Z line1', '##[error]boom', 'tail'].join('\n')
    const view = formatJobLogsForDisplay(raw, { maxLines: 10 })
    expect(view.errors).toContain('boom')
    expect(view.text).toContain('boom')
  })
})
