/**
 * 质感类：亚克力果冻 / 胶片日期戳。
 */
import { roundRectPath, shadeColor, withAlpha } from '@/utils/image/frameRenderer'
import { drawText, linearGradient, radialBlob, stampDate, withShadow } from './shared'

const DESIGN = 1200

// ---------------------------------------------------------------- 亚克力果冻

const ACRYLIC_PANEL = { x: 104, y: 104, w: 992, h: 992, radius: 66 }
const ACRYLIC_WINDOW = { x: 186, y: 186, w: 828, h: 828, radius: 48 }

export const acrylicFrame = {
  id: 'acrylic',
  nameKey: 'imageEditor.frameAcrylic',
  category: 'texture',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    bg1: '#E7F4EE',
    bg2: '#D3E9E4',
    tint: '#8FD3BE',
    blob1: '#B6E3D2',
    blob2: '#F6D9C8',
    ink: '#3F5B52'
  },
  colorSlots: [
    { key: 'bg1', nameKey: 'imageEditor.slotCanvas' },
    { key: 'tint', nameKey: 'imageEditor.slotPanel' },
    { key: 'blob2', nameKey: 'imageEditor.slotAccent' }
  ],
  colorways: [
    {
      id: 'mint',
      nameKey: 'imageEditor.colorMint',
      palette: { bg1: '#E7F4EE', bg2: '#D3E9E4', tint: '#8FD3BE', blob1: '#B6E3D2', blob2: '#F6D9C8', ink: '#3F5B52' }
    },
    {
      id: 'pink',
      nameKey: 'imageEditor.colorSakuraJelly',
      palette: { bg1: '#FBEEF2', bg2: '#F3DDE6', tint: '#EFA8BE', blob1: '#F7C9D8', blob2: '#CFE0F5', ink: '#5B3F49' }
    },
    {
      id: 'lilac',
      nameKey: 'imageEditor.colorIrisJelly',
      palette: { bg1: '#F1EEFA', bg2: '#E2DDF2', tint: '#AFA0E0', blob1: '#CFC3F2', blob2: '#F6D8E8', ink: '#463D62' }
    }
  ],
  window: ACRYLIC_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    // 背景：柔和渐变 + 虚化光斑，给半透明面板提供可透的底
    ctx.fillStyle = linearGradient(ctx, { x: 0, y: 0, width: size, height: size }, [
      [0, palette.bg1],
      [1, palette.bg2]
    ])
    ctx.fillRect(0, 0, size, size)

    radialBlob(ctx, { cx: 230, cy: 300, radius: 430, color: palette.blob1, alpha: 0.55, k })
    radialBlob(ctx, { cx: 980, cy: 250, radius: 380, color: palette.blob2, alpha: 0.5, k })
    radialBlob(ctx, { cx: 300, cy: 1010, radius: 420, color: palette.blob2, alpha: 0.5, k })
    radialBlob(ctx, { cx: 1010, cy: 1000, radius: 400, color: palette.blob1, alpha: 0.5, k })

    const panel = {
      x: ACRYLIC_PANEL.x * k,
      y: ACRYLIC_PANEL.y * k,
      width: ACRYLIC_PANEL.w * k,
      height: ACRYLIC_PANEL.h * k
    }
    const radius = ACRYLIC_PANEL.radius * k

    withShadow(ctx, k, { color: withAlpha(palette.tint, 0.3), blur: 44, offsetY: 26 }, () => {
      ctx.fillStyle = '#FFFFFF'
      roundRectPath(ctx, panel, radius)
      ctx.fill()
    })

    ctx.save()
    ctx.globalAlpha = 0.34
    ctx.fillStyle = palette.tint
    roundRectPath(ctx, panel, radius)
    ctx.fill()
    ctx.restore()

    // 内发光
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.lineWidth = 16 * k
    roundRectPath(ctx, {
      x: panel.x + 10 * k,
      y: panel.y + 10 * k,
      width: panel.width - 20 * k,
      height: panel.height - 20 * k
    }, radius - 8 * k)
    ctx.stroke()
    ctx.restore()

    // 斜向高光
    ctx.save()
    roundRectPath(ctx, panel, radius)
    ctx.clip()
    const gloss = linearGradient(ctx, { x: 120 * k, y: 0, width: 640 * k, height: 0 }, [
      [0, 'rgba(255,255,255,0)'],
      [0.5, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)']
    ], true)
    ctx.fillStyle = gloss
    ctx.beginPath()
    ctx.moveTo(120 * k, 900 * k)
    ctx.lineTo(620 * k, 96 * k)
    ctx.lineTo(760 * k, 96 * k)
    ctx.lineTo(250 * k, 1030 * k)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 框内背板
    ctx.fillStyle = backgroundColor || shadeColor(palette.tint, 0.62)
    roundRectPath(ctx, {
      x: ACRYLIC_WINDOW.x * k,
      y: ACRYLIC_WINDOW.y * k,
      width: ACRYLIC_WINDOW.w * k,
      height: ACRYLIC_WINDOW.h * k
    }, ACRYLIC_WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)'
    ctx.lineWidth = 3 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)'
    ctx.lineWidth = 3 * k
    roundRectPath(ctx, {
      x: ACRYLIC_PANEL.x * k,
      y: ACRYLIC_PANEL.y * k,
      width: ACRYLIC_PANEL.w * k,
      height: ACRYLIC_PANEL.h * k
    }, ACRYLIC_PANEL.radius * k)
    ctx.stroke()

    // 闪光点缀
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.86)'
    ctx.lineWidth = 3 * k
    for (const [cx, cy, s] of [[150, 178, 9], [1046, 200, 7], [170, 1030, 6]]) {
      ctx.beginPath()
      ctx.moveTo((cx - s) * k, cy * k)
      ctx.lineTo((cx + s) * k, cy * k)
      ctx.moveTo(cx * k, (cy - s) * k)
      ctx.lineTo(cx * k, (cy + s) * k)
      ctx.stroke()
    }
  },

  drawLabels({ ctx, k, palette, labels }) {
    drawText(ctx, labels.title, 600 * k, 1058 * k, {
      size: 34, color: palette.ink, align: 'center', tracking: 3, k
    })
  }
}

