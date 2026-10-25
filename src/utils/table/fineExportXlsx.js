// 精细导出 Excel：exceljs 惰性加载，封面图本地文件优先 → 降采样 ≤320px → 嵌入；
// 失败时写「点击查看」超链接。并发 4，四阶段进度，可取消。
import { readLocalImageAsDataUrl } from '@/utils/image/localImage'
import {
  getFineExportFieldRawValue,
  resolveFineExportCover
} from '@/utils/table/exportFields'
import { FINE_EXPORT_XLSX_TITLE } from '@/utils/table/fineExportSerialize'

const SOURCE_IMAGE_MAX_SIZE = 320
const IMAGE_BOX_SIZE = 112
const IMAGE_ROW_HEIGHT = 96
const COVER_COLUMN_WIDTH = 18
const TEXT_ROW_HEIGHT = 30
const HEADER_ROW_HEIGHT = 32
const IMAGE_CONCURRENCY = 4

const COLORS = {
  headerFill: 'FF18181B',
  headerText: 'FFFFFFFF',
  headerBorder: 'FF3F3F46',
  cellBorder: 'FFE7E7EA',
  zebraFill: 'FFF9F9FA',
  text: 'FF27272A',
  muted: 'FFA1A1AA',
  link: 'FF2563EB'
}

const INTEGER_FIELD_KEYS = new Set(['quantity', 'points'])
const DECIMAL_FIELD_KEYS = new Set([
  'price',
  'actualPrice',
  'shippingFee',
  'sellPrice',
  'sellFee'
])
const DATE_FIELD_KEYS = new Set(['acquiredAt', 'sellDate'])
const WRAP_FIELD_KEYS = new Set(['name', 'characters', 'tags', 'storageLocation', 'note', 'images'])
const CENTER_FIELD_KEYS = new Set([
  'recordType',
  'quantity',
  'collectStatus',
  'storageLocation',
  'acquiredAt',
  'currency',
  'sellDate'
])

function createAbortError() {
  const error = new Error('FINE_EXPORT_ABORTED')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

function splitDataUrl(dataUrl) {
  const text = String(dataUrl || '')
  const match = text.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null
  const mime = match[1].toLowerCase()
  const extension = mime === 'jpeg' || mime === 'jpg' ? 'jpeg' : mime === 'png' ? 'png' : 'png'
  return { base64: match[2], extension, mime }
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('IMAGE_UNAVAILABLE'))
      return
    }
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
    image.src = dataUrl
  })
}

/**
 * data URL → ≤320px 的 PNG（透明源）/ JPEG(q0.82)。
 * 同时返回目标宽高，Excel 里可以按原比例放进封面单元格。
 * 环境不支持 canvas 时退回原图，至少保证不阻塞导出。
 */
export async function prepareFineExportCoverImage(dataUrl) {
  const source = splitDataUrl(dataUrl)
  if (!source) return null

  try {
    const image = await loadImage(dataUrl)
    const width = Number(image.naturalWidth || image.width) || 0
    const height = Number(image.naturalHeight || image.height) || 0
    if (!width || !height) return { base64: source.base64, extension: source.extension }

    const keepTransparent = source.mime === 'png'
    if (width <= SOURCE_IMAGE_MAX_SIZE && height <= SOURCE_IMAGE_MAX_SIZE && keepTransparent) {
      return { base64: source.base64, extension: 'png', width, height }
    }

    const scale = Math.min(1, SOURCE_IMAGE_MAX_SIZE / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) return { base64: source.base64, extension: source.extension }

    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    const output = keepTransparent
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.82)
    const prepared = splitDataUrl(output)
    return prepared ? { ...prepared, width: targetWidth, height: targetHeight } : null
  } catch {
    return { base64: source.base64, extension: source.extension }
  }
}

async function buildCoverImages(items, { onProgress, signal }) {
  const total = items.length
  const prepared = new Array(total).fill(null)
  const failed = new Array(total).fill(false)
  let cursor = 0
  let done = 0

  const workerCount = Math.min(IMAGE_CONCURRENCY, total)
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      throwIfAborted(signal)
      const index = cursor
      cursor += 1
      if (index >= total) return

      const cover = resolveFineExportCover(items[index])
      if (cover.uri) {
        const dataUrl = await readLocalImageAsDataUrl(cover.uri, cover.localPath).catch(() => null)
        if (dataUrl) {
          throwIfAborted(signal)
          prepared[index] = await prepareFineExportCoverImage(dataUrl)
        }
        if (!prepared[index]) failed[index] = true
      }

      done += 1
      onProgress?.({
        stage: 'images',
        done,
        total,
        percent: 10 + Math.round((done / Math.max(1, total)) * 60)
      })
    }
  })

  await Promise.all(workers)
  return { prepared, failed }
}

function toUtcDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    return new Date(Date.UTC(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    ))
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text : date
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim())
}

/** Excel 单元格不写 data URL（会撑爆单元格/文件）；只保留可回读的远程或云端引用。 */
function toExcelImageLinks(raw) {
  return String(raw ?? '')
    .split('|')
    .map((value) => String(value || '').trim())
    .filter((value) => value && !value.startsWith('data:') && /^(https?:\/\/|cloud-image:\/\/|cloud:)/i.test(value))
    .join('|')
}

function toExcelValue(field, item) {
  const raw = getFineExportFieldRawValue(item, field)
  if (raw == null || raw === '') return ''
  if (field.key === 'images') return toExcelImageLinks(raw)

  if (INTEGER_FIELD_KEYS.has(field.key)) {
    const number = Number(raw)
    return Number.isFinite(number) ? Math.trunc(number) : String(raw)
  }
  if (DECIMAL_FIELD_KEYS.has(field.key)) {
    const number = Number(raw)
    return Number.isFinite(number) ? number : String(raw)
  }
  if (DATE_FIELD_KEYS.has(field.key)) return toUtcDate(raw)
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw
  return String(raw)
}

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function thinBorder(argb = COLORS.cellBorder) {
  return {
    top: { style: 'thin', color: { argb } },
    left: { style: 'thin', color: { argb } },
    bottom: { style: 'thin', color: { argb } },
    right: { style: 'thin', color: { argb } }
  }
}

function setLink(cell, url, text, { align = 'left', color = COLORS.link } = {}) {
  cell.value = { text, hyperlink: url, tooltip: url }
  cell.font = { name: 'Calibri', size: 10.5, color: { argb: color }, underline: true }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: false }
}

function applyHeaderStyle(cell) {
  cell.fill = solidFill(COLORS.headerFill)
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerText } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.headerBorder } },
    left: { style: 'thin', color: { argb: COLORS.headerBorder } },
    bottom: { style: 'medium', color: { argb: COLORS.headerBorder } },
    right: { style: 'thin', color: { argb: COLORS.headerBorder } }
  }
}

function applyDataStyle(cell, field, rowIndex, { cover = false } = {}) {
  cell.font = { name: 'Calibri', size: 10.5, color: { argb: COLORS.text } }
  cell.alignment = {
    vertical: 'middle',
    horizontal: cover ? 'center' : CENTER_FIELD_KEYS.has(field?.key) ? 'center' : 'left',
    wrapText: !cover && WRAP_FIELD_KEYS.has(field?.key)
  }
  cell.border = thinBorder()
  if (rowIndex % 2 === 1) cell.fill = solidFill(COLORS.zebraFill)

  if (!field) return
  if (DECIMAL_FIELD_KEYS.has(field.key)) {
    cell.alignment = { ...cell.alignment, horizontal: 'right' }
    cell.numFmt = '#,##0.00'
    return
  }
  if (INTEGER_FIELD_KEYS.has(field.key)) {
    cell.numFmt = '0'
    return
  }
  if (DATE_FIELD_KEYS.has(field.key)) {
    cell.numFmt = 'yyyy-mm-dd'
  }
}

function columnWidthToPixels(width) {
  return Math.floor(Number(width) * 7 + 5)
}

function rowHeightToPixels(height) {
  return (Number(height) * 96) / 72
}

function fitCoverBox(prepared) {
  const sourceWidth = Number(prepared?.width) > 0 ? Number(prepared.width) : IMAGE_BOX_SIZE
  const sourceHeight = Number(prepared?.height) > 0 ? Number(prepared.height) : IMAGE_BOX_SIZE
  const scale = Math.min(1, IMAGE_BOX_SIZE / Math.max(sourceWidth, sourceHeight))
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  }
}

function coverAnchor(rowNumber, drawWidth, drawHeight) {
  const columnPixels = columnWidthToPixels(COVER_COLUMN_WIDTH)
  const rowPixels = rowHeightToPixels(IMAGE_ROW_HEIGHT)
  const left = Math.max(0, (columnPixels - drawWidth) / 2)
  const top = Math.max(0, (rowPixels - drawHeight) / 2)
  return {
    col: left / columnPixels,
    row: rowNumber - 1 + top / rowPixels
  }
}

