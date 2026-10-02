/**
 * 拼贴类：水彩撕纸拼贴 / 水彩波纹卡纸。
 * 撕纸毛边用噪声驱动的轮廓扰动（buildRoughPoints），水彩用噪点遮罩贴图。
 */
import {
  drawWatercolorBlob,
  roundRectPath,
  traceRoughRect,
  traceWavyRect,
  withAlpha
} from '@/utils/image/frameRenderer'
import { drawText, radialBlob, withShadow } from './shared'

const DESIGN = 1200

const WAVE_OUTER = [[30, 165, 0], [10, 62, 1]]
const WAVE_INNER = [[16, 118, 0.6], [6, 46, 1.8]]
const WAVE_CARD = { x: 86, y: 86, w: 1028, h: 1028 }
const WAVE_RECESS = { x: 154, y: 154, w: 892, h: 892 }
const WAVE_WINDOW = { x: 252, y: 252, w: 696, h: 696, radius: 40 }

const waveStains = [
  { cx: 150, cy: 176, radius: 420, key: 'stain1', seed: 301, alpha: 0.5 },
  { cx: 1058, cy: 176, radius: 380, key: 'stain2', seed: 311, alpha: 0.55 },
  { cx: 158, cy: 1052, radius: 400, key: 'stain2', seed: 321, alpha: 0.55 },
  { cx: 1050, cy: 1046, radius: 430, key: 'stain1', seed: 331, alpha: 0.5 },
  { cx: 588, cy: 70, radius: 380, key: 'stain1', seed: 341, alpha: 0.68 },
  { cx: 612, cy: 1130, radius: 380, key: 'stain2', seed: 351, alpha: 0.68 }
]

const waveEdgeStains = [
  { cx: 150, cy: 300, radius: 300, key: 'stain1', seed: 401, alpha: 0.62 },
  { cx: 236, cy: 966, radius: 280, key: 'stain1', seed: 411, alpha: 0.62 },
  { cx: 1000, cy: 176, radius: 260, key: 'stain2', seed: 421, alpha: 0.62 },
  { cx: 1086, cy: 726, radius: 250, key: 'stain2', seed: 431, alpha: 0.62 },
  { cx: 520, cy: 120, radius: 240, key: 'stain2', seed: 441, alpha: 0.62 }
]

