/**
 * 意境外框的绘制原语。
 *
 * 贴纸有两种来源：
 * 1. drawSticker —— 设计好的位图贴纸（Twemoji SVG，见 stickerAssets），带投影贴在画面上；
 * 2. dieCut 系列 —— 少量程序化补件（朱日、飞鸟、花枝）：白边包边 + 软投影，和贴纸图一个气质。
 *
 * 所有坐标按 1200×1200 设计空间书写，内部乘 k 缩放到目标画布。
 */
import { getStickerImage } from './stickerAssets'
import { shadeColor } from '@/utils/image/frameRenderer'

const DEFAULT_SHADOW = 'rgba(41, 35, 30, 0.30)'

/**
 * 贴上一张设计好的贴纸图。size 为正方形边长（设计空间 px），
 * 投影由 canvas 按贴纸的透明轮廓自动生成，即「模切贴纸」的浮起感。
 * 图片未预载完成时返回 false（调用方无需关心，画面只是少这一张贴纸）。
 */
export function drawSticker(ctx, k, name, {
  cx,
  cy,
  size,
  alpha = 1,
  angle = 0,
  shadow = DEFAULT_SHADOW,
  blur = 15,
  offsetY = 8
}) {
  const image = getStickerImage(name)
  if (!image) return false
  // 烘焙过白边的贴纸画布比原图大一圈，按比例换算让 size 始终指贴纸本体的可见尺寸
  const total = Number(image.width) || 512
  const side = size * k * (total / 512)
  ctx.save()
  ctx.translate(cx * k, cy * k)
  if (angle) ctx.rotate(angle)
  ctx.globalAlpha = alpha
  ctx.shadowColor = shadow
  ctx.shadowBlur = Math.max(0, blur * k)
  ctx.shadowOffsetY = offsetY * k
  ctx.drawImage(image, -side / 2, -side / 2, side, side)
  ctx.restore()
  return true
}

/** 小菱形贴纸（手帐里的点缀符号）。 */
export function diamondSticker(ctx, k, { cx, cy, size, color, alpha = 1 }) {
  dieCut(ctx, k, { edge: Math.max(3, size * 0.14), blur: 8, offsetY: 4 }, () => {
    const s = size * k
    ctx.save()
    ctx.translate(cx * k, cy * k)
    ctx.rotate(Math.PI / 4)
    ctx.beginPath()
    ctx.rect(-s / 2, -s / 2, s, s)
    ctx.restore()
  }, () => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1
  })
}

/**
 * 花边矩形（ scallop，奶茶裙边）：每条边分成等长段，各段向外凸一个半圆。
 * rect 为设计空间 { x, y, w, h }，bump 为鼓包半径（设计空间 px）。
 */
export function scallopRectPath(ctx, rect, bump, k) {
  const R = bump * k
  const x = rect.x * k
  const y = rect.y * k
  const w = rect.w * k
  const h = rect.h * k
  const corners = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ]
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let i = 0; i < 4; i += 1) {
    const from = corners[i]
    const to = corners[(i + 1) % 4]
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    const n = Math.max(1, Math.round(length / (2 * R)))
    const stepX = (to[0] - from[0]) / n
    const stepY = (to[1] - from[1]) / n
    const step = Math.hypot(stepX, stepY)
    for (let j = 0; j < n; j += 1) {
      const ax = from[0] + stepX * j
      const ay = from[1] + stepY * j
      const bx = from[0] + stepX * (j + 1)
      const by = from[1] + stepY * (j + 1)
      const cx = (ax + bx) / 2
      const cy = (ay + by) / 2
      const a0 = Math.atan2(ay - cy, ax - cx)
      let a1 = Math.atan2(by - cy, bx - cx)
      if (a1 <= a0) a1 += Math.PI * 2
      ctx.arc(cx, cy, step / 2, a0, a1)
    }
  }
  ctx.closePath()
}

/**
 * 模切贴纸骨架（程序化补件用）：pathFn 构建路径，fillFn 在同一份路径内作画。
 * 白边那一次 stroke 负责投影，本体 fill 时不再带阴影，避免投影渗进贴纸内部。
 */
export function dieCut(ctx, k, options, pathFn, fillFn) {
  const {
    outline = '#FFFFFF',
    edge = 8,
    shadow = DEFAULT_SHADOW,
    blur = 13,
    offsetY = 7
  } = options || {}
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = outline
  ctx.lineWidth = Math.max(1, edge * 2 * k)
  ctx.shadowColor = shadow
  ctx.shadowBlur = Math.max(0, blur * k)
  ctx.shadowOffsetY = offsetY * k
  pathFn()
  ctx.stroke()
  ctx.restore()
  if (fillFn) fillFn()
}

