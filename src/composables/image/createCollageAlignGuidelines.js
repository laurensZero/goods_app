import { Point } from 'fabric'

const GUIDE_COLOR = '#4f6ef7'
const LINE_WIDTH = 1
const LINE_MARGIN = 6

/**
 * 基于 fabric-guideline-plugin 的对齐参考线（适配 fabric 6）。
 * 参考线画在 selection overlay，不创建画布对象，不改 fabric 拖拽 offset。
 */
export function createCollageAlignGuidelines(canvas, options = {}) {
  const lineMargin = options.lineMargin ?? LINE_MARGIN
  const lineWidth = options.lineWidth ?? LINE_WIDTH
  const lineColor = options.lineColor ?? GUIDE_COLOR

  let verticalLines = []
  let horizontalLines = []

  function clearMeta() {
    verticalLines = []
    horizontalLines = []
  }

  function clearOverlay() {
    try {
      canvas.clearContext(canvas.getSelectionContext())
    } catch {
      // ignore
    }
  }

  function isInRange(a, b) {
    const zoom = canvas.getZoom() || 1
    return Math.abs(Math.round(a) - Math.round(b)) <= lineMargin / zoom
  }

  function getDraggingCoords(obj) {
    const ac = obj.aCoords
    if (!ac) {
      return { c: obj.getCenterPoint() }
    }
    const center = new Point((ac.tl.x + ac.br.x) / 2, (ac.tl.y + ac.br.y) / 2)
    const sx = center.x - obj.getCenterPoint().x
    const sy = center.y - obj.getCenterPoint().y
    const out = { c: obj.getCenterPoint() }
    for (const key of Object.keys(ac)) {
      out[key] = { x: ac[key].x - sx, y: ac[key].y - sy }
    }
    return out
  }

  /**
   * 在「对齐后应有的中心坐标」里选离当前位置最近的一个。
   * candidates: { center, guide }
   */
  function pickNearestCenter(candidates, currentCenter) {
    if (!candidates.length) return null
    let best = candidates[0]
    let bestAbs = Math.abs(currentCenter - best.center)
    for (let i = 1; i < candidates.length; i += 1) {
      const abs = Math.abs(currentCenter - candidates[i].center)
      if (abs < bestAbs) {
        bestAbs = abs
        best = candidates[i]
      }
    }
    return best
  }

  function drawSign(x, y) {
    const ctx = canvas.getSelectionContext()
    const s = 2
    ctx.lineWidth = 0.5
    ctx.strokeStyle = lineColor
    ctx.beginPath()
    ctx.moveTo(x - s, y - s)
    ctx.lineTo(x + s, y + s)
    ctx.moveTo(x + s, y - s)
    ctx.lineTo(x - s, y + s)
    ctx.stroke()
  }

  function drawLine(x1, y1, x2, y2) {
    const ctx = canvas.getSelectionContext()
    const vt = canvas.viewportTransform
    const p1 = new Point(x1, y1).transform(vt)
    const p2 = new Point(x2, y2).transform(vt)
    ctx.save()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    drawSign(p1.x, p1.y)
    drawSign(p2.x, p2.y)
    ctx.restore()
  }

  function applySnap(activeObject) {
    const dragging = getDraggingCoords(activeObject)
    const centerX = dragging.c.x
    const centerY = dragging.c.y

    const canvasTargetsX = [0, canvas.getWidth() / 2, canvas.getWidth()]
    const canvasTargetsY = [0, canvas.getHeight() / 2, canvas.getHeight()]
    const otherPoints = []

    for (const other of canvas.getObjects()) {
      if (!other || other === activeObject || other.excludeFromExport || other.visible === false) continue
      const ac = other.aCoords
      if (!ac) continue
      otherPoints.push({ ...ac, c: other.getCenterPoint() })
    }

    const centerXCandidates = []
    const centerYCandidates = []

    for (const key of Object.keys(dragging)) {
      const dp = dragging[key]

      for (const tx of canvasTargetsX) {
        if (isInRange(dp.x, tx)) {
          centerXCandidates.push({ center: centerX + (tx - dp.x), guide: tx })
        }
      }
      for (const ty of canvasTargetsY) {
        if (isInRange(dp.y, ty)) {
          centerYCandidates.push({ center: centerY + (ty - dp.y), guide: ty })
        }
      }

      for (const op of otherPoints) {
        for (const ok of Object.keys(op)) {
          if (isInRange(dp.x, op[ok].x)) {
            centerXCandidates.push({ center: centerX + (op[ok].x - dp.x), guide: op[ok].x })
          }
          if (isInRange(dp.y, op[ok].y)) {
            centerYCandidates.push({ center: centerY + (op[ok].y - dp.y), guide: op[ok].y })
          }
        }
      }
    }

    const bestX = pickNearestCenter(centerXCandidates, centerX)
    const bestY = pickNearestCenter(centerYCandidates, centerY)

    if (bestX || bestY) {
      const nextX = bestX ? bestX.center : centerX
      const nextY = bestY ? bestY.center : centerY
      activeObject.setPositionByOrigin(new Point(nextX, nextY), 'center', 'center')
      activeObject.setCoords()
    }

    verticalLines = bestX ? [{ x: bestX.guide }] : []
    horizontalLines = bestY ? [{ y: bestY.guide }] : []
  }

  /**
   * 缩放时：
   * 1) 宽/高靠近其它图时，吸附成同尺寸（保持等比）
   * 2) 缩放后外框边靠近目标线时，微调 scale 让边贴齐（对侧角尽量固定）
   */
  function applyScaleSnap(activeObject) {
    const transform = canvas._currentTransform
    if (!transform) return

    const baseW = Math.max(1, Number(activeObject.width) || 1)
    const baseH = Math.max(1, Number(activeObject.height) || 1)
    const rect = activeObject.getBoundingRect(true, true)
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const peerSizes = []
    for (const other of canvas.getObjects()) {
      if (!other || other === activeObject || other.excludeFromExport || other.visible === false) continue
      const r = other.getBoundingRect(true, true)
      if (r.width > 1) peerSizes.push(r.width)
      if (r.height > 1) peerSizes.push(r.height)
    }

    let nextScaleX = Number(activeObject.scaleX) || 1
    let nextScaleY = Number(activeObject.scaleY) || 1
    let guideV = null
    let guideH = null

    // 1) 同尺寸吸附
    for (const size of peerSizes) {
      if (isInRange(rect.width, size)) {
        const s = size / baseW
        nextScaleX = s
        nextScaleY = s
        break
      }
    }
    if (Math.abs(nextScaleX - (Number(activeObject.scaleX) || 1)) < 0.001) {
      for (const size of peerSizes) {
        if (isInRange(rect.height, size)) {
          const s = size / baseH
          nextScaleX = s
          nextScaleY = s
          break
        }
      }
    }

    // 2) 外框边对齐：按中心缩放近似（移动端主用等比角点缩放时足够稳）
    const scaleX = nextScaleX
    const scaleY = nextScaleY
    const nextW = baseW * scaleX
    const nextH = baseH * scaleY
    const left = centerX - nextW / 2
    const right = centerX + nextW / 2
    const top = centerY - nextH / 2
    const bottom = centerY + nextH / 2

    const canvasTargetsX = [0, canvas.getWidth() / 2, canvas.getWidth()]
    const canvasTargetsY = [0, canvas.getHeight() / 2, canvas.getHeight()]
    const edgeCandidatesX = []
    const edgeCandidatesY = []

    for (const tx of canvasTargetsX) {
      if (isInRange(left, tx)) edgeCandidatesX.push({ edge: 'left', target: tx })
      if (isInRange(right, tx)) edgeCandidatesX.push({ edge: 'right', target: tx })
      if (isInRange(centerX, tx)) edgeCandidatesX.push({ edge: 'center', target: tx })
    }
    for (const ty of canvasTargetsY) {
      if (isInRange(top, ty)) edgeCandidatesY.push({ edge: 'top', target: ty })
      if (isInRange(bottom, ty)) edgeCandidatesY.push({ edge: 'bottom', target: ty })
      if (isInRange(centerY, ty)) edgeCandidatesY.push({ edge: 'center', target: ty })
    }

    for (const other of canvas.getObjects()) {
      if (!other || other === activeObject || other.excludeFromExport || other.visible === false) continue
      const r = other.getBoundingRect(true, true)
      for (const tx of [r.left, r.left + r.width / 2, r.left + r.width]) {
        if (isInRange(left, tx)) edgeCandidatesX.push({ edge: 'left', target: tx })
        if (isInRange(right, tx)) edgeCandidatesX.push({ edge: 'right', target: tx })
      }
      for (const ty of [r.top, r.top + r.height / 2, r.top + r.height]) {
        if (isInRange(top, ty)) edgeCandidatesY.push({ edge: 'top', target: ty })
        if (isInRange(bottom, ty)) edgeCandidatesY.push({ edge: 'bottom', target: ty })
      }
    }

    if (edgeCandidatesX.length) {
      const pick = edgeCandidatesX[0]
      if (pick.edge === 'center') {
        guideV = pick.target
      } else if (pick.edge === 'left') {
        const newW = right - pick.target
        if (newW > 4) {
          nextScaleX = newW / baseW
          nextScaleY = nextScaleX
          guideV = pick.target
        }
      } else if (pick.edge === 'right') {
        const newW = pick.target - left
        if (newW > 4) {
          nextScaleX = newW / baseW
          nextScaleY = nextScaleX
          guideV = pick.target
        }
      }
    }

    if (edgeCandidatesY.length && guideV == null) {
      const pick = edgeCandidatesY[0]
      if (pick.edge === 'center') {
        guideH = pick.target
      } else if (pick.edge === 'top') {
        const newH = bottom - pick.target
        if (newH > 4) {
          nextScaleY = newH / baseH
          nextScaleX = nextScaleY
          guideH = pick.target
        }
      } else if (pick.edge === 'bottom') {
        const newH = pick.target - top
        if (newH > 4) {
          nextScaleY = newH / baseH
          nextScaleX = nextScaleY
          guideH = pick.target
        }
      }
    }

    if (
      Math.abs(nextScaleX - (Number(activeObject.scaleX) || 1)) > 0.0005 ||
      Math.abs(nextScaleY - (Number(activeObject.scaleY) || 1)) > 0.0005
    ) {
      activeObject.set({ scaleX: nextScaleX, scaleY: nextScaleY })
      activeObject.setCoords()
    }

    // 尺寸已贴近时画辅助线
    if (guideV == null && peerSizes.some((size) => isInRange(activeObject.getBoundingRect(true, true).width, size))) {
      guideV = centerX
    }
    if (guideH == null && peerSizes.some((size) => isInRange(activeObject.getBoundingRect(true, true).height, size))) {
      guideH = centerY
    }

    verticalLines = guideV != null ? [{ x: guideV }] : []
    horizontalLines = guideH != null ? [{ y: guideH }] : []
  }

  function onObjectMoving(e) {
    if (options.isEnabled && !options.isEnabled()) {
      clearMeta()
      return
    }
    const target = e?.target
    if (!target || target.type !== 'image' || target.excludeFromExport) {
      clearMeta()
      return
    }
    if (!canvas._currentTransform) {
      clearMeta()
      return
    }
    clearMeta()
    applySnap(target)
  }

  function onObjectScaling(e) {
    if (options.isEnabled && !options.isEnabled()) {
      clearMeta()
      return
    }
    const target = e?.target
    if (!target || target.type !== 'image' || target.excludeFromExport) {
      clearMeta()
      return
    }
    if (!canvas._currentTransform) {
      clearMeta()
      return
    }
    clearMeta()
    applyScaleSnap(target)
  }

  function onMouseDown() {
    clearMeta()
  }

  function onMouseUp() {
    clearMeta()
    canvas.requestRenderAll()
  }

  function onBeforeRender() {
    clearOverlay()
  }

  function onAfterRender() {
    if (!verticalLines.length && !horizontalLines.length) return
    const w = canvas.getWidth()
    const h = canvas.getHeight()
    for (const line of verticalLines) {
      drawLine(line.x, 0, line.x, h)
    }
    for (const line of horizontalLines) {
      drawLine(0, line.y, w, line.y)
    }
  }

  function init() {
    canvas.on('object:moving', onObjectMoving)
    canvas.on('object:scaling', onObjectScaling)
    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:up', onMouseUp)
    canvas.on('before:render', onBeforeRender)
    canvas.on('after:render', onAfterRender)
  }

  function destroy() {
    canvas.off('object:moving', onObjectMoving)
    canvas.off('object:scaling', onObjectScaling)
    canvas.off('mouse:down', onMouseDown)
    canvas.off('mouse:up', onMouseUp)
    canvas.off('before:render', onBeforeRender)
    canvas.off('after:render', onAfterRender)
    clearMeta()
    clearOverlay()
  }

  return { init, destroy }
}
