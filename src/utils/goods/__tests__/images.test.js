import { describe, expect, it } from 'vitest'
import {
  inferGoodsImageStorageMode,
  normalizeEventCoverFields,
  normalizeEventPhotoList,
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

// 云端迁移后条目只剩 ref，读取层必须翻译回 uri / cloudFileName。
// 这是"图片不再被孤儿回收误删"的第一道闸：读不出 ref 的文件名，
// 本地引用集合就会漏掉它。
describe('ref 形态读取（云端迁移后）', () => {
  it('cloud: ref → cloud-image:// + cloudFileName', () => {
    const [image] = normalizeGoodsImageList([{ id: 'img1', ref: 'cloud:goods-image__g1__img1__1.jpg' }])
    expect(image.uri).toBe('cloud-image://goods-image__g1__img1__1.jpg')
    expect(image.cloudFileName).toBe('goods-image__g1__img1__1.jpg')
    expect(image.storageMode).toBe('cloud-local')
  })

  it('remote: ref → 原 URL，不当成云端文件', () => {
    const [image] = normalizeGoodsImageList([{ id: 'img1', ref: 'remote:https://example.com/a.jpg' }])
    expect(image.uri).toBe('https://example.com/a.jpg')
    expect(image.cloudFileName).toBe('')
  })

  it('local: ref → 本地路径', () => {
    const [image] = normalizeGoodsImageList([{ id: 'img1', ref: 'local:user-images/1.jpg' }])
    expect(image.uri).toBe('user-images/1.jpg')
    expect(image.storageMode).toBe('local')
  })

  it('纯字符串 ref 也能读', () => {
    const [image] = normalizeGoodsImageList(['cloud:goods-image__g1__img1__1.jpg'])
    expect(image.uri).toBe('cloud-image://goods-image__g1__img1__1.jpg')
    expect(image.cloudFileName).toBe('goods-image__g1__img1__1.jpg')
  })

  it('同时有 uri 与 ref 时以 uri 为准（混合期数据）', () => {
    const [image] = normalizeGoodsImageList([{
      id: 'img1',
      uri: 'cloud-image://goods-image__g1__img1__1.jpg',
      ref: 'cloud:goods-image__g1__other__1.jpg'
    }])
    expect(image.uri).toBe('cloud-image://goods-image__g1__img1__1.jpg')
    expect(image.cloudFileName).toBe('goods-image__g1__img1__1.jpg')
  })

  it('editSourceRef 翻译回底图两个旧字段，push 仍写旧形态', () => {
    const [image] = normalizeGoodsImageList([{
      id: 'img1',
      ref: 'cloud:goods-image__g1__img1__1.jpg',
      edit: RECIPE,
      editSourceRef: 'cloud:goods-image__g1__img1s__1.jpg'
    }])
    expect(image.editSourceUri).toBe('cloud-image://goods-image__g1__img1s__1.jpg')
    expect(image.editSourceCloudFileName).toBe('goods-image__g1__img1s__1.jpg')

    // 推送走 prepareImagesForSync 的产物（preparedImages），仍写旧形态
    const [synced] = sanitizeGoodsImagesForSync([image], [image])
    expect(synced.uri).toBe('cloud-image://goods-image__g1__img1__1.jpg')
    expect(synced.editSourceCloudFileName).toBe('goods-image__g1__img1s__1.jpg')
  })

  it('认不出的 ref 不会凭空造出图片', () => {
    expect(normalizeGoodsImageList([{ id: 'img1', ref: 'bogus' }])).toHaveLength(0)
  })

  it('半迁移数据：cloud: 落在 uri 字段里也按云图认', () => {
    const [image] = normalizeGoodsImageList([{ id: 'img1', uri: 'cloud:goods-image__g1__img1__1.jpg' }])
    expect(image.uri).toBe('cloud-image://goods-image__g1__img1__1.jpg')
    expect(image.cloudFileName).toBe('goods-image__g1__img1__1.jpg')
  })
})

describe('活动封面 / 照片的 ref 读取', () => {
  it('封面 ref → uri + coverImageData.cloudFileName', () => {
    const { coverImage, coverImageData } = normalizeEventCoverFields('cloud:event-cover__evt1__1.jpg', { mimeType: 'image/jpeg' })
    expect(coverImage).toBe('cloud-image://event-cover__evt1__1.jpg')
    expect(coverImageData.cloudFileName).toBe('event-cover__evt1__1.jpg')
    expect(coverImageData.uri).toBe('cloud-image://event-cover__evt1__1.jpg')
    expect(coverImageData.storageMode).toBe('cloud-local')
    expect(coverImageData.mimeType).toBe('image/jpeg')
  })

  it('非 ref 封面原样返回（仅 trim）', () => {
    const { coverImage, coverImageData } = normalizeEventCoverFields('  https://example.com/a.jpg ', null)
    expect(coverImage).toBe('https://example.com/a.jpg')
    expect(coverImageData).toBeNull()
  })

  it('fillCloudFileName：本地库读取时按旧行为补齐 coverImageData', () => {
    const { coverImageData } = normalizeEventCoverFields('cloud-image://event-cover__evt1__1.jpg', null, { fillCloudFileName: true })
    expect(coverImageData.cloudFileName).toBe('event-cover__evt1__1.jpg')
    expect(coverImageData.uri).toBe('cloud-image://event-cover__evt1__1.jpg')
    expect(coverImageData.storageMode).toBe('cloud-local')
  })

  it('fillCloudFileName 不从 http 封面推断文件名（保持旧行为）', () => {
    const { coverImageData } = normalizeEventCoverFields('https://example.com/a.jpg', null, { fillCloudFileName: true })
    expect(coverImageData).toBeNull()
  })

  it('照片 ref → uri + cloudFileName，且不再保留 ref', () => {
    const [photo] = normalizeEventPhotoList([{ id: 'p1', ref: 'cloud:event-photo__evt1__p1__1.jpg', caption: '正面' }])
    expect(photo.uri).toBe('cloud-image://event-photo__evt1__p1__1.jpg')
    expect(photo.cloudFileName).toBe('event-photo__evt1__p1__1.jpg')
    expect(photo.caption).toBe('正面')
    expect(photo.ref).toBeUndefined()
  })

  it('已有 uri 的照片不被 ref 覆盖', () => {
    const [photo] = normalizeEventPhotoList([{
      id: 'p1',
      uri: 'https://x.supabase.co/storage/v1/object/public/event-photos/event-photo__evt1__p1__1.jpg',
      cloudFileName: 'event-photo__evt1__p1__1.jpg',
      ref: 'cloud:event-photo__evt1__p1__1.jpg'
    }])
    expect(photo.uri).toBe('https://x.supabase.co/storage/v1/object/public/event-photos/event-photo__evt1__p1__1.jpg')
  })
})