export const waveFrame = {
  id: 'wave',
  nameKey: 'imageEditor.frameWave',
  category: 'collage',
  designSize: DESIGN,
  defaultFitRatio: 1,
  acceptsBackgroundColor: true,
  palette: {
    background: '#EFEEE8',
    card: '#FFFDFB',
    recess: '#FDFBF7',
    shade: '#5A5470',
    stain1: '#8FA9DB',
    stain2: '#B9A6D8'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'card', nameKey: 'imageEditor.slotCard' },
    { key: 'stain1', nameKey: 'imageEditor.slotWashA' },
    { key: 'stain2', nameKey: 'imageEditor.slotWashB' }
  ],
  colorways: [
    {
      id: 'blue',
      nameKey: 'imageEditor.colorBlueLilac',
      palette: { background: '#EFEEE8', card: '#FFFDFB', stain1: '#8FA9DB', stain2: '#B9A6D8', shade: '#5A5470' }
    },
    {
      id: 'cream',
      nameKey: 'imageEditor.colorCream',
      palette: { background: '#F2EDE4', card: '#FFFDFB', stain1: '#E3B98F', stain2: '#C9A9C6', shade: '#6A5A44' }
    },
    {
      id: 'mint',
      nameKey: 'imageEditor.colorMint',
      palette: { background: '#EAEFE8', card: '#FFFBF6', stain1: '#9CC7AE', stain2: '#A9C0D8', shade: '#4E6357' }
    }
  ],
  window: WAVE_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, DESIGN * k, DESIGN * k)

    for (const stain of waveStains) {
      drawWatercolorBlob(ctx, {
        cx: stain.cx,
        cy: stain.cy,
        radius: stain.radius,
        color: palette[stain.key],
        alpha: stain.alpha,
        seed: stain.seed,
        k
      })
    }

    const card = { x: WAVE_CARD.x * k, y: WAVE_CARD.y * k, width: WAVE_CARD.w * k, height: WAVE_CARD.h * k }
    const outer = WAVE_OUTER.map(([a, p, ph]) => [a * k, p * k, ph])
    withShadow(ctx, k, { color: 'rgba(40, 34, 30, 0.16)', blur: 30, offsetY: 16 }, () => {
      ctx.fillStyle = palette.card
      traceWavyRect(ctx, card, 96 * k, outer)
      ctx.fill()
    })

    // 跨在波浪边上的水彩：只画在卡纸边缘那圈带子里
    const innerCard = {
      x: (WAVE_CARD.x + 104) * k,
      y: (WAVE_CARD.y + 104) * k,
      width: (WAVE_CARD.w - 208) * k,
      height: (WAVE_CARD.h - 208) * k
    }
    ctx.save()
    traceWavyRect(ctx, card, 96 * k, outer, true)
    traceWavyRect(ctx, innerCard, 74 * k, outer, false)
    ctx.clip('evenodd')
    for (const stain of waveEdgeStains) {
      drawWatercolorBlob(ctx, {
        cx: stain.cx,
        cy: stain.cy,
        radius: stain.radius,
        color: palette[stain.key],
        alpha: stain.alpha,
        seed: stain.seed,
        k
      })
    }
    ctx.restore()

    const recess = { x: WAVE_RECESS.x * k, y: WAVE_RECESS.y * k, width: WAVE_RECESS.w * k, height: WAVE_RECESS.h * k }
    const inner = WAVE_INNER.map(([a, p, ph]) => [a * k, p * k, ph])

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.recess
    traceWavyRect(ctx, recess, 74 * k, inner)
    ctx.fill()

    ctx.strokeStyle = withAlpha(palette.shade, 0.18)
    ctx.lineWidth = 20 * k
    traceWavyRect(ctx, recess, 74 * k, inner)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 8 * k
    traceWavyRect(ctx, {
      x: recess.x + 12 * k,
      y: recess.y + 12 * k,
      width: recess.width - 24 * k,
      height: recess.height - 24 * k
    }, 64 * k, inner)
    ctx.stroke()

    withShadow(ctx, k, { color: 'rgba(40, 34, 30, 0.24)', blur: 18, offsetY: 8 }, () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.01)'
      roundRectPath(ctx, {
        x: WAVE_WINDOW.x * k,
        y: WAVE_WINDOW.y * k,
        width: WAVE_WINDOW.w * k,
        height: WAVE_WINDOW.h * k
      }, WAVE_WINDOW.radius * k)
      ctx.fill()
    })
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, window: win }) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.lineWidth = 3 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()
  }
}

// ---------------------------------------------------------------- 撕纸拼贴

const COLLAGE_CARD = { x: 108, y: 96, w: 984, h: 1008 }
const COLLAGE_WINDOW = { x: 182, y: 168, w: 836, h: 704, radius: 26 }

