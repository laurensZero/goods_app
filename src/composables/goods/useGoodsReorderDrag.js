// @ts-check
import { onBeforeUnmount, reactive, ref } from 'vue'
import { vibrate, HAPTIC_LIGHT } from '@/utils/platform/haptics'

/**
 * 多选模式下从谷子封面右上角把手拖动重排。
 * 手势对齐 EventTrackEditor：
 * - 只在把手上绑 pointerdown/move/up/cancel，并 setPointerCapture
 * - 被拖卡片 1:1 跟手
 * - 落点 = 被拖卡片「当前中心」落入哪张其它卡片的原始格子（兜底最近中心）
 * - 其它卡片按目标线性序的 dest 格子 rect 差位移（二维网格正确）
 */

const BODY_DRAG_CLASS = 'goods-reorder-dragging'

/**
 * @param {{ id: string, el: HTMLElement, rect: DOMRect }[]} cards
 * @param {number} sourceIndex
 * @param {number} excludeIndex
 * @param {number} centerX
 * @param {number} centerY
 */
export function resolveTargetIndex(cards, sourceIndex, excludeIndex, centerX, centerY) {
  if (!cards.length) return sourceIndex
  // 1) 中心落在其它卡片格子内 → 该卡片
  for (let i = 0; i < cards.length; i++) {
    if (i === excludeIndex) continue
    const r = cards[i].rect
    if (centerX >= r.left && centerX <= r.right && centerY >= r.top && centerY <= r.bottom) {
      return i
    }
  }
  // 2) 仍在自己格子内 → 保持 source（excludeIndex 通常就是 source）
  if (cards[sourceIndex]) {
    const own = cards[sourceIndex].rect
    if (centerX >= own.left && centerX <= own.right && centerY >= own.top && centerY <= own.bottom) {
      return sourceIndex
    }
  }
  // 3) 兜底：最近的其它卡片中心
  let nearest = sourceIndex
  let nearestDist = Infinity
  for (let i = 0; i < cards.length; i++) {
    if (i === excludeIndex) continue
    const r = cards[i].rect
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dist = (cx - centerX) ** 2 + (cy - centerY) ** 2
    if (dist < nearestDist) {
      nearestDist = dist
      nearest = i
    }
  }
  return nearest
}

/**
 * @param {object} options
 * @param {() => Array<{ id: string, _type?: string }>} options.getItems
 * @param {() => HTMLElement | null} options.getGridEl
 * @param {(orderedIds: string[]) => void | Promise<void>} options.onCommit
 * @param {() => boolean} [options.canDrag]
 */
