// @ts-check
import { onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'

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
   * 以拖后 DOM 视觉序为准写回 sortOrder。
   * 日期主排序时：同日相对序 = sortOrder；跨日仍由日期字段决定。
   */
  function buildFullOrder(domGoodsIds) {
    const full = getItems()
      .filter((item) => item && item._type !== 'group' && item.id)
      .map((item) => String(item.id))
    if (!domGoodsIds.length) return null

    const domSet = new Set(domGoodsIds)
    const merged = [...domGoodsIds]
    for (const id of full) {
      if (!domSet.has(id)) merged.push(id)
    }
    return merged
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
    clearDropTargets()
    try { document.body.classList.remove('goods-reorder-dragging') } catch {}
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
      // 动画会和整表重排叠加，手机上拖动更卡
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
      // 触控短延迟：区分「拖把手」和「想滚列表」，减少误触与手势冲突
      delayOnTouchOnly: true,
      delay: 60,
      touchStartThreshold: 6,
      onChoose(evt) {
        try { document.body.classList.add('goods-reorder-dragging') } catch {}
        const draggedId = String(evt?.item?.getAttribute?.('data-goods-id') || '')
        if (draggedId) markDropTargets(draggedId)
      },
      onStart(evt) {
        try { document.body.classList.add('goods-reorder-dragging') } catch {}
        const draggedId = String(evt?.item?.getAttribute?.('data-goods-id') || '')
        if (draggedId) markDropTargets(draggedId)
      },
      /** 分组限制（同日/同名/同价）：只允许组内互换 */
      onMove(evt) {
        const groupKeyFn = getDayKey?.()
        if (!groupKeyFn) return true
        const draggedId = String(evt.dragged?.getAttribute?.('data-goods-id') || '')
        const relatedId = String(evt.related?.getAttribute?.('data-goods-id') || '')
        if (!draggedId || !relatedId) return true
        const a = groupKeyFn(draggedId)
        const b = groupKeyFn(relatedId)
        if (a == null || b == null) return true
        return a === b
      },
      async onEnd(evt) {
        try { document.body.classList.remove('goods-reorder-dragging') } catch {}
        clearDropTargets()
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
    else {
      destroy()
      try { document.body.classList.remove('goods-reorder-dragging') } catch {}
    }
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
