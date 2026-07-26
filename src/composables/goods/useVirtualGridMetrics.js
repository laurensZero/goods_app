import { ref } from 'vue'

/**
 * 虚拟网格行高实测。
 *
 * 卡片封面是 aspect-ratio 1:1，实际行高 = 列宽 + 文字区常量，随设备宽度、
 * 列数、系统字体缩放变化——硬编码的行高估算在几乎所有设备上都有每行几
 * 像素的误差，误差随滚动深度累积，渲染窗口每次平移都会造成可见跳动。
 *
 * 这里从已渲染的行实测行距（含 grid gap），并按密度缓存派生常量
 * textExtra = rowSpan - gap - colWidth（与宽度无关），窗口尺寸变化时无需
 * 等待重新测量即可解析新行高。分组卡整行比普通卡矮，置顶模式下位于列表
 * 头部的纯分组行单独测量、单独建模。
 *
 * 测量基于 offsetTop（不受 transform 影响，FLIP/入场动画期间也正确），
 * 两端点相差多行取均值摊薄取整误差；与 getBoundingClientRect 结果一致时
 * 采用后者获得亚像素精度。
 *
 * 已知限制：按时间混排（chronological）模式下出现在列表中部的整行分组卡
 * 不参与建模，跨越渲染窗口边界时会有一次有界的小幅偏移（≈普通行与分组行
 * 高度差），出现条件苛刻（需 ≥列数 个分组恰好排满一行），不值得为其引入
 * 逐行建模的复杂度。
 */
