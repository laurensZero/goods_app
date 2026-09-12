export const COLLAGE_SNAP_THRESHOLD = 8

/**
 * 在候选目标轴位置中找最近吸附点
 * @param {number[]} movingEdges 拖动对象在该轴上的候选点（边/中心）
 * @param {number[]} targetEdges 目标轴位置
 * @param {number} threshold
 * @returns {{ delta: number, target: number } | null}
 */
export function findSnapOnAxis(movingEdges, targetEdges, threshold = COLLAGE_SNAP_THRESHOLD) {
  let best = null
  for (const moving of movingEdges) {
    for (const target of targetEdges) {
      const delta = Number(target) - Number(moving)
      if (!Number.isFinite(delta)) continue
      if (Math.abs(delta) > threshold) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, target: Number(target) }
      }
    }
  }
  return best
}

export function buildCanvasAxisTargets(size, isHorizontal) {
  const length = Number(size) || 0
  if (!length) return []
  return [0, length / 2, length]
}

export function buildObjectAxisTargets(rect, isHorizontal) {
  if (!rect) return []
  const left = Number(rect.left) || 0
  const top = Number(rect.top) || 0
  const width = Number(rect.width) || 0
  const height = Number(rect.height) || 0
  if (isHorizontal) {
    return [left, left + width / 2, left + width]
  }
  return [top, top + height / 2, top + height]
}

/**
 * 计算相对画布的对齐位移（dx, dy）
 * @param {{left:number,top:number,width:number,height:number}} rect
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {'left'|'centerH'|'right'|'top'|'centerV'|'bottom'|'center'} mode
 */
export function computeAlignDelta(rect, canvasWidth, canvasHeight, mode) {
  const left = Number(rect?.left) || 0
  const top = Number(rect?.top) || 0
  const width = Number(rect?.width) || 0
  const height = Number(rect?.height) || 0
  const cw = Number(canvasWidth) || 0
  const ch = Number(canvasHeight) || 0

  let dx = 0
  let dy = 0

  switch (mode) {
    case 'left':
      dx = -left
      break
    case 'right':
      dx = cw - (left + width)
      break
    case 'centerH':
      dx = cw / 2 - (left + width / 2)
      break
    case 'top':
      dy = -top
      break
    case 'bottom':
      dy = ch - (top + height)
      break
    case 'centerV':
      dy = ch / 2 - (top + height / 2)
      break
    case 'center':
      dx = cw / 2 - (left + width / 2)
      dy = ch / 2 - (top + height / 2)
      break
    default:
      break
  }

  return { dx, dy }
}
