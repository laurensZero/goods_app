/**
 * 漫画类：漫画分格外框。
 *
 * 参考图构成：金色圆角外环 → 漫画分格底纹（网点格 / 速度线格 / 天空云格）→ 白色拍立得卡纸。
 * 整块画布都由外框自己铺（`acceptsBackgroundColor` 只管拍立得卡纸内的那块背板）。
 *
 * 全部程序化绘制，不依赖任何位图素材：分格线、网点、速度线、云、四角星芒都是路径。
 * 好处是导出 1200px 时不会有位图放大模糊，且四个色槽一改整张外框跟着换色。
 *
 * 几何一律按 1200×1200 设计空间书写，渲染器按目标尺寸乘 k。
 */
import { roundRectPath } from '@/utils/image/frameRenderer'
import { linearGradient, shadeColor, withShadow } from './shared'

const DESIGN = 1200

// ---------------------------------------------------------------- 几何

/** 金色外环：外圆角 72，环宽 40（内圆角 32 = 外圆角 − 环宽，同心）。 */
const RING = { radius: 72, width: 40 }
/** 漫画页（= 外环内边界）。所有分格都画在这张纸里。 */
const PAGE = { x: 40, y: 40, w: 1120, h: 1120, radius: 32 }
/** 拍立得卡纸与照片窗（窗是卡纸内缩 28 的结果）。 */
const CARD = { x: 156, y: 132, w: 888, h: 936, radius: 24 }
const WINDOW = { x: 184, y: 160, w: 832, h: 880, radius: 10 }

const GUTTER = 6

/**
 * 分格表。列界线：x = 486 / 870；行界线：左列 462、中列 252、右列 624，底部通栏 880。
 * 布局故意让「卡纸盖不住的那圈留白」里每一段都跨到分格边界，露出来的才是分格而不是一整块底色：
 *
 *   +---------+--------------+--------+
 *   |    A    |      C       |   E    |
 *   |         +--------------+        |
 *   |         |      D       +--------+
 *   +---------+              |   F    |
 *   |    B    |              |        |
 *   +---------+--------------+--------+
 *   |                G                |
 *   +---------------------------------+
 */
const PANELS = [
  { id: 'a', x: 40, y: 40, w: 443, h: 419, fill: 'panelTone' },
  { id: 'b', x: 40, y: 465, w: 443, h: 412, fill: 'panelSky' },
  { id: 'c', x: 489, y: 40, w: 378, h: 209, fill: 'panelCream' },
  { id: 'd', x: 489, y: 255, w: 378, h: 622, fill: 'panelSky' },
  { id: 'e', x: 873, y: 40, w: 287, h: 581, fill: 'panelCream' },
  { id: 'f', x: 873, y: 627, w: 287, h: 250, fill: 'panelSky' },
  { id: 'g', x: 40, y: 883, w: 1120, h: 277, fill: 'panelSky' }
]

const GUTTER_X1 = 486
const GUTTER_X2 = 870
const GUTTER_Y_BOTTOM = 880

// ---------------------------------------------------------------- 绘制原语

/**
 * 不调用 beginPath 的圆角矩形子路径。
 * `roundRectPath` 每次都 beginPath，没法用来拼「外圈 + 内圈」的 evenodd 环，
 * 也没法把云的几个气泡 + 平底拼成同一条路径（分开填会在半透明时叠深）。
 */
function roundRectSubpath(ctx, rect, radius) {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2))
  const { x, y, width, height } = rect
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

