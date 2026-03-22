import { createDensityFlip } from '@/utils/densityFlip'

export function useGoodsGridDensityFlip({
  getContainer,
  getDisplayDensity,
  getResponsiveCols,
  rowHeightMap,
  getDensityScrollTop,
  getFlipViewportHeight,
  getFlipViewportRect,
  getContainerScrollOffset,
  isLowPerfDevice,
  getItemCount
}) {
  return createDensityFlip({
    getContainer,
    getItems: (container) => {
      if (!container) return []

      const children = container.children
      const total = children.length
      if (!total) return []

      const density = getDisplayDensity()
      const rowHeight = rowHeightMap[density] || 272
      const cols = getResponsiveCols(density)
      const scrollTop = getDensityScrollTop()
      const viewportHeight = getFlipViewportHeight()
      const relativeScrollTop = Math.max(0, scrollTop - getContainerScrollOffset(container))
      const startRow = Math.max(0, Math.floor(relativeScrollTop / rowHeight) - 1)
      const endRow = Math.ceil((relativeScrollTop + viewportHeight) / rowHeight) + 1
      const startIndex = Math.max(0, startRow * cols)
      const endIndex = Math.min(total, endRow * cols)
      const items = []

      for (let i = startIndex; i < endIndex; i += 1) {
        const el = children[i]
        if (el) items.push(el)
      }

      return items
    },
    getViewport: () => getFlipViewportRect(),
    maxItems: () => (isLowPerfDevice ? 14 : getItemCount() > 220 ? 24 : 40),
    overscan: () => (isLowPerfDevice ? 40 : 80),
    duration: () => (isLowPerfDevice ? 200 : 260),
    fade: () => (isLowPerfDevice ? 0.985 : 0.97),
    scale: () => (isLowPerfDevice ? 0.995 : 0.99)
  })
}
