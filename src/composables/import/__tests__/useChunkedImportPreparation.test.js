import { describe, expect, it, vi } from 'vitest'
import { useChunkedImportPreparation } from '../useChunkedImportPreparation'

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

describe('useChunkedImportPreparation', () => {
  it('先让出首帧，完成时一次性发布结果', async () => {
    const publishes = []
    const context = { id: 1 }
    const createContext = vi.fn(() => context)

    const { result, preparing, done, request } = useChunkedImportPreparation({
      getSources: () => [1, 2, 3],
      createContext,
      processSource: (source, ctx) => {
        expect(ctx).toBe(context)
        return source * 2
      },
      beforePublish: (processed) => publishes.push([...processed]),
    })

    request()
    // 首次同步阶段不建上下文、不发布
    expect(createContext).not.toHaveBeenCalled()
    expect(preparing.value).toBe(true)
    expect(result.value).toEqual([])

    await tick()

    expect(createContext).toHaveBeenCalledTimes(1)
    expect(publishes).toEqual([[2, 4, 6]])
    expect(result.value).toEqual([2, 4, 6])
    expect(done.value).toBe(true)
    expect(preparing.value).toBe(false)
  })

  it('切走时暂停并保留进度，切回从断点继续', async () => {
    let active = true
    const processed = []
    let markFirstProcessed
    const firstProcessed = new Promise((resolve) => {
      markFirstProcessed = resolve
    })

    const { result, request } = useChunkedImportPreparation({
      getSources: () => [1, 2, 3, 4],
      createContext: () => ({}),
      processSource: (source) => {
        processed.push(source)
        if (source === 1) markFirstProcessed()
        return source
      },
      isActive: () => active,
      budgetMs: 0,
    })

    request()
    await firstProcessed

    // 预算为 0，处理完第一个就 yield；此时切走，任务应停在中间
    active = false
    await tick(60)
    expect(result.value).toEqual([])
    expect(processed.length).toBeGreaterThan(0)
    expect(processed.length).toBeLessThan(4)

    active = true
    request()
    await tick(80)

    expect(result.value).toEqual([1, 2, 3, 4])
    expect(processed).toEqual([1, 2, 3, 4])
  })

  it('重新拉取 reset 后旧任务不再发布结果', async () => {
    let markFirstProcessed
    const firstProcessed = new Promise((resolve) => {
      markFirstProcessed = resolve
    })

    const { result, done, request, reset } = useChunkedImportPreparation({
      getSources: () => [1, 2, 3, 4],
      createContext: () => ({}),
      processSource: (source) => {
        if (source === 1) markFirstProcessed()
        return source
      },
      budgetMs: 0,
    })

    request()
    await firstProcessed
    reset()
    await tick(60)

    expect(result.value).toEqual([])
    expect(done.value).toBe(false)
  })
})
