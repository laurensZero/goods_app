import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { getSharedTaggingContext } from '../taggingContextCache'

const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

describe('taggingContextCache snapshot', () => {
  it('冷启动快照不同步全扫，后台重建完成后可读到学习结果', async () => {
    const presets = reactive({ characters: [], categories: ['卡片'] })
    const goods = reactive({
      list: [
        { id: 1, name: '胶片卡', category: '卡片' },
        { id: 2, name: '胶片卡 随机', category: '卡片' },
      ],
    })
    const context = getSharedTaggingContext(presets, goods)

    const cold = context.getLearnedKeywordsSnapshot()
    expect(cold).toEqual([])
    // 冷启动空快照必须是稳定引用：调用方拿它当缓存 key，每次 new [] 会让缓存永远失效
    expect(context.getLearnedKeywordsSnapshot()).toBe(cold)
    // 关键：快照读取不能顺手做一次同步全量重建
    expect(context.building).toBe(false)
    expect(context.learned).toBeNull()
    expect(context.lastBuildAt).toBe(0)

    await wait()
    const warm = context.getLearnedKeywordsSnapshot()
    expect(warm).toContainEqual({ keyword: '胶片卡', value: '卡片' })
  })

  it('waitForLearned 在首轮分片重建完成后 resolve', async () => {
    const presets = reactive({ characters: [], categories: ['卡片'] })
    const goods = reactive({
      list: [
        { id: 1, name: '胶片卡', category: '卡片' },
        { id: 2, name: '胶片卡 随机', category: '卡片' },
      ],
    })
    const context = getSharedTaggingContext(presets, goods)

    const learned = await context.waitForLearned()
    expect(learned).toContainEqual({ keyword: '胶片卡', value: '卡片' })
    expect(context.lastBuildAt).toBeGreaterThan(0)

    // 已完成后再等应立即返回同一份结果，不重复排队
    expect(await context.waitForLearned()).toBe(learned)
  })

  it('waitForLearned({ eager: false }) 不主动排期，等预热真正启动后才 resolve', async () => {
    const presets = reactive({ characters: [], categories: ['卡片'] })
    const goods = reactive({
      list: [
        { id: 1, name: '胶片卡', category: '卡片' },
        { id: 2, name: '胶片卡 随机', category: '卡片' },
      ],
    })
    const context = getSharedTaggingContext(presets, goods)

    const pending = context.waitForLearned({ eager: false })
    // 进页第一帧不能因为等待者自己抢跑而去重建
    expect(context.building).toBe(false)
    expect(context.refreshTimer).toBe(0)

    context.scheduleRebuild(0)
    await expect(pending).resolves.toContainEqual({ keyword: '胶片卡', value: '卡片' })
  })
})