// ---------------------------------------------------------------- 胶片日期戳

const FILM_WINDOW = { x: 124, y: 142, w: 952, h: 858, radius: 4 }

export const filmFrame = {
  id: 'film',
  nameKey: 'imageEditor.frameFilm',
  category: 'texture',
  designSize: DESIGN,
  defaultFitRatio: 0.96,
  acceptsBackgroundColor: true,
  palette: {
    background: '#141414',
    hole: '#F1EDE6',
    line: '#6E6A62',
    line2: '#D8D2C6',
    stamp: '#FF7A2F'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotFilm' },
    { key: 'hole', nameKey: 'imageEditor.slotSprocket' },
    { key: 'stamp', nameKey: 'imageEditor.slotStamp' }
  ],
  colorways: [
    {
      id: 'black',
      nameKey: 'imageEditor.colorMono',
      palette: { background: '#141414', hole: '#F1EDE6', line: '#6E6A62', line2: '#D8D2C6', stamp: '#FF7A2F' }
    },
    {
      id: 'sepia',
      nameKey: 'imageEditor.colorSepia',
      palette: { background: '#241C16', hole: '#F3E7D6', line: '#8A7361', line2: '#E4D3BE', stamp: '#FFB05C' }
    }
  ],
  window: FILM_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, DESIGN * k, DESIGN * k)

    // 齿孔
    ctx.fillStyle = palette.hole
    for (let x = 96; x < 1104; x += 66) {
      for (const y of [70, 1020]) {
        roundRectPath(ctx, { x: x * k, y: y * k, width: 40 * k, height: 34 * k }, 8 * k)
        ctx.fill()
      }
    }

    ctx.strokeStyle = palette.line
    ctx.lineWidth = 3 * k
    ctx.strokeRect(50 * k, 50 * k, 1100 * k, 1100 * k)

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.background
    ctx.fillRect(FILM_WINDOW.x * k, FILM_WINDOW.y * k, FILM_WINDOW.w * k, FILM_WINDOW.h * k)
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = palette.line
    ctx.lineWidth = 2 * k
    ctx.strokeRect(win.x, win.y, win.width, win.height)

    // 划痕
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = '#FFFAF0'
    ctx.lineWidth = 2 * k
    for (const [x, drift] of [[210, 9], [388, -12], [552, 6], [704, -8], [900, 11]]) {
      ctx.beginPath()
      ctx.moveTo(x * k, 146 * k)
      ctx.lineTo((x + drift) * k, 996 * k)
      ctx.stroke()
    }
    ctx.restore()
  },

  drawLabels({ ctx, k, palette, labels }) {
    const stamp = stampDate(labels.date)
    drawText(ctx, stamp, 1076 * k, 1080 * k, {
      size: 38, color: palette.stamp, align: 'right', tracking: 2, k
    })
    drawText(ctx, labels.title, 130 * k, 1084 * k, { size: 32, color: palette.line2, k })
  }
}
