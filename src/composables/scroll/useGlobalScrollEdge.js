import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 全局顶缘滚动感知：单一实例挂在 App 壳层，覆盖所有页面。
 *
 * 滚动源兼容双轨——页面可能滚在 window 上（.page 只有 min-height 时 document
 * 滚动），也可能滚在各页 .page-body 上。用 capture 阶段监听 document 的
 * scroll（能捕获一切元素滚动），配合主动扫描当前 .page-body 的 scrollTop。
 *
 * 路由切换时主动求值数帧：滚动位置恢复是异步写 scrollTop，若只依赖 scroll
 * 事件，返回已滚动页面时模糊会晚一拍才出现。
 * @param {{ threshold?: number }} [options]
 */
export function useGlobalScrollEdge({ threshold = 8 } = {}) {
  const isActive = ref(false)
  let rafId = 0
  let bound = false

  function evaluate() {
    rafId = 0
    let top = window.scrollY
    for (const el of document.querySelectorAll('.page .page-body')) {
      if (el.scrollTop > top) top = el.scrollTop
    }
    const next = top > threshold
    if (next !== isActive.value) isActive.value = next
  }

  function onScroll() {
    if (!rafId) rafId = requestAnimationFrame(evaluate)
  }

  function bind() {
    if (bound) return
    bound = true
    // capture：元素滚动事件不冒泡，capture 才能统一收到
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
  }

  function unbind() {
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('scroll', onScroll)
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    bound = false
  }

  const route = useRoute()
  // 路由切换：新页面挂载 + 滚动位置恢复都是异步的，错峰求值几帧兜住时序
  watch(() => route.fullPath, () => {
    evaluate()
    setTimeout(evaluate, 120)
    setTimeout(evaluate, 400)
  })

  bind()
  onBeforeUnmount(unbind)

  return isActive
}
