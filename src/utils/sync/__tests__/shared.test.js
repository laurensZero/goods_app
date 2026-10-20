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
  collectReferencedImageState,
  buildImageEditSourceFilename,
  buildImageFilename,
  buildProfileBackgroundFilename
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
  it('collects draft item cloudFileName and prevents GC of unsaved draft images', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
      batchDrafts: [{
        id: 'collection',
        slot: 'collection',
        items: [{
          id: 'q1',
          cloudFileName: 'batch-draft-image__collection__q1__1.jpg',
          imageUri: 'cloud-image://batch-draft-image__collection__q1__1.jpg'
        }]
      }]
    })
    expect(referencedFiles.has('batch-draft-image__collection__q1__1.jpg')).toBe(true)
    expect(ownedEntityIds.has('collection')).toBe(true)
  })

  it('单个草稿：登记 singleForm.images，避免未保存的单草稿图被孤儿回收删掉', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
      batchDrafts: [{
        id: 'wishlist',
        slot: 'wishlist',
        items: [{
          id: 'single',
          singleForm: {
            name: '单草稿',
            images: [
              { id: 'img1', uri: 'cloud-image://goods-image__w1__img1__1.jpg', cloudFileName: 'goods-image__w1__img1__1.jpg' },
              { id: 'img2', uri: 'https://x.supabase.co/storage/v1/object/public/goods-images/uid-1/goods-image__w1__img2__1.jpg' }
            ]
          }
        }]
      }]
    })
    expect(referencedFiles.has('goods-image__w1__img1__1.jpg')).toBe(true)
    expect(referencedFiles.has('goods-image__w1__img2__1.jpg')).toBe(true)
    expect(ownedEntityIds.has('wishlist')).toBe(true)
  })

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

  it('登记外框二次编辑的「去框底图」，否则孤儿回收会删掉它', () => {
    const backingName = 'goods-image__g1__img1s__1.jpg'
    const { referencedFiles } = collectReferencedImageState({
      goods: [{
        id: 'g1',
        images: [{
          id: 'img1',
          uri: 'cloud-image://goods-image__g1__img1__1.jpg',
          cloudFileName: 'goods-image__g1__img1__1.jpg',
          edit: { version: 1, frameId: 'wave' },
          editSourceUri: `cloud-image://${backingName}`,
          editSourceCloudFileName: backingName
        }]
      }]
    })
    expect(referencedFiles.has(backingName)).toBe(true)
    expect(referencedFiles.has('goods-image__g1__img1__1.jpg')).toBe(true)
  })

  it('回收站里的行也带着底图引用（软删除期间不能删文件）', () => {
    const backingName = 'goods-image__t1__img1s__2.jpg'
    const { referencedFiles } = collectReferencedImageState({
      trash: [{
        id: 't1',
        images: [{
          id: 'img1',
          uri: 'cloud-image://goods-image__t1__img1__2.jpg',
          edit: { version: 1, frameId: 'wave' },
          editSourceCloudFileName: backingName
        }]
      }]
    })
    expect(referencedFiles.has(backingName)).toBe(true)
  })

  it('配方被清掉（关掉外框）后底图引用不再登记，交给孤儿回收', () => {
    const backingName = 'goods-image__t1__img1s__2.jpg'
    const { referencedFiles } = collectReferencedImageState({
      trash: [{
        id: 't1',
        images: [{ id: 'img1', uri: 'cloud-image://goods-image__t1__img1__2.jpg', editSourceCloudFileName: backingName }]
      }]
    })
    expect(referencedFiles.has(backingName)).toBe(false)
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

  // 事故复现路径：云端迁移后条目只剩 ref，如果这里读不出文件名，
  // referencedFiles 会漏掉这些文件 → 孤儿回收把它们当垃圾删掉。
  it('ref 形态：goods / 活动 / 充值 / 草稿的文件名都要登记', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
      goods: [{
        id: 'g1',
        images: [
          { id: 'img1', ref: 'cloud:goods-image__g1__img1__1.jpg' },
          {
            id: 'img2',
            ref: 'cloud:goods-image__g1__img2__1.jpg',
            edit: { version: 1, frameId: 'wave' },
            editSourceRef: 'cloud:goods-image__g1__img2s__1.jpg'
          },
          { id: 'img3', ref: 'remote:https://example.com/external.jpg' }
        ]
      }],
      events: [{
        id: 'evt1',
        coverImage: 'cloud:event-cover__evt1__1.jpg',
        photos: [{ id: 'p1', ref: 'cloud:event-photo__evt1__p1__1.jpg' }]
      }],
      recharge: [{ id: 'r1', ref: 'cloud:recharge-image__r1__1.jpg' }],
      batchDrafts: [{
        id: 'collection',
        items: [{ id: 'q1', ref: 'cloud:batch-draft-image__collection__q1__1.jpg' }]
      }]
    })

    expect([...referencedFiles].sort()).toEqual([
      'batch-draft-image__collection__q1__1.jpg',
      'event-cover__evt1__1.jpg',
      'event-photo__evt1__p1__1.jpg',
      'goods-image__g1__img1__1.jpg',
      'goods-image__g1__img2__1.jpg',
      'goods-image__g1__img2s__1.jpg',
      'recharge-image__r1__1.jpg'
    ])
    expect(referencedFiles.has('external.jpg')).toBe(false)
    expect(ownedEntityIds.has('g1')).toBe(true)
    expect(ownedEntityIds.has('evt1')).toBe(true)
  })
})

