/**
 * 复古 / 东方类：复古描金 / 和风国风。
 */
import { roundRectPath, shadeColor } from '@/utils/image/frameRenderer'
import { drawText, linearGradient } from './shared'

const DESIGN = 1200

// ---------------------------------------------------------------- 复古描金

function giltStops(base) {
  return [
    [0, shadeColor(base, -0.45)],
    [0.24, shadeColor(base, -0.12)],
    [0.42, shadeColor(base, 0.42)],
    [0.58, shadeColor(base, -0.16)],
    [0.78, shadeColor(base, -0.42)],
    [1, shadeColor(base, 0.18)]
  ]
}

function teardrop(ctx, cx, cy, length, width, angle) {
  ctx.beginPath()
  for (let step = 0; step <= 36; step += 1) {
    const a = (step / 36) * Math.PI * 2
    const x = Math.cos(a) * (length / 2)
    const y = Math.sin(a) * (width / 2) * (0.35 + 0.65 * (Math.cos(a) * 0.5 + 0.5))
    const px = cx + x * Math.cos(angle) - y * Math.sin(angle)
    const py = cy + x * Math.sin(angle) + y * Math.cos(angle)
    if (step === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}

/** 左上角方向的花饰；其余三角靠镜像绘制。 */
function cornerOrnament(ctx, k, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color

  for (const [r, width] of [[58, 7], [86, 4], [112, 3]]) {
    ctx.lineWidth = width * k
    ctx.beginPath()
    ctx.arc(30 * k, 30 * k, r * k, 0, Math.PI / 2)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.arc(31 * k, 31 * k, 15 * k, 0, Math.PI * 2)
  ctx.fill()

  const diagonal = Math.PI / 4
  for (let i = 0; i < 3; i += 1) {
    const dist = 132 + i * 42
    const c = dist * 0.7071
    teardrop(ctx, c * k, c * k, (46 - i * 8) * k, (26 - i * 5) * k, i % 2 === 0 ? diagonal : diagonal + Math.PI / 2)
  }
  for (const dist of [104, 250]) {
    const c = dist * 0.7071
    ctx.beginPath()
    ctx.arc(c * k, c * k, 6 * k, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export const vintageFrame = {
  id: 'vintage',
  nameKey: 'imageEditor.frameVintage',
  category: 'classic',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    panel: '#F3E9D5',
    gold: '#C9A34A',
    accent2: '#4A3B22'
  },
  colorSlots: [
    { key: 'panel', nameKey: 'imageEditor.slotCanvas' },
    { key: 'gold', nameKey: 'imageEditor.slotGold' },
    { key: 'accent2', nameKey: 'imageEditor.slotInk' }
  ],
  colorways: [
    { id: 'ivory', nameKey: 'imageEditor.colorIvoryGold', palette: { panel: '#F3E9D5', gold: '#C9A34A', accent2: '#4A3B22' } },
    { id: 'teal', nameKey: 'imageEditor.colorTealGold', palette: { panel: '#E4EBE4', gold: '#C2A455', accent2: '#25453C' } },
    { id: 'oxblood', nameKey: 'imageEditor.colorWineGold', palette: { panel: '#F0E2DC', gold: '#C79A4C', accent2: '#4E2320' } }
  ],
  window: { x: 150, y: 150, w: 900, h: 900, radius: 6 },

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    ctx.fillStyle = palette.panel
    ctx.fillRect(0, 0, size, size)

    // 极淡暗纹
    ctx.save()
    ctx.globalAlpha = 0.06
    ctx.strokeStyle = palette.accent2
    ctx.lineWidth = 2 * k
    for (let y = -60; y < DESIGN + 80; y += 96) {
      for (let x = -60; x < DESIGN + 80; x += 96) {
        ctx.beginPath()
        ctx.arc((x + 48) * k, (y + 48) * k, 48 * k, Math.PI * 1.11, Math.PI * 1.89)
        ctx.stroke()
      }
    }
    ctx.restore()

    // 金色外框
    const goldGradient = linearGradient(ctx, { x: 0, y: 64 * k, width: size, height: 1072 * k }, giltStops(palette.gold))
    ctx.fillStyle = goldGradient
    ctx.beginPath()
    ctx.rect(66 * k, 66 * k, 1068 * k, 1068 * k)
    ctx.rect(96 * k, 96 * k, 1008 * k, 1008 * k)
    ctx.fill('evenodd')

    // 内暗线，压掉金属渐变边缘的塑料感
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = shadeColor(palette.gold, -0.66)
    ctx.lineWidth = 6 * k
    ctx.strokeRect(99 * k, 99 * k, 1002 * k, 1002 * k)
    ctx.restore()

    ctx.strokeStyle = goldGradient
    ctx.lineWidth = 5 * k
    ctx.strokeRect(118 * k, 118 * k, 964 * k, 964 * k)

    // 四角花饰
    for (const [flipX, flipY] of [[false, false], [true, false], [false, true], [true, true]]) {
      ctx.save()
      ctx.translate(flipX ? 1134 * k : 66 * k, flipY ? 1134 * k : 66 * k)
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1)
      cornerOrnament(ctx, k, palette.gold)
      ctx.restore()
    }

    // 内窗内阴影
    ctx.save()
    ctx.globalAlpha = 0.30
    ctx.strokeStyle = shadeColor(palette.gold, -0.72)
    ctx.lineWidth = 20 * k
    ctx.strokeRect(158 * k, 158 * k, 884 * k, 884 * k)
    ctx.restore()

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.panel
    roundRectPath(ctx, { x: 150 * k, y: 150 * k, width: 900 * k, height: 900 * k }, 6 * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = palette.gold
    ctx.lineWidth = 3 * k
    ctx.strokeRect(win.x, win.y, win.width, win.height)
  },

  drawLabels({ ctx, k, palette, labels }) {
    drawText(ctx, labels.title, 600 * k, 1152 * k, {
      size: 34, color: palette.accent2, align: 'center', tracking: 8, k
    })
  }
}

// ---------------------------------------------------------------- 和风国风

function sakura(ctx, cx, cy, size, color, rotation) {
  const r = size * 0.26
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)
  ctx.fillStyle = color
  for (let i = 0; i < 5; i += 1) {
    ctx.save()
    ctx.rotate((i / 5) * Math.PI * 2)
    ctx.beginPath()
    ctx.ellipse(r * 0.62, 0, r * 0.52, r * 0.40, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#FFF6E2'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export const waFrame = {
  id: 'wa',
  nameKey: 'imageEditor.frameWa',
  category: 'oriental',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    paper: '#F8F3E9',
    accent: '#9AA6B8',
    vermillion: '#C0392B',
    petal: '#F3B9C8',
    ink: '#3B3A36'
  },
  colorSlots: [
    { key: 'paper', nameKey: 'imageEditor.slotCanvas' },
    { key: 'vermillion', nameKey: 'imageEditor.slotVermillion' },
    { key: 'petal', nameKey: 'imageEditor.slotPetal' }
  ],
  colorways: [
    {
      id: 'sakura',
      nameKey: 'imageEditor.colorSakura',
      palette: { paper: '#F8F3E9', accent: '#9AA6B8', vermillion: '#C0392B', petal: '#F3B9C8', ink: '#3B3A36' }
    },
    {
      id: 'indigo',
      nameKey: 'imageEditor.colorIndigo',
      palette: { paper: '#F6F2E7', accent: '#8E9BA8', vermillion: '#B23A2E', petal: '#E7C9A8', ink: '#31353D' }
    }
  ],
  window: { x: 140, y: 140, w: 920, h: 870, radius: 4 },

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    ctx.fillStyle = palette.paper
    ctx.fillRect(0, 0, size, size)

    // 青海波
    ctx.save()
    ctx.globalAlpha = 0.16
    ctx.strokeStyle = palette.accent
    ctx.lineWidth = 2 * k
    const r = 34
    for (let row = -2; row < DESIGN / r + 3; row += 1) {
      for (let col = -2; col < DESIGN / r + 3; col += 1) {
        const cx = col * r * 2 + (row % 2) * r
        const cy = row * r
        ctx.beginPath()
        ctx.arc(cx * k, cy * k, r * 2 * k, Math.PI, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.restore()

    // 朱线 + 墨线
    ctx.strokeStyle = palette.vermillion
    ctx.lineWidth = 6 * k
    roundRectPath(ctx, { x: 74 * k, y: 74 * k, width: 1052 * k, height: 1052 * k }, 10 * k)
    ctx.stroke()

    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, { x: 100 * k, y: 100 * k, width: 1000 * k, height: 1000 * k }, 8 * k)
    ctx.stroke()
    ctx.restore()

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.paper
    ctx.fillRect(140 * k, 140 * k, 920 * k, 870 * k)
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.save()
    ctx.globalAlpha = 0.66
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 2 * k
    ctx.strokeRect(win.x, win.y, win.width, win.height)
    ctx.restore()

    // 樱瓣（压住照片右上角）
    for (const [cx, cy, scale, rotation] of [
      [988, 206, 0.42, 0.2],
      [1064, 300, 0.32, 3.7],
      [912, 300, 0.26, 1.6]
    ]) {
      sakura(ctx, cx * k, cy * k, 320 * scale * k, palette.petal, rotation)
    }

    // 落款印章
    ctx.fillStyle = palette.vermillion
    roundRectPath(ctx, { x: 122 * k, y: 1018 * k, width: 88 * k, height: 88 * k }, 14 * k)
    ctx.fill()
    drawText(ctx, '谷', 166 * k, 1063 * k, {
      size: 54, color: '#FFF6EE', align: 'center', baseline: 'middle', k
    })
  },

  drawLabels({ ctx, k, palette, labels }) {
    drawText(ctx, labels.title, 620 * k, 1040 * k, {
      size: 30, color: palette.ink, align: 'center', tracking: 6, k
    })
    drawText(ctx, labels.date, 620 * k, 1086 * k, {
      size: 20, weight: 400, color: palette.vermillion, align: 'center', tracking: 4, k
    })
  }
}
