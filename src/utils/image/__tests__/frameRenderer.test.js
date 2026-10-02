import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FIT_RATIO,
  buildRoughPoints,
  buildWavyPoints,
  fitInside,
  normalizeFitRatio,
  renderFrameComposition,
  resolveFrameWindow,
  scaleHarmonics,
  shadeColor,
  withAlpha
} from '@/utils/image/frameRenderer'
import {
  ALL_FRAMES,
  FRAME_CATEGORIES,
  FRAME_NONE_ID,
  getColorway,
  getFrameById,
  getFramesByCategory,
  isKnownFrameId,
  resolveFrameColors,
  waveFrame
} from '@/config/imageFrames'

/**
 * 假的 2D 上下文：只记录调用顺序与填充色。
 * 用来钉住「谁负责铺底色」「绘制顺序」这类契约，不依赖真实 canvas。
 */
function createRecordingContext() {
  const ops = []
  const makeGradient = () => ({
    addColorStop(_offset, color) {
      ops.push(['stop', color])
    }
  })
  const ctx = {
    ops,
    filter: undefined,
    save() {},
    restore() {},
    setTransform() {},
    translate() {},
    rotate() {},
    scale() {},
    clearRect() {
      ops.push(['clearRect'])
    },
    fillRect() {
      ops.push(['fillRect', ctx.fillStyle])
    },
    strokeRect() {
      ops.push(['strokeRect', ctx.strokeStyle])
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    ellipse() {},
    rect() {},
    closePath() {},
    fill() {
      ops.push(['fill', ctx.fillStyle])
    },
    stroke() {
      ops.push(['stroke', ctx.strokeStyle])
    },
    clip() {},
    drawImage(_source, x, y, width, height) {
      ops.push(['drawImage', x, y, width, height])
    },
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
    measureText(text) {
      return { width: String(text).length * 8 }
    },
    fillText() {
      ops.push(['text', ctx.fillStyle])
    }
  }
  return ctx
}

function createProbeSource() {
  return { width: 800, height: 600 }
}

function fillColors(ctx) {
  return ctx.ops.filter((op) => op[0] === 'fillRect' || op[0] === 'fill').map((op) => op[1])
}

/** 所有真正落到画面上的颜色：填充、描边、渐变停靠点、文字。 */
function paintedColors(ctx) {
  return ctx.ops
    .filter((op) => ['fillRect', 'fill', 'strokeRect', 'stroke', 'stop', 'text'].includes(op[0]))
    .map((op) => String(op[1]))
}

describe('frameRenderer · fitInside', () => {
  it('无外框时与旧的纯色背景合成算法一致', () => {
    const rect = fitInside({ width: 800, height: 600 }, { x: 0, y: 0, width: 1200, height: 1200 }, 0.88)
    expect(rect).toEqual({ x: 72, y: 204, width: 1056, height: 792 })
  })

  it('内窗有偏移时按内窗居中', () => {
    const rect = fitInside({ width: 400, height: 400 }, { x: 100, y: 200, width: 200, height: 200 }, 1)
    expect(rect).toEqual({ x: 100, y: 200, width: 200, height: 200 })
  })

  it('尺寸非法时返回 null，不画出错位的图', () => {
    expect(fitInside({ width: 0, height: 0 }, { x: 0, y: 0, width: 100, height: 100 })).toBeNull()
    expect(fitInside(null, { x: 0, y: 0, width: 100, height: 100 })).toBeNull()
  })

  it('占比被夹在合理区间', () => {
    expect(normalizeFitRatio(3)).toBe(1)
    expect(normalizeFitRatio(0.01)).toBe(0.4)
    expect(normalizeFitRatio(undefined)).toBe(DEFAULT_FIT_RATIO)
  })
})

describe('frameRenderer · 轮廓变形', () => {
  const rect = { x: 100, y: 50, width: 600, height: 400, radius: 40 }
  const harmonics = [[20, 160, 0], [6, 60, 1.1]]

  it('周期性波纹：确定性、起点在轮廓上、偏移不超过振幅和', () => {
    const a = buildWavyPoints({ ...rect, harmonics })
    const b = buildWavyPoints({ ...rect, harmonics })
    expect(a.length).toBeGreaterThan(100)
    expect(a).toEqual(b)

    const zeroPhase = buildWavyPoints({ ...rect, harmonics: [[20, 160, 0]] })
    expect(zeroPhase[0].x).toBeCloseTo(rect.x + rect.radius, 6)
    expect(zeroPhase[0].y).toBeCloseTo(rect.y, 6)

    const maxAmplitude = harmonics.reduce((sum, [amplitude]) => sum + amplitude, 0)
    for (const point of buildWavyPoints({ ...rect, harmonics })) {
      expect(point.x).toBeGreaterThanOrEqual(rect.x - maxAmplitude - 1e-6)
      expect(point.x).toBeLessThanOrEqual(rect.x + rect.width + maxAmplitude + 1e-6)
      expect(point.y).toBeGreaterThanOrEqual(rect.y - maxAmplitude - 1e-6)
      expect(point.y).toBeLessThanOrEqual(rect.y + rect.height + maxAmplitude + 1e-6)
    }
  })

  it('无谐波时退化成普通圆角矩形轮廓', () => {
    const points = buildWavyPoints({ ...rect, harmonics: [] })
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(rect.x, 6)
    expect(Math.max(...xs)).toBeCloseTo(rect.x + rect.width, 6)
    expect(Math.min(...ys)).toBeCloseTo(rect.y, 6)
    expect(Math.max(...ys)).toBeCloseTo(rect.y + rect.height, 6)
  })

  it('谐波随画布尺寸等比缩放', () => {
    expect(scaleHarmonics([[20, 160, 0.5]], 0.5)).toEqual([[10, 80, 0.5]])
  })

  it('噪声毛边：确定性、闭合、幅度受控', () => {
    const roughness = { amplitude: 14, seed: 9, cycles: 5, octaves: 3 }
    const a = buildRoughPoints({ ...rect, roughness })
    const b = buildRoughPoints({ ...rect, roughness })
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(100)

    for (const point of a) {
      expect(point.x).toBeGreaterThanOrEqual(rect.x - roughness.amplitude - 1e-6)
      expect(point.x).toBeLessThanOrEqual(rect.x + rect.width + roughness.amplitude + 1e-6)
    }
    const first = a[0]
    const last = a[a.length - 1]
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(roughness.amplitude * 2.5)
  })
})

describe('frameRenderer · 颜色工具', () => {
  it('withAlpha 生成 rgba', () => {
    expect(withAlpha('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(withAlpha('#000', 2)).toBe('rgba(0, 0, 0, 1)')
  })

  it('shadeColor 派生深浅色', () => {
    expect(shadeColor('#808080', 1)).toBe('#ffffff')
    expect(shadeColor('#808080', -1)).toBe('#000000')
  })
})

describe('frameRenderer · 内窗换算', () => {
  it('设计空间 → 目标像素', () => {
    const win = resolveFrameWindow({ designSize: 1200, window: { x: 300, y: 150, w: 600, h: 600, radius: 30 } }, 600)
    expect(win).toMatchObject({ x: 150, y: 75, width: 300, height: 300, radius: 15 })
    expect(win.k).toBe(0.5)
  })

  it('没有模板时内窗就是整块画布', () => {
    expect(resolveFrameWindow(null, 800)).toEqual({ x: 0, y: 0, width: 800, height: 800, radius: 0, k: 800 / 1200 })
  })
})

describe('imageFrames · 模板契约', () => {
  it('none / 未知 id 都解析为空模板', () => {
    expect(getFrameById(FRAME_NONE_ID)).toBeNull()
    expect(getFrameById('不存在的模板')).toBeNull()
    expect(getFrameById('')).toBeNull()
  })

  it('id 合法性校验', () => {
    expect(isKnownFrameId(FRAME_NONE_ID)).toBe(true)
    expect(isKnownFrameId(ALL_FRAMES[0].id)).toBe(true)
    expect(isKnownFrameId('nope')).toBe(false)
  })

  it('每个模板都满足渲染器与面板要求的结构', () => {
    expect(ALL_FRAMES.length).toBeGreaterThanOrEqual(8)
    const categoryIds = new Set(FRAME_CATEGORIES.map((category) => category.id))

    for (const frame of ALL_FRAMES) {
      expect(typeof frame.id).toBe('string')
      expect(frame.id).not.toBe(FRAME_NONE_ID)
      expect(frame.nameKey).toMatch(/^imageEditor\./)
      expect(categoryIds.has(frame.category)).toBe(true)

      const designSize = Number(frame.designSize)
      expect(designSize).toBeGreaterThan(0)
      expect(Number(frame.defaultFitRatio)).toBeGreaterThan(0)
      expect(Number(frame.defaultFitRatio)).toBeLessThanOrEqual(1)

      const win = frame.window
      expect(win.x).toBeGreaterThanOrEqual(0)
      expect(win.y).toBeGreaterThanOrEqual(0)
      expect(win.x + win.w).toBeLessThanOrEqual(designSize)
      expect(win.y + win.h).toBeLessThanOrEqual(designSize)

      // 必须显式声明吃不吃用户选的框内底色，否则又会出现「点了没反应」的死控件
      expect(typeof frame.acceptsBackgroundColor).toBe('boolean')

      expect(typeof frame.drawBehind).toBe('function')
      expect(typeof frame.drawOverlay).toBe('function')
      expect(typeof frame.clipSubject).toBe('function')
    }
  })

  it('色槽必须能在模板配色里找到，否则会渲染出 undefined 颜色', () => {
    for (const frame of ALL_FRAMES) {
      expect(Array.isArray(frame.colorSlots)).toBe(true)
      expect(frame.colorSlots.length).toBeGreaterThan(0)
      for (const slot of frame.colorSlots) {
        expect(slot.nameKey).toMatch(/^imageEditor\./)
        expect(frame.palette[slot.key], `${frame.id}.${slot.key}`).toMatch(/^#[0-9a-fA-F]{3,8}$/)
      }
    }
  })

  it('每个配色方案都覆盖全部色槽，切换后不会留下上一个方案的颜色', () => {
    for (const frame of ALL_FRAMES) {
      expect(Array.isArray(frame.colorways)).toBe(true)
      expect(frame.colorways.length).toBeGreaterThan(0)
      const ids = frame.colorways.map((colorway) => colorway.id)
      expect(new Set(ids).size).toBe(ids.length)

      for (const colorway of frame.colorways) {
        expect(colorway.nameKey).toMatch(/^imageEditor\./)
        for (const slot of frame.colorSlots) {
          expect(colorway.palette[slot.key], `${frame.id}/${colorway.id}/${slot.key}`)
            .toMatch(/^#[0-9a-fA-F]{3,8}$/)
        }
      }
    }
  })

  it('模板 id 不重复，分类筛选覆盖全部模板', () => {
    const ids = ALL_FRAMES.map((frame) => frame.id)
    expect(new Set(ids).size).toBe(ids.length)

    const collected = FRAME_CATEGORIES.flatMap((category) => getFramesByCategory(category.id))
    expect(collected.length).toBe(ALL_FRAMES.length)
    expect(getFramesByCategory('').length).toBe(ALL_FRAMES.length)
  })

  it('resolveFrameColors：默认 → 配色方案 → 手动调色', () => {
    const frame = getFrameById('photocard')
    const colorway = frame.colorways[0]

    const defaults = resolveFrameColors(frame, '', null)
    expect(defaults).toEqual({
      background: frame.palette.background,
      card: frame.palette.card,
      accent: frame.palette.accent
    })

    const fromColorway = resolveFrameColors(frame, colorway.id, null)
    expect(fromColorway.accent).toBe(colorway.palette.accent)

    const overridden = resolveFrameColors(frame, colorway.id, { accent: '#123456', 未登记: '#000000' })
    expect(overridden.accent).toBe('#123456')
    expect(overridden).not.toHaveProperty('未登记')
  })

  it('getColorway 对未知 id 返回 null', () => {
    expect(getColorway(getFrameById('wave'), 'nope')).toBeNull()
    expect(getColorway(null, 'blue')).toBeNull()
  })
})

describe('renderFrameComposition · 底色归属与顺序', () => {
  const probeFrame = {
    id: 'probe',
    designSize: 1200,
    window: { x: 0, y: 0, w: 1200, h: 1200, radius: 0 },
    acceptsBackgroundColor: true
  }

  it('无外框时由渲染器铺底色', () => {
    const ctx = createRecordingContext()
    renderFrameComposition(ctx, {
      width: 600,
      height: 600,
      source: createProbeSource(),
      frame: null,
      background: { color: '#123456' }
    })
    expect(ctx.ops).toEqual([['clearRect'], ['fillRect', '#123456'], ['drawImage', 36, 102, 528, 396]])
  })

  it('不传颜色时保留透明底，不铺任何底色', () => {
    const ctx = createRecordingContext()
    renderFrameComposition(ctx, {
      width: 600,
      height: 600,
      source: createProbeSource(),
      frame: null,
      background: { color: '' }
    })
    expect(ctx.ops).toEqual([['clearRect'], ['drawImage', 36, 102, 528, 396]])
  })

  it('有外框时渲染器不抢着铺底色，颜色原样交给模板', () => {
    const calls = []
    const frame = {
      ...probeFrame,
      drawBehind(api) {
        calls.push(['behind', api.backgroundColor])
      },
      drawOverlay() {
        calls.push(['overlay'])
      }
    }
    const ctx = createRecordingContext()
    renderFrameComposition(ctx, {
      width: 600,
      height: 600,
      source: createProbeSource(),
      frame,
      background: { color: '#abcdef' }
    })
    expect(ctx.ops.filter((op) => op[0] === 'fillRect')).toEqual([])
    expect(calls).toEqual([['behind', '#abcdef'], ['overlay']])
  })

  it('调用顺序固定为 模板底层 → 主体 → 模板覆盖层', () => {
    const order = []
    const frame = {
      ...probeFrame,
      drawBehind() {
        order.push('behind')
      },
      drawOverlay() {
        order.push('overlay')
      }
    }
    const ctx = createRecordingContext()
    renderFrameComposition(ctx, { width: 600, height: 600, source: createProbeSource(), frame })
    order.splice(1, 0, 'drawImage')
    expect(order).toEqual(['behind', 'drawImage', 'overlay'])
  })

  it('frameColors 覆盖模板默认配色', () => {
    const seen = []
    const frame = {
      ...probeFrame,
      palette: { card: '#FFFFFF' },
      drawBehind(api) {
        seen.push(api.palette.card)
      }
    }
    const ctx = createRecordingContext()
    renderFrameComposition(ctx, {
      width: 300,
      height: 300,
      source: createProbeSource(),
      frame,
      frameColors: { card: '#FF0000' }
    })
    expect(seen).toEqual(['#FF0000'])
  })

  it('用户选的底色画在框内背板上，不占用画布外层', () => {
    const ctx = createRecordingContext()
    renderFrameComposition(ctx, {
      width: 600,
      height: 600,
      source: createProbeSource(),
      frame: waveFrame,
      background: { color: '#123456' }
    })
    const colors = fillColors(ctx)
    expect(colors).toContain('#123456')
    expect(colors[0]).not.toBe('#123456')
    expect(colors.indexOf('#123456')).toBeGreaterThan(0)
  })

  it('8 个真实模板在无画布环境下都能画完，且真的画了东西', () => {
    for (const frame of ALL_FRAMES) {
      const ctx = createRecordingContext()
      expect(() => renderFrameComposition(ctx, {
        width: 300,
        height: 300,
        source: createProbeSource(),
        frame,
        background: { color: '#ffffff' }
      }), frame.id).not.toThrow()

      expect(ctx.ops.some((op) => op[0] === 'drawImage'), frame.id).toBe(true)
      expect(fillColors(ctx).length, frame.id).toBeGreaterThan(1)
    }
  })

  it('带调色时每个模板的画面真的跟着变', () => {
    for (const frame of ALL_FRAMES) {
      const colors = resolveFrameColors(frame, frame.colorways[0].id, null)
      const overrides = {}
      for (const key of Object.keys(colors)) overrides[key] = '#010203'

      const base = createRecordingContext()
      renderFrameComposition(base, {
        width: 300, height: 300, source: createProbeSource(), frame
      })

      const tinted = createRecordingContext()
      renderFrameComposition(tinted, {
        width: 300, height: 300, source: createProbeSource(), frame, frameColors: overrides
      })

      const before = paintedColors(base)
      const after = paintedColors(tinted)
      expect(after, `${frame.id} 调色后画面没有变化`).not.toEqual(before)
      expect(
        after.some((color) => color.toLowerCase().includes('010203') || color.includes('1, 2, 3')),
        `${frame.id} 调色没有真正画到画面上`
      ).toBe(true)
    }
  })
})
