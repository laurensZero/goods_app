import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

/**
 * 米游铺和淘宝的账号面板共用同一套 UI。
 * 两边只保留各自的数据/登录流程，账号卡片、操作栏、确认弹窗都在 AccountManagerSheet 里。
 */
describe('账号面板复用', () => {
  it('米游铺和淘宝都复用 AccountManagerSheet，而不是各写一套账号卡片', () => {
    const mihoyo = read('src/components/import/MihoyoAccountSheet.vue')
    const taobao = read('src/components/import/TaobaoAccountSheet.vue')

    for (const [file, source] of [
      ['MihoyoAccountSheet.vue', mihoyo],
      ['TaobaoAccountSheet.vue', taobao],
    ]) {
      expect(source, `${file} 未复用 AccountManagerSheet`).toContain(
        "from '@/components/import/AccountManagerSheet.vue'"
      )
      expect(source, `${file} 未渲染 AccountManagerSheet`).toContain('<AccountManagerSheet')
      expect(source, `${file} 仍在重复账号卡片结构`).not.toContain('account-hero')
      expect(source, `${file} 仍在重复账号列表结构`).not.toContain('sheet-options')
    }

    expect(mihoyo).toContain('supports-stoken')
    expect(mihoyo).toContain('supports-refresh')
    expect(taobao).not.toContain('supports-stoken')
    expect(taobao).not.toContain('supports-refresh')
  })

  it('共享面板保留账号卡片与操作栏结构', () => {
    const shared = read('src/components/import/AccountManagerSheet.vue')
    expect(shared).toContain('account-hero')
    expect(shared).toContain('account-actions')
    expect(shared).toContain("t('import.otherAccounts')")
  })
})
