import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/locales', () => ({
  default: { global: { t: (key) => key } }
}))
vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(async () => '')
}))
vi.mock('@/stores/batchDraftHelpers', () => ({
  isBatchDraftDeleted: vi.fn(() => false)
}))
vi.mock('@/utils/db', () => ({
  getAllBatchDrafts: vi.fn(async () => []),
  getAllImageEdits: vi.fn(async () => [])
}))

import { createSyncPayloadService } from '@/services/sync/syncPayloadService'
import { getAllImageEdits } from '@/utils/db'
import { buildImageEditRecipe } from '@/utils/image/imageEditRecipe'

const PRODUCT_DATA_URL = 'data:image/jpeg;base64,AAAA'
const BACKING_DATA_URL = 'data:image/png;base64,BBBB'
const GOODS_ID = 'g1'
const IMAGE_ID = 'img_1'

const RECIPE = buildImageEditRecipe({
  frameId: 'wave',
  colorwayId: 'blue',
  fitRatioPercent: 94,
  bgColor: '#EFEEE8',
  labelsDate: '2026.10.02'
})

function makeService({ items = [], readImage = null, compressedBlob = null } = {}) {
  const store = { list: items, trashList: [] }
  return createSyncPayloadService({
    deviceIdRef: { value: 'dev_1' },
    imageCloudIdRef: { value: '' },
    lastSyncedAtRef: { value: '' },
    buildPresetsData: async () => ({}),
    ensureEventsStoreReady: async () => {},
    useGoodsStore: () => store,
    useRechargeStore: () => ({ list: [] }),
    useEventsStore: () => ({ list: [], trashList: [] }),
    useGoodsGroupStore: () => ({ groupList: [], groupItemList: [] }),
    readLocalImageAsDataUrl: async (uri) => {
      if (typeof readImage === 'function') return await readImage(uri)
      if (uri === 'capacitor://local/product.jpg') return PRODUCT_DATA_URL
      if (uri.startsWith('data:')) return uri
      return null
    },
    compressImageToBlob: async () => compressedBlob,
    imageFileSizeLimit: 1024 * 1024
  })
}

function goodsItem(overrides = {}) {
  return {
    id: GOODS_ID,
    name: '谷子',
    updatedAt: 1700000000000,
    images: [{
      id: IMAGE_ID,
      uri: 'capacitor://local/product.jpg',
      kind: 'primary',
      label: '',
      storageMode: 'inline-local',
      localPath: 'user-images/product.jpg',
      cloudFileName: '',
      mimeType: '',
      fileSize: 0,
      isPrimary: true,
      edit: RECIPE,
      editSourceUri: '',
      editSourceCloudFileName: '',
      ...overrides
    }]
  }
}

beforeEach(() => {
  getAllImageEdits.mockReset().mockResolvedValue([])
})

