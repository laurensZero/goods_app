import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCoverTone, COVER_TONES, COVER_TONE_FALLBACK } from '../coverTone'

const DEFAULT_CATEGORIES = [
  '手办',
  '挂件',
  '立牌',
  '徽章',
  '卡牌',
  '明信片',
  '色纸',
  'CD/专辑',
  '服饰',
  '镭射票',
  '画集',
  '赠品',
  '其他'
]

const baseCss = readFileSync(join(process.cwd(), 'src/assets/base.css'), 'utf8')
const darkSplitIndex = baseCss.indexOf('html.theme-dark {')
const lightCss = baseCss.slice(0, darkSplitIndex)
const darkCss = baseCss.slice(darkSplitIndex)

const detailViewCss = readFileSync(join(process.cwd(), 'src/views/goods/DetailView.vue'), 'utf8')
const editorFormCss = readFileSync(join(process.cwd(), 'src/assets/goodsEditorForm.css'), 'utf8')

function extractBlock(source, selector) {
  const start = source.indexOf(`${selector} {`)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('}', start)
  return source.slice(start, end)
}

describe('getCoverTone', () => {
  it('默认分类全部命中专属 tone', () => {
    expect(DEFAULT_CATEGORIES.map((category) => getCoverTone(category))).toEqual([
      'figure',
      'charm',
      'standee',
      'badge',
      'card',
      'postcard',
      'shikishi',
      'album',
      'apparel',
      'ticket',
      'artbook',
      'gift',
      'other'
    ])
  })

  it('所有默认分类的 tone 都登记在 COVER_TONES 中', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(COVER_TONES).toContain(getCoverTone(category))
    }
  })

  it('兼容历史「卡片」写法', () => {
    expect(getCoverTone('卡片')).toBe('card')
  })

  it('分类名两端空白不影响命中', () => {
    expect(getCoverTone('  徽章  ')).toBe('badge')
  })

  it('未登记分类与非法入参兜底为 other', () => {
    for (const value of ['我的自制分类', '', '   ', null, undefined, 42, {}]) {
      expect(getCoverTone(value)).toBe(COVER_TONE_FALLBACK)
    }
  })
})

describe('base.css 占位配色', () => {
  it('dark 分割点存在，浅深两段可区分', () => {
    expect(darkSplitIndex).toBeGreaterThan(0)
    expect(lightCss).toContain(':root {')
  })

  it('每个 tone 都声明了浅色渐变变量', () => {
    for (const tone of COVER_TONES) {
      expect(lightCss).toContain(`--cover-tone-${tone}: linear-gradient(`)
    }
  })

  it('每个 tone 都声明了深色渐变变量', () => {
    for (const tone of COVER_TONES) {
      expect(darkCss).toContain(`--cover-tone-${tone}: linear-gradient(`)
    }
  })

  it('每个 tone 都有 data-cover-tone 映射规则', () => {
    for (const tone of COVER_TONES) {
      expect(lightCss).toContain(`[data-cover-tone="${tone}"] { --cover-tone: var(--cover-tone-${tone}); }`)
    }
  })

  it('浅深两套分别声明了占位首字颜色', () => {
    expect(lightCss).toContain('--cover-tone-text:')
    expect(darkCss).toContain('--cover-tone-text:')
  })
})

describe('占位首字字号同源', () => {
  it('base.css 声明了公共字号变量', () => {
    expect(lightCss).toContain('--cover-hero-letter-size:')
  })

  it('详情页与编辑页共用同一个字号变量', () => {
    expect(extractBlock(detailViewCss, '.cover-initial')).toContain('font-size: var(--cover-hero-letter-size);')
    expect(extractBlock(editorFormCss, '.preview-fallback')).toContain('font-size: var(--cover-hero-letter-size);')
  })
})
