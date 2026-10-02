/**
 * 外框模板共用的绘制工具。
 * 模板按 1200×1200 设计空间书写，api.k = 目标尺寸 / 设计尺寸。
 */
import { roundRectPath, shadeColor, withAlpha } from '@/utils/image/frameRenderer'

export { withAlpha, shadeColor }

const CJK_STACK = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, -apple-system, sans-serif'

export function frameFont(weight, size, k) {
  const px = Math.max(1, size * k)
  return `${weight} ${px}px ${CJK_STACK}`
}

/** 带字距的文本绘制（canvas 没有 letter-spacing，只能逐字画）。 */
export function drawText(ctx, text, x, y, options = {}) {
  if (!text) return
  const {
    weight = 700,
    size = 32,
    color = '#333333',
    align = 'left',
    baseline = 'top',
    tracking = 0,
    k = 1
  } = options

  ctx.save()
  ctx.font = frameFont(weight, size, k)
  ctx.fillStyle = color
  ctx.textBaseline = baseline
  ctx.textAlign = 'left'

  const chars = [...String(text)]
  let total = 0
  for (const char of chars) total += ctx.measureText(char).width + tracking * k
  total -= tracking * k

  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
  for (const char of chars) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + tracking * k
  }
  ctx.restore()
}

/** 带投影地画一个路径：draw() 里自己 fill，投影参数由这里统一注入。 */
export function withShadow(ctx, k, options, draw) {
  const { color = 'rgba(40, 34, 30, 0.18)', blur = 24, offsetY = 12 } = options || {}
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = Math.max(0, blur * k)
  ctx.shadowOffsetY = offsetY * k
  draw()
  ctx.restore()
}

export function shadowedRoundRect(ctx, k, rect, radius, options, fillStyle) {
  withShadow(ctx, k, options, () => {
    ctx.fillStyle = fillStyle
    roundRectPath(ctx, rect, radius)
    ctx.fill()
  })
}

export function linearGradient(ctx, rect, stops, horizontal = false) {
  const gradient = horizontal
    ? ctx.createLinearGradient(rect.x, 0, rect.x + rect.width, 0)
    : ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.height)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  return gradient
}

/** 径向柔和色块：亚克力的背景光斑、水彩的晕染都用它。 */
export function radialBlob(ctx, { cx, cy, radius, color, alpha = 0.5, k = 1, inner = 0 }) {
  const x = cx * k
  const y = cy * k
  const r = radius * k
  const gradient = ctx.createRadialGradient(x, y, Math.max(0.01, r * inner), x, y, Math.max(0.02, r))
  gradient.addColorStop(0, withAlpha(color, alpha))
  gradient.addColorStop(0.62, withAlpha(color, alpha * 0.55))
  gradient.addColorStop(1, withAlpha(color, 0))
  ctx.save()
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 设计空间矩形 → 目标像素矩形。 */
export function scaleRect(rect, k) {
  return {
    x: rect.x * k,
    y: rect.y * k,
    width: rect.width * k,
    height: rect.height * k
  }
}

/** 把 '2026.10.02' 之类的日期压成胶片日期戳需要的紧凑格式。 */
export function stampDate(dateLabel, separator = ' ') {
  const raw = String(dateLabel || '').trim()
  const digits = raw.match(/\d+/g)
  if (!digits || digits.length < 3) return ''
  const [year, month, day] = digits
  return `'${String(year).slice(-2)}${separator}${String(month).padStart(2, '0')}${separator}${String(day).padStart(2, '0')}`
}
