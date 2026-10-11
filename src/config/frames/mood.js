/**
 * 意境类：设计贴纸风外框。
 * 贴纸图（明月/流云/富士山/樱花等）来自 Twemoji（CC-BY 4.0），由 drawSticker 带投影贴上；
 * 卡纸底、月晕、晨雾、朱日、花枝等氛围层仍走程序化绘制，配色经 colorSlots 暴露给用户。
 */
import {
  drawWatercolorBlob,
  roundRectPath,
  shadeColor,
  withAlpha
} from '@/utils/image/frameRenderer'
import { drawText, radialBlob } from './shared'
import {
  birdSticker,
  branchSticker,
  diamondSticker,
  drawSticker,
  mountainSticker,
  scallopRectPath
} from './moodStickers'

const DESIGN = 1200

// ---------------------------------------------------------------- 月夜流云

// 内窗四周留出约 190-200px 的贴纸带，所有贴纸都待在留白里，不压照片
const MOON_WINDOW = { x: 190, y: 200, w: 820, h: 800, radius: 18 }
const MOON_POS = { cx: 1090, cy: 110, size: 190 }

/** 散在画布留白上的细碎星点，坐标钉死保证每次渲染一致。 */
const MOON_DOTS = [
  [60, 120, 3], [120, 68, 2.4], [210, 52, 2], [470, 60, 2.2],
  [600, 40, 3], [730, 92, 2.2], [48, 300, 2.6], [92, 470, 2.2], [56, 640, 3],
  [110, 820, 2.4], [1120, 420, 2.6], [1150, 580, 2.2], [1108, 760, 3],
  [240, 1108, 2.4], [420, 1152, 2.6], [760, 1122, 2.2], [940, 1162, 3]
]

const MOON_SPARKS = [
  { cx: 100, cy: 480, size: 90 },
  { cx: 135, cy: 890, size: 65 },
  { cx: 1110, cy: 620, size: 80 },
  { cx: 1118, cy: 930, size: 55 },
  { cx: 762, cy: 1128, size: 60 }
]

export const moonlitFrame = {
  dateLabel: true,
  id: 'moonlit',
  nameKey: 'imageEditor.frameMoonlit',
  category: 'mood',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    background: '#2B3450',
    back: '#232B48',
    wash: '#E8C87A'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'wash', nameKey: 'imageEditor.slotGlow' }
  ],
  colorways: [
    {
      id: 'night',
      nameKey: 'imageEditor.colorNightIndigo',
      palette: { background: '#2B3450', wash: '#E8C87A' }
    },
    {
      id: 'teal',
      nameKey: 'imageEditor.colorDeepTeal',
      palette: { background: '#24433F', wash: '#D8CE9A' }
    },
    {
      id: 'plum',
      nameKey: 'imageEditor.colorDuskPurple',
      palette: { background: '#3B2D46', wash: '#E8B8B0' }
    }
  ],
  window: MOON_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, size, size)

    // 月晕与夜气（画在主体之下，照片会盖住窗内的部分）
    radialBlob(ctx, { cx: MOON_POS.cx, cy: MOON_POS.cy, radius: 400, color: palette.wash, alpha: 0.22, k })
    radialBlob(ctx, { cx: 180, cy: 1040, radius: 430, color: palette.wash, alpha: 0.06, k })
    radialBlob(ctx, { cx: 1080, cy: 980, radius: 420, color: palette.wash, alpha: 0.05, k })

    // 留白上的细碎星点
    ctx.fillStyle = 'rgba(255, 244, 214, 0.5)'
    for (const [x, y, r] of MOON_DOTS) {
      ctx.beginPath()
      ctx.arc(x * k, y * k, r * k, 0, Math.PI * 2)
      ctx.fill()
    }

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.back
    roundRectPath(ctx, {
      x: MOON_WINDOW.x * k,
      y: MOON_WINDOW.y * k,
      width: MOON_WINDOW.w * k,
      height: MOON_WINDOW.h * k
    }, MOON_WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    // 窗口一圈极细的月光线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()

    // 明月栖在右上角，轻吻内窗角
    drawSticker(ctx, k, 'moon', { cx: MOON_POS.cx, cy: MOON_POS.cy, size: MOON_POS.size })

    // 流云守上沿留白并轻吻窗沿，一朵栖在左下（月兔坐在云上），麦穗守右下
    drawSticker(ctx, k, 'cloud', { cx: 420, cy: 105, size: 190 })
    drawSticker(ctx, k, 'cloud', { cx: 880, cy: 125, size: 150, alpha: 0.92 })
    drawSticker(ctx, k, 'cloud', { cx: 150, cy: 1090, size: 185, alpha: 0.88 })
    drawSticker(ctx, k, 'rabbit', { cx: 248, cy: 1098, size: 118 })
    drawSticker(ctx, k, 'rice', { cx: 1105, cy: 1092, size: 185 })

    for (const spark of MOON_SPARKS) {
      drawSticker(ctx, k, 'sparkles', { ...spark, blur: 10, offsetY: 5 })
    }
  },

  drawLabels({ ctx, k, palette, labels }) {
    const color = withAlpha(palette.wash, 0.85)
    drawText(ctx, labels.title, 600 * k, 1104 * k, {
      size: 30, color, align: 'center', tracking: 6, k
    })
    drawText(ctx, labels.date, 600 * k, 1150 * k, {
      size: 22, weight: 400, color, align: 'center', tracking: 4, k
    })
  }
}