// ---------------------------------------------------------------- 程序化补件

/** 飞鸟补件：两段弧顶 + 浅弧腹的海鸥剪影，远看比卡通小鸟更有意境。 */
export function birdSticker(ctx, k, { cx, cy, s, color, angle = 0 }) {
  dieCut(ctx, k, { edge: Math.max(3.5, s * 0.16), blur: 10, offsetY: 5 }, () => {
    const w = s * k
    ctx.save()
    ctx.translate(cx * k, cy * k)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(-w, -w * 0.3)
    ctx.quadraticCurveTo(-w * 0.38, -w * 0.78, 0, -w * 0.1)
    ctx.quadraticCurveTo(w * 0.38, -w * 0.78, w, -w * 0.3)
    ctx.quadraticCurveTo(w * 0.42, -w * 0.16, 0, w * 0.14)
    ctx.quadraticCurveTo(-w * 0.42, -w * 0.16, -w, -w * 0.3)
    ctx.closePath()
    ctx.restore()
  }, () => {
    ctx.fillStyle = color
    ctx.fill()
  })
}

/**
 * 山脊剪影：crest 是折线山峰（设计空间 [x, y]），闭合到 baseY 成剪影。
 * 供全宽山形层叠使用：远山画在照片后面，近山压在照片下沿，
 * 模切白边就是层与层之间的「纸」。
 */
export function mountainSticker(ctx, k, { crest, baseY, color, alpha = 1 }) {
  dieCut(ctx, k, { edge: 7, blur: 14, offsetY: 7 }, () => {
    ctx.beginPath()
    ctx.moveTo(crest[0][0] * k, crest[0][1] * k)
    for (let i = 1; i < crest.length; i += 1) {
      ctx.lineTo(crest[i][0] * k, crest[i][1] * k)
    }
    ctx.lineTo(crest[crest.length - 1][0] * k, baseY * k)
    ctx.lineTo(crest[0][0] * k, baseY * k)
    ctx.closePath()
  }, () => {
    const top = Math.min(...crest.map((point) => point[1])) * k
    const gradient = ctx.createLinearGradient(0, top, 0, baseY * k)
    gradient.addColorStop(0, shadeColor(color, 0.3))
    gradient.addColorStop(0.45, color)
    gradient.addColorStop(1, shadeColor(color, -0.12))
    ctx.globalAlpha = alpha
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.globalAlpha = 1
  })
}

// ---------------------------------------------------------------- 花枝

function quadPoint(from, via, to, t) {
  const u = 1 - t
  return {
    x: u * u * from.x + 2 * u * t * via.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * via.y + t * t * to.y
  }
}

/** 沿二次贝塞尔采一条锥形缎带（起点粗、终点细），追加到当前路径。 */
function taperedRibbon(ctx, k, from, via, to, width0, width1) {
  const steps = 28
  const left = []
  const right = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const p = quadPoint(from, via, to, t)
    const ahead = quadPoint(from, via, to, Math.min(1, t + 0.01))
    const behind = quadPoint(from, via, to, Math.max(0, t - 0.01))
    const dx = ahead.x - behind.x
    const dy = ahead.y - behind.y
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const half = ((width0 + (width1 - width0) * t) / 2) * k
    left.push([p.x * k + nx * half, p.y * k + ny * half])
    right.push([p.x * k - nx * half, p.y * k - ny * half])
  }
  ctx.moveTo(left[0][0], left[0][1])
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i][0], left[i][1])
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1])
  ctx.closePath()
}

/**
 * 花枝补件：主枝 + 若干分枝各是一条锥形缎带，合成同一张贴纸（一副模切）。
 * 花朵单独用贴纸图叠在枝上，保留「贴上去」的层叠感。
 */
export function branchSticker(ctx, k, { from, via, to, width0, width1, color, twigs = [] }) {
  dieCut(ctx, k, { edge: 7, blur: 15, offsetY: 8 }, () => {
    ctx.beginPath()
    taperedRibbon(ctx, k, from, via, to, width0, width1)
    for (const twig of twigs) {
      taperedRibbon(ctx, k, twig.from, twig.via, twig.to, twig.width0, twig.width1)
    }
  }, () => {
    const gradient = ctx.createLinearGradient(from.x * k, from.y * k, to.x * k, to.y * k)
    gradient.addColorStop(0, shadeColor(color, -0.2))
    gradient.addColorStop(0.5, color)
    gradient.addColorStop(1, shadeColor(color, 0.06))
    ctx.fillStyle = gradient
    ctx.fill()
  })
}
