// @ts-check
/**
 * 通用表格解析：CSV / XLSX → { headers, rows }
 * 供 AI 表格导入工具使用；不绑定淘宝等特定业务格式。
 */
import { unzipSync, strFromU8 } from 'fflate'

/** @typedef {{ headers: string[], rows: string[][] }} ParsedTable */

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * 解析 CSV 文本（支持引号字段、自定义/自动分隔符、BOM）。
 * @param {string} text
 * @param {string} [delimiter] 显式分隔符；缺省自动探测 , ; \t
 * @returns {ParsedTable}
 */
export function parseCsv(text, delimiter) {
  const raw = String(text || '').replace(/^\\uFEFF/, '')
  if (!raw.trim()) throw new Error('CSV 内容为空')
  const delim = delimiter || detectDelimiter(raw)
  const rows = splitCsvRows(raw, delim)
  if (rows.length === 0) throw new Error('CSV 没有可解析的行')
  const headers = (rows[0] || []).map((cell) => String(cell ?? '').trim())
  if (!headers.some(Boolean)) throw new Error('CSV 首行（表头）为空')
  const dataRows = rows
    .slice(1)
    .map((row) => headers.map((_, i) => String(row[i] ?? '').trim()))
    .filter((row) => row.some(Boolean))
  return { headers, rows: dataRows }
}

/** @param {string} text */
function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n')
  const candidates = [',', '\t', ';']
  let best = ','
  let bestScore = -1
  for (const d of candidates) {
    const score = sample.split(d).length
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/**
 * 逐字符扫描解析：处理引号包裹、引号内分隔符/换行、双引号转义。
 * @param {string} text
 * @param {string} delim
 * @returns {string[][]}
 */
function splitCsvRows(text, delim) {
  /** @type {string[][]} */
  const rows = []
  /** @type {string[]} */
  let row = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delim) {
      row.push(cell)
      cell = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i += 1
      continue
    }
    cell += ch
    i += 1
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => String(c).trim()))
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

/**
 * 解析 .xlsx（Open XML）：sharedStrings + inlineStr + 数值。
 * 取第一个工作表；首行视为表头。
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {ParsedTable}
 */
export function parseXlsx(input) {
  const uint8 = input instanceof Uint8Array ? input : new Uint8Array(input)
  /** @type {Record<string, Uint8Array>} */
  let files
  try {
    files = unzipSync(uint8)
  } catch {
    throw new Error('文件解压失败，请确认是有效的 .xlsx 文件')
  }
  const sheetEntry = files['xl/worksheets/sheet1.xml']
  if (!sheetEntry) throw new Error('未找到工作表数据，文件格式不支持')
  const sheetXml = strFromU8(sheetEntry)
  const sharedStrings = parseSharedStringsXml(
    files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : ''
  )
  const sparseRows = parseSheetXml(sheetXml, sharedStrings)
  if (sparseRows.length === 0) throw new Error('工作表没有数据')

  // 稀疏列 → 稠密二维数组
  const colIndices = new Set()
  for (const cells of sparseRows) {
    for (const key of Object.keys(cells)) colIndices.add(key)
  }
  const sortedCols = [...colIndices].sort(compareColLetters)
  const dense = sparseRows.map((cells) => sortedCols.map((col) => cells[col] ?? ''))

  const headers = (dense[0] || []).map((cell) => String(cell).trim())
  if (!headers.some(Boolean)) throw new Error('工作表首行（表头）为空')
  const rows = dense
    .slice(1)
    .map((row) => headers.map((_, i) => String(row[i] ?? '').trim()))
    .filter((row) => row.some(Boolean))
  return { headers, rows }
}

/** @param {string} xml */
function parseSharedStringsXml(xml) {
  if (!xml) return []
  /** @type {string[]} */
  const result = []
  for (const siBlock of xml.matchAll(/<si>[\s\S]*?<\/si>/g)) {
    const texts = []
    for (const m of siBlock[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      texts.push(decodeXml(m[1]))
    }
    result.push(texts.join(''))
  }
  return result
}

/**
 * @param {string} sheetXml
 * @param {string[]} sharedStrings
 * @returns {Array<Record<string, string>>}
 */
function parseSheetXml(sheetXml, sharedStrings) {
  /** @type {Array<Record<string, string>>} */
  const rows = []
  for (const rowMatch of sheetXml.matchAll(/<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = parseInt(rowMatch[1], 10) - 1
    /** @type {Record<string, string>} */
    const cells = {}
    for (const cellMatch of rowMatch[2].matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
      const col = cellMatch[1]
      const attrs = cellMatch[2]
      const inner = cellMatch[3] || ''
      let val = ''
      // inlineStr：值在 <is><t> 里
      const isMatch = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)
      if (isMatch) {
        cells[col] = decodeXml(isMatch[1])
        continue
      }
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/)
      if (!vMatch) {
        cells[col] = ''
        continue
      }
      if (attrs.includes('t="s"') && sharedStrings.length) {
        val = sharedStrings[parseInt(vMatch[1], 10)] || ''
      } else if (attrs.includes('t="str"') || attrs.includes('t="inlineStr"')) {
        val = decodeXml(vMatch[1])
      } else {
        val = vMatch[1]
      }
      cells[col] = val
    }
    if (Object.keys(cells).length > 0) rows[rowIdx] = cells
  }
  return rows.filter(Boolean)
}

/** @param {string} text */
function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** 列字母比较：A < B < … < Z < AA */
function compareColLetters(a, b) {
  return colToIndex(a) - colToIndex(b)
}

/** @param {string} letters A, B, … AA, AB */
function colToIndex(letters) {
  let n = 0
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

// ── 统一入口 ──────────────────────────────────────────────────────────────────

/**
 * 按文件名/内容分发解析。
 * @param {string} filename
 * @param {ArrayBuffer|string} content xlsx 传 ArrayBuffer；csv 传文本
 * @returns {ParsedTable}
 */
export function parseTableFile(filename, content) {
  const name = String(filename || '').toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.tsv') || typeof content === 'string') {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(/** @type {ArrayBuffer} */ (content))
    return parseCsv(text, name.endsWith('.tsv') ? '\t' : undefined)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    if (typeof content === 'string') {
      // 容错：误传 base64/文本时仍尝试当二进制
      throw new Error('xlsx 需要二进制内容（ArrayBuffer）')
    }
    return parseXlsx(content)
  }
  // 未识别扩展名：按内容嗅探
  if (typeof content !== 'string' && content instanceof ArrayBuffer) {
    return parseXlsx(content)
  }
  return parseCsv(String(content))
}

/** 支持的表格扩展名（用于 file input accept 与校验）；zip 为官方多表包，由 appDataCsv 处理 */
export const TABLE_FILE_EXTENSIONS = ['.csv', '.xlsx', '.xlsm', '.tsv', '.zip']

/** @param {string} filename */
export function isTableFilename(filename) {
  const name = String(filename || '').toLowerCase()
  return TABLE_FILE_EXTENSIONS.some((ext) => name.endsWith(ext))
}
