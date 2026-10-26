import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const view = () => readFileSync(
  resolve(process.cwd(), 'src/views/mihoyo/MihoyoNewArrivalsView.vue'),
  'utf8',
)

/**
 * 冷启动第一次「加入心愿单」曾在点击路径上同步做两件重活：
 * 建导入上下文（全库扫角色/标签）+ 首轮标签学习。
 * 这里钉住「进页空闲期预热」的接线，避免又被挪回点击路径。
 */
describe('米游铺上新页加入心愿单预热', () => {
  it('进页预热标签缓存，并等首轮学习完成后再建导入上下文', () => {
    const source = view()

    expect(source).toContain('warmTaggingContext')
    expect(source).toMatch(/warmTaggingContext\(presetsStore, goodsStore/)
    // 上下文只在 learned 稳定后建，否则刚建好就会因引用变化作废
    expect(source).toContain('waitForLearned({ eager: false })')
    expect(source).toMatch(/\.then\(scheduleImportContextWarmup/)
    // 预热必须放到空闲期，不能挂在 onMounted 同步跑
    expect(source).toContain('requestIdleCallback')
    expect(source).toMatch(/onMounted\(\(\) => \{[\s\S]*?warmImportContext\(\)/)
  })

  it('离开页面时取消未执行的预热任务', () => {
    const source = view()
    expect(source).toMatch(/onUnmounted\(\(\) => \{[\s\S]*?cancelTagWarmup/)
    expect(source).toContain('cancelIdleCallback')
  })

  it('打开款式弹层时补一次空闲预热，覆盖用户点得很快的情况', () => {
    const source = view()
    expect(source).toMatch(/function openSkuSheet\(item\)[\s\S]*?scheduleImportContextWarmup\(\)/)
  })
})
