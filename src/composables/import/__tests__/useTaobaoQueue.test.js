import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/taobao/service', () => ({
  fetchTaobaoDraft: vi.fn(),
}))

import { fetchTaobaoDraft } from '@/utils/taobao/service'
import { useTaobaoQueue } from '../useTaobaoQueue'

const DRAFT_A = { title: '商品A', price: '10' }
const DRAFT_B = { title: '商品B', price: '20' }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useTaobaoQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('入队后立即解析，且严格串行（前一个完成才发下一个）', async () => {
    const first = deferred()
    const second = deferred()
    fetchTaobaoDraft.mockImplementation((input) => (String(input).includes('111111') ? first.promise : second.promise))

    const queue = useTaobaoQueue()
    const { entry: e1 } = queue.enqueue('https://item.taobao.com/item.htm?id=111111')
    const { entry: e2 } = queue.enqueue('222222')

    expect(e1.status).toBe('parsing')
    expect(e2.status).toBe('parsing')
    expect(queue.entries.value[0].itemId).toBe('111111')
    expect(queue.entries.value[1].itemId).toBe('222222')
    // 串行：第二个请求尚未发出
    expect(fetchTaobaoDraft).toHaveBeenCalledTimes(1)

    first.resolve(DRAFT_A)
    await vi.waitFor(() => expect(e1.status).toBe('ready'))
    expect(e1.draft).toBe(DRAFT_A)
    expect(fetchTaobaoDraft).toHaveBeenCalledTimes(2)

    second.resolve(DRAFT_B)
    await vi.waitFor(() => expect(e2.status).toBe('ready'))
    expect(e2.draft).toBe(DRAFT_B)
  })

  it('同一 itemId 去重：重复入队返回已有条目', () => {
    fetchTaobaoDraft.mockReturnValue(new Promise(() => {}))
    const queue = useTaobaoQueue()
    const first = queue.enqueue('111111')
    const again = queue.enqueue('https://item.taobao.com/item.htm?id=111111')

    expect(again.duplicated).toBe(true)
    expect(again.entry.uid).toBe(first.entry.uid)
    expect(queue.entries.value).toHaveLength(1)
  })

  it('解析失败留队可重试，成功后触发回调', async () => {
    const failure = deferred()
    const success = deferred()
    // 第一次调用（初次解析）失败，重试的那次成功
    fetchTaobaoDraft.mockImplementationOnce(() => failure.promise)
      .mockImplementationOnce(() => success.promise)
    const onFailed = vi.fn()
    const onReady = vi.fn()
    const queue = useTaobaoQueue({ onReady, onFailed })

    const { entry } = queue.enqueue('111111')
    failure.reject(new Error('BLOCKED'))
    await vi.waitFor(() => expect(entry.status).toBe('failed'))
    expect(entry.error.message).toBe('BLOCKED')
    expect(onFailed).toHaveBeenCalledTimes(1)
    // 条目仍留在队列里（可重试）
    expect(queue.entries.value).toHaveLength(1)
    expect(queue.entries.value[0].status).toBe('failed')

    queue.retry(entry.uid)
    await vi.waitFor(() => expect(entry.status).toBe('parsing'))
    success.resolve(DRAFT_A)
    await vi.waitFor(() => expect(entry.status).toBe('ready'))
    expect(onReady).toHaveBeenCalledWith(entry)
  })

  it('remove / clear 移除条目；清空后未入场的请求不再发出', async () => {
    const pending = deferred()
    fetchTaobaoDraft.mockReturnValue(pending.promise)
    const onReady = vi.fn()
    const queue = useTaobaoQueue({ onReady })

    const { entry: a } = queue.enqueue('111111')
    const { entry: b } = queue.enqueue('222222')
    expect(queue.entries.value).toHaveLength(2)
    expect(fetchTaobaoDraft).toHaveBeenCalledTimes(1)

    queue.remove(a.uid)
    expect(queue.entries.value.map((entry) => entry.uid)).toEqual([b.uid])

    // 清空：在途请求落地后不再发下一个（b 的解析请求从未发出）
    queue.clear()
    expect(queue.entries.value).toHaveLength(0)
    pending.resolve(DRAFT_A)
    // 已移除的条目是幽灵：在途结果不得写回、不得触发 onReady
    // （否则清空队列后仍会被一条「幽灵完成」改写视图的 Cookie 状态）
    await Promise.resolve()
    await Promise.resolve()
    expect(a.status).toBe('parsing')
    expect(onReady).not.toHaveBeenCalled()
    expect(fetchTaobaoDraft).toHaveBeenCalledTimes(1)
    expect(queue.entries.value).toHaveLength(0)
  })
})
