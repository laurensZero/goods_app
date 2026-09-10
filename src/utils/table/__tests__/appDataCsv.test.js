// @ts-check
import { describe, it, expect } from 'vitest'
import {
  CSV_SCHEMAS,
  buildAppCsvFiles,
  packAppCsvZip,
  parseAppCsv,
  parseAppCsvFiles,
  rowsToCsv,
  unpackAppCsvZip
} from '../appDataCsv'

describe('appDataCsv', () => {
  it('rowsToCsv escapes commas/quotes and serializes arrays as JSON', () => {
    const csv = rowsToCsv(CSV_SCHEMAS.goods, [{
      name: 'A"B,C',
      characters: ['甲', '乙'],
      tags: ['x'],
      quantity: 2,
      isWishlist: true,
      price: '12.5'
    }])
    expect(csv).toContain('A""B,C')
    // JSON 数组经 CSV 转义后引号会双写
    expect(csv).toContain('""甲""')
    expect(csv).toContain('true')
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('parseAppCsv round-trips goods rows', () => {
    const csv = rowsToCsv(CSV_SCHEMAS.goods, [{
      name: '吧唧',
      category: '徽章',
      ip: '原神',
      characters: ['雷电将军'],
      tags: ['限定'],
      quantity: 2,
      isWishlist: false,
      price: '15',
      actualPrice: '12',
      collectStatus: '已拥有',
      note: '备注,含逗号',
      images: [
        { id: 'img1', uri: 'https://example.com/a.jpg', kind: 'primary', isPrimary: true },
        { id: 'img2', uri: 'https://example.com/b.jpg', kind: 'custom', isPrimary: false }
      ],
      coverImage: 'https://example.com/a.jpg',
      statusTimeline: [{ status: '已拥有', date: '2026-01-01' }]
    }])
    const { items, errors } = parseAppCsv(csv, 'goods')
    expect(errors).toHaveLength(0)
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('吧唧')
    expect(items[0].characters).toEqual(['雷电将军'])
    expect(items[0].tags).toEqual(['限定'])
    expect(items[0].quantity).toBe(2)
    expect(items[0].note).toBe('备注,含逗号')
    expect(items[0].statusTimeline).toEqual([{ status: '已拥有', date: '2026-01-01' }])
    expect(items[0].isWishlist).toBe(false)
    expect(Array.isArray(items[0].images)).toBe(true)
    expect(items[0].images).toHaveLength(2)
    expect(items[0].images[0].uri).toBe('https://example.com/a.jpg')
    expect(items[0].coverImage).toBe('https://example.com/a.jpg')
  })

  it('buildAppCsvFiles backfills coverImage from primary image', () => {
    const files = buildAppCsvFiles({
      goods: [{
        name: '有图谷子',
        images: [{ id: 'x', uri: 'https://cdn.example.com/cover.png', isPrimary: true, kind: 'primary' }]
      }]
    })
    const { items } = parseAppCsv(files['goods.csv'], 'goods')
    expect(items[0].coverImage).toBe('https://cdn.example.com/cover.png')
    expect(items[0].images[0].uri).toBe('https://cdn.example.com/cover.png')
  })

  it('rejects CSV without recognizable headers', () => {
    expect(() => parseAppCsv('foo,bar\n1,2\n')).toThrow('CSV_UNSTANDARD')
  })

  it('builds and unpacks a multi-table zip package', () => {
    const files = buildAppCsvFiles({
      goods: [{ name: '谷子A', isWishlist: false }],
      groups: [{ id: 'g1', name: '组1', type: 'collection' }],
      groupItems: [{ id: 'gi1', groupId: 'g1', goodsId: 'a', sortOrder: 1 }],
      events: [{ id: 'e1', name: '漫展', startDate: '2026-01-01', endDate: '2026-01-02', tracks: [{ title: '歌1' }] }],
      recharge: [{ id: 'r1', game: '原神', amount: 30, chargedAt: '2026-01-03' }],
      categories: [{ name: '吧唧' }],
      ips: [{ name: '原神' }],
      characters: [{ name: '雷电将军', ip: '原神' }],
      storageLocations: ['柜子/抽屉1']
    })
    expect(Object.keys(files).sort()).toEqual([
      'categories.csv',
      'characters.csv',
      'event_tracks.csv',
      'events.csv',
      'goods.csv',
      'goods_group_items.csv',
      'goods_groups.csv',
      'ips.csv',
      'recharge.csv',
      'storage_locations.csv'
    ])

    const zip = packAppCsvZip(files)
    const restored = unpackAppCsvZip(zip)
    const bySchema = parseAppCsvFiles(restored)
    expect(bySchema.goods.items[0].name).toBe('谷子A')
    expect(bySchema.goods_groups.items[0].name).toBe('组1')
    expect(bySchema.goods_group_items.items[0].goodsId).toBe('a')
    expect(bySchema.events.items[0].name).toBe('漫展')
    expect(bySchema.events.items[0].tracks?.[0]?.title).toBe('歌1')
    expect(bySchema.recharge.items[0].amount).toBe(30)
    expect(bySchema.categories.items[0].name).toBe('吧唧')
    expect(bySchema.characters.items[0].name).toBe('雷电将军')
    expect(bySchema.storage_locations.items[0].path).toBe('柜子/抽屉1')
  })

  it('parses single recharge csv by header sniffing', () => {
    const csv = 'id,game,itemName,amount,chargedAt,note,image,deleted,updatedAt\n' +
      'r1,原神,创世结晶,30,2026-01-01,,,false,1\n'
    const { schemaKey, items } = parseAppCsv(csv)
    expect(schemaKey).toBe('recharge')
    expect(items[0].amount).toBe(30)
  })
})
