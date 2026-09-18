import { describe, it, expect } from 'vitest'
import { resolveTargetIndex } from '../useGoodsReorderDrag'

function card(id, left, top, w = 100, h = 120) {
  return {
    id,
    el: null,
    rect: {
      left,
      top,
      width: w,
      height: h,
      right: left + w,
      bottom: top + h
    }
  }
}

describe('resolveTargetIndex（网格落点）', () => {
  // 2 列：[0][1] / [2][3]
  const cards = [
    card('a', 0, 0),
    card('b', 120, 0),
    card('c', 0, 140),
    card('d', 120, 140)
  ]

  it('中心落在右邻格子 → 右边目标（PC 往右拖）', () => {
    // 从 a 往右拖，卡片中心进入 b 的格子
    expect(resolveTargetIndex(cards, 0, 0, 150, 60)).toBe(1)
  })

  it('中心落在下邻格子 → 下边目标（纵向交换）', () => {
    expect(resolveTargetIndex(cards, 0, 0, 50, 180)).toBe(2)
  })

  it('中心仍在自己格子内时保持 source', () => {
    expect(resolveTargetIndex(cards, 0, 0, 40, 40)).toBe(0)
  })

  it('中心落在斜对角格子 → 对角目标', () => {
    expect(resolveTargetIndex(cards, 0, 0, 160, 180)).toBe(3)
  })
})
