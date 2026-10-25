// 精细导出回读：识别本地化表头，把 CSV / XLSX 还原成可交给 goodsStore 的谷子记录。
// 精细导出不是完整备份，只还原用户勾选的字段；记录类型、图片链接、记录 ID 始终写入。
import { CSV_SCHEMAS } from '@/utils/table/appDataCsv'
import { normalizeCustomFieldDefs } from '@/utils/goods/customFields'
import { parseCsv } from '@/utils/table/parseTable'
import { FINE_EXPORT_BASE_FIELDS } from '@/utils/table/exportFields'
import { FINE_EXPORT_XLSX_TITLE } from '@/utils/table/fineExportSerialize'

import enManage from '@/locales/en/manage.json'
import jaManage from '@/locales/ja/manage.json'
import koManage from '@/locales/ko/manage.json'
import zhCnManage from '@/locales/zh-CN/manage.json'
import zhTwManage from '@/locales/zh-TW/manage.json'

const LOCALE_MESSAGES = [zhCnManage, zhTwManage, enManage, jaManage, koManage]
const COVER_KEY = '__coverImage'
const CUSTOM_PREFIX = 'custom:'
const STANDARD_HEADER_KEYS = new Set(
  Object.values(CSV_SCHEMAS).flat().map((key) => normalizeFineExportHeader(key))
)

const RECORD_TYPE_WISHLIST = new Set(['wishlist', '1', 'true', 'yes', 'y'])
const RECORD_TYPE_COLLECTION = new Set(['collection', '0', 'false', 'no', 'n'])
const LINK_TEXT_VALUES = new Set(
  LOCALE_MESSAGES
    .map((messages) => normalizeFineExportHeader(messages['manage.fineExportLinkText']))
    .filter(Boolean)
)

let baseHeaderMap = null

export function normalizeFineExportHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase()
}

function addHeaderLabel(map, label, key) {
  const normalized = normalizeFineExportHeader(label)
  if (normalized && !map.has(normalized)) map.set(normalized, key)
}

function getBaseHeaderMap() {
  if (baseHeaderMap) return baseHeaderMap

  const map = new Map()
  for (const field of FINE_EXPORT_BASE_FIELDS) {
    for (const messages of LOCALE_MESSAGES) {
      addHeaderLabel(map, messages[field.labelKey], field.key)
      for (const aliasKey of field.headerAliases || []) {
        addHeaderLabel(map, messages[aliasKey], field.key)
      }
    }
    addHeaderLabel(map, field.label, field.key)
  }
  for (const messages of LOCALE_MESSAGES) {
    addHeaderLabel(map, messages['manage.fineExportCover'], COVER_KEY)
  }

  baseHeaderMap = map
  return baseHeaderMap
}

let recordTypeValueMap = null
function getRecordTypeValueMap() {
  if (recordTypeValueMap) return recordTypeValueMap

  const wishlist = new Set(RECORD_TYPE_WISHLIST)
  const collection = new Set(RECORD_TYPE_COLLECTION)
  for (const messages of LOCALE_MESSAGES) {
    const wishlistLabel = normalizeFineExportHeader(messages['manage.fineExportWishlist'])
    const collectionLabel = normalizeFineExportHeader(messages['manage.fineExportCollection'])
    if (wishlistLabel) wishlist.add(wishlistLabel)
    if (collectionLabel) collection.add(collectionLabel)
  }

  recordTypeValueMap = { wishlist, collection }
  return recordTypeValueMap
}

export function parseFineExportRecordType(value) {
  const normalized = normalizeFineExportHeader(value)
  if (!normalized) return null
  const { wishlist, collection } = getRecordTypeValueMap()
  if (wishlist.has(normalized)) return true
  if (collection.has(normalized)) return false
  return null
}

export function isFineExportFilename(filename) {
  const base = String(filename || '').split(/[\\/]/).pop().toLowerCase()
  if (!base) return false
  return LOCALE_MESSAGES
    .map((messages) => String(messages['manage.fineExportFilenamePrefix'] || '').trim().toLowerCase())
    .filter(Boolean)
    .some((prefix) => base.startsWith(`${prefix}_`) || base.includes(prefix))
}

function buildHeaderMap(customDefs = []) {
  const map = new Map(getBaseHeaderMap())
  for (const def of normalizeCustomFieldDefs(customDefs)) {
    addHeaderLabel(map, def.name, `${CUSTOM_PREFIX}${def.id}`)
  }
  return map
}

/**
 * 判断表头像不像精细导出，并给出列到字段的映射。
 * `unknownColumns` 是当前预设里不存在的自定义字段名，导入前可以自动补建。
 */
