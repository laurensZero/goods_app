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
import { getAllBatchDrafts } from '@/utils/db'
import { SINGLE_DRAFT_FORM_KEY } from '@/utils/batch/singleDraft'

const LOCAL_IMAGE_URI = 'capacitor://local/single-draft.png'
const IMAGE_DATA_URL = 'data:image/png;base64,AAAA'
const SLOT = 'collection'
const IMAGE_ID = 'img_1'
const EXPECTED_NAME = `batch-draft-image__${SLOT}__${IMAGE_ID}__0.png`

function makeService() {
  return createSyncPayloadService({
    deviceIdRef: { value: 'dev_1' },
    imageCloudIdRef: { value: '' },
    lastSyncedAtRef: { value: '' },
    buildPresetsData: async () => ({}),
    ensureEventsStoreReady: async () => {},
    useGoodsStore: () => ({ list: [], trashList: [] }),
    useRechargeStore: () => ({ list: [] }),
    useEventsStore: () => ({ list: [], trashList: [] }),
    useGoodsGroupStore: () => ({ groupList: [], groupItemList: [] }),
    readLocalImageAsDataUrl: async (uri) => (uri === LOCAL_IMAGE_URI ? IMAGE_DATA_URL : null),
    compressImageToBlob: async () => null,
    imageFileSizeLimit: 1024 * 1024
  })
}

function singleDraft(images) {
  return {
    id: SLOT,
    slot: SLOT,
    batchId: '',
    isWishlist: false,
    items: [{
      id: 'single',
      [SINGLE_DRAFT_FORM_KEY]: { name: '单草稿', images }
    }],
    defaults: {},
    deleted: false,
    updatedAt: 1700000000000
  }
}

function localImage(overrides = {}) {
  return {
    id: IMAGE_ID,
    uri: LOCAL_IMAGE_URI,
    storageMode: 'inline-local',
    cloudFileName: '',
    isPrimary: true,
    ...overrides
  }
}

beforeEach(() => {
  getAllBatchDrafts.mockReset().mockResolvedValue([])
})

describe('buildBatchDraftSyncPayload：单个草稿的图片文件名', () => {
  it('上传到 batch-draft-image__ 前缀，实体 id 用草稿槽位', async () => {
    getAllBatchDrafts.mockResolvedValue([singleDraft([localImage()])])

    const result = await makeService().buildBatchDraftSyncPayload({})

    expect(Object.keys(result.batchDraftImageFiles)).toEqual([EXPECTED_NAME])
    expect(result.batchDraftReferencedImageFiles.has(EXPECTED_NAME)).toBe(true)
    expect(result.batchDraftImageStats.uploadedImages).toBe(1)

    const form = result.batchDraftSyncData.batchDrafts[0].items[0][SINGLE_DRAFT_FORM_KEY]
    expect(form.images[0].cloudFileName).toBe(EXPECTED_NAME)
    expect(form.images[0].uri).toBe(`cloud-image://${EXPECTED_NAME}`)
    expect(form.images[0].storageMode).toBe('cloud-local')
  })

  it('已上传过的图（旧的 goods-image__ 文件名）原样复用，不重复上传', async () => {
    const legacyName = `goods-image__${SLOT}__${IMAGE_ID}__1.png`
    getAllBatchDrafts.mockResolvedValue([singleDraft([
      localImage({ uri: `cloud-image://${legacyName}`, storageMode: 'cloud-local', cloudFileName: legacyName })
    ])])

    const result = await makeService().buildBatchDraftSyncPayload({
      existingImageCloud: { complete: true, files: { [legacyName]: { name: legacyName } } }
    })

    expect(result.batchDraftImageFiles).toEqual({})
    expect(result.batchDraftReferencedImageFiles.has(legacyName)).toBe(true)
    expect(result.batchDraftImageStats.uploadedImages).toBe(0)

    const form = result.batchDraftSyncData.batchDrafts[0].items[0][SINGLE_DRAFT_FORM_KEY]
    expect(form.images[0].cloudFileName).toBe(legacyName)
  })
})
