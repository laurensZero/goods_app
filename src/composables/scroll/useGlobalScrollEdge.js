import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 全局顶缘滚动感知：单一实例挂在 App 壳层，覆盖所有页面。
 *
 * 滚动源兼容双轨——页面可能滚在 window 上（.page 只有 min-height 时 document
 * 滚动），也可能滚在各页 .page-body 上。用 capture 阶段监听 document 的
 * scroll（能捕获一切元素滚动），配合主动扫描当前 .page-body 的 scrollTop。
 *
 * 路由切换后 2.5s 内轮询求值：滚动位置恢复是异步写 scrollTop，且内容未就绪
 * 时浏览器会钳回滚动位置（钳回不触发 scroll 事件）——纯事件驱动会停在旧状态
 * （曾导致切页后模糊晚一拍 / 顶部无滚动却亮着）。跳变（恢复/回顶）时置
 * instant 跳过淡入淡出，帧内立即生效。
 */
export function useGlobalScrollEdge({ threshold = 8 } = {}) {
  const state = ref({ active: false, instant: false })
  let rafId = 0
  let pollId = 0
  let pollUntil = 0
  let lastTop = 0
  let bound = false

  function readTop() {
    let top = window.scrollY
    for (const el of document.querySelectorAll('.page .page-body')) {
      if (el.scrollTop > top) top = el.scrollTop
    }
    return top
  }

  function evaluate() {
    rafId = 0
    const top = readTop()
    const jumped = Math.abs(top - lastTop) > 250
    lastTop = top
    const next = top > threshold
    if (next === state.value.active && !jumped) return
    if (jumped) {
      state.value = { active: next, instant: true }
      requestAnimationFrame(() => {
        state.value = { active: next, instant: false }
      })
    } else {
      state.value = { active: next, instant: false }
    }
  }

  function scheduleEvaluate() {
    if (rafId) return
    rafId = requestAnimationFrame(evaluate)
  }

  function bind() {
    if (bound) return
    bound = true
    // capture：元素滚动事件不冒泡，capture 才能统一收到
    document.addEventListener('scroll', scheduleEvaluate, { capture: true, passive: true })
    window.addEventListener('scroll', scheduleEvaluate, { passive: true })
  }

  function unbind() {
    document.removeEventListener('scroll', scheduleEvaluate, true)
    window.removeEventListener('scroll', scheduleEvaluate)
    if (rafId) cancelAnimationFrame(rafId)
    if (pollId) clearInterval(pollId)
    rafId = 0
    pollId = 0
    bound = false
  }

  const route = useRoute()
  // 路由切换：新页面挂载 + 滚动位置恢复是异步的，轮询 2.5s 兜住全部时序
  watch(() => route.fullPath, () => {
    evaluate()
    clearInterval(pollId)
    pollUntil = Date.now() + 2500
    pollId = setInterval(() => {
      if (Date.now() > pollUntil) {
        clearInterval(pollId)
        pollId = 0
        return
      }
      evaluate()
    }, 150)
  })

  bind()
  onBeforeUnmount(unbind)

  return state
}