// ---------------------------------------------------------------- 远山淡影

// 整张画布是一幅连续的山水横卷：远山画在照片后面（山峰从两侧探出、中段被照片
// 自然遮住），中景与近景山脊全宽横贯画布底部并层层压叠，雾气垫在层与层之间，
// 朱日与飞鸟占住天空间，日期当「落款」题在天空正中。照片是山水中的一扇亮窗。
const RIDGE_WINDOW = { x: 210, y: 170, w: 780, h: 700, radius: 8 }

/** 远山（画在照片后面）：两侧峰探出，中段被照片遮住。 */
const RIDGE_FAR = [
  [-30, 950], [120, 830], [300, 910], [500, 940], [700, 950], [880, 845], [1060, 920], [1230, 960]
]
/** 中景与近景（画在照片前面）：全宽横贯，峰线全部压在照片下沿之下。 */
const RIDGE_MID = [
  [-30, 1030], [160, 930], [360, 1000], [560, 1010], [760, 1000], [960, 940], [1150, 1000], [1230, 1040]
]
const RIDGE_NEAR = [
  [-30, 1110], [200, 1020], [430, 1090], [650, 1000], [880, 1090], [1100, 1020], [1230, 1090]
]

const BIRDS = [
  { cx: 280, cy: 108, s: 42, angle: -0.06 },
  { cx: 374, cy: 76, s: 30, angle: 0.08 },
  { cx: 212, cy: 70, s: 24, angle: -0.12 }
]

/** 垫在中景与近景之间的水彩雾气，中心全部压在照片下沿之下。 */
const RIDGE_MIST = [
  { cx: 250, cy: 1050, radius: 160, seed: 521, alpha: 0.5 },
  { cx: 700, cy: 1062, radius: 170, seed: 531, alpha: 0.45 },
  { cx: 1050, cy: 1045, radius: 150, seed: 541, alpha: 0.5 }
]

