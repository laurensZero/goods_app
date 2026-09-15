import { describe, it, expect, vi } from 'vitest'

// Mock dependencies
vi.mock('@/utils/goods/images', () => ({
  inferGoodsImageStorageMode: vi.fn(() => 'cloud-local'),
  normalizeGoodsImageList: vi.fn((images) => Array.isArray(images) ? images : []),
  parseCloudImageUri: vi.fn(() => null)
}))

vi.mock('@/utils/sync/shared', () => ({
  processWithConcurrency: vi.fn(async (items, fn) => Promise.all(items.map(fn)))
}))

import { createSyncImageService, MAX_ORPHAN_DELETE_PER_SYNC } from '../syncImageService'

describe('createSyncImageService', () => {
  const mockBackend = {
    readImage: vi.fn(),
    getImagePublicUrl: undefined
  }

  const mockTrackSyncStep = vi.fn(async (name, fn) => fn())

  const service = createSyncImageService({
    backend: mockBackend,
    getBackend: null,
    trackSyncStep: mockTrackSyncStep,
    imageFilePrefix: 'goods-image__',
    eventCoverPrefix: 'event-cover__',
    eventPhotoPrefix: 'event-photo__'
  })

  describe('buildImageCleanupFiles', () => {
    it('returns files to clean up that are not referenced', () => {
      const existingCloud = {
        files: {
          'goods-image__item1__img1__0.jpg': {},
          'goods-image__item2__img2__0.jpg': {},
          'other-file.txt': {}
        }
      }
      const referenced = new Set(['goods-image__item1__img1__0.jpg'])

      const result = service.buildImageCleanupFiles(existingCloud, referenced)
      expect(result).toHaveProperty('goods-image__item2__img2__0.jpg')
      expect(result['goods-image__item2__img2__0.jpg']).toBeNull()
      expect(result).not.toHaveProperty('goods-image__item1__img1__0.jpg')
      expect(result).not.toHaveProperty('other-file.txt')
    })

    it('includes event cover files', () => {
      const existingCloud = {
        files: {
          'event-cover__evt1__0.jpg': {},
          'event-photo__evt1__photo1__0.jpg': {}
        }
      }
      const referenced = new Set()

      const result = service.buildImageCleanupFiles(existingCloud, referenced)
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('skips non-image files', () => {
      const existingCloud = {
        files: {
          'data.json': {},
          'readme.md': {},
          'goods-image__item1__img1__0.jpg': {}
        }
      }
      const referenced = new Set()

      const result = service.buildImageCleanupFiles(existingCloud, referenced)
      expect(Object.keys(result)).toHaveLength(1)
      expect(result).toHaveProperty('goods-image__item1__img1__0.jpg')
    })

    it('returns empty for empty cloud', () => {
      const result = service.buildImageCleanupFiles({}, new Set())
      expect(result).toEqual({})
    })

    it('returns empty for null cloud files', () => {
      const result = service.buildImageCleanupFiles({ files: null }, new Set())
      expect(result).toEqual({})
    })

    it('returns empty when backend has getImagePublicUrl (Supabase mode)', () => {
      const supabaseService = createSyncImageService({
        backend: { getImagePublicUrl: () => 'url' },
        getBackend: null,
        trackSyncStep: mockTrackSyncStep,
        imageFilePrefix: 'goods-image__',
        eventCoverPrefix: 'event-cover__',
        eventPhotoPrefix: 'event-photo__'
      })

      const existingCloud = {
        files: { 'goods-image__item1__img1__0.jpg': {} }
      }
      const result = supabaseService.buildImageCleanupFiles(existingCloud, new Set())
      expect(result).toEqual({})
    })
  })

  describe('collectSupabaseOrphanImageFiles', () => {
    // Supabase 模式的 service（backend 带 getImagePublicUrl）
    const supabaseService = createSyncImageService({
      backend: { getImagePublicUrl: () => 'url' },
      getBackend: null,
      trackSyncStep: mockTrackSyncStep,
      imageFilePrefix: 'goods-image__',
      eventCoverPrefix: 'event-cover__',
      eventPhotoPrefix: 'event-photo__'
    })

    const OLD_CREATED_AT = '2020-01-01T00:00:00Z'
    const ownedIds = () => new Set(['1712000000000', 'evt1'])

    function makeCloud(files, complete = true) {
      return { id: 'goods-images', files, complete }
    }

    it('deletes unreferenced owned file older than grace period', () => {
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })
      expect(result).toEqual(['goods-image__1712000000000__img_a__1.jpg'])
    })

    it('keeps referenced files', () => {
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(['goods-image__1712000000000__img_a__1.jpg']),
        ownedEntityIds: ownedIds()
      })
      expect(result).toEqual([])
    })

    it('keeps files referenced via a user-scoped path (uid/ 前缀在比对前剥除)', () => {
      // 回归：引用名可能携带用户目录前缀（来自用户目录公开 URL 解析），比对必须用裸文件名
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(['user-uid-123/goods-image__1712000000000__img_a__1.jpg']),
        ownedEntityIds: ownedIds()
      })
      expect(result).toEqual([])
    })

    it('keeps files whose embedded id is not owned (foreign user)', () => {
      const cloud = makeCloud({
        'goods-image__9999999999999__img_x__1.jpg': { name: 'goods-image__9999999999999__img_x__1.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })
      expect(result).toEqual([])
    })

    it('keeps files created within the grace period', () => {
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: '2024-01-01T00:00:00Z' }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds(),
        now: Date.parse('2024-01-01T12:00:00Z')
      })
      expect(result).toEqual([])
    })

    it('keeps files with missing or invalid createdAt', () => {
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg' },
        'goods-image__1712000000000__img_b__1.jpg': { name: 'goods-image__1712000000000__img_b__1.jpg', createdAt: 'not-a-date' }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })
      expect(result).toEqual([])
    })

    it('returns empty when listing is incomplete or complete flag is absent', () => {
      const files = {
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      }
      expect(supabaseService.collectSupabaseOrphanImageFiles(makeCloud(files, false), {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })).toEqual([])
      expect(supabaseService.collectSupabaseOrphanImageFiles({ id: 'goods-images', files }, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })).toEqual([])
    })

    it('returns empty when ownedEntityIds is empty', () => {
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: new Set()
      })
      expect(result).toEqual([])
    })

    it('skips .txt alias keys and non-prefixed files', () => {
      const entry = { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': entry,
        'goods-image__1712000000000__img_a__1.jpg.txt': entry,
        'data.json': { name: 'data.json', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })
      // 无重复、无非图片文件
      expect(result).toEqual(['goods-image__1712000000000__img_a__1.jpg'])
    })

    it('normalizes legacy .txt references to protect the bare storage name', () => {
      const cloud = makeCloud({
        'goods-image__1712000000000__img_a__1.jpg': { name: 'goods-image__1712000000000__img_a__1.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(['goods-image__1712000000000__img_a__1.jpg.txt']),
        ownedEntityIds: ownedIds()
      })
      expect(result).toEqual([])
    })

    it('matches event cover and photo files via event id', () => {
      const cloud = makeCloud({
        'event-cover__evt1__123.jpg': { name: 'event-cover__evt1__123.jpg', createdAt: OLD_CREATED_AT },
        'event-photo__evt1__p1__123.jpg': { name: 'event-photo__evt1__p1__123.jpg', createdAt: OLD_CREATED_AT },
        'event-cover__evt-other__123.jpg': { name: 'event-cover__evt-other__123.jpg', createdAt: OLD_CREATED_AT }
      })
      const result = supabaseService.collectSupabaseOrphanImageFiles(cloud, {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })
      expect(result.sort()).toEqual(['event-cover__evt1__123.jpg', 'event-photo__evt1__p1__123.jpg'])
    })

    it('caps output at MAX_ORPHAN_DELETE_PER_SYNC', () => {
      const files = {}
      for (let i = 0; i < MAX_ORPHAN_DELETE_PER_SYNC + 50; i++) {
        const name = `goods-image__1712000000000__img_${i}__1.jpg`
        files[name] = { name, createdAt: OLD_CREATED_AT }
      }
      const result = supabaseService.collectSupabaseOrphanImageFiles(makeCloud(files), {
        referencedFiles: new Set(),
        ownedEntityIds: ownedIds()
      })
      expect(result).toHaveLength(MAX_ORPHAN_DELETE_PER_SYNC)
    })
  })
})
