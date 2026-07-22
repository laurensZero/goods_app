import { describe, it, expect, vi } from 'vitest'

// Mock dependencies
vi.mock('@/utils/goods/images', () => ({
  inferGoodsImageStorageMode: vi.fn(() => 'gist-local'),
  normalizeGoodsImageList: vi.fn((images) => Array.isArray(images) ? images : []),
  parseGistImageUri: vi.fn(() => null)
}))

vi.mock('@/utils/sync/shared', () => ({
  processWithConcurrency: vi.fn(async (items, fn) => Promise.all(items.map(fn)))
}))

import { createSyncImageService } from '../syncImageService'

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
      const existingGist = {
        files: {
          'goods-image__item1__img1__0.jpg.txt': {},
          'goods-image__item2__img2__0.jpg.txt': {},
          'other-file.txt': {}
        }
      }
      const referenced = new Set(['goods-image__item1__img1__0.jpg.txt'])

      const result = service.buildImageCleanupFiles(existingGist, referenced)
      expect(result).toHaveProperty('goods-image__item2__img2__0.jpg.txt')
      expect(result['goods-image__item2__img2__0.jpg.txt']).toBeNull()
      expect(result).not.toHaveProperty('goods-image__item1__img1__0.jpg.txt')
      expect(result).not.toHaveProperty('other-file.txt')
    })

    it('includes event cover files', () => {
      const existingGist = {
        files: {
          'event-cover__evt1__0.jpg.txt': {},
          'event-photo__evt1__photo1__0.jpg.txt': {}
        }
      }
      const referenced = new Set()

      const result = service.buildImageCleanupFiles(existingGist, referenced)
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('skips non-image files', () => {
      const existingGist = {
        files: {
          'data.json': {},
          'readme.md': {},
          'goods-image__item1__img1__0.jpg.txt': {}
        }
      }
      const referenced = new Set()

      const result = service.buildImageCleanupFiles(existingGist, referenced)
      expect(Object.keys(result)).toHaveLength(1)
      expect(result).toHaveProperty('goods-image__item1__img1__0.jpg.txt')
    })

    it('returns empty for empty gist', () => {
      const result = service.buildImageCleanupFiles({}, new Set())
      expect(result).toEqual({})
    })

    it('returns empty for null gist files', () => {
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

      const existingGist = {
        files: { 'goods-image__item1__img1__0.jpg.txt': {} }
      }
      const result = supabaseService.buildImageCleanupFiles(existingGist, new Set())
      expect(result).toEqual({})
    })
  })
})
