/**
 * 简约类：INS 极简留白 / 韩系小卡。
 * 「框内背板」由导出设置里的背景颜色驱动（acceptsBackgroundColor），
 * 因此调色槽位只覆盖画布外层、卡纸、描边这些模板自己的颜色。
 */
import { roundRectPath } from '@/utils/image/frameRenderer'
import { drawText, shadowedRoundRect } from './shared'

const DESIGN = 1200

export const minimalFrame = {
  id: 'minimal',
  nameKey: 'imageEditor.frameMinimal',
  category: 'simple',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    background: '#EFEDE9',
    mat: '#FBFAF8',
    hair: '#CFC9C0',
    ink: '#2E2C29'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'hair', nameKey: 'imageEditor.slotLine' },
    { key: 'ink', nameKey: 'imageEditor.slotInk' }
  ],
  colorways: [
    {
      id: 'warm',
      nameKey: 'imageEditor.colorWarmWhite',
      palette: { background: '#EFEDE9', mat: '#FBFAF8', hair: '#CFC9C0', ink: '#2E2C29' }
    },
    {
      id: 'cool',
      nameKey: 'imageEditor.colorCoolWhite',
      palette: { background: '#E9EBEE', mat: '#FCFCFD', hair: '#C6CBD2', ink: '#232830' }
    }
  ],
  window: { x: 168, y: 168, w: 864, h: 864, radius: 2 },

  drawBehind({ ctx, k, palette, backgroundColor }) {
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, 1200 * k, 1200 * k)

    const mat = { x: 58 * k, y: 58 * k, width: 1084 * k, height: 1084 * k }
    shadowedRoundRect(ctx, k, mat, 6 * k, { color: 'rgba(40, 34, 30, 0.10)', blur: 34, offsetY: 12 }, palette.mat)

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.mat
    roundRectPath(ctx, { x: 168 * k, y: 168 * k, width: 864 * k, height: 864 * k }, 2 * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = palette.hair
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()
  },

  drawLabels({ ctx, k, palette, labels }) {
    drawText(ctx, labels.date, 168 * k, 1062 * k, {
      size: 24, weight: 700, color: palette.ink, tracking: 4, k
    })
    drawText(ctx, labels.title, 1032 * k, 1062 * k, {
      size: 26, weight: 400, color: palette.ink, align: 'right', tracking: 2, k
    })
  }
}

export const photocardFrame = {
  id: 'photocard',
  nameKey: 'imageEditor.framePhotocard',
  category: 'simple',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    background: '#F6EFE6',
    card: '#FFFFFF',
    accent: '#D8A478',
    ink: '#4E453D',
    soft: '#A99784'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'card', nameKey: 'imageEditor.slotCard' },
    { key: 'accent', nameKey: 'imageEditor.slotAccent' }
  ],
  colorways: [
    {
      id: 'cream',
      nameKey: 'imageEditor.colorCream',
      palette: { background: '#F6EFE6', card: '#FFFFFF', accent: '#D8A478', ink: '#4E453D', soft: '#A99784' }
    },
    {
      id: 'mint',
      nameKey: 'imageEditor.colorMint',
      palette: { background: '#E9F2EA', card: '#FFFFFF', accent: '#7FB08C', ink: '#43564A', soft: '#9BB3A2' }
    },
    {
      id: 'blush',
      nameKey: 'imageEditor.colorBlush',
      palette: { background: '#FAEFF1', card: '#FFFFFF', accent: '#E09AA6', ink: '#574549', soft: '#BC9CA3' }
    },
    {
      id: 'lavender',
      nameKey: 'imageEditor.colorLavender',
      palette: { background: '#F0EDF8', card: '#FFFFFF', accent: '#A79AD3', ink: '#4B4560', soft: '#A9A2BE' }
    }
  ],
  window: { x: 152, y: 144, w: 896, h: 702, radius: 30 },

  drawBehind({ ctx, k, palette, backgroundColor }) {
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, 1200 * k, 1200 * k)

    const card = { x: 92 * k, y: 84 * k, width: 1016 * k, height: 1008 * k }
    shadowedRoundRect(
      ctx, k, card, 58 * k,
      { color: 'rgba(78, 69, 61, 0.20)', blur: 26, offsetY: 18 },
      palette.card
    )

    // 框内背板（抠图后主体悬浮时最明显）
    ctx.fillStyle = backgroundColor || palette.card
    roundRectPath(ctx, { x: 152 * k, y: 144 * k, width: 896 * k, height: 702 * k }, 30 * k)
    ctx.fill()

    ctx.fillStyle = palette.accent
    roundRectPath(ctx, { x: 700 * k, y: 58 * k, width: 200 * k, height: 50 * k }, 22 * k)
    ctx.fill()
  },
  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = palette.accent
    ctx.globalAlpha = 0.45
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()
    ctx.globalAlpha = 1

    ctx.fillStyle = palette.accent
    roundRectPath(ctx, { x: 156 * k, y: 1012 * k, width: 80 * k, height: 10 * k }, 5 * k)
    ctx.fill()
  },

  drawLabels({ ctx, k, palette, labels }) {
    drawText(ctx, labels.title, 156 * k, 888 * k, { size: 46, color: palette.ink, k })
    drawText(ctx, labels.date, 1044 * k, 994 * k, {
      size: 26, weight: 400, color: palette.soft, align: 'right', k
    })
    drawText(ctx, labels.code, 800 * k, 72 * k, {
      size: 22, color: '#FFFFFF', align: 'center', tracking: 2, k
    })
  }
}