export function inspectFineExportColumns(headers, {
  customDefs = [],
  filename = '',
  title = ''
} = {}) {
  const headerMap = buildHeaderMap(customDefs)
  const columns = []
  const unknownColumns = []
  const seenKeys = new Set()
  let baseMatchCount = 0
  let exclusiveBaseMatchCount = 0
  let customMatchCount = 0

  const headerList = Array.isArray(headers) ? headers : []
  headerList.forEach((header, index) => {
    const name = String(header ?? '').trim()
    const normalized = normalizeFineExportHeader(name)
    if (!normalized) return

    const key = headerMap.get(normalized)
    if (key) {
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      columns.push({ index, key, header: name })

      if (key.startsWith(CUSTOM_PREFIX)) {
        customMatchCount += 1
      } else if (key !== COVER_KEY) {
        baseMatchCount += 1
        if (!STANDARD_HEADER_KEYS.has(normalized)) exclusiveBaseMatchCount += 1
      }
      return
    }

    if (!STANDARD_HEADER_KEYS.has(normalized)) {
      unknownColumns.push({ index, name })
    }
  })

  const coverColumnIndex = columns.find((column) => column.key === COVER_KEY)?.index ?? -1
  const hasStandardId = headerList.some((header) => normalizeFineExportHeader(header) === 'id')
  const filenameMatch = isFineExportFilename(filename)
  const titleMatch = String(title || '').trim() === FINE_EXPORT_XLSX_TITLE
  const hasBaseSignature = baseMatchCount > 0 || coverColumnIndex >= 0
  // 精细导出现在固定带 id 列，不能再用「是否有 id」判断；改用只属于精细导出的表头
  //（记录类型 / 图片链接 / 本地化字段名）避免把标准 CSV 误判成精细导出。
  const hasExclusiveSignature = exclusiveBaseMatchCount > 0 || coverColumnIndex >= 0
  const isFineExport = Boolean(
    titleMatch ||
    filenameMatch ||
    (hasBaseSignature && (hasExclusiveSignature || !hasStandardId))
  )

  return {
    columns,
    unknownColumns,
    coverColumnIndex,
    baseMatchCount,
    exclusiveBaseMatchCount,
    customMatchCount,
    hasStandardId,
    filenameMatch,
    titleMatch,
    isFineExport
  }
}

export function readFineExportCsvTable(text) {
  const { headers, rows } = parseCsv(text)
  return {
    headers,
    rows: rows.map((values, index) => ({ values, rowNumber: index + 2, links: {} }))
  }
}

function excelCellText(value) {
  if (value == null) return ''
  if (value instanceof Date) return formatExcelDate(value)
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(excelCellText).filter(Boolean).join('|')
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => String(part?.text ?? '')).join('').trim()
    }
    if (value.text != null) return String(value.text).trim()
    if (value.result != null) return String(value.result).trim()
    if (value.hyperlink) return String(value.hyperlink).trim()
  }
  return ''
}

