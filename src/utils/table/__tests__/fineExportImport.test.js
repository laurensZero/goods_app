import { describe, expect, it } from 'vitest'
import {
  buildFineExportGoodsItems,
  inspectFineExportColumns,
  parseFineExportRecordType,
  readFineExportCsvTable,
  readFineExportXlsxTable
} from '@/utils/table/fineExportImport'

const CUSTOM_DEFS = [
  { id: 'cf_condition', name: '品相', type: 'text', options: [], scopes: ['collection', 'wishlist'] }
]

describe('fine export import mapping', () => {
  it('maps localized headers and custom fields', () => {
    const headers = ['封面', '谷子名称', '记录类型', '角色', '标签', '数量', '实付价', '购买日期', '图片链接', '记录 ID', '品相']
    const inspection = inspectFineExportColumns(headers, {
      customDefs: CUSTOM_DEFS,
      filename: '谷子精细导出_2026-10-25.csv'
    })

    expect(inspection.isFineExport).toBe(true)
    expect(inspection.coverColumnIndex).toBe(0)
    expect(inspection.unknownColumns).toEqual([])
    expect(inspection.columns.map((column) => column.key)).toEqual([
      '__coverImage',
      'name',
      'recordType',
      'characters',
      'tags',
      'quantity',
      'actualPrice',
      'acquiredAt',
      'images',
      'id',
      'custom:cf_condition'
    ])
  })

  it('rebuilds item values including type, lists, custom fields, multiple images and ids', () => {
    const table = {
      headers: ['封面', '谷子名称', '记录类型', '角色', '标签', '数量', '实付价', '购买日期', '图片链接', '记录 ID', '品相'],
      rows: [{
        rowNumber: 2,
        values: [
          '',
          '吧唧',
          '心愿',
          '芙宁娜|那维莱特',
          '限定|特典',
          '3',
          '61.33',
          '2026-10-20',
          'https://example.com/front.png|https://example.com/back.png',
          'g1',
          '全新'
        ],
        links: {}
      }]
    }
    const inspection = inspectFineExportColumns(table.headers, {
      customDefs: CUSTOM_DEFS,
      filename: '谷子精细导出_2026-10-25.csv'
    })
    const items = buildFineExportGoodsItems(table, inspection, {
      coverByRow: new Map([[2, 'data:image/png;base64,cover']])
    })

    expect(items).toEqual([{
      id: 'g1',
      coverImage: 'data:image/png;base64,cover',
      images: [
        { uri: 'data:image/png;base64,cover', isPrimary: true },
        { uri: 'https://example.com/front.png', isPrimary: false },
        { uri: 'https://example.com/back.png', isPrimary: false }
      ],
      name: '吧唧',
      isWishlist: true,
      characters: ['芙宁娜', '那维莱特'],
      tags: ['限定', '特典'],
      quantity: 3,
      actualPrice: '61.33',
      acquiredAt: '2026-10-20',
      customFields: { cf_condition: '全新' }
    }])
  })

  it('recognizes headers written in another locale', () => {
    const headers = ['Item name', 'Record type', 'Characters', 'Quantity', 'Cover URL']
    const inspection = inspectFineExportColumns(headers, {
      customDefs: [],
      filename: 'goods-fine-export_2026-10-25.csv'
    })
    expect(inspection.isFineExport).toBe(true)

    const items = buildFineExportGoodsItems({
      headers,
      rows: [{
        rowNumber: 2,
        values: ['Pin', 'Wishlist', 'A|B', '2', 'https://example.com/pin.png'],
        links: {}
      }]
    }, inspection)

    expect(items[0]).toMatchObject({
      name: 'Pin',
      isWishlist: true,
      characters: ['A', 'B'],
      quantity: 2,
      coverImage: 'https://example.com/pin.png',
      images: [{ uri: 'https://example.com/pin.png', isPrimary: true }]
    })
  })

  it('does not mistake a standard goods CSV for a fine export', () => {
    const inspection = inspectFineExportColumns(['id', 'name', 'ip', 'category', 'characters'], {
      customDefs: [],
      filename: 'goods.csv'
    })
    expect(inspection.isFineExport).toBe(false)
  })

  it('detects a renamed fine export even though it includes an id column', () => {
    const inspection = inspectFineExportColumns(['谷子名称', '记录类型', '图片链接', '记录 ID'], {
      customDefs: [],
      filename: 'renamed.csv'
    })
    expect(inspection.isFineExport).toBe(true)
    expect(inspection.columns.map((column) => column.key)).toEqual(['name', 'recordType', 'images', 'id'])
  })

  it('detects custom-only files by filename and maps them after presets are created', () => {
    const headers = ['品相', '愿望优先级']
    const initial = inspectFineExportColumns(headers, {
      customDefs: [],
      filename: '谷子精细导出_2026-10-25.csv'
    })
    expect(initial.isFineExport).toBe(true)
    expect(initial.unknownColumns.map((column) => column.name)).toEqual(['品相', '愿望优先级'])

    const createdDefs = [
      { id: 'cf_condition', name: '品相', type: 'text', options: [], scopes: ['collection', 'wishlist'] },
      { id: 'cf_priority', name: '愿望优先级', type: 'text', options: [], scopes: ['collection', 'wishlist'] }
    ]
    const inspection = inspectFineExportColumns(headers, {
      customDefs: createdDefs,
      filename: '谷子精细导出_2026-10-25.csv'
    })
    const items = buildFineExportGoodsItems({
      headers,
      rows: [{ rowNumber: 2, values: ['全新', '高'], links: {} }]
    }, inspection)

    expect(items[0]).toEqual({
      customFields: { cf_condition: '全新', cf_priority: '高' }
    })
  })

  it('parses record type labels and stable tokens', () => {
    expect(parseFineExportRecordType('心愿')).toBe(true)
    expect(parseFineExportRecordType('Wishlist')).toBe(true)
    expect(parseFineExportRecordType('收藏')).toBe(false)
    expect(parseFineExportRecordType('Collection')).toBe(false)
    expect(parseFineExportRecordType('')).toBeNull()
  })

  it('reads fine-export CSV text with BOM and CRLF', () => {
    const table = readFineExportCsvTable(
      '\uFEFF谷子名称,记录类型\r\n吧唧,收藏\r\n'
    )
    expect(table.headers).toEqual(['谷子名称', '记录类型'])
    expect(table.rows[0].values).toEqual(['吧唧', '收藏'])
  })

  it('reads fine-export XLSX values, dates and embedded covers', async () => {
    const module = await import('exceljs')
    const Workbook = module.Workbook || module.default?.Workbook || module.default
    const workbook = new Workbook()
    workbook.title = 'GoodsApp Fine Export'
    const worksheet = workbook.addWorksheet('谷子')
    worksheet.addRow(['封面', '谷子名称', '记录类型', '购买日期'])
    worksheet.addRow(['', '吧唧', '心愿', new Date(Date.UTC(2026, 9, 20))])

    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw7iSAAAAABJRU5ErkJggg=='
    const imageId = workbook.addImage({ base64: png, extension: 'png' })
    worksheet.addImage(imageId, {
      tl: { col: 0.1, row: 1.1 },
      ext: { width: 24, height: 24 }
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const table = await readFineExportXlsxTable(buffer, {
      customDefs: [],
      filename: 'whatever.xlsx'
    })

    expect(table?.headers).toEqual(['封面', '谷子名称', '记录类型', '购买日期'])
    expect(table?.rows[0].values).toEqual(['', '吧唧', '心愿', '2026-10-20'])
    expect(table?.coverByRow.get(2)).toMatch(/^data:image\/png;base64,/)
  })
})
