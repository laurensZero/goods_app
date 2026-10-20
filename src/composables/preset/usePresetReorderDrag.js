import { onBeforeUnmount, reactive } from 'vue'

/**
 * 预设管理列表的拖动重排（参考活动曲目列表的拖拽手感）。
 *
 * 交互约定：
 * - 只从拖拽把手开始拖动，不干扰行内收藏/编辑/删除按钮；
 * - 拖动中的行跟手位移，其余行按目标位置让位；
 * - groupOf 可选：默认排序下收藏项 / 「其他」会被排序规则分组，
 *   拖动只允许在同一分组内换位，否则松手后会被拉回原位。
 *
 * @param {{
 *   listRef: import('vue').Ref<HTMLElement|null>,
 *   canDrag?: () => boolean,
 *   groupOf?: (index: number) => string,
 *   itemSelector?: string,
 *   onReorder: (from: number, to: number) => void
 * }} options
 */
export function usePresetReorderDrag({
  listRef,
  canDrag = () => true,
  groupOf = null,
  itemSelector = '[data-preset-item]',
  onReorder
}) {
  const drag = reactive({
    active: false,
    pointerId: null,
    index: -1,
    targetIndex: -1,
    startY: 0,
    lastClientY: 0,
    offset: 0,
    rectTop: 0,
    itemHeight: 0,
    gap: 10,
    rects: [],
    scrollEl: null,
    startScrollY: 0
  })
  let autoScrollRafId = 0

  function isDragging(index) {
    return drag.active && drag.index === index
  }

  function itemDragStyle(index) {
    if (!drag.active) return null
    if (index === drag.index) return { transform: `translateY(${drag.offset}px)` }
    const step = drag.itemHeight + drag.gap
    let shift = 0
    if (index > drag.index && index <= drag.targetIndex) shift = -step
    else if (index < drag.index && index >= drag.targetIndex) shift = step
    return shift ? { transform: `translateY(${shift}px)` } : null
  }

  function currentScrollTop() {
    return drag.scrollEl ? drag.scrollEl.scrollTop : window.scrollY
  }

  function findScrollParent(el) {
    let node = el?.parentElement || null
    while (node) {
      const overflowY = getComputedStyle(node).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
      node = node.parentElement
    }
    return null
  }

  function onDragPointerDown(event, index) {
    if (event.button != null && event.button !== 0) return
    if (drag.active || !canDrag()) return
    const listEl = listRef.value
    const itemEls = listEl ? Array.from(listEl.querySelectorAll(itemSelector)) : []
    if (itemEls.length < 2 || !itemEls[index]) return
    const rects = itemEls.map((el) => el.getBoundingClientRect())
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - (rects[0].top + rects[0].height)) : 10

    drag.active = true
    drag.pointerId = event.pointerId
    drag.index = index
    drag.targetIndex = index
    drag.startY = event.clientY
    drag.lastClientY = event.clientY
    drag.offset = 0
    drag.rectTop = rects[index].top
    drag.itemHeight = rects[index].height
    drag.gap = gap
    drag.rects = rects
    drag.scrollEl = findScrollParent(listEl)
    drag.startScrollY = currentScrollTop()

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      resetDragState()
      return
    }
    event.preventDefault()
  }

  function onDragPointerMove(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return
    updateDragGeometry(event.clientY)
    ensureAutoScroll()
  }

  function onDragPointerUp(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return
    const { index, targetIndex } = drag
    resetDragState()
    if (index !== targetIndex) onReorder?.(index, targetIndex)
  }

  function onDragPointerCancel(event) {
    if (!drag.active || event.pointerId !== drag.pointerId) return
    resetDragState()
  }

  function updateDragGeometry(clientY) {
    drag.lastClientY = clientY
    const scrollDelta = currentScrollTop() - drag.startScrollY
    drag.offset = clientY - drag.startY + scrollDelta
    const center = drag.rectTop + drag.offset + drag.itemHeight / 2
    const group = groupOf ? groupOf(drag.index) : null
    let target = drag.index
    drag.rects.forEach((rect, i) => {
      if (i === drag.index) return
      if (groupOf && groupOf(i) !== group) return
      const mid = rect.top + rect.height / 2 - scrollDelta
      if (i < drag.index && center < mid) target = Math.min(target, i)
      else if (i > drag.index && center > mid) target = Math.max(target, i)
    })
    drag.targetIndex = target
  }

  function ensureAutoScroll() {
    if (autoScrollRafId) return
    autoScrollRafId = requestAnimationFrame(() => {
      autoScrollRafId = 0
      if (!drag.active) return
      const delta = computeAutoScrollDelta()
      if (!delta) return
      if (drag.scrollEl) drag.scrollEl.scrollTop += delta
      else window.scrollBy(0, delta)
      updateDragGeometry(drag.lastClientY)
      ensureAutoScroll()
    })
  }

  function computeAutoScrollDelta() {
    const edge = 72
    if (drag.lastClientY < edge) return -Math.min(22, Math.ceil((edge - drag.lastClientY) / 3))
    const viewportBottom = window.innerHeight - edge
    if (drag.lastClientY > viewportBottom) return Math.min(22, Math.ceil((drag.lastClientY - viewportBottom) / 3))
    return 0
  }

  function resetDragState() {
    drag.active = false
    drag.pointerId = null
    drag.index = -1
    drag.targetIndex = -1
    drag.offset = 0
    drag.rects = []
    drag.scrollEl = null
    if (autoScrollRafId) {
      cancelAnimationFrame(autoScrollRafId)
      autoScrollRafId = 0
    }
  }

  onBeforeUnmount(() => {
    if (autoScrollRafId) cancelAnimationFrame(autoScrollRafId)
  })

  return {
    drag,
    isDragging,
    itemDragStyle,
    onDragPointerDown,
    onDragPointerMove,
    onDragPointerUp,
    onDragPointerCancel
  }
}
