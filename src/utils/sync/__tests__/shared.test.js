import { describe, it, expect } from 'vitest'
import {
  getItemTimestamp,
  countWishlistSplit,
  sortObjectKeys,
  sortedStringify,
  buildComparableRecordMap,
  buildTimestampRecordMap,
  countComparableRecordDiff,
  resolveGoodsTrashMaps,
  parseImageDataUrl,
  buildImageSyncStats,
  toTimestampMs,
  normalizeBudgetValue,
  getLatestRechargeTimestamp,
  shouldPullRechargeByManifest,
  collectReferencedImageState
} from '../shared'

describe('getItemTimestamp', () => {
  it('returns updatedAt as number', () => {
    expect(getItemTimestamp({ updatedAt: 123 })).toBe(123)
  })

  it('returns 0 for missing updatedAt', () => {
    expect(getItemTimestamp({})).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(getItemTimestamp(null)).toBe(0)
  })

  it('returns 0 for non-numeric updatedAt', () => {
    expect(getItemTimestamp({ updatedAt: 'abc' })).toBe(0)
  })
})

describe('countWishlistSplit', () => {
  it('counts collection and wishlist items', () => {
    const items = [
      { isWishlist: false },
      { isWishlist: true },
      { isWishlist: false },
      { isWishlist: true }
    ]
    expect(countWishlistSplit(items)).toEqual({ collection: 2, wishlist: 2 })
  })

  it('returns zeros for empty array', () => {
    expect(countWishlistSplit([])).toEqual({ collection: 0, wishlist: 0 })
  })

  it('returns zeros for empty default (undefined)', () => {
    expect(countWishlistSplit()).toEqual({ collection: 0, wishlist: 0 })
  })

  it('treats missing isWishlist as collection', () => {
    expect(countWishlistSplit([{}])).toEqual({ collection: 1, wishlist: 0 })
  })
})

describe('sortObjectKeys', () => {
  it('sorts object keys alphabetically', () => {
    expect(JSON.stringify(sortObjectKeys({ b: 1, a: 2 }))).toBe('{"a":2,"b":1}')
  })

  it('recursively sorts nested objects', () => {
    const input = { b: { d: 1, c: 2 }, a: 3 }
    const result = sortObjectKeys(input)
    expect(Object.keys(result)).toEqual(['a', 'b'])
    expect(Object.keys(result.b)).toEqual(['c', 'd'])
  })

  it('handles arrays', () => {
    const input = [{ b: 1, a: 2 }]
    const result = sortObjectKeys(input)
    expect(Object.keys(result[0])).toEqual(['a', 'b'])
  })

  it('passes through primitives', () => {
    expect(sortObjectKeys(42)).toBe(42)
    expect(sortObjectKeys('str')).toBe('str')
    expect(sortObjectKeys(null)).toBe(null)
  })
})

