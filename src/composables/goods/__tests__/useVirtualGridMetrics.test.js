import { describe, expect, it } from 'vitest'
import { useVirtualGridMetrics } from '../useVirtualGridMetrics'

const ROW_HEIGHT_MAP = {
  comfortable: 308,
  standard: 272,
  compact: 236
}
const GAP = 12

function createMetrics(overrides = {}) {
  return useVirtualGridMetrics({
    getGridEl: () => null,
    getCols: () => 3,
    getDensity: () => 'standard',
    getLeadingGroupCount: () => 0,
    fallbackRowHeightMap: ROW_HEIGHT_MAP,
    fallbackRowGap: GAP,
    ...overrides
  })
}

describe('useVirtualGridMetrics（未测量时的 fallback 数学）', () => {
  it('无 DOM 时 rowSpan 回退到 ROW_HEIGHT_MAP + gap', () => {
    const m = createMetrics()
    expect(m.getRowSpan()).toBe(272 + GAP)
    expect(m.getRowSpan('comfortable')).toBe(308 + GAP)
    expect(m.getRowSpan('compact')).toBe(236 + GAP)
  })

  it('头部 spacer 与旧公式 headRows*rowHeight + (headRows-1)*gap 等价', () => {
    const m = createMetrics()
    for (const headRows of [1, 2, 5, 40]) {
      const legacy = headRows * 272 + Math.max(0, headRows - 1) * GAP
      expect(m.headSpacerHeight(headRows)).toBe(legacy)
    }
    expect(m.headSpacerHeight(0)).toBe(0)
    expect(m.headSpacerHeight(-1)).toBe(0)
  })

  it('尾部 spacer 与旧公式等价', () => {
    const m = createMetrics()
    for (const rows of [1, 3, 17]) {
      const legacy = rows * 272 + Math.max(0, rows - 1) * GAP
      expect(m.tailSpacerHeight(rows)).toBe(legacy)
    }
    expect(m.tailSpacerHeight(0)).toBe(0)
  })

  it('rowAtOffset 是 offsetOfRow 的逆映射', () => {
    const m = createMetrics()
    for (const row of [0, 1, 2, 7, 50]) {
      const offset = m.offsetOfRow(row)
      expect(m.rowAtOffset(offset)).toBe(row)
      // 行内任意偏移仍落在同一行
      expect(m.rowAtOffset(offset + 1)).toBe(row)
      if (row > 0) expect(m.rowAtOffset(offset - 1)).toBe(row - 1)
    }
  })

  it('rowAtOffset 与旧的 floor(top/rowSpan) 一致（无分组行时）', () => {
    const m = createMetrics()
    const rowSpan = 272 + GAP
    for (const top of [0, 100, 283, 284, 285, 999, 5000]) {
      expect(m.rowAtOffset(top)).toBe(Math.floor(top / rowSpan))
    }
    expect(m.rowAtOffset(-50)).toBe(0)
  })

  it('有前置分组行但行距未学到时退化为均匀行距（正逆映射仍一致）', () => {
    const m = createMetrics({ getLeadingGroupCount: () => 7, getCols: () => 3 })
    // 7 个分组 / 3 列 = 2 个纯分组行；未测量时分组行距回退为普通行距
    for (const row of [0, 1, 2, 3, 10]) {
      expect(m.rowAtOffset(m.offsetOfRow(row))).toBe(row)
    }
    expect(m.offsetOfRow(5)).toBe(5 * (272 + GAP))
  })

  it('时间线密度下不需要分组行补测', () => {
    const m = createMetrics({ getDensity: () => 'timeline', getLeadingGroupCount: () => 9 })
    expect(m.needsGroupSpanMeasure()).toBe(false)
  })

  it('未测量过时不请求分组行补测（无缓存条目可补）', () => {
    const m = createMetrics({ getLeadingGroupCount: () => 9 })
    expect(m.needsGroupSpanMeasure()).toBe(false)
  })
})