export const mountainFrame = {
  dateLabel: true,
  id: 'mountain',
  nameKey: 'imageEditor.frameMistMountain',
  category: 'mood',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    background: '#F5F2E9',
    back: '#EFEADF',
    mountain: '#5C6B7A',
    wash: '#9FB4C4'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'mountain', nameKey: 'imageEditor.slotMountain' },
    { key: 'wash', nameKey: 'imageEditor.slotWashA' }
  ],
  colorways: [
    {
      id: 'dusky',
      nameKey: 'imageEditor.colorDeepTeal',
      palette: { background: '#F5F2E9', mountain: '#5C6B7A', wash: '#9FB4C4' }
    },
    {
      id: 'dusk',
      nameKey: 'imageEditor.colorDuskPurple',
      palette: { background: '#F3EFF2', mountain: '#6E6280', wash: '#B4A8C4' }
    },
    {
      id: 'river',
      nameKey: 'imageEditor.colorRivuletGreen',
      palette: { background: '#F2F2E8', mountain: '#4F7263', wash: '#A9C4B4' }
    }
  ],
  window: RIDGE_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, size, size)

    // 天空的两抹淡霭
    radialBlob(ctx, { cx: 170, cy: 120, radius: 420, color: palette.wash, alpha: 0.18, k })
    radialBlob(ctx, { cx: 1030, cy: 90, radius: 380, color: palette.wash, alpha: 0.14, k })

    // 远山：画在照片后面，山脚雾气也压在照片后面，只在边角露出来
    mountainSticker(ctx, k, {
      crest: RIDGE_FAR, baseY: 1210, color: shadeColor(palette.mountain, 0.45), alpha: 0.92
    })
    drawWatercolorBlob(ctx, { cx: 600, cy: 1010, radius: 320, color: '#FFFFFF', alpha: 0.4, seed: 511, k })

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.back
    roundRectPath(ctx, {
      x: RIDGE_WINDOW.x * k,
      y: RIDGE_WINDOW.y * k,
      width: RIDGE_WINDOW.w * k,
      height: RIDGE_WINDOW.h * k
    }, RIDGE_WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = withAlpha(shadeColor(palette.mountain, -0.35), 0.18)
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()

    // 天空：金乌贴纸带一圈暖晕，飞鸟斜掠
    radialBlob(ctx, { cx: 1085, cy: 92, radius: 170, color: '#E9C46A', alpha: 0.22, k })
    drawSticker(ctx, k, 'sun', { cx: 1085, cy: 92, size: 150 })
    const birdColor = withAlpha(shadeColor(palette.wash, -0.6), 0.92)
    for (const bird of BIRDS) {
      birdSticker(ctx, k, { ...bird, color: birdColor })
    }

    // 中景山脊 → 雾 → 近景山脊：层层压叠，白边就是层间的纸
    mountainSticker(ctx, k, { crest: RIDGE_MID, baseY: 1210, color: shadeColor(palette.mountain, 0.18) })
    for (const stain of RIDGE_MIST) {
      drawWatercolorBlob(ctx, { ...stain, color: '#FFFFFF', k })
    }
    mountainSticker(ctx, k, { crest: RIDGE_NEAR, baseY: 1210, color: palette.mountain })
  },

  drawLabels({ ctx, k, palette, labels }) {
    const color = withAlpha(shadeColor(palette.mountain, -0.5), 0.9)
    drawText(ctx, labels.title, 600 * k, 40 * k, {
      size: 28, color, align: 'center', tracking: 6, k
    })
    drawText(ctx, labels.date, 600 * k, 88 * k, {
      size: 22, weight: 400, color, align: 'center', tracking: 4, k
    })
  }
}

// ---------------------------------------------------------------- 花枝落瓣

const BLOSSOM_WINDOW = { x: 210, y: 190, w: 820, h: 830, radius: 10 }

export const blossomFrame = {
  dateLabel: true,
  id: 'blossom',
  nameKey: 'imageEditor.frameBlossom',
  category: 'mood',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    background: '#F8F3EA',
    back: '#F4EEE2',
    branch: '#7B5A40',
    wash: '#E9C8CE'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'branch', nameKey: 'imageEditor.slotBranch' },
    { key: 'wash', nameKey: 'imageEditor.slotWashA' }
  ],
  colorways: [
    {
      id: 'pink',
      nameKey: 'imageEditor.colorPeachBloom',
      palette: { background: '#F8F3EA', branch: '#7B5A40', wash: '#E9C8CE' }
    },
    {
      id: 'red',
      nameKey: 'imageEditor.colorRedPlum',
      palette: { background: '#F6F1E7', branch: '#5C4A3C', wash: '#E3B7AE' }
    },
    {
      id: 'white',
      nameKey: 'imageEditor.colorWhitePlum',
      palette: { background: '#F2F1EC', branch: '#4C4A45', wash: '#DCD8CE' }
    }
  ],
  window: BLOSSOM_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k
    ctx.fillStyle = palette.background
    ctx.fillRect(0, 0, size, size)

    radialBlob(ctx, { cx: 300, cy: 240, radius: 430, color: palette.wash, alpha: 0.18, k })
    radialBlob(ctx, { cx: 940, cy: 1010, radius: 470, color: palette.wash, alpha: 0.14, k })

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.back
    roundRectPath(ctx, {
      x: BLOSSOM_WINDOW.x * k,
      y: BLOSSOM_WINDOW.y * k,
      width: BLOSSOM_WINDOW.w * k,
      height: BLOSSOM_WINDOW.h * k
    }, BLOSSOM_WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, window: win }) {
    ctx.strokeStyle = withAlpha(shadeColor(palette.branch, -0.3), 0.16)
    ctx.lineWidth = 2 * k
    roundRectPath(ctx, win, win.radius || 0)
    ctx.stroke()

    // 一枝沿上沿留白横出，两根分枝各擎一朵樱花——整枝都不越过内窗上沿
    branchSticker(ctx, k, {
      from: { x: -40, y: 100 },
      via: { x: 310, y: 76 },
      to: { x: 762, y: 90 },
      width0: 30,
      width1: 9,
      color: palette.branch,
      twigs: [
        { from: { x: 222, y: 88 }, via: { x: 320, y: 40 }, to: { x: 400, y: 55 }, width0: 12, width1: 4 },
        { from: { x: 445, y: 84 }, via: { x: 540, y: 30 }, to: { x: 620, y: 60 }, width0: 12, width1: 4 }
      ]
    })

    drawSticker(ctx, k, 'sakura', { cx: 762, cy: 96, size: 100, angle: 0.1 })
    drawSticker(ctx, k, 'sakura', { cx: 400, cy: 55, size: 84, angle: -0.3 })
    drawSticker(ctx, k, 'sakura', { cx: 65, cy: 100, size: 66, angle: 0.5 })
    drawSticker(ctx, k, 'sakura', { cx: 555, cy: 72, size: 44, angle: 1.2 })
    drawSticker(ctx, k, 'leaf', { cx: 700, cy: 145, size: 76, angle: -2.4 })
    drawSticker(ctx, k, 'leaf', { cx: 240, cy: 150, size: 58, angle: 2.6 })

    // 落英守下沿与右侧留白
    const petals = [
      [860, 1090, 44, 0.7], [950, 1135, 36, -0.5], [700, 1110, 42, 1.3],
      [420, 1135, 34, 0.2], [1120, 600, 40, 0.5], [1105, 820, 34, 1.1]
    ]
    for (const [cx, cy, size, angle] of petals) {
      drawSticker(ctx, k, 'sakura', { cx, cy, size, angle, blur: 9, offsetY: 4 })
    }
  },

  drawLabels({ ctx, k, palette, labels }) {
    const color = withAlpha(shadeColor(palette.branch, -0.1), 0.9)
    drawText(ctx, labels.title, 126 * k, 1078 * k, {
      size: 30, color, tracking: 6, k
    })
    drawText(ctx, labels.date, 128 * k, 1124 * k, {
      size: 22, weight: 400, color, tracking: 4, k
    })
  }
}

