import { describe, it, expect, vi } from 'vitest'

// 避免加载完整 i18n 语言包
vi.mock('@/locales', () => ({
  default: { global: { t: (key) => key } }
}))

import { createStorageOps, GOODS_IMAGE_BUCKET, EVENT_PHOTO_BUCKET, toStoragePath } from '../storage'

// 构造最小化的 supabase client mock：list 按桶分发，remove 记录批次
function makeDb({ listImpl, removeImpl }) {
  return {
    storage: {
      from: (bucket) => ({
        list: (folder, opts) => listImpl(bucket, folder, opts),
        remove: (batch) => removeImpl(bucket, batch)
      })
    }
  }
}

function makeOps(db) {
  return createStorageOps({ getDb: () => db, withRetry: (fn) => fn() })
}

function makeGoodsEntries(count, startIndex = 0) {
  const entries = []
  for (let i = 0; i < count; i++) {
    entries.push({ name: `goods-image__item__img${startIndex + i}__1.jpg`, created_at: '2024-01-01T00:00:00Z' })
  }
  return entries
}

describe('createStorageOps', () => {
  describe('getExistingImageCloud', () => {
    it('paginates past 1000 entries, keeps createdAt and .txt aliases, sets complete=true', async () => {
      const listCalls = []
      const db = makeDb({
        listImpl: async (bucket, folder, opts) => {
          listCalls.push({ bucket, offset: opts.offset })
          if (bucket === GOODS_IMAGE_BUCKET) {
            // 第一页满 1000 条，第二页 5 条（不足一页 → 结束）
            if (opts.offset === 0) return { data: makeGoodsEntries(1000), error: null }
            return { data: makeGoodsEntries(5, 1000), error: null }
          }
          // event 桶单页，含占位文件（应被过滤）
          return {
            data: [
              { name: 'event-photo__evt1__p1__1.jpg', created_at: '2024-02-01T00:00:00Z' },
              { name: '.emptyFolderPlaceholder', created_at: '' }
            ],
            error: null
          }
        },
        removeImpl: async () => ({ error: null })
      })

      const result = await makeOps(db).getExistingImageCloud()

      expect(result.complete).toBe(true)
      // goods 桶翻了两页
      expect(listCalls.filter((c) => c.bucket === GOODS_IMAGE_BUCKET).map((c) => c.offset)).toEqual([0, 1000])
      // 1005 goods + 1 event，每个文件带 .txt 别名
      expect(Object.keys(result.files)).toHaveLength((1005 + 1) * 2)
      const entry = result.files['event-photo__evt1__p1__1.jpg']
      expect(entry.createdAt).toBe('2024-02-01T00:00:00Z')
      // .txt 别名与真实文件指向同一对象
      expect(result.files['event-photo__evt1__p1__1.jpg.txt']).toBe(entry)
      expect(result.files['.emptyFolderPlaceholder']).toBeUndefined()
    })

    it('sets complete=false when any page listing fails', async () => {
      const db = makeDb({
        listImpl: async (bucket) => {
          if (bucket === GOODS_IMAGE_BUCKET) return { data: makeGoodsEntries(3), error: null }
          return { data: null, error: { message: 'boom' } }
        },
        removeImpl: async () => ({ error: null })
      })

      const result = await makeOps(db).getExistingImageCloud()

      expect(result.complete).toBe(false)
      // 成功列出的桶内容仍可用
      expect(result.files['goods-image__item__img0__1.jpg']).toBeTruthy()
    })
  })

  describe('removeImages', () => {
    it('routes buckets by prefix, batches at 100, strips legacy .txt suffix', async () => {
      const removeCalls = []
      const db = makeDb({
        listImpl: async () => ({ data: [], error: null }),
        removeImpl: async (bucket, batch) => {
          removeCalls.push({ bucket, batch })
          return { error: null }
        }
      })

      const names = []
      for (let i = 0; i < 250; i++) names.push(`goods-image__item__img${i}__1.jpg`)
      names.push('goods-image__legacy__img__1.jpg.txt')
      names.push('event-photo__evt1__p1__1.jpg')

      const result = await makeOps(db).removeImages(names)

      expect(result).toEqual({ removed: 252, failed: 0 })

      const goodsCalls = removeCalls.filter((c) => c.bucket === GOODS_IMAGE_BUCKET)
      const eventCalls = removeCalls.filter((c) => c.bucket === EVENT_PHOTO_BUCKET)
      // goods 桶 251 个路径 → 100 + 100 + 51 三批
      expect(goodsCalls.map((c) => c.batch.length)).toEqual([100, 100, 51])
      expect(eventCalls.map((c) => c.batch.length)).toEqual([1])
      expect(eventCalls[0].batch).toEqual(['event-photo__evt1__p1__1.jpg'])
      // 旧版 .txt 后缀被剥离
      const allGoodsPaths = goodsCalls.flatMap((c) => c.batch)
      expect(allGoodsPaths).toContain('goods-image__legacy__img__1.jpg')
      expect(allGoodsPaths).not.toContain('goods-image__legacy__img__1.jpg.txt')
    })

    it('counts failed batches without throwing', async () => {
      const db = makeDb({
        listImpl: async () => ({ data: [], error: null }),
        removeImpl: async (bucket) => {
          if (bucket === EVENT_PHOTO_BUCKET) return { error: { message: 'denied' } }
          return { error: null }
        }
      })

      const result = await makeOps(db).removeImages([
        'goods-image__a__b__1.jpg',
        'event-photo__evt1__p1__1.jpg'
      ])

      expect(result).toEqual({ removed: 1, failed: 1 })
    })

    it('returns zero counts for empty input', async () => {
      const db = makeDb({
        listImpl: async () => ({ data: [], error: null }),
        removeImpl: async () => ({ error: null })
      })
      expect(await makeOps(db).removeImages([])).toEqual({ removed: 0, failed: 0 })
      expect(await makeOps(db).removeImages(null)).toEqual({ removed: 0, failed: 0 })
    })
  })

  describe('toStoragePath', () => {
    it('strips legacy .txt suffix only', () => {
      expect(toStoragePath('a.jpg.txt')).toBe('a.jpg')
      expect(toStoragePath('a.jpg')).toBe('a.jpg')
    })
  })
})
