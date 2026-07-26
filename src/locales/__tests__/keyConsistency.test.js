import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// 比对 5 种语言全部命名空间 JSON 的 key 集合，防止新增文案漏翻某种语言
// （运行时缺 key 只会静默回退 zh-CN，靠 locales/index.js 的 missing handler 才能发现）

const LOCALES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko']

const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const namespaces = readdirSync(path.join(baseDir, 'zh-CN'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))

function flattenKeys(value, prefix = '') {
  const keys = []
  for (const [key, entry] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      keys.push(...flattenKeys(entry, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

describe('i18n locale key consistency', () => {
  it('discovers the zh-CN namespaces', () => {
    expect(namespaces.length).toBeGreaterThan(0)
  })

  it('all locales expose the same key set in every namespace', () => {
    const problems = []

    for (const namespace of namespaces) {
      const keysByLocale = new Map()
      const unionKeys = new Set()

      for (const locale of LOCALES) {
        const filePath = path.join(baseDir, locale, `${namespace}.json`)
        let keys
        try {
          keys = flattenKeys(JSON.parse(readFileSync(filePath, 'utf8')))
        } catch {
          problems.push(`${locale}/${namespace}.json: 文件缺失或 JSON 解析失败`)
          keysByLocale.set(locale, new Set())
          continue
        }
        keysByLocale.set(locale, new Set(keys))
        for (const key of keys) unionKeys.add(key)
      }

      for (const locale of LOCALES) {
        const localeKeys = keysByLocale.get(locale)
        const missing = [...unionKeys].filter((key) => !localeKeys.has(key))
        if (missing.length > 0) {
          problems.push(`${locale}/${namespace}.json 缺少 key: ${missing.join(', ')}`)
        }
      }
    }

    expect(problems).toEqual([])
  })
})
