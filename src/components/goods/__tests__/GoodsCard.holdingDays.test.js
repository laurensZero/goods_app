// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import i18n from '@/locales'
import GoodsCard from '../GoodsCard.vue'

i18n.global.locale.value = 'zh-CN'

const t = i18n.global.t
const HOLD = t('goods.card.holding')
const UNIT = t('common.daysUnit')
const SOLD = t('status.short.sold')

function baseItem(overrides = {}) {
  return {
    id: 'card-holding-test',
    name: '测试商品',
    isWishlist: false,
    quantity: 2,
    category: '',
    ip: '',
    characters: [],
    tags: [],
    price: '0',
    actualPrice: '',
    currency: 'CNY',
    actualPriceCurrency: 'CNY',
    shippingFee: '',
    unitActualPriceList: [],
    points: null,
    _unitHoldingDaysList: [],
    _hasUnitHoldingDays: false,
    _holdingDays: null,
    _pendingDays: null,
    _primaryStatus: '已拥有',
    _isExited: false,
    _isPending: false,
    ...overrides
  }
}

function renderDays(item) {
  const wrapper = mount(GoodsCard, {
    props: { item, density: 'standard', windowWidth: 400 },
    global: { plugins: [i18n], stubs: { LazyCachedImage: true } }
  })
  return wrapper.find('.card-days').text()
}

describe('GoodsCard 持有天数口径', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // 回归：一件 2025-12-26 当天入手当天已出(0 天) + 一件 2026-01-18 入手在手(273 天)
  // 已出件不再持有，不能并入「持有」区间 → 只显示在手件的天数
  it('已出件不计入持有区间', () => {
    const item = baseItem({
      _hasUnitHoldingDays: true,
      _unitHoldingDaysList: [
        { days: 0, status: '已出', pending: false },
        { days: 273, status: '已拥有', pending: false }
      ]
    })
    expect(renderDays(item)).toBe(`${HOLD} 273 ${UNIT}`)
  })

  it('全部件都在手时仍显示持有区间', () => {
    const item = baseItem({
      _hasUnitHoldingDays: true,
      _unitHoldingDaysList: [
        { days: 10, status: '已拥有', pending: false },
        { days: 273, status: '已拥有', pending: false }
      ]
    })
    expect(renderDays(item)).toBe(`${HOLD} 10~273 ${UNIT}`)
  })

  it('全部件已出时改用状态标签而不是「持有」', () => {
    const item = baseItem({
      _hasUnitHoldingDays: true,
      _isExited: true,
      _unitHoldingDaysList: [
        { days: 0, status: '已出', pending: false },
        { days: 30, status: '已出', pending: false }
      ]
    })
    expect(renderDays(item)).toBe(`${SOLD} 0~30 ${UNIT}`)
  })

  it('单件已出时改用状态标签', () => {
    const item = baseItem({
      quantity: 1,
      _holdingDays: 5,
      _isExited: true,
      _primaryStatus: '已出'
    })
    expect(renderDays(item)).toBe(`${SOLD} 5 ${UNIT}`)
  })

  it('单件在手时仍显示「持有」', () => {
    const item = baseItem({ quantity: 1, _holdingDays: 273 })
    expect(renderDays(item)).toBe(`${HOLD} 273 ${UNIT}`)
  })

  it('含在途件时仍按状态显示区间，不打「持有」标签', () => {
    const item = baseItem({
      _hasUnitHoldingDays: true,
      _isPending: true,
      unitCollectStatusList: ['待发货', '已出'],
      _unitHoldingDaysList: [
        { days: 3, status: '待发货', pending: true },
        { days: 0, status: '已出', pending: false }
      ]
    })
    const text = renderDays(item)
    expect(text).not.toContain(HOLD)
    expect(text).toContain(`0~3 ${UNIT}`)
  })
})