function formatExcelDate(date) {
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function excelCellLink(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return String(value.hyperlink || '').trim()
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function imageMediaToDataUrl(media) {
  if (!media) return ''
  const extension = String(media.extension || 'png').toLowerCase()
  const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension || 'png'}`
  if (typeof media.base64 === 'string' && media.base64) {
    return media.base64.startsWith('data:') ? media.base64 : `data:${mime};base64,${media.base64}`
  }
  const bytes = toUint8Array(media.buffer)
  if (!bytes || bytes.length === 0) return ''
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

function mapEmbeddedCoverImages(worksheet, workbook, coverColumnIndex) {
  const result = new Map()
  for (const entry of worksheet.getImages()) {
    const tl = entry?.range?.tl
    if (!tl) continue

    const nativeCol = Number(tl.nativeCol)
    const colIndex = Number.isFinite(nativeCol) ? nativeCol : Math.floor(Number(tl.col))
    if (coverColumnIndex >= 0 && Number.isFinite(colIndex) && colIndex !== coverColumnIndex) continue

    const nativeRow = Number(tl.nativeRow)
    const rowIndex = Number.isFinite(nativeRow) ? nativeRow : Math.floor(Number(tl.row))
    if (!Number.isFinite(rowIndex)) continue

    const rowNumber = rowIndex + 1
    if (result.has(rowNumber)) continue

    const dataUrl = imageMediaToDataUrl(workbook.getImage(entry.imageId))
    if (dataUrl) result.set(rowNumber, dataUrl)
  }
  return result
}

function readWorksheetTable(worksheet) {
  const headers = []
  const columnCount = Math.max(worksheet.columnCount || 0, worksheet.getRow(1).cellCount || 0)
  for (let column = 1; column <= columnCount; column += 1) {
    headers[column - 1] = excelCellText(worksheet.getRow(1).getCell(column).value)
  }

  const rows = []
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const values = []
    const links = {}
    let hasValue = false

    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column)
      const text = excelCellText(cell.value)
      values[column - 1] = text
      if (text) hasValue = true
      const link = excelCellLink(cell.value)
      if (link) links[column - 1] = link
    }

    if (hasValue) rows.push({ values, links, rowNumber })
  }

  return { headers, rows }
}

export async function readFineExportXlsxTable(input, {
  customDefs = [],
  filename = ''
} = {}) {
  const module = await import('exceljs')
  const Workbook = module.Workbook || module.default?.Workbook || module.default
  if (!Workbook) throw new Error('EXCELJS_UNAVAILABLE')

  const workbook = new Workbook()
  await workbook.xlsx.load(input)
  const worksheet = workbook.worksheets?.[0]
  if (!worksheet) throw new Error('FINE_EXPORT_WORKSHEET_MISSING')

  const table = readWorksheetTable(worksheet)
  const inspection = inspectFineExportColumns(table.headers, {
    customDefs,
    filename,
    title: workbook.title
  })
  if (!inspection.isFineExport) return null

  table.title = workbook.title
  table.coverByRow = mapEmbeddedCoverImages(worksheet, workbook, inspection.coverColumnIndex)
  table.inspection = inspection
  return table
}

function splitListValue(value) {
  const text = String(value ?? '').trim()
  if (!text) return []
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean)
      }
    } catch {
      // 非 JSON 时按精细导出的 | 分隔格式继续解析
    }
  }
  return text.split('|').map((entry) => entry.trim()).filter(Boolean)
}

function parseInteger(value) {
  const number = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(number) ? number : undefined
}

function parseNumber(value) {
  const number = Number(String(value ?? '').trim())
  return Number.isFinite(number) ? number : undefined
}

function normalizeImageLinkValue(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '—') return ''
  if (LINK_TEXT_VALUES.has(normalizeFineExportHeader(text))) return ''
  return text
}

function normalizeCoverValue(value, link) {
  const url = String(link || '').trim()
  if (url) return url
  return normalizeImageLinkValue(value)
}

/**
 * 把识别出的表格行还原成 goodsStore 可导入的对象。
 * 日期、数字等保持文本/原生值交给 normalizeGoodsInput 统一处理。
 */
export function buildFineExportGoodsItems(table, inspection, {
  coverByRow = new Map()
} = {}) {
  const columns = Array.isArray(inspection?.columns) ? inspection.columns : []
  const rows = Array.isArray(table?.rows) ? table.rows : []
  const items = []

  for (const row of rows) {
    const values = Array.isArray(row?.values) ? row.values : []
    const links = row?.links || {}
    const rowNumber = Number(row?.rowNumber) || 0
    const item = {}
    const customFields = {}
    const imageLinks = []
    let embeddedCover = ''
    let hasContent = false

    for (const column of columns) {
      const { index, key } = column
      const text = String(values[index] ?? '').trim()

      if (key === COVER_KEY) {
        const cover = coverByRow.get(rowNumber) || normalizeCoverValue(text, links[index])
        if (cover) {
          embeddedCover = cover
          hasContent = true
        }
        continue
      }

      if (!text) {
        if (key === 'images' || key === 'coverImage') {
          const link = String(links[index] || '').trim()
          if (link) {
            imageLinks.push(link)
            hasContent = true
          }
        }
        continue
      }

      if (key === 'id') {
        item.id = text
        continue
      }

      if (key.startsWith(CUSTOM_PREFIX)) {
        customFields[key.slice(CUSTOM_PREFIX.length)] = text
        hasContent = true
        continue
      }

      if (key === 'recordType') {
        const isWishlist = parseFineExportRecordType(text)
        if (isWishlist != null) item.isWishlist = isWishlist
        continue
      }

      if (key === 'characters' || key === 'tags') {
        const list = splitListValue(text)
        if (list.length > 0) {
          item[key] = list
          hasContent = true
        }
        continue
      }

      if (key === 'quantity' || key === 'points') {
        const number = key === 'quantity' ? parseInteger(text) : parseNumber(text)
        if (number != null) {
          item[key] = number
          hasContent = true
        }
        continue
      }

      if (key === 'images' || key === 'coverImage') {
        const list = splitListValue(text)
          .map((entry, entryIndex) => normalizeImageLinkValue(entry) || (entryIndex === 0 ? String(links[index] || '').trim() : ''))
          .filter(Boolean)
        if (list.length > 0) {
          imageLinks.push(...list)
          hasContent = true
        }
        continue
      }

      item[key] = text
      hasContent = true
    }

    if (embeddedCover || coverByRow.get(rowNumber)) {
      imageLinks.unshift(embeddedCover || coverByRow.get(rowNumber))
    }
    const uniqueImages = [...new Set(imageLinks.filter(Boolean))]
    if (uniqueImages.length > 0) {
      item.images = uniqueImages.map((uri, index) => ({ uri, isPrimary: index === 0 }))
      item.coverImage = uniqueImages[0]
    }

    if (Object.keys(customFields).length > 0) item.customFields = customFields
    if (hasContent) items.push(item)
  }

  return items
}

export function getFineExportUnknownCustomFieldNames(inspection) {
  return (inspection?.unknownColumns || [])
    .map((column) => String(column?.name || '').trim())
    .filter(Boolean)
}