// ---------------------------------------------------------------- 甜点手帐

const SWEETS_WINDOW = { x: 165, y: 235, w: 870, h: 730, radius: 10 }
const SWEETS_CREAM = { x: 62, y: 62, w: 1076, h: 1076 }
const SWEETS_YELLOW = { x: 46, y: 46, w: 1108, h: 1108 }
const SWEETS_SCALLOP = 30
/** 标题斜放角度（弧度，负值 = 右端上扬）。 */
const TITLE_TILT = -0.085

const SWEETS_DIAMONDS = [
  { cx: 118, cy: 312, size: 26 },
  { cx: 1082, cy: 425, size: 30 },
  { cx: 718, cy: 148, size: 22 },
  { cx: 138, cy: 705, size: 22 },
  { cx: 1080, cy: 905, size: 26 }
]

export const sweetsFrame = {
  dateLabel: true,
  id: 'sweets',
  nameKey: 'imageEditor.frameSweets',
  category: 'mood',
  designSize: DESIGN,
  defaultFitRatio: 0.94,
  acceptsBackgroundColor: true,
  palette: {
    background: '#FBF7EE',
    frame: '#6B4F3A',
    accent: '#E8C86A',
    back: '#FFFDF6'
  },
  colorSlots: [
    { key: 'background', nameKey: 'imageEditor.slotCanvas' },
    { key: 'frame', nameKey: 'imageEditor.slotFrame' },
    { key: 'accent', nameKey: 'imageEditor.slotAccent' }
  ],
  colorways: [
    {
      id: 'cocoa',
      nameKey: 'imageEditor.colorCocoa',
      palette: { background: '#FBF7EE', frame: '#6B4F3A', accent: '#E8C86A' }
    },
    {
      id: 'matcha',
      nameKey: 'imageEditor.colorMatcha',
      palette: { background: '#F7FAF0', frame: '#5F6F4C', accent: '#D8A85A' }
    },
    {
      id: 'berry',
      nameKey: 'imageEditor.colorBerry',
      palette: { background: '#FDF4F4', frame: '#7A4A52', accent: '#E0A4B4' }
    }
  ],
  window: SWEETS_WINDOW,

  drawBehind({ ctx, k, palette, backgroundColor }) {
    const size = DESIGN * k

    // 棕色外环 → 黄色细环 → 奶油花边纸
    ctx.fillStyle = palette.frame
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = palette.accent
    scallopRectPath(ctx, SWEETS_YELLOW, SWEETS_SCALLOP, k)
    ctx.fill()
    ctx.fillStyle = palette.background
    scallopRectPath(ctx, SWEETS_CREAM, SWEETS_SCALLOP, k)
    ctx.fill()

    // 格纹纸（裁进花边里）
    ctx.save()
    scallopRectPath(ctx, SWEETS_CREAM, SWEETS_SCALLOP, k)
    ctx.clip()
    ctx.strokeStyle = withAlpha(shadeColor(palette.frame, 0.45), 0.35)
    ctx.lineWidth = 2 * k
    for (let pos = 48; pos < DESIGN; pos += 48) {
      ctx.beginPath()
      ctx.moveTo(pos * k, 0)
      ctx.lineTo(pos * k, size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos * k)
      ctx.lineTo(size, pos * k)
      ctx.stroke()
    }
    ctx.restore()

    // 框内背板
    ctx.fillStyle = backgroundColor || palette.back
    roundRectPath(ctx, {
      x: SWEETS_WINDOW.x * k,
      y: SWEETS_WINDOW.y * k,
      width: SWEETS_WINDOW.w * k,
      height: SWEETS_WINDOW.h * k
    }, SWEETS_WINDOW.radius * k)
    ctx.fill()
  },

  clipSubject({ ctx, window: win }) {
    roundRectPath(ctx, win, win.radius || 0)
  },

  drawOverlay({ ctx, k, palette, labels }) {
    // 食物贴纸守四角留白，轻吻照片边缘
    drawSticker(ctx, k, 'croissant', { cx: 1022, cy: 155, size: 165 })
    drawSticker(ctx, k, 'cookie', { cx: 1108, cy: 268, size: 112 })
    drawSticker(ctx, k, 'pudding', { cx: 160, cy: 1048, size: 165 })
    drawSticker(ctx, k, 'strawberry', { cx: 286, cy: 1108, size: 92 })
    drawSticker(ctx, k, 'shortcake', { cx: 72, cy: 928, size: 118 })

    for (const diamond of SWEETS_DIAMONDS) {
      diamondSticker(ctx, k, { ...diamond, color: palette.accent, alpha: 0.95 })
    }

    // 手帐艺术字标题：左上角微微上扬地斜放（Baloo 2 预载失败时退回系统字体）。
    // 词尾菱形把「things 行尾」的局部坐标经旋转平移换算回画布坐标，保证不压到字上。
    ctx.save()
    ctx.translate(112 * k, 118 * k)
    ctx.rotate(TITLE_TILT)
    ctx.scale(k, k)
    ctx.fillStyle = palette.frame
    ctx.textBaseline = 'alphabetic'
    ctx.font = '700 56px "FrameArt", "Baloo 2", system-ui, sans-serif'
    ctx.fillText('sweet little', 0, 44)
    ctx.fillText('things', 14, 112)
    const thingsWidth = ctx.measureText ? ctx.measureText('things').width : 150
    ctx.restore()
    const tailX = 14 + thingsWidth + 36
    const tailY = 84
    diamondSticker(ctx, k, {
      cx: 112 + tailX * Math.cos(TITLE_TILT) - tailY * Math.sin(TITLE_TILT),
      cy: 118 + tailX * Math.sin(TITLE_TILT) + tailY * Math.cos(TITLE_TILT),
      size: 22,
      color: palette.accent
    })
    drawText(ctx, '· · · · ·', 128 * k, 224 * k, {
      size: 22, weight: 400, color: palette.accent, tracking: 12, k
    })

    // 用户备注写在标题右侧，日期装进底部胶囊
    drawText(ctx, labels.title, 420 * k, 138 * k, {
      size: 28, color: withAlpha(palette.frame, 0.75), tracking: 4, k
    })

    if (!labels.date) return
    const pill = { x: 842, y: 1048, width: 264, height: 64, radius: 32 }
    ctx.save()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
    ctx.strokeStyle = withAlpha(palette.frame, 0.8)
    ctx.lineWidth = 3 * k
    roundRectPath(ctx, { x: pill.x * k, y: pill.y * k, width: pill.width * k, height: pill.height * k }, pill.radius * k)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    drawText(ctx, `· ${labels.date} ·`, (pill.x + pill.width / 2) * k, (pill.y + pill.height / 2) * k, {
      size: 26, weight: 600, color: palette.frame, align: 'center', baseline: 'middle', tracking: 2, k
    })
  }
}