/** 网点：交错排布的圆点，漫画的「网点纸」。调用方负责 clip 到分格。 */
function halftoneDots(ctx, k, panel, { color, radius = 7, step = 30, alpha = 1 }) {
  const stepPx = step * k
  const rPx = radius * k
  const x0 = panel.x * k
  const y0 = panel.y * k
  const x1 = (panel.x + panel.w) * k
  const y1 = (panel.y + panel.h) * k

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  let row = 0
  for (let y = y0 - stepPx; y < y1 + stepPx; y += stepPx, row += 1) {
    const offset = (row % 2) * (stepPx / 2)
    for (let x = x0 - stepPx + offset; x < x1 + stepPx; x += stepPx) {
      ctx.beginPath()
      ctx.arc(x, y, rPx, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** 45° 速度线（左下 → 右上），漫画的「集中线」替代品。 */
function speedLines(ctx, k, panel, { color, step = 30, width = 6, alpha = 1 }) {
  const x0 = panel.x * k
  const y0 = panel.y * k
  const right = (panel.x + panel.w) * k
  const bottom = (panel.y + panel.h) * k
  const height = bottom - y0
  const stepPx = step * k

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = width * k
  ctx.lineCap = 'round'
  for (let offset = -height; offset <= right - x0 + height; offset += stepPx) {
    ctx.beginPath()
    ctx.moveTo(x0 + offset, bottom)
    ctx.lineTo(x0 + offset + height, y0)
    ctx.stroke()
  }
  ctx.restore()
}

/** 一朵云：几个气泡 + 一条平底拼成同一条路径，一次填充，半透明也不会叠深。 */
function cloud(ctx, k, { cx, cy, w, h, color = '#FFFFFF', alpha = 1 }) {
  const puffs = [
    [-0.30, 0.04, 0.24],
    [0.00, -0.12, 0.31],
    [0.30, 0.04, 0.23],
    [-0.52, 0.16, 0.16],
    [0.52, 0.16, 0.15]
  ]
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  for (const [dx, dy, r] of puffs) {
    const px = (cx + dx * w) * k
    const py = (cy + dy * h) * k
    const pr = r * w * k
    ctx.moveTo(px + pr, py)
    ctx.arc(px, py, pr, 0, Math.PI * 2)
  }
  roundRectSubpath(ctx, {
    x: (cx - 0.58 * w) * k,
    y: (cy + 0.02 * h) * k,
    width: 1.16 * w * k,
    height: 0.26 * h * k
  }, 0.12 * h * k)
  ctx.fill()
  ctx.restore()
}

/** 四角星芒：四条凹边内的星形，白填充 + 墨蓝描边（参考图里的闪光符号）。 */
function sparkle(ctx, k, { cx, cy, size, fill = '#FFFFFF', stroke = '#3C4784', lineWidth = 3, alpha = 1 }) {
  const r = (size / 2) * k
  const x = cx * k
  const y = cy * k
  const waist = r * 0.15

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  const tipAngle = (i) => -Math.PI / 2 + (i / 4) * Math.PI * 2
  ctx.moveTo(x + Math.cos(tipAngle(0)) * r, y + Math.sin(tipAngle(0)) * r)
  for (let i = 0; i < 4; i += 1) {
    const mid = tipAngle(i) + Math.PI / 4
    const next = tipAngle(i + 1)
    ctx.quadraticCurveTo(x + Math.cos(mid) * waist, y + Math.sin(mid) * waist,
      x + Math.cos(next) * r, y + Math.sin(next) * r)
  }
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke && lineWidth > 0) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth * k
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  ctx.restore()
}

// ---------------------------------------------------------------- 分格内容

function paintPanel(ctx, k, palette, panel) {
  const rect = {
    x: panel.x * k,
    y: panel.y * k,
    width: panel.w * k,
    height: panel.h * k
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()

  const ink = palette.gutter

  switch (panel.id) {
    case 'a': {
      // 网点格：紫罗兰网点纸 + 三颗星芒（都落在卡纸盖不到的那圈留白里）
      halftoneDots(ctx, k, panel, { color: shadeColor(palette.panelTone, -0.30), radius: 8, step: 34, alpha: 0.55 })
      sparkle(ctx, k, { cx: 300, cy: 84, size: 88, stroke: ink, lineWidth: 3.6 })
      sparkle(ctx, k, { cx: 96, cy: 250, size: 76, stroke: ink, lineWidth: 3 })
      sparkle(ctx, k, { cx: 108, cy: 620, size: 58, stroke: ink, lineWidth: 2.6 })
      break
    }
    case 'b': {
      // 天空格（左）：云头探出卡纸左边缘，被卡纸裁掉一半
      cloud(ctx, k, { cx: 140, cy: 700, w: 360, h: 210, alpha: 0.95 })
      cloud(ctx, k, { cx: 70, cy: 1000, w: 300, h: 180, alpha: 0.85 })
      sparkle(ctx, k, { cx: 112, cy: 1010, size: 52, stroke: ink, lineWidth: 2.4 })
      break
    }
    case 'c': {
      // 速度线格：米白底 + 45° 斜线
      speedLines(ctx, k, panel, { color: shadeColor(palette.panelSky, -0.04), step: 32, width: 7, alpha: 0.8 })
      sparkle(ctx, k, { cx: 690, cy: 88, size: 88, stroke: ink, lineWidth: 3.4 })
      break
    }
    case 'd': {
      cloud(ctx, k, { cx: 620, cy: 520, w: 380, h: 220, alpha: 0.9 })
      cloud(ctx, k, { cx: 760, cy: 760, w: 300, h: 180, alpha: 0.8 })
      break
    }
    case 'e': {
      // 右侧长格：仅网点，右边缘整段干净
      halftoneDots(ctx, k, panel, { color: shadeColor(palette.panelSky, -0.06), radius: 6, step: 30, alpha: 0.7 })
      sparkle(ctx, k, { cx: 1116, cy: 176, size: 72, stroke: ink, lineWidth: 3 })
      sparkle(ctx, k, { cx: 1100, cy: 470, size: 54, stroke: ink, lineWidth: 2.6 })
      break
    }
    case 'f': {
      cloud(ctx, k, { cx: 1050, cy: 800, w: 360, h: 210, alpha: 0.9 })
      sparkle(ctx, k, { cx: 1122, cy: 764, size: 60, stroke: ink, lineWidth: 2.8 })
      break
    }
    case 'g': {
      // 底部通栏：云海 + 左下角一抹斜向金纸（云必须压在卡纸下沿之下才看得见）
      cloud(ctx, k, { cx: 430, cy: 1120, w: 400, h: 220, alpha: 0.92 })
      cloud(ctx, k, { cx: 790, cy: 1150, w: 330, h: 190, alpha: 0.86 })
      cloud(ctx, k, { cx: 1080, cy: 1108, w: 300, h: 180, alpha: 0.8 })

      ctx.save()
      ctx.globalAlpha = 0.6
      ctx.fillStyle = palette.gold
      ctx.beginPath()
      ctx.moveTo(40 * k, 1160 * k)
      ctx.lineTo(40 * k, 1000 * k)
      ctx.lineTo(300 * k, 883 * k)
      ctx.lineTo(462 * k, 883 * k)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      sparkle(ctx, k, { cx: 196, cy: 1104, size: 80, stroke: ink, lineWidth: 3.4 })
      sparkle(ctx, k, { cx: 918, cy: 1116, size: 60, stroke: ink, lineWidth: 2.6 })
      break
    }
    default:
      break
  }

  ctx.restore()
}

// ---------------------------------------------------------------- 模板

export const comicFrame = {
  id: 'comic',
  nameKey: 'imageEditor.frameComic',
  category: 'comic',
  designSize: DESIGN,
  defaultFitRatio: 1,
  acceptsBackgroundColor: true,
  palette: {
    gold: '#F1DEA4',
    goldDeep: '#DFC273',
    gutter: '#3C4784',
    panelTone: '#E7DEF6',
    panelCream: '#FDFAF1',
    panelSky: '#CBE4F7',
    paper: '#FFFFFF'
  },
  colorSlots: [
    { key: 'gold', nameKey: 'imageEditor.slotGold' },
    { key: 'gutter', nameKey: 'imageEditor.slotGutter' },
    { key: 'panelTone', nameKey: 'imageEditor.slotPanelTone' },
    { key: 'panelSky', nameKey: 'imageEditor.slotPanelSky' }
  ],
  colorways: [
    {
      id: 'pop',
      nameKey: 'imageEditor.colorComicPop',
      palette: {
        gold: '#F1DEA4', goldDeep: '#DFC273', gutter: '#3C4784',
        panelTone: '#E7DEF6', panelCream: '#FDFAF1', panelSky: '#CBE4F7', paper: '#FFFFFF'
      }
    },
    {
      id: 'night',
      nameKey: 'imageEditor.colorComicNight',
      palette: {
        gold: '#E4CD8E', goldDeep: '#C6A860', gutter: '#1E2547',
        panelTone: '#3A3A6B', panelCream: '#2B3252', panelSky: '#2D4270', paper: '#FFFFFF'
      }
    },
    {
      id: 'sakura',
      nameKey: 'imageEditor.colorComicSakura',
      palette: {
        gold: '#F4E0C4', goldDeep: '#E0BE97', gutter: '#6B4A57',
        panelTone: '#F7DEE9', panelCream: '#FEF7F2', panelSky: '#FCE3EA', paper: '#FFFFFF'
      }
    },
    {
      id: 'mint',
      nameKey: 'imageEditor.colorComicMint',
      palette: {
        gold: '#EFE6AC', goldDeep: '#D6C878', gutter: '#3D5A50',
        panelTone: '#DCEEE4', panelCream: '#FBFDF3', panelSky: '#D6EEF2', paper: '#FFFFFF'
      }
    }
  ],
  window: WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k

    // —— ① 漫画页：整页先铺分格线色，再逐格盖上分格底色，露出来的就是分格线
    ctx.save()
    roundRectPath(ctx, {
      x: PAGE.x * k, y: PAGE.y * k, width: PAGE.w * k, height: PAGE.h * k
    }, PAGE.radius * k)
    ctx.clip()
    ctx.fillStyle = palette.gutter
    ctx.fillRect(0, 0, size, size)
    for (const panel of PANELS) {
      ctx.fillStyle = palette[panel.fill] || palette.panelCream
      ctx.fillRect(panel.x * k, panel.y * k, panel.w * k, panel.h * k)
      paintPanel(ctx, k, palette, panel)
    }
    // 分格线统一收口：把 6px 的缝补齐成整数像素，避免缩放到预览尺寸时忽粗忽细
    ctx.fillStyle = palette.gutter
    ctx.fillRect((GUTTER_X1 - GUTTER / 2) * k, PAGE.y * k, GUTTER * k, PAGE.h * k)
    ctx.fillRect((GUTTER_X2 - GUTTER / 2) * k, PAGE.y * k, GUTTER * k, PAGE.h * k)
    ctx.fillRect(PAGE.x * k, (GUTTER_Y_BOTTOM - GUTTER / 2) * k, PAGE.w * k, GUTTER * k)
    ctx.restore()

    // —— ② 金色外环：盖在漫画页边缘之上，边界更干净
    const ring = linearGradient(ctx, { x: 0, y: 0, width: size, height: size }, [
      [0, shadeColor(palette.gold, 0.16)],
      [0.45, palette.gold],
      [1, palette.goldDeep]
    ])
    ctx.fillStyle = ring
    ctx.beginPath()
    roundRectSubpath(ctx, { x: 0, y: 0, width: size, height: size }, RING.radius * k)
    roundRectSubpath(ctx, {
      x: RING.width * k,
      y: RING.width * k,
      width: size - RING.width * 2 * k,
      height: size - RING.width * 2 * k
    }, PAGE.radius * k)
    ctx.fill('evenodd')

    // 外缘压深一线 + 内缘一道高光，去掉塑料渐变感
    ctx.save()
    ctx.globalAlpha = 0.4
    ctx.strokeStyle = shadeColor(palette.goldDeep, -0.55)
    ctx.lineWidth = 2.5 * k
    roundRectPath(ctx, { x: 1.5 * k, y: 1.5 * k, width: size - 3 * k, height: size - 3 * k }, RING.radius * k)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3 * k
    roundRectPath(ctx, {
      x: 7 * k, y: 7 * k, width: size - 14 * k, height: size - 14 * k
    }, (RING.radius - 6) * k)
    ctx.stroke()
    ctx.restore()

    // —— ③ 拍立得卡纸
    withShadow(ctx, k, { color: 'rgba(32, 36, 66, 0.16)', blur: 22, offsetY: 9 }, () => {
      ctx.fillStyle = palette.paper
      roundRectPath(ctx, {
        x: CARD.x * k, y: CARD.y * k, width: CARD.w * k, height: CARD.h * k
      }, CARD.radius * k)
      ctx.fill()
    })

    // —— ④ 框内背板（画面比例不匹配时露出的那圈「相纸」）
    ctx.fillStyle = backgroundColor || palette.paper
    roundRectPath(ctx, {
      x: WINDOW.x * k, y: WINDOW.y * k, width: WINDOW.w * k, height: WINDOW.h * k
    }, WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    // 照片一圈极淡的内边，压住图与相纸之间的硬边
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.strokeStyle = shadeColor(palette.gutter, 0.2)
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()
    ctx.restore()
  }
}