describe('buildSyncPayload：外框二次编辑的底图上传', () => {
  it('本机有底图时另存一份云端文件，文件名第三段与成品图区分', async () => {
    getAllImageEdits.mockResolvedValue([{
      imageId: IMAGE_ID,
      sourceUri: 'capacitor://local/backing.png',
      sourcePath: 'user-images/backing.png'
    }])
    const service = makeService({
      items: [goodsItem()],
      readImage: async (uri) => {
        if (uri === 'capacitor://local/product.jpg') return PRODUCT_DATA_URL
        if (uri === 'capacitor://local/backing.png') return BACKING_DATA_URL
        return null
      }
    })

    const { imageFiles, referencedImageFiles, syncData } = await service.buildSyncPayload({ incremental: false })

    const productName = Object.keys(imageFiles).find((name) => name.includes(`__${IMAGE_ID}__`))
    const backingName = Object.keys(imageFiles).find((name) => name.includes(`__${IMAGE_ID}s__`))
    expect(productName).toBeTruthy()
    expect(backingName).toBeTruthy()
    // 引用收集按前三段判归属，两段必须不同，否则底图会被当成成品图的另一个版本
    expect(backingName.split('__').slice(0, 3)).not.toEqual(productName.split('__').slice(0, 3))
    expect(imageFiles[backingName].content).toBe(BACKING_DATA_URL)
    expect(referencedImageFiles.has(backingName)).toBe(true)

    const entry = syncData.goods[0].images[0]
    expect(entry.editSourceCloudFileName).toBe(backingName)
    expect(entry.editSourceUri).toBe(`cloud-image://${backingName}`)
  })

  it('云端已有同名底图时复用，不重复上传', async () => {
    const existingName = `goods-image__${GOODS_ID}__${IMAGE_ID}s__1700000000000.jpg`
    getAllImageEdits.mockResolvedValue([{
      imageId: IMAGE_ID,
      sourceUri: 'capacitor://local/backing.jpg',
      sourcePath: 'user-images/backing.jpg'
    }])
    const service = makeService({
      items: [goodsItem({ editSourceUri: `cloud-image://${existingName}`, editSourceCloudFileName: existingName })],
      readImage: async (uri) => {
        if (uri === 'capacitor://local/product.jpg') return PRODUCT_DATA_URL
        if (uri === 'capacitor://local/backing.jpg') return BACKING_DATA_URL
        return null
      }
    })

    const { imageFiles, imageStats, referencedImageFiles, syncData } = await service.buildSyncPayload({
      incremental: false,
      existingImageCloud: { complete: true, files: { [existingName]: { createdAt: new Date().toISOString() } } }
    })

    expect(imageFiles[existingName]).toBeUndefined()
    expect(referencedImageFiles.has(existingName)).toBe(true)
    expect(syncData.goods[0].images[0].editSourceCloudFileName).toBe(existingName)
    expect(imageStats.imageFileCount).toBeGreaterThan(0)
  })

  it('本机没有底图、云端也没有 → 不伪造引用，配方照常同步', async () => {
    const service = makeService({ items: [goodsItem()] })
    const { imageFiles, referencedImageFiles, syncData } = await service.buildSyncPayload({ incremental: false })

    expect(Object.keys(imageFiles)).toHaveLength(1)
    expect([...referencedImageFiles].some((name) => name.includes(`${IMAGE_ID}s__`))).toBe(false)
    const entry = syncData.goods[0].images[0]
    expect(entry.edit.frameId).toBe('wave')
    expect(entry.editSourceUri).toBe('')
    expect(entry.editSourceCloudFileName).toBe('')
  })

  it('没套外框的图不产生底图文件，也不带 edit 字段', async () => {
    const item = goodsItem({ edit: null })
    const service = makeService({ items: [item] })
    const { imageFiles, syncData } = await service.buildSyncPayload({ incremental: false })

    expect(Object.keys(imageFiles)).toHaveLength(1)
    const entry = syncData.goods[0].images[0]
    expect(entry.edit).toBeNull()
    expect(entry.editSourceUri).toBe('')
    expect(entry.editSourceCloudFileName).toBe('')
  })

  it('底图压不到 1MB 以内时不上传，同步不因此失败', async () => {
    getAllImageEdits.mockResolvedValue([{
      imageId: IMAGE_ID,
      sourceUri: 'capacitor://local/huge.png',
      sourcePath: 'user-images/huge.png'
    }])
    const huge = `data:image/png;base64,${'A'.repeat(1024 * 1024 * 2)}`
    const service = makeService({
      items: [goodsItem()],
      readImage: async (uri) => {
        if (uri === 'capacitor://local/product.jpg') return PRODUCT_DATA_URL
        if (uri === 'capacitor://local/huge.png') return huge
        return null
      },
      compressedBlob: null
    })

    const { imageFiles, referencedImageFiles, syncData } = await service.buildSyncPayload({ incremental: false })

    expect(Object.keys(imageFiles)).toHaveLength(1)
    expect([...referencedImageFiles].some((name) => name.includes(`${IMAGE_ID}s__`))).toBe(false)
    expect(syncData.goods[0].images[0].edit.frameId).toBe('wave')
  })

  it('拉下来但本机还没底图的行：保留云端引用，不下载', async () => {
    const cloudName = `goods-image__${GOODS_ID}__${IMAGE_ID}s__1700000000000.jpg`
    const service = makeService({
      items: [goodsItem({ editSourceUri: `cloud-image://${cloudName}`, editSourceCloudFileName: cloudName })]
    })
    const { imageFiles, referencedImageFiles, syncData } = await service.buildSyncPayload({ incremental: false })

    expect(Object.keys(imageFiles)).toHaveLength(1)
    expect(referencedImageFiles.has(cloudName)).toBe(true)
    expect(syncData.goods[0].images[0].editSourceCloudFileName).toBe(cloudName)
  })
})
