/**
 * 图片外框合成渲染器。
 *
 * 实时预览与最终导出共用这一套绘制逻辑，避免「预览好看、导出对不上」。
 * 所有外框模板按 DESIGN_SIZE 设计空间书写，渲染时按目标尺寸等比缩放，
 * 因此同一份模板既能画进 320px 的预览 canvas，也能画进 1200px 的导出 canvas。
 */

export const DESIGN_SIZE = 1200
export const DEFAULT_FIT_RATIO = 0.88

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function hexToRgb(hex) {
  const value = String(hex || '').replace('#', '').trim()
  const full = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value.padEnd(6, '0').slice(0, 6)
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0
  }
}

export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(Number(alpha) || 0, 0, 1)})`
}

/** 按比例向黑/白混合，用于从主色派生出描边、阴影等辅助色。 */
export function shadeColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const ratio = clamp(Number(amount) || 0, -1, 1)
  const target = ratio >= 0 ? 255 : 0
  const t = Math.abs(ratio)
  const mix = (channel) => Math.round(channel + (target - channel) * t)
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function normalizeFitRatio(value, fallback = DEFAULT_FIT_RATIO) {
  const ratio = Number(value)
  if (!Number.isFinite(ratio) || ratio <= 0) return fallback
  return clamp(ratio, 0.4, 1)
}

export function drawableSize(source) {
  if (!source) return { width: 0, height: 0 }
  const width = Number(source.width ?? source.naturalWidth ?? 0)
  const height = Number(source.height ?? source.naturalHeight ?? 0)
  return { width, height }
}

/**
 * 把 source 等比缩放到 box 内并居中（保留 fitRatio 余量）。
 * box 为画布绝对坐标；无外框时 box 即整块画布，与旧的纯色背景合成结果一致。
 */
export function fitInside(sourceSize, box, fitRatio = 1) {
  const sourceWidth = Number(sourceSize?.width) || 0
  const sourceHeight = Number(sourceSize?.height) || 0
  if (!sourceWidth || !sourceHeight) return null

  const ratio = normalizeFitRatio(fitRatio, 1)
  const scale = Math.min(
    (box.width * ratio) / sourceWidth,
    (box.height * ratio) / sourceHeight
  )
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  return {
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + (box.height - height) / 2),
    width,
    height
  }
}

export function scaleHarmonics(harmonics, scale) {
  if (!Array.isArray(harmonics)) return []
  return harmonics.map((item) => {
    const amplitude = Number(item?.[0]) || 0
    const period = Number(item?.[1]) || 0
    const phase = Number(item?.[2]) || 0
    return [amplitude * scale, Math.max(1, period * scale), phase]
  })
}

/** 把模板里的设计空间矩形换算到目标画布像素。 */
export function resolveFrameWindow(frame, width, height = width) {
  const designSize = Number(frame?.designSize) || DESIGN_SIZE
  const k = width / designSize
  const win = frame?.window
  if (!win) {
    return { x: 0, y: 0, width, height, radius: 0, k }
  }
  return {
    x: (Number(win.x) || 0) * k,
    y: (Number(win.y) || 0) * k,
    width: (Number(win.w) || 0) * k,
    height: (Number(win.h) || 0) * k,
    radius: (Number(win.radius) || 0) * k,
    harmonics: scaleHarmonics(win.harmonics, k),
    k
  }
}

function pushCorner(points, cx, cy, radius, startDeg, endDeg, density) {
  const arcLength = Math.abs(((endDeg - startDeg) * Math.PI) / 180) * radius
  const steps = Math.max(3, Math.round((arcLength * density) / 4))
  for (let i = 0; i <= steps; i += 1) {
    const angle = ((startDeg + ((endDeg - startDeg) * i) / steps) * Math.PI) / 180
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    points.push({ x: cx + nx * radius, y: cy + ny * radius, nx, ny })
  }
}

function pushEdge(points, from, to, normal, density) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const steps = Math.max(2, Math.round((length * density) / 4))
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    points.push({ x: from.x + dx * t, y: from.y + dy * t, nx: normal.nx, ny: normal.ny })
  }
}

/**
 * 圆角矩形轮廓采样：每个点带外法线，供后续做「沿法线偏移」的变形。
 * 返回顺序固定：上边 → 右上角 → 右边 → 右下角 → 下边 → 左下角 → 左边 → 左上角。
 */
function collectOutline({ x, y, width, height, radius = 0, density = 1.4 }) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  const points = []

  pushEdge(points, { x: x + r, y }, { x: x + width - r, y }, { nx: 0, ny: -1 }, density)
  pushCorner(points, x + width - r, y + r, r, -90, 0, density)
  pushEdge(points, { x: x + width, y: y + r }, { x: x + width, y: y + height - r }, { nx: 1, ny: 0 }, density)
  pushCorner(points, x + width - r, y + height - r, r, 0, 90, density)
  pushEdge(points, { x: x + width - r, y: y + height }, { x: x + r, y: y + height }, { nx: 0, ny: 1 }, density)
  pushCorner(points, x + r, y + height - r, r, 90, 180, density)
  pushEdge(points, { x, y: y + height - r }, { x, y: y + r }, { nx: -1, ny: 0 }, density)
  pushCorner(points, x + r, y + r, r, 180, 270, density)

  return points
}

function perimeterOf(points) {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return Math.max(1, total)
}

/**
 * 圆角矩形轮廓 + 沿外法线叠加正弦谐波 → 周期性水波纹。
 * harmonics: [[amplitude, period, phase], ...]
 */
export function buildWavyPoints({ x, y, width, height, radius = 0, harmonics = [], density = 1.4 }) {
  const points = collectOutline({ x, y, width, height, radius, density })

  const out = []
  let length = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    if (i > 0) {
      length += Math.hypot(current.x - points[i - 1].x, current.y - points[i - 1].y)
    }
    let offset = 0
    for (const [amplitude, period, phase] of harmonics) {
      if (!period) continue
      offset += amplitude * Math.sin((2 * Math.PI * length) / period + phase)
    }
    out.push({ x: current.x + current.nx * offset, y: current.y + current.ny * offset })
  }
  return out
}

/** 周期性的 1D 值噪声，t ∈ [0,1) 首尾相接，保证轮廓闭合处不出现接缝。 */
function periodicNoise1D(seed, samples) {
  const random = mulberry32(seed)
  const values = new Float32Array(samples)
  for (let i = 0; i < samples; i += 1) values[i] = random() * 2 - 1
  return (t) => {
    const scaled = t * samples
    const base = Math.floor(scaled)
    const i0 = ((base % samples) + samples) % samples
    const i1 = (i0 + 1) % samples
    const f = scaled - base
    const smooth = f * f * (3 - 2 * f)
    return values[i0] * (1 - smooth) + values[i1] * smooth
  }
}

/**
 * 噪声驱动的轮廓扰动：撕纸毛边、手绘边这类「不规律」的边缘。
 * roughness: { amplitude, seed, cycles, octaves }
 */
export function buildRoughPoints({ x, y, width, height, radius = 0, roughness = {}, density = 1.4 }) {
  const amplitude = Number(roughness.amplitude) || 12
  const seed = Number(roughness.seed) || 1
  const cycles = Math.max(2, Number(roughness.cycles) || 7)
  const octaves = Math.max(1, Number(roughness.octaves) || 3)

  const points = collectOutline({ x, y, width, height, radius, density })
  const layers = []
  for (let octave = 0; octave < octaves; octave += 1) {
    layers.push({
      noise: periodicNoise1D(seed + octave * 137, Math.round(cycles * 2 ** octave)),
      weight: 1 / 1.7 ** octave
    })
  }
  const totalWeight = layers.reduce((sum, layer) => sum + layer.weight, 0)
  const perimeter = perimeterOf(points)

  const out = []
  let length = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    if (i > 0) {
      length += Math.hypot(current.x - points[i - 1].x, current.y - points[i - 1].y)
    }
    let noiseValue = 0
    for (const layer of layers) noiseValue += layer.noise(length / perimeter) * layer.weight
    const offset = (noiseValue / totalWeight) * amplitude
    out.push({ x: current.x + current.nx * offset, y: current.y + current.ny * offset })
  }
  return out
}

export function tracePath(ctx, points, begin = true) {
  if (!points.length) return
  if (begin) ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
}

export function traceWavyRect(ctx, rect, radius = 0, harmonics = [], begin = true) {
  tracePath(ctx, buildWavyPoints({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    radius,
    harmonics
  }), begin)
}

export function traceRoughRect(ctx, rect, radius = 0, roughness = {}, begin = true) {
  tracePath(ctx, buildRoughPoints({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    radius,
    roughness
  }), begin)
}

export function roundRectPath(ctx, rect, radius = 0) {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, r)
    return
  }
  ctx.moveTo(rect.x + r, rect.y)
  ctx.lineTo(rect.x + rect.width - r, rect.y)
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r)
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - r)
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - r, rect.y + rect.height)
  ctx.lineTo(rect.x + r, rect.y + rect.height)
  ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r)
  ctx.lineTo(rect.x, rect.y + r)
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y)
  ctx.closePath()
}

export function applyAdjustmentFilter(ctx, adjustments = {}) {
  const brightness = Number(adjustments.brightness) || 0
  const contrast = Number(adjustments.contrast) || 0
  const saturation = Number(adjustments.saturation) || 0
  if (!brightness && !contrast && !saturation) return false
  if (typeof ctx.filter !== 'string') return false
  ctx.filter = `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`
  return true
}

// ---------------------------------------------------------------- 噪点水彩工具

function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function valueNoise(seed, gridSize) {
  const random = mulberry32(seed)
  const grid = new Float32Array((gridSize + 1) * (gridSize + 1))
  for (let i = 0; i < grid.length; i += 1) grid[i] = random()
  const at = (ix, iy) => grid[iy * (gridSize + 1) + ix]
  return (u, v) => {
    const x = u * gridSize
    const y = v * gridSize
    const x0 = Math.min(gridSize - 1, Math.max(0, Math.floor(x)))
    const y0 = Math.min(gridSize - 1, Math.max(0, Math.floor(y)))
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(x0, y0)
    const b = at(x0 + 1, y0)
    const c = at(x0, y0 + 1)
    const d = at(x0 + 1, y0 + 1)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
  }
}

const noiseTileCache = new Map()
const tintedTileCache = new Map()

/** 生成一张带径向衰减的分形噪点遮罩（白色 + alpha），按 seed 缓存。 */
export function noiseMaskTile(seed, size = 128) {
  if (typeof document === 'undefined') return null
  const key = `${seed}:${size}`
  const cached = noiseTileCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const octaves = [
    { noise: valueNoise(seed, 6), weight: 0.5 },
    { noise: valueNoise(seed + 17, 12), weight: 0.32 },
    { noise: valueNoise(seed + 991, 24), weight: 0.18 }
  ]

  const image = ctx.createImageData(size, size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const v = y / size
      let value = 0
      for (const octave of octaves) value += octave.noise(u, v) * octave.weight
      const dx = (u - 0.5) * 2
      const dy = (v - 0.5) * 2
      const dist = Math.min(1, Math.hypot(dx, dy))
      const core = Math.max(0, (value - 0.47) / 0.3)
      const alpha = Math.min(1, core * Math.pow(1 - dist, 0.7) * 1.7)
      const index = (y * size + x) * 4
      image.data[index] = 255
      image.data[index + 1] = 255
      image.data[index + 2] = 255
      image.data[index + 3] = Math.round(alpha * 255)
    }
  }

  ctx.putImageData(image, 0, 0)
  noiseTileCache.set(key, canvas)
  return canvas
}

function tintedTile(seed, color) {
  const key = `${seed}|${color}`
  const cached = tintedTileCache.get(key)
  if (cached) return cached
  const tile = noiseMaskTile(seed)
  if (!tile) return null
  const canvas = document.createElement('canvas')
  canvas.width = tile.width
  canvas.height = tile.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(tile, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  tintedTileCache.set(key, canvas)
  return canvas
}

/**
 * 画一摊水彩：位置/半径走设计空间坐标，内部按 k 缩放。
 * 调用方如需裁切（例如只允许落在卡纸边缘那圈）自行 ctx.clip()。
 */
export function drawWatercolorBlob(ctx, { cx, cy, radius, color, alpha = 0.7, seed = 1, k = 1 }) {
  if (!color) return
  const tile = tintedTile(seed, color)
  if (!tile) return
  const size = radius * 2 * k
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(tile, (cx - radius) * k, (cy - radius) * k, size, size)
  ctx.restore()
}

// ---------------------------------------------------------------- 合成入口

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

/**
 * 把主体（已裁切/已抠图）与外框合成为一张完整画面。
 * ctx 的目标尺寸由调用方决定（预览用小尺寸，导出用 1200）。
 */
export function renderFrameComposition(ctx, options = {}) {
  const {
    width = DESIGN_SIZE,
    height = width,
    source = null,
    background = {},
    frame = null,
    frameColors = null,
    fitRatio = DEFAULT_FIT_RATIO,
    adjustments = {},
    labels = {}
  } = options

  if (!ctx || width <= 0 || height <= 0) return

  const designSize = Number(frame?.designSize) || DESIGN_SIZE
  const k = width / designSize
  // 模板默认配色 → 用户挑的配色/调色覆盖
  const palette = { ...(frame?.palette || {}), ...(frameColors || {}) }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  // 画布底色只由「谁是这一层的所有者」决定：
  //   有外框 → 交给模板自己铺（它可能接受用户选的颜色，也可能自带配色）
  //   无外框 → 渲染器铺，不传颜色则保留透明底
  if (!frame && background.color) {
    ctx.fillStyle = background.color
    ctx.fillRect(0, 0, width, height)
  }

  const api = {
    ctx,
    k,
    width,
    height,
    designSize,
    palette,
    labels,
    // 用户选的画布底色。模板是否采用由 acceptsBackgroundColor 声明。
    backgroundColor: background.color || '',
    window: resolveFrameWindow(frame, width, height),
    clearShadow: () => clearShadow(ctx)
  }

  if (typeof frame?.drawBehind === 'function') {
    ctx.save()
    frame.drawBehind(api)
    ctx.restore()
    clearShadow(ctx)
  }

  const sourceSize = drawableSize(source)
  if (source && sourceSize.width > 0 && sourceSize.height > 0) {
    const rect = fitInside(sourceSize, api.window, normalizeFitRatio(fitRatio))
    if (rect) {
      ctx.save()
      if (typeof frame?.clipSubject === 'function') {
        frame.clipSubject(api)
        ctx.clip()
      }
      applyAdjustmentFilter(ctx, adjustments)
      ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height)
      ctx.restore()
    }
  }

  if (typeof frame?.drawOverlay === 'function') {
    ctx.save()
    frame.drawOverlay(api)
    ctx.restore()
    clearShadow(ctx)
  }

  if (typeof frame?.drawLabels === 'function') {
    ctx.save()
    frame.drawLabels(api, labels)
    ctx.restore()
  }

  ctx.restore()
}
