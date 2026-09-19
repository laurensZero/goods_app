// @ts-check
import { onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'

/**
 * 虚拟列表重排合并：把 DOM 上可见 goods 的新顺序写回它们在全量序列中的槽位。
 * 屏外 id 不动；组卡 id 一律忽略。
 * @param {Array<{ id?: string, _type?: string }>} displayItems
 * @param {string[]} domGoodsIds
 * @returns {string[] | null}
 */
export function mergeVisibleReorderIntoFullOrder(displayItems, domGoodsIds) {
  const full = (displayItems || [])
    .filter((item) => item && item._type !== 'group' && item.id)
    .map((item) => String(item.id))
  if (!full.length) return null

  const fullSet = new Set(full)
  const domGoodsOnly = (domGoodsIds || []).map(String).filter((id) => fullSet.has(id))
  if (!domGoodsOnly.length) return null

  const domSet = new Set(domGoodsOnly)
  const next = full.slice()
  /** @type {number[]} */
  const positions = []
  for (let i = 0; i < next.length; i++) {
    if (domSet.has(next[i])) positions.push(i)
  }
  for (let i = 0; i < positions.length; i++) {
    next[positions[i]] = domGoodsOnly[i]
  }
  return next
}

/**
 * 用 SortableJS 做收藏/心愿主列表网格重排。
 * 支持 custom 全量重排，以及 createdAt/acquiredAt 下「同一天内」小范围重排。
 *
 * 手机端（如小米旗舰）掉帧主因：
 * - 重排时关掉虚拟列表 → 整表 GoodsCard 进 DOM
 * - forceFallback 拖影 + 每次 onChoose/onStart 扫全表改 style
 * - 卡片 transition/阴影在拖动中持续触发合成
 * 因此：自定义模式不做 O(n) 置灰；拖动中关动画；触控加短 delay 防和滚动手势抢。
 *
 * @param {object} options
 * @param {() => HTMLElement | null} options.getGridEl
 * @param {() => Array<{ id: string, _type?: string }>} options.getItems 完整展示序列
 * @param {() => boolean} options.canReorder
 * @param {(orderedGoodsIds: string[]) => void | Promise<void>} options.onCommit
 * @param {() => ((id: string) => string) | null} [options.getDayKey]
 *   返回 id → 日键；提供后限制只能在同日条目间拖动
 */
export function useGoodsSortable(options) {
  const { getGridEl, getItems, canReorder, onCommit, getDayKey } = options

  /** @type {import('sortablejs').Sortable | null} */
  let sortable = null
  let syncing = false
  let markedGroupId = false
  /** @type {string} */
  let currentDragId = ''
  /** @type {(() => void) | null} */
  let dragScrollHandler = null
  let dragScrollRaf = 0

  function detachDragScrollWatch() {
    if (dragScrollRaf) {
      cancelAnimationFrame(dragScrollRaf)
      dragScrollRaf = 0
    }
    if (dragScrollHandler) {
      window.removeEventListener('scroll', dragScrollHandler, true)
      dragScrollHandler = null
    }
  }

  /** 虚拟列表滚动加载后，给新露出的卡片补上可放/不可放标记 */
  function ensureDropTargetsMarked(draggedId) {
    const id = String(draggedId || currentDragId || '')
    if (!id || !getDayKey?.()) return
    const gridEl = getGridEl()
    if (!gridEl) return
    const nodes = gridEl.querySelectorAll('.goods-card[data-goods-id]')
    let needs = false
    nodes.forEach((n) => {
      const nid = String(n.getAttribute('data-goods-id') || '')
      if (!nid || nid === id) return
      if (!n.classList.contains('goods-sortable-drop-ok') && !n.classList.contains('goods-sortable-drop-no')) {
        needs = true
      }
    })
    if (needs) markDropTargets(id)
  }

  function attachDragScrollWatch() {
    detachDragScrollWatch()
    dragScrollHandler = () => {
      if (!currentDragId || !getDayKey?.()) return
      if (dragScrollRaf) return
      dragScrollRaf = requestAnimationFrame(() => {
        dragScrollRaf = 0
        ensureDropTargetsMarked(currentDragId)
      })
    }
    // capture：命中虚拟列表/页面等任意滚动容器
    window.addEventListener('scroll', dragScrollHandler, true)
  }

  function beginDragMarking(draggedId) {
    currentDragId = draggedId
    try { document.body.classList.add('goods-reorder-dragging') } catch {}
    if (draggedId) markDropTargets(draggedId)
    // 组限制模式：滚动加载新卡时补灰色遮罩
    if (getDayKey?.()) attachDragScrollWatch()
  }

  function endDragMarking() {
    currentDragId = ''
    detachDragScrollWatch()
    try { document.body.classList.remove('goods-reorder-dragging') } catch {}
    clearDropTargets()
  }

  function readGoodsOrderFromDom(gridEl) {
    /** @type {string[]} */
    const ids = []
    gridEl.querySelectorAll('.goods-card[data-goods-id]').forEach((node) => {
      const id = String(node.getAttribute('data-goods-id') || '')
      if (id) ids.push(id)
    })
    return ids
  }

  /**
   * 虚拟列表下的全量合并：屏上只改「可见 goods」在全量序列里对应槽位的相对序，
   * 屏外条目保持原位置，避免把未渲染项整体甩到末尾。
   * @param {string[]} fullGoodsIds 当前完整未分组 goods 序列（getItems）
   * @param {string[]} domGoodsIds 拖后 DOM 里可见 goods 的视觉序
   * @returns {string[] | null}
   */
  function buildFullOrder(domGoodsIds) {
    return mergeVisibleReorderIntoFullOrder(getItems(), domGoodsIds)
  }

  function markDropTargets(draggedId) {
    const groupKeyFn = getDayKey?.()
    const gridEl = getGridEl()
    if (!gridEl) return

    // 自定义：全部可放。避免拖动起点扫全表改 style（大列表手机上明显掉帧）
    if (!groupKeyFn) {
      if (markedGroupId) {
        document.body.classList.remove('goods-reorder-has-group')
        markedGroupId = false
      }
      return
    }

    markedGroupId = true
    document.body.classList.add('goods-reorder-has-group')
    const key = groupKeyFn(String(draggedId))
    const nodes = gridEl.querySelectorAll('.goods-card[data-goods-id]')

    nodes.forEach((n) => {
      const id = String(n.getAttribute('data-goods-id') || '')
      const isSelf = id === String(draggedId)
      const ok = !isSelf && key != null && groupKeyFn(id) === key
      n.classList.toggle('goods-sortable-drop-ok', ok)
      n.classList.toggle('goods-sortable-drop-no', !ok && !isSelf)
      if (isSelf) {
        n.style.filter = ''
        n.style.opacity = ''
        return
      }
      if (ok) {
        n.style.filter = ''
        n.style.opacity = ''
      } else {
        n.style.filter = 'grayscale(1)'
        n.style.opacity = '0.28'
      }
    })
  }

  function clearDropTargets() {
    document.body.classList.remove('goods-reorder-has-group')
    markedGroupId = false
    const gridEl = getGridEl()
    if (!gridEl) return
    // 无组限制时通常没写过 drop 样式，跳过多余全表清理
    if (!getDayKey?.()) return
    gridEl.querySelectorAll('.goods-card[data-goods-id]').forEach((n) => {
      n.classList.remove('goods-sortable-drop-ok', 'goods-sortable-drop-no')
      n.style.filter = ''
      n.style.opacity = ''
    })
  }

  function destroy() {
    if (sortable) {
      try { sortable.destroy() } catch {}
      sortable = null
    }
    endDragMarking()
  }

  function create() {
    destroy()
    const gridEl = getGridEl()
    if (!gridEl) return
    if (!canReorder()) return

    sortable = Sortable.create(gridEl, {
      handle: '.reorder-handle',
      draggable: '.goods-card',
      filter: '.goods-list-spacer',
      preventOnFilter: false,
      animation: 0,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackClass: 'goods-sortable-fallback',
      chosenClass: 'goods-sortable-chosen',
      ghostClass: 'goods-sortable-ghost',
      dragClass: 'goods-sortable-drag',
      dataIdAttr: 'data-goods-id',
      swapThreshold: 0.65,
      invertSwap: false,
      scroll: true,
      scrollSensitivity: 48,
      scrollSpeed: 14,
      bubbleScroll: true,
      delayOnTouchOnly: true,
      delay: 60,
      touchStartThreshold: 6,
      onChoose(evt) {
        const draggedId = String(evt?.item?.getAttribute?.('data-goods-id') || '')
        beginDragMarking(draggedId)
      },
      onStart(evt) {
        const draggedId = String(evt?.item?.getAttribute?.('data-goods-id') || '')
        beginDragMarking(draggedId)
      },
      /** 分组限制（同日/同名/同价）：只允许组内互换；顺带补新加载卡片的遮罩 */
      onMove(evt) {
        const groupKeyFn = getDayKey?.()
        const draggedId = String(evt.dragged?.getAttribute?.('data-goods-id') || '')
        if (draggedId && draggedId !== currentDragId) {
          currentDragId = draggedId
        }
        if (!groupKeyFn) return true
        ensureDropTargetsMarked(currentDragId || draggedId)
        const relatedId = String(evt.related?.getAttribute?.('data-goods-id') || '')
        if (!draggedId || !relatedId) return true
        const a = groupKeyFn(draggedId)
        const b = groupKeyFn(relatedId)
        if (a == null || b == null) return true
        return a === b
      },
      async onEnd(evt) {
        endDragMarking()
        if (syncing) return
        const from = Number(evt.oldIndex)
        const to = Number(evt.newIndex)
        if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return

        const grid = getGridEl()
        if (!grid) return
        const domGoodsIds = readGoodsOrderFromDom(grid)
        const fullOrder = buildFullOrder(domGoodsIds)
        if (!fullOrder || fullOrder.length === 0) return

        syncing = true
        try {
          await onCommit(fullOrder)
        } catch (e) {
          console.error('[goods-sortable] commit failed:', e)
        } finally {
          syncing = false
        }
      }
    })
  }

  /**
   * @param {boolean} enabled
   */
  function sync(enabled) {
    if (enabled) create()
    else destroy()
  }

  onBeforeUnmount(() => { destroy() })

  return { sync, destroy, get instance() { return sortable } }
}

export const GOODS_SORTABLE_CSS = `
body.goods-reorder-dragging,
body.goods-reorder-dragging * {
  user-select: none !important;
  -webkit-user-select: none !important;
  transition: none !important;
  animation: none !important;
}
body.goods-reorder-dragging {
  cursor: grabbing !important;
}
body.goods-reorder-dragging .goods-card {
  transition: none !important;
  /* 拖动中降低合成压力 */
  box-shadow: none !important;
}
body.goods-reorder-dragging .goods-card img {
  pointer-events: none !important;
}
/* 有组限制时：不可放入的卡片置灰（行内 filter 为主，class 兜底） */
body.goods-reorder-dragging.goods-reorder-has-group .goods-card.goods-sortable-drop-no {
  filter: grayscale(1) !important;
  opacity: 0.28 !important;
}
body.goods-reorder-dragging.goods-reorder-has-group .goods-card.goods-sortable-drop-ok {
  filter: none !important;
  opacity: 1 !important;
}
body.goods-reorder-dragging.goods-reorder-has-group .group-card {
  filter: grayscale(1) !important;
  opacity: 0.28 !important;
}
.goods-sortable-fallback {
  opacity: 0.92 !important;
  filter: none !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22) !important;
  transform: scale(1.03);
  cursor: grabbing !important;
  z-index: 1000 !important;
  pointer-events: none !important;
  /* fallback 用合成层，减轻拖动时主线程重排 */
  will-change: transform;
  contain: layout style paint;
}
.goods-sortable-ghost {
  opacity: 0.2;
}
.goods-sortable-chosen .reorder-handle {
  cursor: grabbing;
}
`
