import { describe, expect, it } from 'vitest'
import { normalizeGoodsImageList } from '@/utils/goods/images'

describe('normalizeGoodsImageList', () => {
  it('deduplicates remote images that only differ by query or hash', () => {
    const images = normalizeGoodsImageList([
      'https://example.com/goods/a.png?x-oss-process=image/resize,w_400',
      'https://example.com/goods/a.png?x-oss-process=image/resize,w_800',
      'https://example.com/goods/a.png#preview',
    ])

    expect(images).toHaveLength(1)
    expect(images[0].uri).toBe('https://example.com/goods/a.png?x-oss-process=image/resize,w_400')
    expect(images[0].isPrimary).toBe(true)
  })

  it('keeps distinct remote image paths', () => {
    const images = normalizeGoodsImageList([
      'https://example.com/goods/a.png?size=400',
      'https://example.com/goods/b.png?size=400',
    ])

    expect(images).toHaveLength(2)
  })
})