export async function createFineExportXlsx({
  items,
  fields,
  embedImages = false,
  onProgress,
  signal,
  coverLabel = '封面',
  linkText = '点击查看'
} = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const safeFields = Array.isArray(fields) ? fields.filter(Boolean) : []
  throwIfAborted(signal)

  onProgress?.({ stage: 'prepare', done: 0, total: safeItems.length, percent: 2 })

  const module = await import('exceljs')
  const Workbook = module.Workbook || module.default?.Workbook || module.default
  if (!Workbook) throw new Error('EXCELJS_UNAVAILABLE')

  const workbook = new Workbook()
  workbook.creator = 'GoodsApp'
  workbook.title = FINE_EXPORT_XLSX_TITLE
  workbook.created = new Date()
  workbook.modified = new Date()
  const worksheet = workbook.addWorksheet('谷子')

  const columns = []
  if (embedImages) {
    columns.push({ header: coverLabel, key: '__cover', width: COVER_COLUMN_WIDTH })
  }
  for (const field of safeFields) {
    columns.push({
      header: field.label || field.labelKey || field.key,
      key: field.key,
      width: field.key === 'images' ? 42 : field.width || 18
    })
  }
  worksheet.columns = columns

  const headerRow = worksheet.getRow(1)
  headerRow.height = HEADER_ROW_HEIGHT
  for (let column = 1; column <= columns.length; column += 1) {
    applyHeaderStyle(headerRow.getCell(column))
  }

  worksheet.views = [{
    state: 'frozen',
    xSplit: embedImages ? 2 : 1,
    ySplit: 1,
    showGridLines: false
  }]
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  }
  worksheet.properties.defaultRowHeight = TEXT_ROW_HEIGHT
  worksheet.properties.tabColor = { argb: COLORS.headerFill }
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2
    }
  }
  worksheet.headerFooter = { oddFooter: '&C&8GoodsApp' }

  let coverImages = { prepared: [], failed: [] }
  if (embedImages && safeItems.length > 0) {
    coverImages = await buildCoverImages(safeItems, { onProgress, signal })
  }
  throwIfAborted(signal)

  onProgress?.({ stage: 'build', done: 0, total: safeItems.length, percent: 74 })

  const fieldOffset = embedImages ? 1 : 0
  safeItems.forEach((item, index) => {
    const values = safeFields.map((field) => toExcelValue(field, item))
    const rowValues = embedImages ? ['', ...values] : values
    const row = worksheet.addRow(rowValues)
    row.height = embedImages ? IMAGE_ROW_HEIGHT : TEXT_ROW_HEIGHT

    for (let column = 1; column <= columns.length; column += 1) {
      const field = safeFields[column - 1 - fieldOffset]
      applyDataStyle(row.getCell(column), field, index, { cover: column <= fieldOffset })
    }

    // 「图片链接」在 Excel 里只写远程/云端链接；本地 data URL 交给封面嵌图，避免单元格超长。
    safeFields.forEach((field, fieldIndex) => {
      if (field.key !== 'images') return
      const cell = row.getCell(fieldOffset + fieldIndex + 1)
      const text = String(values[fieldIndex] || '').trim()
      if (!text) {
        cell.value = '—'
        cell.font = { name: 'Calibri', size: 10.5, color: { argb: COLORS.muted } }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        return
      }

      const links = text.split('|').map((value) => value.trim()).filter(Boolean)
      if (links.length === 1 && isExternalUrl(links[0])) {
        setLink(cell, links[0], linkText)
        return
      }

      cell.value = text
      cell.font = { name: 'Calibri', size: 10.5, color: { argb: COLORS.link } }
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    })

    if (!embedImages) return

    const coverCell = row.getCell(1)
    const cover = resolveFineExportCover(item)
    const prepared = coverImages.prepared[index]
    if (prepared) {
      const fit = fitCoverBox(prepared)
      const imageId = workbook.addImage({
        base64: prepared.base64,
        extension: prepared.extension === 'png' ? 'png' : 'jpeg'
      })
      worksheet.addImage(imageId, {
        tl: coverAnchor(row.number, fit.width, fit.height),
        ext: { width: fit.width, height: fit.height },
        editAs: 'oneCell',
        ...(isExternalUrl(cover.uri)
          ? { hyperlinks: { hyperlink: cover.uri, tooltip: cover.uri } }
          : {})
      })
      return
    }

    if (isExternalUrl(cover.uri)) {
      setLink(coverCell, cover.uri, linkText, { align: 'center' })
      return
    }

    coverCell.value = '—'
    coverCell.font = { name: 'Calibri', size: 10.5, color: { argb: COLORS.muted } }
    coverCell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  throwIfAborted(signal)
  onProgress?.({ stage: 'save', done: safeItems.length, total: safeItems.length, percent: 92 })

  const buffer = await workbook.xlsx.writeBuffer()
  onProgress?.({ stage: 'done', done: safeItems.length, total: safeItems.length, percent: 100 })

  if (buffer instanceof Uint8Array) return buffer
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer)
  return new Uint8Array(buffer)
}
