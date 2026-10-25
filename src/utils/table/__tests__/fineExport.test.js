import { describe, expect, it } from 'vitest'
import {
  buildFineExportFields,
  collectFineExportCharacterOptions,
  collectFineExportFilterOptions,
  collectFineExportImageUris,
  countFineExportUnits,
  createDefaultFineExportConfig,
  getFineExportFieldRawValue,
  getFineExportFieldValue,
  matchesFineExportFilters,
  normalizeFineExportConfig,
  resolveFineExportCover
} from '@/utils/table/exportFields'
import {
  buildFineExportFilename,
  serializeFineExportCsv
} from '@/utils/table/fineExportSerialize'

const CUSTOM_DEFS = [
  { id: 'cf_condition', name: '品相', type: 'text', options: [], scopes: ['collection', 'wishlist'] },
  { id: 'cf_wish', name: '愿望优先级', type: 'select', options: ['高'], scopes: ['wishlist'] }
]

function item(overrides = {}) {
  return {
    id: 'g1',
    name: '吧唧',
    category: '徽章',
    ip: '原神',
    characters: ['芙宁娜', '那维莱特'],
    tags: ['限定', '特典'],
    quantity: 3,
    collectStatus: '已拥有',
    customFields: { cf_condition: '全新', cf_wish: '高' },
    images: [],
    ...overrides
  }
}

function findField(fields, key) {
  return fields.find((field) => field.key === key)
}

describe('fine export field registry', () => {
  it('expands custom fields and resolves their values', () => {
    const fields = buildFineExportFields(CUSTOM_DEFS)
    const condition = findField(fields, 'custom:cf_condition')
    expect(condition?.label).toBe('品相')
    expect(getFineExportFieldValue(item(), condition)).toBe('全新')
  })

  it('filters custom fields by scope', () => {
    const collectionFields = buildFineExportFields(CUSTOM_DEFS, { scope: 'collection' })
    expect(findField(collectionFields, 'custom:cf_condition')).toBeTruthy()
    expect(findField(collectionFields, 'custom:cf_wish')).toBeFalsy()

    const wishlistFields = buildFineExportFields(CUSTOM_DEFS, { scope: 'wishlist' })
    expect(findField(wishlistFields, 'custom:cf_wish')).toBeTruthy()
  })

  it('leaves custom field blank when the item list does not match its scopes', () => {
    const fields = buildFineExportFields(CUSTOM_DEFS)
    const wishField = findField(fields, 'custom:cf_wish')
    expect(getFineExportFieldValue(item({ isWishlist: false }), wishField)).toBe('')
    expect(getFineExportFieldValue(item({ isWishlist: true }), wishField)).toBe('高')
  })

  it('writes a localized record type value', () => {
    const fields = buildFineExportFields([])
    const field = findField(fields, 'recordType')
    const wishlist = getFineExportFieldValue(item({ isWishlist: true }), field)
    const collection = getFineExportFieldValue(item({ isWishlist: false }), field)

    expect(wishlist).not.toBe('manage.fineExportWishlist')
    expect(collection).not.toBe('manage.fineExportCollection')
    expect(wishlist).not.toBe(collection)
  })

  it('joins array fields with a pipe', () => {
    const fields = buildFineExportFields([])
    expect(getFineExportFieldValue(item(), findField(fields, 'characters'))).toBe('芙宁娜|那维莱特')
    expect(getFineExportFieldValue(item(), findField(fields, 'tags'))).toBe('限定|特典')
  })

  it('always exports internal id and all image urls, primary first', () => {
    const fields = buildFineExportFields([])
    const idField = findField(fields, 'id')
    const imagesField = findField(fields, 'images')
    expect(idField?.locked).toBe(true)
    expect(imagesField?.locked).toBe(true)

    const source = item({
      id: 'g9',
      coverImage: 'https://example.com/legacy.jpg',
      images: [
        { uri: 'https://example.com/detail.jpg' },
        { uri: 'https://example.com/primary.jpg', isPrimary: true },
        { uri: 'https://example.com/detail.jpg' }
      ]
    })
    expect(collectFineExportImageUris(source)).toEqual([
      'https://example.com/primary.jpg',
      'https://example.com/detail.jpg'
    ])
    expect(getFineExportFieldValue(source, imagesField)).toBe(
      'https://example.com/primary.jpg|https://example.com/detail.jpg'
    )
    expect(getFineExportFieldValue(source, idField)).toBe('g9')
  })

  it('keeps native numbers for Excel while CSV still receives strings', () => {
    const fields = buildFineExportFields([])
    const source = item({ quantity: 3, price: 68, actualPrice: 61.33, acquiredAt: '2026-10-20' })
    expect(getFineExportFieldRawValue(source, findField(fields, 'quantity'))).toBe(3)
    expect(getFineExportFieldRawValue(source, findField(fields, 'price'))).toBe(68)
    expect(getFineExportFieldRawValue(source, findField(fields, 'actualPrice'))).toBe(61.33)
    expect(getFineExportFieldRawValue(source, findField(fields, 'acquiredAt'))).toBe('2026-10-20')
    expect(getFineExportFieldValue(source, findField(fields, 'quantity'))).toBe('3')
    expect(getFineExportFieldValue(source, findField(fields, 'actualPrice'))).toBe('61.33')
  })

  it('resolves covers with the documented fallback chain and keeps localPath', () => {
    const withPrimary = item({
      coverImage: 'https://example.com/cover.jpg',
      image: 'https://example.com/legacy.jpg',
      images: [
        { uri: 'https://example.com/detail.jpg', localPath: 'user-images/detail.jpg' },
        { uri: 'https://example.com/primary.jpg', localPath: 'user-images/primary.jpg', isPrimary: true }
      ]
    })
    expect(resolveFineExportCover(withPrimary)).toEqual({
      uri: 'https://example.com/primary.jpg',
      localPath: 'user-images/primary.jpg'
    })

    const coverFallback = item({ coverImage: 'https://example.com/cover.jpg', images: [] })
    expect(resolveFineExportCover(coverFallback).uri).toBe('https://example.com/cover.jpg')

    const imageFallback = item({ coverImage: '', image: 'https://example.com/legacy.jpg', images: [] })
    expect(resolveFineExportCover(imageFallback).uri).toBe('https://example.com/legacy.jpg')

    const firstImage = item({ images: [{ uri: 'https://example.com/only.jpg' }] })
    expect(resolveFineExportCover(firstImage).uri).toBe('https://example.com/only.jpg')
  })
})

