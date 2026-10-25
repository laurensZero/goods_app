// 精细导出 CSV 序列化与文件名（纯函数）
import { getFineExportFieldValue } from '@/utils/table/exportFields'

export const FINE_EXPORT_CSV_MIME = 'text/csv;charset=utf-8'
export const FINE_EXPORT_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const FINE_EXPORT_XLSX_TITLE = 'GoodsApp Fine Export'

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function resolveFieldLabel(field) {
  return String(field?.label || field?.labelKey || field?.key || '').trim()
}

/** Excel/CSV 表头不写字段 key，写当前语言 label（自定义字段就是字段名）。 */
export function serializeFineExportCsv(items, fields, { bom = true } = {}) {
  const safeFields = Array.isArray(fields) ? fields.filter(Boolean) : []
  const safeItems = Array.isArray(items) ? items : []
  const lines = []

  lines.push(safeFields.map((field) => escapeCsvCell(resolveFieldLabel(field))).join(','))
  for (const item of safeItems) {
    lines.push(
      safeFields
        .map((field) => escapeCsvCell(getFineExportFieldValue(item, field)))
        .join(',')
    )
  }

  return `${bom ? '\uFEFF' : ''}${lines.join('\r\n')}`
}

function normalizeDatePart(date) {
  if (typeof date === 'string') {
    const matched = date.match(/^\d{4}-\d{2}-\d{2}/)
    if (matched) return matched[0]
    const parsed = new Date(date)
    if (Number.isFinite(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = String(parsed.getMonth() + 1).padStart(2, '0')
      const day = String(parsed.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  const resolved = date instanceof Date ? date : new Date()
  if (!Number.isFinite(resolved.getTime())) return new Date().toISOString().slice(0, 10)
  const year = resolved.getFullYear()
  const month = String(resolved.getMonth() + 1).padStart(2, '0')
  const day = String(resolved.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildFineExportFilename({
  format = 'csv',
  date = new Date(),
  prefix = '谷子精细导出'
} = {}) {
  const safePrefix = sanitizeFilenamePart(prefix) || '谷子精细导出'
  const extension = format === 'xlsx' ? 'xlsx' : 'csv'
  return `${safePrefix}_${normalizeDatePart(date)}.${extension}`
}