describe('sortedStringify', () => {
  it('stringifies with sorted keys', () => {
    expect(sortedStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('handles null', () => {
    expect(sortedStringify(null)).toBe('null')
  })

  it('handles undefined', () => {
    expect(sortedStringify(undefined)).toBe('null')
  })

  it('handles strings', () => {
    expect(sortedStringify('hello')).toBe('"hello"')
  })

  it('handles numbers', () => {
    expect(sortedStringify(42)).toBe('42')
  })

  it('handles -0 as null', () => {
    expect(sortedStringify(-0)).toBe('null')
  })

  it('handles booleans', () => {
    expect(sortedStringify(true)).toBe('true')
    expect(sortedStringify(false)).toBe('false')
  })

  it('handles arrays', () => {
    expect(sortedStringify([1, 2, 3])).toBe('[1,2,3]')
  })

  it('handles nested objects', () => {
    expect(sortedStringify({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}')
  })

  it('skips undefined values in objects', () => {
    expect(sortedStringify({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('converts undefined in arrays to null', () => {
    expect(sortedStringify([1, undefined, 3])).toBe('[1,null,3]')
  })
})

describe('buildComparableRecordMap', () => {
  it('builds map from items', () => {
    const items = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
    const map = buildComparableRecordMap(items)
    expect(map.size).toBe(2)
    expect(map.has('1')).toBe(true)
    expect(map.has('2')).toBe(true)
  })

  it('skips items without id', () => {
    const items = [{ name: 'A' }, { id: '2', name: 'B' }]
    const map = buildComparableRecordMap(items)
    expect(map.size).toBe(1)
  })

  it('returns empty map for undefined (default)', () => {
    expect(buildComparableRecordMap().size).toBe(0)
  })
})

describe('buildTimestampRecordMap', () => {
  it('builds map with timestamps', () => {
    const items = [{ id: '1', updatedAt: 100 }, { id: '2', updatedAt: 200 }]
    const map = buildTimestampRecordMap(items)
    expect(map.get('1')).toBe(100)
    expect(map.get('2')).toBe(200)
  })

  it('defaults to 0 for missing updatedAt', () => {
    const map = buildTimestampRecordMap([{ id: '1' }])
    expect(map.get('1')).toBe(0)
  })
})

describe('countComparableRecordDiff', () => {
  it('counts remote-only, local-only, and updated', () => {
    const local = new Map([['1', '{"a":1}'], ['2', '{"a":2}']])
    const remote = new Map([['1', '{"a":1}'], ['3', '{"a":3}']])
    const result = countComparableRecordDiff(local, remote)
    expect(result.remoteOnly).toBe(1)  // id=3
    expect(result.localOnly).toBe(1)   // id=2
    expect(result.updated).toBe(0)     // id=1 same
    expect(result.remoteTotal).toBe(2)
  })

  it('detects updated records', () => {
    const local = new Map([['1', '{"a":1}']])
    const remote = new Map([['1', '{"a":2}']])
    const result = countComparableRecordDiff(local, remote)
    expect(result.updated).toBe(1)
  })
})

describe('resolveGoodsTrashMaps', () => {
  it('keeps goods and trash separate when no conflicts', () => {
    const goods = [{ id: '1', updatedAt: 100 }]
    const trash = [{ id: '2', updatedAt: 200 }]
    const { goodsMap, trashMap } = resolveGoodsTrashMaps(goods, trash)
    expect(goodsMap.has('1')).toBe(true)
    expect(trashMap.has('2')).toBe(true)
  })

  it('removes from trash when goods is newer', () => {
    const goods = [{ id: '1', updatedAt: 200 }]
    const trash = [{ id: '1', updatedAt: 100 }]
    const { goodsMap, trashMap } = resolveGoodsTrashMaps(goods, trash)
    expect(goodsMap.has('1')).toBe(true)
    expect(trashMap.has('1')).toBe(false)
  })

  it('removes from goods when trash is newer', () => {
    const goods = [{ id: '1', updatedAt: 100 }]
    const trash = [{ id: '1', updatedAt: 200 }]
    const { goodsMap, trashMap } = resolveGoodsTrashMaps(goods, trash)
    expect(goodsMap.has('1')).toBe(false)
    expect(trashMap.has('1')).toBe(true)
  })
})

describe('parseImageDataUrl', () => {
  it('parses valid data URL', () => {
    const result = parseImageDataUrl('data:image/png;base64,abc123')
    expect(result.mimeType).toBe('image/png')
    expect(result.base64Data).toBe('abc123')
    expect(typeof result.fileSize).toBe('number')
  })

  it('returns null for invalid URL', () => {
    expect(parseImageDataUrl('not a data url')).toBe(null)
  })

  it('returns null for null', () => {
    expect(parseImageDataUrl(null)).toBe(null)
  })

  it('returns null for empty string', () => {
    expect(parseImageDataUrl('')).toBe(null)
  })
})

describe('buildImageSyncStats', () => {
  it('returns initial stats object', () => {
    const stats = buildImageSyncStats()
    expect(stats.uploadedImages).toBe(0)
    expect(stats.reusedImages).toBe(0)
    expect(stats.restoredImages).toBe(0)
    expect(stats.imageFileCount).toBe(0)
    expect(stats.imageUpdatedAt).toBe('')
  })
})

describe('toTimestampMs', () => {
  it('returns number as-is if finite', () => {
    expect(toTimestampMs(1000)).toBe(1000)
  })

  it('returns 0 for NaN', () => {
    expect(toTimestampMs(NaN)).toBe(0)
  })

  it('returns 0 for Infinity', () => {
    expect(toTimestampMs(Infinity)).toBe(0)
  })

  it('parses date string', () => {
    const ms = toTimestampMs('2024-01-01T00:00:00Z')
    expect(ms).toBeGreaterThan(0)
  })

  it('returns 0 for invalid date string', () => {
    expect(toTimestampMs('invalid')).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(toTimestampMs(null)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(toTimestampMs('')).toBe(0)
  })
})

describe('normalizeBudgetValue', () => {
  it('returns positive number', () => {
    expect(normalizeBudgetValue(100)).toBe(100)
  })

  it('returns 0 for zero', () => {
    expect(normalizeBudgetValue(0)).toBe(0)
  })

  it('returns 0 for negative', () => {
    expect(normalizeBudgetValue(-10)).toBe(0)
  })

  it('returns 0 for NaN', () => {
    expect(normalizeBudgetValue('abc')).toBe(0)
  })

  it('parses numeric string', () => {
    expect(normalizeBudgetValue('500')).toBe(500)
  })
})

describe('getLatestRechargeTimestamp', () => {
  it('returns max timestamp', () => {
    const records = [{ updatedAt: 100 }, { updatedAt: 300 }, { updatedAt: 200 }]
    expect(getLatestRechargeTimestamp(records)).toBe(300)
  })

  it('returns 0 for empty array', () => {
    expect(getLatestRechargeTimestamp([])).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(getLatestRechargeTimestamp(null)).toBe(0)
  })
})

describe('shouldPullRechargeByManifest', () => {
  it('returns true when remote is newer', () => {
    const manifest = { rechargeUpdatedAt: '2024-02-01T00:00:00Z' }
    const local = [{ updatedAt: new Date('2024-01-01').getTime() }]
    expect(shouldPullRechargeByManifest(manifest, local)).toBe(true)
  })

  it('returns false when local is newer', () => {
    const manifest = { rechargeUpdatedAt: '2024-01-01T00:00:00Z' }
    const local = [{ updatedAt: new Date('2024-02-01').getTime() }]
    expect(shouldPullRechargeByManifest(manifest, local)).toBe(false)
  })

  it('returns true when no remote timestamp', () => {
    expect(shouldPullRechargeByManifest({}, [])).toBe(true)
  })
})

describe('collectReferencedImageState', () => {
  it('collects cloudFileName from goods images', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
      goods: [{
        id: 'g1',
        images: [{ id: 'img1', uri: 'cloud-image://goods-image__g1__img1__1.jpg', cloudFileName: 'goods-image__g1__img1__1.jpg' }]
      }]
    })
    expect(referencedFiles.has('goods-image__g1__img1__1.jpg')).toBe(true)
    expect(ownedEntityIds.has('g1')).toBe(true)
  })

  it('resolves cloud-image:// uris without explicit cloudFileName', () => {
    const { referencedFiles } = collectReferencedImageState({
      trash: [{
        id: 't1',
        images: [{ id: 'img1', uri: 'cloud-image://goods-image__t1__img1__2.jpg' }]
      }]
    })
    expect(referencedFiles.has('goods-image__t1__img1__2.jpg')).toBe(true)
  })

  it('resolves Supabase public URLs to bare filenames', () => {
    const { referencedFiles } = collectReferencedImageState({
      goods: [{
        id: 'a',
        images: [{ id: 'img1', uri: 'https://x.supabase.co/storage/v1/object/public/goods-images/goods-image__a__b__1.jpg' }]
      }]
    })
    expect(referencedFiles.has('goods-image__a__b__1.jpg')).toBe(true)
  })

  it('resolves user-scoped Supabase public URLs (uid/ 目录前缀) to bare filenames', () => {
    // 回归：用户目录前缀若保留在引用名中，孤儿回收会因比对不上裸文件名而误删被引用图片
    const { referencedFiles } = collectReferencedImageState({
      goods: [{
        id: 'a',
        images: [{ id: 'img1', uri: 'https://x.supabase.co/storage/v1/object/public/goods-images/user-uid-123/goods-image__a__b__1.jpg' }]
      }]
    })
    expect(referencedFiles.has('goods-image__a__b__1.jpg')).toBe(true)
    expect(referencedFiles.has('user-uid-123/goods-image__a__b__1.jpg')).toBe(false)
  })

  it('falls back to legacy coverImage when images array is empty', () => {
    const { referencedFiles } = collectReferencedImageState({
      goods: [{
        id: 'g1',
        coverImage: 'cloud-image://goods-image__g1__legacy__1.jpg'
      }]
    })
    expect(referencedFiles.has('goods-image__g1__legacy__1.jpg')).toBe(true)
  })

  it('collects event cover and photo refs, including deleted events', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
      events: [{
        id: 'evt1',
        deleted: true,
        coverImage: 'cloud-image://event-cover__evt1__1.jpg',
        coverImageData: { cloudFileName: 'event-cover__evt1__1.jpg' },
        photos: [
          { id: 'p1', uri: 'cloud-image://event-photo__evt1__p1__1.jpg', cloudFileName: 'event-photo__evt1__p1__1.jpg' },
          { id: 'p2', uri: 'https://x.supabase.co/storage/v1/object/public/event-photos/event-photo__evt1__p2__1.jpg' }
        ]
      }]
    })
    expect(referencedFiles.has('event-cover__evt1__1.jpg')).toBe(true)
    expect(referencedFiles.has('event-photo__evt1__p1__1.jpg')).toBe(true)
    expect(referencedFiles.has('event-photo__evt1__p2__1.jpg')).toBe(true)
    expect(ownedEntityIds.has('evt1')).toBe(true)
  })

  it('includes both raw and sanitized entity ids', () => {
    const { ownedEntityIds } = collectReferencedImageState({
      goods: [{ id: 'a b' }]
    })
    expect(ownedEntityIds.has('a b')).toBe(true)
    expect(ownedEntityIds.has('a-b')).toBe(true)
  })

  it('returns empty sets for empty input', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState()
    expect(referencedFiles.size).toBe(0)
    expect(ownedEntityIds.size).toBe(0)
  })
})