describe('fine export filters and counts', () => {
  it('filters keyword, category, ip, character and status with AND semantics', () => {
    const target = item({ searchText: '吧唧\n徽章\n原神\n芙宁娜\nbaji' })
    expect(matchesFineExportFilters(target, { keyword: 'baji' })).toBe(true)
    expect(matchesFineExportFilters(target, { categories: ['徽章'] })).toBe(true)
    expect(matchesFineExportFilters(target, { ips: ['崩铁'] })).toBe(false)
    expect(matchesFineExportFilters(target, { characters: ['芙宁娜', '胡桃'] })).toBe(true)
    expect(matchesFineExportFilters(target, { statuses: ['已拥有'] })).toBe(true)
    expect(matchesFineExportFilters(target, { statuses: ['已出'] })).toBe(false)
  })

  it('counts records and units separately', () => {
    expect(countFineExportUnits([item({ quantity: 3 }), item({ quantity: 2 })])).toBe(5)
    expect(countFineExportUnits([item({ quantity: 0 })])).toBe(1)
  })

  it('collects filter options from presets and actual goods', () => {
    const options = collectFineExportFilterOptions(
      [item({ category: '立牌', ip: '崩铁', characters: ['流萤'] })],
      { categories: ['徽章'], ips: ['原神'], characters: [{ name: '芙宁娜', ip: '原神' }] }
    )
    expect(options.categories).toEqual(['徽章', '立牌'])
    expect(options.ips).toEqual(['原神', '崩铁'])
    expect(options.characters).toEqual(['芙宁娜', '流萤'])
  })

  it('narrows character options when IPs are selected', () => {
    const items = [
      item({ id: 'g1', ip: '原神', characters: ['芙宁娜'] }),
      item({ id: 'g2', ip: '崩铁', characters: ['流萤', '停云'] })
    ]
    const presets = {
      characters: [
        { name: '胡桃', ip: '原神' },
        { name: '三月七', ip: '崩铁' },
        { name: '无 IP 角色', ip: '' }
      ]
    }

    expect(collectFineExportCharacterOptions(items, presets)).toEqual(
      expect.arrayContaining(['芙宁娜', '流萤', '停云', '胡桃', '三月七', '无 IP 角色'])
    )

    const genshinOnly = collectFineExportCharacterOptions(items, presets, ['原神'])
    expect(genshinOnly).toHaveLength(2)
    expect(genshinOnly).toEqual(expect.arrayContaining(['芙宁娜', '胡桃']))
    expect(genshinOnly).not.toContain('流萤')
  })
})

describe('fine export config normalization', () => {
  it('drops custom field keys whose definitions were removed', () => {
    const config = normalizeFineExportConfig(
      {
        fields: ['name', 'custom:cf_condition', 'custom:cf_deleted'],
        filters: { keyword: ' 吧唧 ', statuses: ['已拥有', '不存在'] },
        format: 'xlsx',
        embedImages: false
      },
      { customDefs: CUSTOM_DEFS }
    )
    expect(config.fields).toEqual(['name', 'custom:cf_condition'])
    expect(config.filters.keyword).toBe('吧唧')
    expect(config.filters.statuses).toEqual(['已拥有'])
    expect(config.format).toBe('xlsx')
    expect(config.embedImages).toBe(false)
  })

  it('falls back to defaults for a missing config and keeps all statuses valid', () => {
    const config = normalizeFineExportConfig(null, { customDefs: [] })
    expect(config).toEqual({ ...createDefaultFineExportConfig(), filters: createDefaultFineExportConfig().filters })
    expect(config.fields).toContain('currency')
  })

  it('keeps locked internal fields out of the saved selection', () => {
    const config = normalizeFineExportConfig(
      { fields: ['name', 'id', 'images', 'recordType', 'coverImage'] },
      { customDefs: [] }
    )
    expect(config.fields).toEqual(['name'])
  })
})

describe('fine export CSV and filename', () => {
  it('writes BOM, CRLF, quotes escaping and pipe-joined arrays', () => {
    const fields = buildFineExportFields([]).filter((field) =>
      ['name', 'characters', 'note'].includes(field.key)
    )
    const csv = serializeFineExportCsv(
      [item({ name: '吧唧,"限定"', note: '第一行\n第二行' })],
      fields
    )
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('谷子名称,角色,备注')
    expect(csv).toContain('"吧唧,""限定"""')
    expect(csv).toContain('芙宁娜|那维莱特')
    expect(csv).toContain('"第一行\n第二行"')
    expect(csv).toContain('\r\n')
  })

  it('builds date-stamped filenames for both formats', () => {
    expect(buildFineExportFilename({ format: 'csv', date: '2026-10-25T08:00:00Z', prefix: '谷子精细导出' }))
      .toBe('谷子精细导出_2026-10-25.csv')
    expect(buildFineExportFilename({ format: 'xlsx', date: new Date(2026, 9, 25), prefix: '谷子/精细' }))
      .toBe('谷子_精细_2026-10-25.xlsx')
  })
})
