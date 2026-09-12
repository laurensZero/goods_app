export const COLLAGE_MAX_IMAGES = 12
export const COLLAGE_SOURCE_MAX_EDGE = 2048
export const COLLAGE_EXPORT_EDGES = [1080, 2048]

export const COLLAGE_RATIO_PRESETS = [
  { key: 'free', value: null },
  { key: '1:1', value: 1 },
  { key: '3:4', value: 3 / 4 },
  { key: '16:9', value: 16 / 9 }
]

export function resolveCollageRatio(key) {
  const preset = COLLAGE_RATIO_PRESETS.find((item) => item.key === key)
  return preset ? preset.value : null
}

export function fitBoxInto(containerWidth, containerHeight, aspectRatio) {
  const maxW = Math.max(0, Number(containerWidth) || 0)
  const maxH = Math.max(0, Number(containerHeight) || 0)
  if (!maxW || !maxH) {
    return { width: 0, height: 0 }
  }

  const ratio = Number(aspectRatio)
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { width: maxW, height: maxH }
  }

  let width = maxW
  let height = width / ratio
  if (height > maxH) {
    height = maxH
    width = height * ratio
  }

  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height))
  }
}

export function clampCollageImageCount(currentCount, addingCount) {
  const current = Math.max(0, Number(currentCount) || 0)
  const adding = Math.max(0, Number(addingCount) || 0)
  return Math.max(0, Math.min(adding, COLLAGE_MAX_IMAGES - current))
}

export function scaleToFitObject(objectWidth, objectHeight, canvasWidth, canvasHeight, maxFill = 0.72) {
  const ow = Math.max(1, Number(objectWidth) || 1)
  const oh = Math.max(1, Number(objectHeight) || 1)
  const cw = Math.max(1, Number(canvasWidth) || 1)
  const ch = Math.max(1, Number(canvasHeight) || 1)
  const limitW = cw * maxFill
  const limitH = ch * maxFill
  // 始终按画布展示框适配（允许放大）：同宽高比的图进画布后显示尺寸一致，
  // 不会因源图像素数不同而一小一大
  return Math.min(limitW / ow, limitH / oh)
}

/**
 * 按最长边 edge 与画布比例计算导出像素，保证与预览同比例
 */
export function resolveExportPixelSize(canvasWidth, canvasHeight, edge) {
  const w = Math.max(1, Number(canvasWidth) || 1)
  const h = Math.max(1, Number(canvasHeight) || 1)
  const maxEdge = Math.max(1, Number(edge) || 1)
  const longest = Math.max(w, h)
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale
  }
}
