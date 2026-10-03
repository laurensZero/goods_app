import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FIT_RATIO_PERCENT,
  IMAGE_EDIT_RECIPE_VERSION,
  buildImageEditRecipe,
  normalizeColorOverrides,
  normalizeFitRatio,
  normalizeHexColor,
  normalizeImageEditRecipe
} from '@/utils/image/imageEditRecipe'
import { getFrameById } from '@/config/imageFrames'

const WAVE = getFrameById('wave')

describe('normalizeHexColor', () => {
  it('只接受 6 位十六进制', () => {
    expect(normalizeHexColor('#AABBCC')).toBe('#aabbcc')
    expect(normalizeHexColor(' #ffffff ')).toBe('#ffffff')
    expect(normalizeHexColor('#fff')).toBe('')
    expect(normalizeHexColor('red')).toBe('')
    expect(normalizeHexColor(null)).toBe('')
  })
})

describe('normalizeFitRatio', () => {
  it('夹到 0.4~1', () => {
    expect(normalizeFitRatio(0.9)).toBe(0.9)
    expect(normalizeFitRatio(0.1)).toBe(0.4)
    expect(normalizeFitRatio(3)).toBe(1)
  })

  it('非法值退回 1（铺满）', () => {
    expect(normalizeFitRatio(undefined)).toBe(1)
    expect(normalizeFitRatio('abc')).toBe(1)
    expect(normalizeFitRatio(0)).toBe(1)
  })
})

describe('normalizeColorOverrides', () => {
  it('只保留模板登记过的色槽', () => {
    const slotKeys = (WAVE.colorSlots || []).map((slot) => slot.key)
    expect(slotKeys.length).toBeGreaterThan(0)
    const result = normalizeColorOverrides({
      [slotKeys[0]]: '#ABCDEF',
      不存在的槽: '#123456'
    }, WAVE)
    expect(result).toEqual({ [slotKeys[0]]: '#abcdef' })
  })

  it('丢掉非法色值与非对象输入', () => {
    expect(normalizeColorOverrides({ card: 'blue' }, WAVE)).toEqual({})
    expect(normalizeColorOverrides(null, WAVE)).toEqual({})
    expect(normalizeColorOverrides(['#ffffff'], WAVE)).toEqual({})
  })
})

describe('buildImageEditRecipe', () => {
  it('没套外框时不生成配方（也就不会多存一份底图）', () => {
    expect(buildImageEditRecipe({ frameId: 'none' })).toBeNull()
    expect(buildImageEditRecipe({ frameId: '' })).toBeNull()
    expect(buildImageEditRecipe({})).toBeNull()
    expect(buildImageEditRecipe({ frameId: '不存在的模板' })).toBeNull()
  })

  it('把编辑器状态收成一份自洽的配方', () => {
    const recipe = buildImageEditRecipe({
      frameId: 'wave',
      colorwayId: WAVE.colorways[0].id,
      colorOverrides: { [WAVE.colorSlots[0].key]: '#AABBCC', nope: '#000000' },
      fitRatioPercent: DEFAULT_FIT_RATIO_PERCENT,
      bgColor: '#EFEEE8',
      labelsDate: '2026.10.02'
    })

    expect(recipe).toMatchObject({
      version: IMAGE_EDIT_RECIPE_VERSION,
      frameId: 'wave',
      colorwayId: WAVE.colorways[0].id,
      colorOverrides: { [WAVE.colorSlots[0].key]: '#aabbcc' },
      fitRatio: 0.88,
      bgColor: '#efeee8',
      labelsDate: '2026.10.02'
    })
  })

  it('配色方案不合法时退回模板第一个配色，非法日期丢掉', () => {
    const recipe = buildImageEditRecipe({
      frameId: 'wave',
      colorwayId: '不存在',
      fitRatioPercent: 1000,
      bgColor: 'not-a-color',
      labelsDate: '2026/10/02'
    })
    expect(recipe.colorwayId).toBe(WAVE.colorways[0].id)
    expect(recipe.fitRatio).toBe(1)
    expect(recipe.bgColor).toBe('#ffffff')
    expect(recipe.labelsDate).toBe('')
  })
})

describe('normalizeImageEditRecipe', () => {
  const valid = buildImageEditRecipe({
    frameId: 'photocard',
    colorwayId: 'mint',
    colorOverrides: {},
    fitRatioPercent: 94,
    bgColor: '#ffffff',
    labelsDate: '2026.10.02'
  })

  it('合法配方可往返', () => {
    expect(normalizeImageEditRecipe(valid)).toEqual(valid)
  })

  it('模板不认识 / 版本更新 / 结构不对 → 当作没有配方', () => {
    expect(normalizeImageEditRecipe({ ...valid, frameId: '已删除的模板' })).toBeNull()
    expect(normalizeImageEditRecipe({ ...valid, version: IMAGE_EDIT_RECIPE_VERSION + 1 })).toBeNull()
    expect(normalizeImageEditRecipe(null)).toBeNull()
    expect(normalizeImageEditRecipe('wave')).toBeNull()
    expect(normalizeImageEditRecipe([valid])).toBeNull()
  })

  it('读回时再次夹住取值（防手改 DB / 跨版本脏数据）', () => {
    const dirty = normalizeImageEditRecipe({
      version: 1,
      frameId: 'wave',
      colorwayId: 'blue',
      colorOverrides: { [WAVE.colorSlots[0].key]: '#ABCDEF' },
      fitRatio: 5,
      bgColor: '#ABCDEF',
      labelsDate: 'x'
    })
    expect(dirty.fitRatio).toBe(1)
    expect(dirty.bgColor).toBe('#abcdef')
    expect(dirty.labelsDate).toBe('')
  })

  it('缺 colorwayId 时补上模板第一个配色', () => {
    const recipe = normalizeImageEditRecipe({ frameId: 'vintage' })
    expect(recipe.colorwayId).toBe(getFrameById('vintage').colorways[0].id)
  })
})