describe('buildImageFilename 前缀覆盖', () => {
  it('默认商品图前缀', () => {
    const name = buildImageFilename({ id: 'g1', updatedAt: 1700000000000 }, { id: 'img_1' }, 'image/jpeg')
    expect(name).toBe('goods-image__g1__img_1__1700000000000.jpg')
  })

  it('单草稿图可用 batch-draft-image__ 前缀（实体 id 仍是草稿槽位）', () => {
    const name = buildImageFilename({ id: 'collection' }, { id: 'img_1' }, 'image/jpeg', 'batch-draft-image__')
    expect(name).toBe('batch-draft-image__collection__img_1__0.jpg')
  })

  it('底图前缀覆盖同样生效（第三段保留 s 后缀）', () => {
    const name = buildImageEditSourceFilename(
      { id: 'collection' }, { id: 'img_1' }, 'image/png', '', 'batch-draft-image__'
    )
    expect(name).toBe('batch-draft-image__collection__img_1s__0.png')
  })
})

describe('buildImageEditSourceFilename', () => {
  const item = { id: 'g1', updatedAt: 1700000000000 }
  const imageEntry = { id: 'img_1' }

  it('第三段与成品图不同：底图加 s 后缀', () => {
    const product = buildImageFilename(item, imageEntry, 'image/jpeg')
    const backing = buildImageEditSourceFilename(item, imageEntry, 'image/png')
    expect(product).toBe('goods-image__g1__img_1__1700000000000.jpg')
    expect(backing).toBe('goods-image__g1__img_1s__1700000000000.png')
    // 归属校验按 __ 切段匹配：前三段必须不同，否则两张图会被当成同一张的版本
    expect(backing.split('__').slice(0, 3)).not.toEqual(product.split('__').slice(0, 3))
  })

  it('已有云端文件名时原样复用（不因时间戳变化产生新文件）', () => {
    const existing = 'goods-image__g1__img_1s__1699999999999.jpg'
    expect(buildImageEditSourceFilename(item, {
      ...imageEntry,
      editSourceCloudFileName: existing
    }, 'image/png')).toBe(existing)
    expect(buildImageEditSourceFilename(item, {
      ...imageEntry,
      editSourceUri: `cloud-image://${existing}`
    }, 'image/png')).toBe(existing)
  })

  it('扩展名取自本机底图文件名（抠图保留 png 透明通道）', () => {
    const name = buildImageEditSourceFilename(item, imageEntry, '', 'user-images/edit_source_1.png')
    expect(name.endsWith('.png')).toBe(true)
  })
})

describe('buildProfileBackgroundFilename', () => {
  it('按 itemId 生成确定性文件名（重试上传覆盖同名文件）', () => {
    expect(buildProfileBackgroundFilename('bg_abc')).toBe('profile-bg__bg_abc__main.jpg')
    expect(buildProfileBackgroundFilename('bg_abc', 'image/png')).toBe('profile-bg__bg_abc__main.png')
    expect(buildProfileBackgroundFilename('bg_abc')).toBe(buildProfileBackgroundFilename('bg_abc'))
  })

  it('文件名首段是条目 id，孤儿回收可据此做归属校验', () => {
    const name = buildProfileBackgroundFilename('bg_abc')
    expect(name.slice('profile-bg__'.length).split('__')[0]).toBe('bg_abc')
  })

  it('collectReferencedImageState 登记背景图文件名与条目 id', () => {
    const { referencedFiles, ownedEntityIds } = collectReferencedImageState({
      collectionProfiles: {
        ipProfiles: {
          '明日方舟': {
            items: [{
              id: 'bg_abc',
              kind: 'image',
              cloudFileName: 'profile-bg__bg_abc__main.jpg'
            }]
          }
        }
      }
    })
    expect(referencedFiles.has('profile-bg__bg_abc__main.jpg')).toBe(true)
    expect(ownedEntityIds.has('bg_abc')).toBe(true)
  })
})
