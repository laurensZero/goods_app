import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const VIEWS = [
  'src/views/import/CartImportView.vue',
  'src/views/import/AccountImportView.vue',
]

function read(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

/**
 * 购物车/账号导入共用 useMihoyoImportSession 的步骤机。
 * 曾经两个视图各自保留一份 step，拉取时更新的是会话门的 step，视图永远停在 cookie 步，
 * 表现为「点拉取没反应」；这里做静态兜底，避免再次分叉。
 */
describe('米游铺导入视图与 useMihoyoImportSession 的步骤机接线', () => {
  it('视图复用会话门的 step，且不再声明本地 step', () => {
    for (const file of VIEWS) {
      const source = read(file)
      const destructure = source.match(/const \{([\s\S]*?)\} = useMihoyoImportSession/)?.[1] || ''

      expect(destructure, `${file} 未从会话门取 step`).toMatch(/\bstep\s*,/)
      expect(source, `${file} 仍声明了本地 step`).not.toMatch(/const\s+step\s*=\s*ref\(/)
    }
  })

  it('内嵌视图把激活状态交给会话门，由会话门统一 bootstrap', () => {
    const sessionSource = read('src/composables/import/useMihoyoImportSession.js')
    expect(sessionSource).toMatch(/watch\(\s*\(\)\s*=>\s*isEmbeddedActive\(\)[\s\S]*?scheduleBootstrap\(\)/)

    for (const file of VIEWS) {
      expect(read(file), `${file} 未传 isEmbeddedActive`).toContain('isEmbeddedActive: () => props.embeddedActive')
    }
  })
})