export const collageFrame = {
  id: 'collage',
  nameKey: 'imageEditor.frameCollage',
  category: 'collage',
  designSize: DESIGN,
  defaultFitRatio: 0.96,
  acceptsBackgroundColor: true,
  palette: {
    paper: '#F6F2EA',
    card: '#FFFDFA',
    wash: '#A9BEDF',
    wash2: '#C9B7DE',
    blot1: '#8FAAD8',
    blot2: '#C0ACDA',
    tape: '#E3EAF6',
    ink: '#4A5468',
    soft: '#93A0B4'
  },
  colorSlots: [
    { key: 'paper', nameKey: 'imageEditor.slotCanvas' },
    { key: 'card', nameKey: 'imageEditor.slotCard' },
    { key: 'wash', nameKey: 'imageEditor.slotWashA' },
    { key: 'wash2', nameKey: 'imageEditor.slotWashB' }
  ],
  colorways: [
    {
      id: 'blue',
      nameKey: 'imageEditor.colorBlueLilac',
      palette: {
        paper: '#F6F2EA', card: '#FFFDFA', wash: '#A9BEDF', wash2: '#C9B7DE',
        blot1: '#8FAAD8', blot2: '#C0ACDA', tape: '#E3EAF6', ink: '#4A5468', soft: '#93A0B4'
      }
    },
    {
      id: 'peach',
      nameKey: 'imageEditor.colorPeach',
      palette: {
        paper: '#F8F1EA', card: '#FFFDFA', wash: '#E7BFAE', wash2: '#F0CFAC',
        blot1: '#E3A288', blot2: '#EFC7A4', tape: '#F6E6DB', ink: '#63483E', soft: '#AD8D7D'
      }
    },
    {
      id: 'sage',
      nameKey: 'imageEditor.colorMatcha',
      palette: {
        paper: '#F3F3EA', card: '#FFFDFA', wash: '#BCCBA9', wash2: '#D8CFA8',
        blot1: '#A2B78A', blot2: '#D4CB9F', tape: '#E7EBDC', ink: '#4A5442', soft: '#8F9B84'
      }
    }
  ],
  window: COLLAGE_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    ctx.fillStyle = palette.paper
    ctx.fillRect(0, 0, size, size)

    radialBlob(ctx, { cx: 200, cy: 220, radius: 520, color: palette.wash, alpha: 0.42, k })
    radialBlob(ctx, { cx: 1000, cy: 980, radius: 500, color: palette.wash2, alpha: 0.40, k })
    radialBlob(ctx, { cx: 1040, cy: 200, radius: 420, color: palette.wash, alpha: 0.3, k })

    // 卡纸外露出的水彩色块
    for (const [cx, cy, radius, col, seed] of [
      [150, 190, 380, palette.blot1, 31],
      [1050, 990, 360, palette.blot2, 57],
      [1060, 160, 300, palette.blot1, 73],
      [140, 1020, 280, palette.blot2, 91]
    ]) {
      drawWatercolorBlob(ctx, { cx, cy, radius, color: col, alpha: 0.68, seed, k })
    }

    const card = {
      x: COLLAGE_CARD.x * k,
      y: COLLAGE_CARD.y * k,
      width: COLLAGE_CARD.w * k,
      height: COLLAGE_CARD.h * k
    }
    const roughness = { amplitude: 15 * k, seed: 9, cycles: 5, octaves: 3 }
    withShadow(ctx, k, { color: 'rgba(40, 34, 30, 0.20)', blur: 22, offsetY: 14 }, () => {
      ctx.fillStyle = palette.card
      traceRoughRect(ctx, card, 34 * k, roughness)
      ctx.fill()
    })

    // 胶带
    ctx.save()
    ctx.globalAlpha = 0.62
    ctx.fillStyle = palette.tape
    ctx.beginPath()
    ctx.moveTo(268 * k, 46 * k)
    ctx.lineTo(686 * k, 16 * k)
    ctx.lineTo(700 * k, 132 * k)
    ctx.lineTo(284 * k, 164 * k)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.card
    roundRectPath(ctx, {
      x: COLLAGE_WINDOW.x * k,
      y: COLLAGE_WINDOW.y * k,
      width: COLLAGE_WINDOW.w * k,
      height: COLLAGE_WINDOW.h * k
    }, COLLAGE_WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, window: win }) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.60)'
    ctx.lineWidth = 6 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()
  },

  drawLabels({ ctx, k, palette, labels }) {
    drawText(ctx, labels.title, 186 * k, 930 * k, { size: 44, color: palette.ink, k })
    drawText(ctx, labels.date, 188 * k, 1000 * k, {
      size: 24, weight: 400, color: palette.soft, tracking: 3, k
    })
  }
}
