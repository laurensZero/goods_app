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

  it('购物车/订单列表规整走分片任务，不在 onList 里同步整表重算', () => {
    const cart = read('src/views/import/CartImportView.vue')
    const account = read('src/views/import/AccountImportView.vue')
    const scheduler = read('src/composables/import/useChunkedImportPreparation.js')

    // 重型规整结果由分片任务填充；不能退回 computed（读取即同步算全表）
    expect(cart).toContain('useChunkedImportPreparation')
    expect(account).toContain('useChunkedImportPreparation')
    expect(cart).not.toMatch(/const processedGroups = computed\(/)
    expect(account).not.toMatch(/const processedOrders = computed\(/)

    // onList 只落数据 + 切步，然后异步整理
    expect(cart).toMatch(/onList:\s*\(list\)\s*=>\s*\{[\s\S]*?step\.value = 'list'[\s\S]*?requestPrepare\(\)/)

    // 分片任务：先让出、按预算让出、切走暂停、完成才发布
    expect(scheduler).toContain('await yieldToMain()')
    expect(scheduler).toMatch(/if \(!isActive\(\)\) \{/)
    expect(scheduler).toMatch(/result\.value = current\.results/)

    // 导入链路只读标签缓存快照，冷启动不在主线程做 n-gram 全扫
    expect(cart).toContain('getLearnedKeywordsSnapshot()')
    expect(account).toContain('getLearnedKeywordsSnapshot()')
  })

  it('自动 bootstrap 不与其他导入的拉取并发', () => {
    const session = read('src/composables/import/useMihoyoImportSession.js')
    expect(session).toContain('let runningImportFetches = 0')
    expect(session).toMatch(/fromBootstrap && runningImportFetches > 0/)
    expect(session).toMatch(/runningImportFetches = Math\.max\(0, runningImportFetches - 1\)/)
  })
})
