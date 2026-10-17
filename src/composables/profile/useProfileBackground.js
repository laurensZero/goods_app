import { computed, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 会话级轮换游标：key -> 上次展示的下标。
 *
 * 必须放在模块作用域（而不是 composable 内部），因为收藏馆页面不是 keep-alive，
 * 每次进入都会重新创建组件实例 —— 只有模块级游标才能实现「每次进入换一张」。
 * 应用重启后游标重置，首张从第一张开始。
 */
const rotationCursor = new Map()

/**
 * 收藏馆背景轮换调度。
 *
 * 输入一个「已解析好的背景集」({ owner, key, set })，负责：
 * - 进入页面时按轮换模式挑选起始张（`visit` 顺序游标避免连续重复）
 * - 手动切下一张 / 上一张
 * - `interval` 模式定时切换，页面不可见 / 失活时暂停
 *
 * 过渡动画交给宿主（ProfileHero 用 <Transition> 做交叉淡入），
 * 这里只维护「当前该显示第几张」。
 *
 * @param {{ resolvedRef: import('vue').Ref<{ owner: string, key: string, set: any }|null>,
 *   isActive?: import('vue').Ref<boolean> }} options
 */
export function useProfileBackground({ resolvedRef, isActive }) {
  const activeRef = isActive || ref(true)
  const activeIndex = ref(0)
  let timer = 0

  const activeKey = computed(() => String(resolvedRef.value?.key || ''))
  const items = computed(() => resolvedRef.value?.set?.items || [])
  const rotation = computed(() => resolvedRef.value?.set?.rotation || null)
  const currentItem = computed(() => items.value[activeIndex.value] || null)
  const hasMultiple = computed(() => items.value.length > 1)

  function clampIndex(index) {
    const total = items.value.length
    if (total <= 0) return 0
    return ((index % total) + total) % total
  }

  function pickEntryIndex() {
    const total = items.value.length
    if (total <= 1) return 0

    const mode = rotation.value?.mode || 'off'
    const order = rotation.value?.order || 'seq'
    const key = activeKey.value
    const last = rotationCursor.get(key)

    // 非「每次进入换一张」：沿用上次停留的位置，缺省第一张
    if (mode !== 'visit') {
      return clampIndex(last ?? 0)
    }

    if (order === 'random') {
      let index = Math.floor(Math.random() * total)
      if (index === last) index = (index + 1) % total
      return index
    }

    if (last == null) return 0
    return (last + 1) % total
  }

  function commitIndex(index) {
    activeIndex.value = clampIndex(index)
    if (activeKey.value) rotationCursor.set(activeKey.value, activeIndex.value)
  }

  function clearTimer() {
    if (!timer) return
    window.clearInterval(timer)
    timer = 0
  }

  function restartTimer() {
    clearTimer()
    if (!activeRef.value) return
    if (rotation.value?.mode !== 'interval') return
    if (items.value.length <= 1) return
    const seconds = Math.max(3, Number(rotation.value?.intervalSec) || 8)
    timer = window.setInterval(() => {
      commitIndex(activeIndex.value + 1)
    }, seconds * 1000)
  }

  function reset() {
    commitIndex(pickEntryIndex())
    restartTimer()
  }

  function next() {
    if (items.value.length <= 1) return
    commitIndex(activeIndex.value + 1)
    restartTimer()
  }

  function prev() {
    if (items.value.length <= 1) return
    commitIndex(activeIndex.value - 1)
    restartTimer()
  }

  watch(activeKey, () => reset(), { immediate: true })

  watch(
    () => items.value.length,
    (total) => {
      if (activeIndex.value >= total) commitIndex(0)
      restartTimer()
    }
  )

  // 定时器控制必须同步生效：page 切到后台 / 轮换参数变化的同一 tick 就要停表或换频率
  watch(rotation, () => restartTimer(), { deep: true, flush: 'sync' })

  watch(activeRef, () => restartTimer(), { flush: 'sync' })

  onBeforeUnmount(clearTimer)

  return {
    activeIndex,
    currentItem,
    hasMultiple,
    next,
    prev,
    restartTimer
  }
}
