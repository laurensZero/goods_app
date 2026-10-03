import { describe, expect, it } from 'vitest'
import {
  inferGoodsImageStorageMode,
  normalizeGoodsImageList,
  sanitizeGoodsImagesForSync,
  sanitizeGoodsImagesForShare
} from '@/utils/goods/images'
import { buildImageEditRecipe } from '@/utils/image/imageEditRecipe'

const RECIPE = buildImageEditRecipe({
  frameId: 'wave',
  colorwayId: 'blue',
  fitRatioPercent: 94,
  bgColor: '#EFEEE8',
  labelsDate: '2026.10.02'
})

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

describe('外框二次编辑字段（阶段二：随行同步）', () => {
  const entry = {
    id: 'img_1',
    uri: 'https://x.supabase.co/storage/v1/object/public/goods-images/goods-image__g1__img_1__1.jpg',
    kind: 'primary',
    label: '',
    storageMode: 'remote',
    localPath: '',
    cloudFileName: 'goods-image__g1__img_1__1.jpg',
    mimeType: '',
    fileSize: 0,
    isPrimary: true,
    edit: RECIPE,
    editSourceUri: 'cloud-image://goods-image__g1__img_1s__1.jpg',
    editSourceCloudFileName: 'goods-image__g1__img_1s__1.jpg'
  }

  it('normalizeGoodsImageList 保留配方与底图引用', () => {
    const [image] = normalizeGoodsImageList([entry])
    expect(image.edit).toEqual(RECIPE)
    expect(image.editSourceUri).toBe('cloud-image://goods-image__g1__img_1s__1.jpg')
    expect(image.editSourceCloudFileName).toBe('goods-image__g1__img_1s__1.jpg')
  })

  it('坏配方（结构不像配方）当作没有配方，底图引用一并清掉', () => {
    const [image] = normalizeGoodsImageList([{ ...entry, edit: { nope: true } }])
    expect(image.edit).toBeNull()
    expect(image.editSourceCloudFileName).toBe('')
  })

  it('本机不认识的配方（未来版本）原样留着，不能在推送上抹掉别的设备写的数据', () => {
    const future = { version: 99, frameId: 'wave_future', extra: 'keep-me' }
    const [image] = normalizeGoodsImageList([{ ...entry, edit: future }])
    expect(image.edit).toEqual(future)
    expect(image.editSourceCloudFileName).toBe('goods-image__g1__img_1s__1.jpg')

    const [synced] = sanitizeGoodsImagesForSync([{ ...entry, edit: future }])
    expect(synced.edit).toEqual(future)
    expect(synced.editSourceCloudFileName).toBe('goods-image__g1__img_1s__1.jpg')
  })

  it('sanitizeGoodsImagesForSync 推上云、且底图只留云端引用（本地路径不外泄）', () => {
    const [synced] = sanitizeGoodsImagesForSync([{ ...entry, localPath: 'user-images/1_src.jpg' }])
    expect(synced.edit).toEqual(RECIPE)
    expect(synced.editSourceUri).toBe('cloud-image://goods-image__g1__img_1s__1.jpg')
    expect(synced.editSourceCloudFileName).toBe('goods-image__g1__img_1s__1.jpg')
    expect(JSON.stringify(synced)).not.toContain('user-images/1_src.jpg')
  })

  it('配方只跟着成品图走：没套外框就不带 edit / editSource*', () => {
    const [synced] = sanitizeGoodsImagesForSync([{ ...entry, edit: null }])
    expect(synced.edit).toBeNull()
    expect(synced.editSourceUri).toBe('')
    expect(synced.editSourceCloudFileName).toBe('')
  })

  it('分享链接不含配方（只需要成品图）', async () => {
    const shared = await sanitizeGoodsImagesForShare([entry])
    expect(shared).toHaveLength(1)
    expect(shared[0].edit).toBeUndefined()
    expect(shared[0].editSourceUri).toBeUndefined()
    expect(shared[0].editSourceCloudFileName).toBeUndefined()
  })
})
