import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import { useProfileBackground } from '@/composables/profile/useProfileBackground'
import { DEFAULT_PROFILE_ROTATION, normalizeProfileItem } from '@/utils/profile/collectionProfile'

/**
 * 在真实组件实例里跑 composable，避免 onBeforeUnmount / watch 落在组件上下文之外。
 */
function mountBackground(resolvedRef, isActive) {
  let result = null
  const app = createApp({
    setup() {
      result = useProfileBackground({ resolvedRef, isActive })
      return () => null
    }
  })
  app.mount(document.createElement('div'))
  return {
    api: () => result,
    unmount: () => app.unmount()
  }
}

function makeResolved(key, ids, rotation = {}) {
  return {
    owner: 'ip',
    key,
    set: {
      items: ids.map((id) => normalizeProfileItem({ id, kind: 'image', uri: `local://${id}` })),
      rotation: { ...DEFAULT_PROFILE_ROTATION, ...rotation }
    }
  }
}

const mounted = []

function mount(resolvedRef, isActive) {
  const handle = mountBackground(resolvedRef, isActive)
  mounted.push(handle)
  return handle
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  vi.useRealTimers()
})

describe('useProfileBackground — 「每次进入换一张」', () => {
  it('advances one step per page mount for the same key (visit + seq)', () => {
    const key = 'visit-seq'
    const store = () => ref(makeResolved(key, ['a', 'b', 'c']))

    expect(mount(store()).api().activeIndex.value).toBe(0)
    expect(mount(store()).api().activeIndex.value).toBe(1)
    expect(mount(store()).api().activeIndex.value).toBe(2)
    // 绕回第一张，不会出现越界
    expect(mount(store()).api().activeIndex.value).toBe(0)
  })

  it('stays on the first item when rotation is off', () => {
    const key = 'visit-off'
    const store = () => ref(makeResolved(key, ['a', 'b', 'c'], { mode: 'off' }))

    expect(mount(store()).api().activeIndex.value).toBe(0)
    expect(mount(store()).api().activeIndex.value).toBe(0)
    expect(mount(store()).api().activeIndex.value).toBe(0)
  })

  it('never repeats the previous item in random mode', () => {
    const key = 'visit-random'
    const store = () => ref(makeResolved(key, ['a', 'b', 'c'], { order: 'random' }))

    const seen = []
    for (let i = 0; i < 12; i += 1) {
      const index = mount(store()).api().activeIndex.value
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(3)
      expect(index).not.toBe(seen[seen.length - 1])
      seen.push(index)
    }
  })

  it('does not advance when there is only one background', () => {
    const key = 'visit-single'
    const store = () => ref(makeResolved(key, ['only']))
    expect(mount(store()).api().activeIndex.value).toBe(0)
    expect(mount(store()).api().activeIndex.value).toBe(0)
  })

  it('reports hasMultiple only above one item', () => {
    expect(mount(ref(makeResolved('multi', ['a', 'b']))).api().hasMultiple.value).toBe(true)
    expect(mount(ref(makeResolved('single', ['a']))).api().hasMultiple.value).toBe(false)
  })

  it('handles a missing background set without throwing', () => {
    const api = mount(ref({ owner: 'none', key: 'none', set: null })).api()
    expect(api.activeIndex.value).toBe(0)
    expect(api.currentItem.value).toBeNull()
    expect(api.hasMultiple.value).toBe(false)
  })
})

describe('useProfileBackground — 手动与定时切换', () => {
  it('cycles forward and backward with next()/prev()', () => {
    const api = mount(ref(makeResolved('manual', ['a', 'b', 'c'], { mode: 'off' }))).api()

    expect(api.activeIndex.value).toBe(0)
    api.next()
    expect(api.activeIndex.value).toBe(1)
    api.next()
    expect(api.activeIndex.value).toBe(2)
    api.next()
    expect(api.activeIndex.value).toBe(0)
    api.prev()
    expect(api.activeIndex.value).toBe(2)
  })

  it('switches on the configured interval while the page is active', () => {
    const isActive = ref(true)
    const api = mount(ref(makeResolved('interval', ['a', 'b', 'c'], { mode: 'interval', intervalSec: 5 })), isActive).api()

    expect(api.activeIndex.value).toBe(0)
    vi.advanceTimersByTime(5000)
    expect(api.activeIndex.value).toBe(1)
    vi.advanceTimersByTime(5000)
    expect(api.activeIndex.value).toBe(2)
  })

  it('pauses the interval when the page becomes inactive', () => {
    const isActive = ref(true)
    const api = mount(ref(makeResolved('interval-pause', ['a', 'b', 'c'], { mode: 'interval', intervalSec: 5 })), isActive).api()

    vi.advanceTimersByTime(5000)
    expect(api.activeIndex.value).toBe(1)

    isActive.value = false
    vi.advanceTimersByTime(20000)
    expect(api.activeIndex.value).toBe(1)

    isActive.value = true
    vi.advanceTimersByTime(5000)
    expect(api.activeIndex.value).toBe(2)
  })

  it('does not run a timer in visit mode', () => {
    const api = mount(ref(makeResolved('visit-no-timer', ['a', 'b']))).api()
    expect(api.activeIndex.value).toBe(0)
    vi.advanceTimersByTime(60000)
    expect(api.activeIndex.value).toBe(0)
  })

  it('clamps the index when backgrounds are removed while mounted', async () => {
    const source = ref(makeResolved('shrink', ['a', 'b', 'c'], { mode: 'off' }))
    const api = mount(source).api()

    api.next()
    api.next()
    expect(api.activeIndex.value).toBe(2)

    source.value = makeResolved('shrink', ['a'])
    await nextTick()
    expect(api.activeIndex.value).toBe(0)
  })
})
