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
    // 关键：快照读取不能顺手做一次同步全量重建
    expect(context.building).toBe(false)
    expect(context.learned).toBeNull()
    expect(context.lastBuildAt).toBe(0)

    await wait()
    const warm = context.getLearnedKeywordsSnapshot()
    expect(warm).toContainEqual({ keyword: '胶片卡', value: '卡片' })
  })
})
