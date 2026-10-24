import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * 滚动边缘感知：目标滚动容器 scrollTop 越过 threshold 后 isScrolled 翻转。
 * rAF 节流；供滚动边缘渐进模糊条做 opacity 过渡（不在滚动里改 backdrop-filter）。
 * 同时监听 window scroll 作为兜底（与 usePageScrollBinder 的双绑策略一致）。
 * @param {import('vue').Ref<HTMLElement|null> | (() => HTMLElement|null)} source
 * @param {{ threshold?: number }} [options]
 */
export function useScrolledEdge(source, { threshold = 8 } = {}) {
  const isScrolled = ref(false)
  let rafId = 0
  let el = null
  let bound = false

  function evaluate() {
    rafId = 0
    // 页面可能滚在元素上（.page-body 被高度约束时）也可能滚在 window 上
    // （.page 只有 min-height，内容溢出时 document 滚动）。取两者最大值，
    // 任一越阈即视为已滚动——单一来源会在另一种布局下永远为 0。
    const top = Math.max(el ? el.scrollTop : 0, window.scrollY)
    const next = top > threshold
    if (next !== isScrolled.value) isScrolled.value = next
  }

  function onScroll() {
    if (!rafId) rafId = requestAnimationFrame(evaluate)
  }

  function bind(target) {
    if (bound && el === target) return
    unbind()
    el = target || null
    bound = true
    if (el) el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    evaluate()
  }

  function unbind() {
    if (el) el.removeEventListener('scroll', onScroll)
    window.removeEventListener('scroll', onScroll)
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    el = null
    bound = false
  }

  const getEl = typeof source === 'function' ? source : () => source?.value
  watch(getEl, (target) => bind(target), { immediate: true })
  onBeforeUnmount(unbind)

  return isScrolled
}