export function useGoodsReorderDrag(options) {
  const { getItems, getGridEl, onCommit, canDrag } = options

  const dragActive = ref(false)
  const dragId = ref('')
  const dragStyle = ref(/** @type {Record<string, string> | null} */ (null))
  const shiftMap = reactive(/** @type {Record<string, string>} */ ({}))
  const targetId = ref('')

  /** @type {{ id: string, el: HTMLElement, rect: DOMRect }[]} */
  let cards = []
  /** @type {string[]} */
  let fullGoodsIds = []
  /** @type {string[]} */
  let visibleIds = []
  let sourceVisibleIndex = -1
  let targetVisibleIndex = -1
  let pointerId = null
  let startClientX = 0
  let startClientY = 0
  /** @type {HTMLElement | null} */
  let dragEl = null

  function clearShiftMap() {
    for (const key of Object.keys(shiftMap)) delete shiftMap[key]
  }

  function setBodyDragging(on) {
    try { document.body.classList.toggle(BODY_DRAG_CLASS, on) } catch {}
  }

  function collectVisibleCards() {
    const gridEl = getGridEl()
    if (!gridEl) return []
    const goodsIds = new Set(
      getItems()
        .filter((item) => item && item._type !== 'group' && item.id)
        .map((item) => String(item.id))
    )
    /** @type {{ id: string, el: HTMLElement, rect: DOMRect }[]} */
    const list = []
    gridEl.querySelectorAll('[data-goods-id]').forEach((node) => {
      const id = String(node.getAttribute('data-goods-id') || '')
      if (!goodsIds.has(id)) return
      const el = /** @type {HTMLElement} */ (node)
      if (typeof el.getBoundingClientRect !== 'function') return
      const rect = el.getBoundingClientRect()
      if (!rect.width && !rect.height) return
      list.push({ id, el, rect })
    })
    // 视觉序：上到下、左到右（网格线性下标）
    list.sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left))
    return list
  }

  function markTarget() {
    for (const card of cards) {
      card.el?.classList?.remove('goods-card--reorder-target')
    }
    const card = cards[targetVisibleIndex]
    if (!card || card.id === dragId.value) {
      targetId.value = ''
      return
    }
    card.el?.classList?.add('goods-card--reorder-target')
    targetId.value = card.id
  }

  /** 线性插入：i 号在 source→target 后应落到 dest 格子，用 dest 原始 rect 做二维位移 */
  function shiftDeltaFor(i, source, target) {
    if (i === source) return null
    let dest = i
    if (source < target) {
      if (i > source && i <= target) dest = i - 1
    } else if (source > target) {
      if (i >= target && i < source) dest = i + 1
    }
    if (dest === i || !cards[i] || !cards[dest]) return { dx: 0, dy: 0 }
    return {
      dx: cards[dest].rect.left - cards[i].rect.left,
      dy: cards[dest].rect.top - cards[i].rect.top
    }
  }

  function applyOtherCardShifts() {
    clearShiftMap()
    if (sourceVisibleIndex < 0 || targetVisibleIndex < 0 || sourceVisibleIndex === targetVisibleIndex) {
      for (const card of cards) {
        if (card.id === dragId.value || !card.el) continue
        card.el.style.transform = ''
      }
      return
    }
    for (let i = 0; i < cards.length; i++) {
      const { id, el } = cards[i]
      if (id === dragId.value) continue
      const delta = shiftDeltaFor(i, sourceVisibleIndex, targetVisibleIndex)
      if (!delta) continue
      const transform = (delta.dx === 0 && delta.dy === 0) ? '' : `translate(${delta.dx}px, ${delta.dy}px)`
      shiftMap[id] = transform
      if (el) {
        el.style.transition = 'none'
        el.style.transform = transform
      }
    }
  }

  function resetCardVisuals() {
    for (const card of cards) {
      if (!card.el) continue
      card.el.style.transform = ''
      card.el.style.transition = ''
      card.el.style.zIndex = ''
      card.el.classList.remove('goods-card--reorder-target')
      card.el.classList.remove('goods-card--reorder-dragging')
    }
    clearShiftMap()
    dragStyle.value = null
    targetId.value = ''
  }

  function currentDragCenter() {
    // 跟手后用卡片当前几何中心命中，而不是把手所在的右上角
    if (dragEl) {
      const r = dragEl.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    return { x: startClientX, y: startClientY }
  }

  function applyDraggedTransform(clientX, clientY) {
    const dx = clientX - startClientX
    const dy = clientY - startClientY
    const transform = `translate(${dx}px, ${dy}px) scale(1.04)`
    if (dragEl) {
      dragEl.style.transition = 'none'
      dragEl.style.transform = transform
      dragEl.style.zIndex = '40'
      dragEl.classList.add('goods-card--reorder-dragging')
    }
    dragStyle.value = { transform, zIndex: '40', transition: 'none' }
  }

  function onPointerMove(clientX, clientY) {
    if (!dragActive.value) return
    applyDraggedTransform(clientX, clientY)
    const { x, y } = currentDragCenter()
    const next = resolveTargetIndex(cards, sourceVisibleIndex, sourceVisibleIndex, x, y)
    if (next !== targetVisibleIndex) {
      targetVisibleIndex = next
      applyOtherCardShifts()
      markTarget()
    }
  }

  function buildCommitIds() {
    const ids = [...fullGoodsIds]
    const fromId = visibleIds[sourceVisibleIndex]
    const toId = visibleIds[targetVisibleIndex]
    if (!fromId || !toId || fromId === toId) return null
    const from = ids.indexOf(fromId)
    if (from < 0) return null
    let to = ids.indexOf(toId)
    if (to < 0) return null
    const [moved] = ids.splice(from, 1)
    if (from < to) to -= 1
    ids.splice(to, 0, moved)
    return ids
  }

  async function finishDrag(commit) {
    if (!dragActive.value) return
    const shouldCommit = commit
      && sourceVisibleIndex >= 0
      && targetVisibleIndex >= 0
      && sourceVisibleIndex !== targetVisibleIndex
    const commitIds = shouldCommit ? buildCommitIds() : null

    dragActive.value = false
    pointerId = null
    // 先清视觉再提交，避免 transform 残留 + 列表重排叠成弹跳
    resetCardVisuals()
    setBodyDragging(false)

    if (commitIds) {
      try {
        await onCommit(commitIds)
      } catch (e) {
        console.error('[goods-reorder] commit failed:', e)
      }
    }

    cards = []
    fullGoodsIds = []
    visibleIds = []
    sourceVisibleIndex = -1
    targetVisibleIndex = -1
    dragEl = null
  }

  /**
   * 与 EventTrackEditor 相同：事件挂在把手上，capture 失败则中止。
   * @param {PointerEvent} event
   * @param {{ id: string, clientX: number, clientY: number }} payload
   */
  function onHandlePointerDown(event, payload) {
    if (event.button != null && event.button !== 0) return
    if (canDrag && !canDrag()) return
    if (dragActive.value) return

    const items = getItems().filter((item) => item && item._type !== 'group' && item.id)
    fullGoodsIds = items.map((item) => String(item.id))
    cards = collectVisibleCards()
    visibleIds = cards.map((c) => c.id)

    const id = String(payload.id)
    const index = cards.findIndex((c) => c.id === id)
    if (cards.length < 2 || index < 0) return

    sourceVisibleIndex = index
    targetVisibleIndex = index
    dragId.value = id
    dragEl = cards[index].el
    startClientX = payload.clientX
    startClientY = payload.clientY
    pointerId = event.pointerId
    dragActive.value = true
    setBodyDragging(true)

    if (dragEl) {
      dragEl.style.transition = 'none'
      dragEl.style.zIndex = '40'
      dragEl.style.transform = 'translate(0px, 0px) scale(1.04)'
      dragEl.classList.add('goods-card--reorder-dragging')
    }
    dragStyle.value = {
      transform: 'translate(0px, 0px) scale(1.04)',
      zIndex: '40',
      transition: 'none'
    }

    const handleEl = /** @type {HTMLElement | null} */ (event.currentTarget || null)
    try {
      handleEl?.setPointerCapture?.(event.pointerId)
    } catch {
      resetCardVisuals()
      setBodyDragging(false)
      dragActive.value = false
      pointerId = null
      return
    }

    // move/up 绑在把手上（capture 后指针离开仍会派发到这里）
    handleEl?.addEventListener('pointermove', onHandlePointerMove)
    handleEl?.addEventListener('pointerup', onHandlePointerUp)
    handleEl?.addEventListener('pointercancel', onHandlePointerCancel)

    event.preventDefault()
    vibrate(HAPTIC_LIGHT)
  }

  function onHandlePointerMove(event) {
    if (!dragActive.value || event.pointerId !== pointerId) return
    if (event.cancelable) event.preventDefault()
    onPointerMove(event.clientX, event.clientY)
  }

  function onHandlePointerUp(event) {
    if (!dragActive.value || event.pointerId !== pointerId) return
    unbindHandle(event.currentTarget)
    void finishDrag(true)
  }

  function onHandlePointerCancel(event) {
    if (!dragActive.value || event.pointerId !== pointerId) return
    unbindHandle(event.currentTarget)
    void finishDrag(false)
  }

  function unbindHandle(el) {
    const handleEl = /** @type {HTMLElement | null} */ (el || null)
    if (handleEl) {
      handleEl.removeEventListener('pointermove', onHandlePointerMove)
      handleEl.removeEventListener('pointerup', onHandlePointerUp)
      handleEl.removeEventListener('pointercancel', onHandlePointerCancel)
      try {
        if (pointerId != null) handleEl.releasePointerCapture?.(pointerId)
      } catch {}
    }
  }

  /**
   * 入口：GoodsCard 把手 pointerdown。
   * @param {PointerEvent} event
   * @param {{ id: string, clientX: number, clientY: number }} payload
   */
  function beginFromHandle(event, payload) {
    onHandlePointerDown(event, payload)
  }

  function cancelDrag() {
    if (!dragActive.value) return
    // 尽量从当前 dragEl 的父级把手解绑——capture 元素就是 handle
    const handleEl = dragEl?.parentElement?.querySelector?.('.reorder-handle')
      || dragEl?.querySelector?.('.reorder-handle')
      || null
    unbindHandle(handleEl)
    void finishDrag(false)
  }

  onBeforeUnmount(() => { cancelDrag() })

  return {
    dragActive,
    dragId,
    dragStyle,
    shiftMap,
    targetId,
    beginFromHandle,
    cancelDrag
  }
}

export const GOODS_REORDER_DRAG_BODY_CSS = `
body.goods-reorder-dragging,
body.goods-reorder-dragging * {
  user-select: none !important;
  -webkit-user-select: none !important;
}
body.goods-reorder-dragging {
  cursor: grabbing !important;
}
body.goods-reorder-dragging .goods-card {
  transition: none !important;
}
.goods-card--reorder-dragging {
  z-index: 40 !important;
  transition: none !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28) !important;
  cursor: grabbing !important;
}
.goods-card--reorder-dragging:active {
  transform: none;
}
.goods-card--reorder-target {
  outline: 2px dashed color-mix(in srgb, var(--app-text, #111) 40%, transparent);
  outline-offset: 3px;
}
`
