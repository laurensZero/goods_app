import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src', 'private/src']

function collectVueFiles(dir) {
  const result = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      result.push(...collectVueFiles(full))
    } else if (name.endsWith('.vue')) {
      result.push(full)
    }
  }
  return result
}

/**
 * 账号面板复用在同一份组件里，stoken 保存/刷新能力必须由每个父页面显式传入。
 * 漏传 save-stoken 时组件只会显示笼统的“刷新失败”，所以这里做静态兜底。
 */
describe('MihoyoAccountSheet 使用点接线', () => {
  it('所有使用点都传入 stoken 保存/刷新能力，且不再传未声明的 logout 事件', () => {
    const usages = collectVueFiles(ROOTS[0])
      .concat(collectVueFiles(ROOTS[1]))
      .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => /<MihoyoAccountSheet\b/.test(source))

    expect(usages.length).toBeGreaterThan(0)

    for (const { file, source } of usages) {
      const tag = source.match(/<MihoyoAccountSheet\b[\s\S]*?\/>/)?.[0] || ''
      expect(tag, `${file} 缺少账号面板标签`).not.toBe('')
      expect(tag, `${file} 漏传 save-stoken`).toContain(':save-stoken=')
      expect(tag, `${file} 漏传 stoken-error-message`).toContain(':stoken-error-message=')
      expect(tag, `${file} 漏接 refresh-account`).toContain('@refresh-account=')
      expect(tag, `${file} 仍在使用未声明的 @logout`).not.toContain('@logout=')
    }
  })
})
