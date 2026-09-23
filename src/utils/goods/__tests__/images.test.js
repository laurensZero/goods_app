import { describe, expect, it } from 'vitest'
import { inferGoodsImageStorageMode, normalizeGoodsImageList } from '@/utils/goods/images'

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

describe('inferGoodsImageStorageMode', () => {
  const androidConvertFileSrc =
    'https://goodsapp.de5.net/_capacitor_file_/data/user/0/com.goodsapp.collector/files/user-images/1790134705082_mv5dd.jpg'

  it('treats Android convertFileSrc custom-host URI as linked-local', () => {
    expect(inferGoodsImageStorageMode(androidConvertFileSrc)).toBe('linked-local')
  })

  it('overrides incorrect explicit remote for file-backed convertFileSrc URI', () => {
    expect(inferGoodsImageStorageMode(androidConvertFileSrc, 'remote')).toBe('linked-local')
  })

  it('still treats real https URLs as remote', () => {
    expect(inferGoodsImageStorageMode('https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/goods-images/a/b.jpg')).toBe('remote')
  })

  it('normalizeGoodsImageEntry rewrites wrong remote mode for local convertFileSrc URI', () => {
    const images = normalizeGoodsImageList([{
      id: 'img_1',
      uri: androidConvertFileSrc,
      kind: 'primary',
      label: '',
      fileSize: 0,
      mimeType: '',
      isPrimary: true,
      localPath: 'user-images/1790134705082_mv5dd.jpg',
      storageMode: 'remote',
      cloudFileName: ''
    }])

    expect(images).toHaveLength(1)
    expect(images[0].storageMode).toBe('linked-local')
    expect(images[0].localPath).toBe('user-images/1790134705082_mv5dd.jpg')
  })
})