export function useVirtualGridMetrics({
  getGridEl,
  getCols,
  getDensity,
  getLeadingGroupCount = () => 0,
  fallbackRowHeightMap = {},
  fallbackRowGap = 12
}) {
  // 测量结果落地时自增；spacer computed 读取它以便重新求值
  const metricsVersion = ref(0)
  const cache = new Map()
  let measureRaf = 0
  let measureAttempts = 0

  const MIN_ROW_SPAN = 60
  const MAX_ROW_SPAN = 1200
  const MAX_MEASURE_ATTEMPTS = 60

  function readGap(el, axis) {
    const style = window.getComputedStyle?.(el)
    const parsed = parseFloat(axis === 'column' ? style?.columnGap : style?.rowGap)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackRowGap
  }

  function collectCards(el) {
    const cards = []
    for (const child of el.children) {
      if (child.classList?.contains('goods-list-spacer')) continue
      cards.push(child)
    }
    return cards
  }

  function isEntryFresh(entry, cols, gridWidth) {
    return entry && entry.cols === cols && gridWidth > 0 && Math.abs(entry.gridWidth - gridWidth) < 1
  }

  // 置顶分组行还没学到行距（首测发生在滚过分组块之后等情况）
  function entryNeedsGroupSpan(entry) {
    if (!entry || entry.groupTextExtra != null) return false
    const cols = getCols()
    if (!Number.isFinite(cols) || cols < 1) return false
    return Math.max(0, getLeadingGroupCount() || 0) >= cols
  }

  function needsGroupSpanMeasure() {
    return entryNeedsGroupSpan(cache.get(getDensity()))
  }

  function tryMeasure() {
    const density = getDensity()
    if (!density || density === 'timeline') return true

    const el = getGridEl?.()
    if (!el || !el.isConnected) return false

    const cols = getCols()
    if (!Number.isFinite(cols) || cols < 1) return false

    const gridWidth = el.clientWidth
    if (!(gridWidth > 0)) return false

    const existing = cache.get(density)
    if (isEntryFresh(existing, cols, gridWidth) && !entryNeedsGroupSpan(existing)) return true

    const cards = collectCards(el)
    if (cards.length < cols + 1) return false

    const rowCount = Math.floor((cards.length - 1) / cols) + 1
    if (rowCount < 2) return false

    // 行首卡片的 offsetTop 即行顶；整行都是分组卡的行更矮，需与普通行区分
    const rowTops = []
    const rowIsGroup = []
    for (let r = 0; r < rowCount; r += 1) {
      rowTops.push(cards[r * cols].offsetTop)
      let allGroup = true
      for (let c = 0; c < cols; c += 1) {
        const card = cards[r * cols + c]
        if (!card) break
        if (!card.classList.contains('group-card')) {
          allGroup = false
          break
        }
      }
      rowIsGroup.push(allGroup)
    }

    // 取最长的连续普通行区间测量普通行距
    let bestStart = -1
    let bestLen = 0
    let runStart = -1
    for (let r = 0; r <= rowCount; r += 1) {
      const isGoodsRow = r < rowCount && !rowIsGroup[r]
      if (isGoodsRow) {
        if (runStart < 0) runStart = r
        continue
      }
      if (runStart >= 0) {
        const len = r - runStart
        if (len > bestLen) {
          bestLen = len
          bestStart = runStart
        }
        runStart = -1
      }
    }
    if (bestLen < 2) return false

    const a = bestStart
    const b = bestStart + bestLen - 1
    const spanRows = b - a
    const offsetDelta = rowTops[b] - rowTops[a]
    const rectDelta = cards[b * cols].getBoundingClientRect().top - cards[a * cols].getBoundingClientRect().top
    // 比较未平均的端点差：祖先 transform（如视图切换入场的 scale）会让 rect
    // 整体偏差随行数放大而被识破，此时退回不受 transform 影响的 offset 值
    const rowSpan = (Math.abs(rectDelta - offsetDelta) <= 2 ? rectDelta : offsetDelta) / spanRows
    if (!(rowSpan >= MIN_ROW_SPAN && rowSpan <= MAX_ROW_SPAN)) return false

    // 分组行行距 = 下一行行顶差（含 gap）；对所有可测的分组行取均值
    let groupSpanSum = 0
    let groupSpanCount = 0
    for (let r = 0; r < rowCount - 1; r += 1) {
      if (!rowIsGroup[r]) continue
      groupSpanSum += rowTops[r + 1] - rowTops[r]
      groupSpanCount += 1
    }
    let groupRowSpan = null
    if (groupSpanCount > 0) {
      const span = groupSpanSum / groupSpanCount
      if (span >= MIN_ROW_SPAN && span <= MAX_ROW_SPAN) groupRowSpan = span
    }

    const gap = readGap(el, 'row')
    const columnGap = readGap(el, 'column')
    const colWidth = (gridWidth - (cols - 1) * columnGap) / cols
    // 本次窗口里没有分组行时保留旧的分组行知识（groupTextExtra 与宽度无关），
    // 避免旋转/深位置重测把已学到的数据覆盖丢失
    const groupTextExtra = groupRowSpan != null
      ? groupRowSpan - gap - colWidth
      : (existing?.groupTextExtra ?? null)
    cache.set(density, {
      cols,
      gridWidth,
      gap,
      columnGap,
      rowSpan,
      groupRowSpan,
      textExtra: rowSpan - gap - colWidth,
      groupTextExtra
    })
    metricsVersion.value += 1
    return true
  }

  function scheduleMeasure() {
    measureAttempts = 0
    if (measureRaf) return
    const tick = () => {
      measureRaf = 0
      if (tryMeasure()) return
      measureAttempts += 1
      if (measureAttempts < MAX_MEASURE_ATTEMPTS) {
        measureRaf = window.requestAnimationFrame(tick)
      }
    }
    measureRaf = window.requestAnimationFrame(tick)
  }

  function cancelMeasure() {
    if (!measureRaf) return
    window.cancelAnimationFrame(measureRaf)
    measureRaf = 0
  }

  function getGap() {
    void metricsVersion.value
    const entry = cache.get(getDensity())
    return entry ? entry.gap : fallbackRowGap
  }

  function deriveSpan(entry, textExtra) {
    const el = getGridEl?.()
    const gridWidth = el?.clientWidth || 0
    if (!(gridWidth > 0)) return null
    const cols = getCols()
    if (!Number.isFinite(cols) || cols < 1) return null
    const colWidth = (gridWidth - (cols - 1) * entry.columnGap) / cols
    const derived = colWidth + textExtra + entry.gap
    return derived >= MIN_ROW_SPAN && derived <= MAX_ROW_SPAN ? derived : null
  }

  function getRowSpan(density = getDensity()) {
    void metricsVersion.value
    const entry = cache.get(density)
    if (entry) {
      const el = getGridEl?.()
      if (isEntryFresh(entry, getCols(), el?.clientWidth || 0)) return entry.rowSpan
      // 宽度或列数已变：用与宽度无关的 textExtra 立即派生，避免等待重测
      return deriveSpan(entry, entry.textExtra) ?? entry.rowSpan
    }
    return (fallbackRowHeightMap[density] || 272) + fallbackRowGap
  }

  function getGroupRowSpan(density = getDensity()) {
    void metricsVersion.value
    const entry = cache.get(density)
    if (entry) {
      if (entry.groupRowSpan != null) {
        const el = getGridEl?.()
        if (isEntryFresh(entry, getCols(), el?.clientWidth || 0)) return entry.groupRowSpan
      }
      if (entry.groupTextExtra != null) {
        const derived = deriveSpan(entry, entry.groupTextExtra)
        if (derived != null) return derived
      }
      if (entry.groupRowSpan != null) return entry.groupRowSpan
    }
    return getRowSpan(density)
  }

  function getLeadingShortRowCount() {
    const cols = getCols()
    if (!Number.isFinite(cols) || cols < 1) return 0
    return Math.floor(Math.max(0, getLeadingGroupCount() || 0) / cols)
  }

  // 第 row 行行顶相对网格内容起点的偏移（含头部纯分组行的矮行建模）
  function offsetOfRow(row) {
    if (!(row > 0)) return 0
    const shortRows = Math.min(row, getLeadingShortRowCount())
    if (shortRows > 0) {
      return shortRows * getGroupRowSpan() + (row - shortRows) * getRowSpan()
    }
    return row * getRowSpan()
  }

  // offsetOfRow 的逆映射：偏移量落在第几行
  function rowAtOffset(offset) {
    const top = Math.max(0, Number(offset) || 0)
    const shortRowCount = getLeadingShortRowCount()
    if (shortRowCount > 0) {
      const groupSpan = Math.max(1, getGroupRowSpan())
      const groupBlock = shortRowCount * groupSpan
      if (top < groupBlock) return Math.floor(top / groupSpan)
      return shortRowCount + Math.floor((top - groupBlock) / Math.max(1, getRowSpan()))
    }
    return Math.floor(top / Math.max(1, getRowSpan()))
  }

  // spacer 自身是参与 grid gap 的一个网格项，故减去与相邻行之间的一个 gap
  function headSpacerHeight(headRows) {
    if (!(headRows > 0)) return 0
    return Math.max(0, offsetOfRow(headRows) - getGap())
  }

  function tailSpacerHeight(remainingRows) {
    if (!(remainingRows > 0)) return 0
    return Math.max(0, remainingRows * getRowSpan() - getGap())
  }

  return {
    metricsVersion,
    scheduleMeasure,
    cancelMeasure,
    needsGroupSpanMeasure,
    getGap,
    getRowSpan,
    getGroupRowSpan,
    offsetOfRow,
    rowAtOffset,
    headSpacerHeight,
    tailSpacerHeight
  }
}
