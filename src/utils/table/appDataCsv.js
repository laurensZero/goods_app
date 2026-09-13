// @ts-check
/**
 * 应用标准多表 CSV：覆盖谷子、谷子组、活动、充值、预设等。
 * 导出为 zip 多文件包；导入支持单表 csv 或整包 zip。
 * 非标准表格仍走 AI 助手 table_dryrun / table_commit。
 */
import { parseCsv } from '@/utils/table/parseTable'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'

/** 单元格内嵌 JSON 的列（数组/对象） */
const JSON_COLUMNS = new Set([
  'characters', 'tags', 'tracks', 'photos', 'dayTicketList', 'otherExpenses',
  'linkedGoodsIds', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList',
  'unitAcquiredAtList', 'unitSaleInfoList', 'statusTimeline', 'saleReminderOffsets',
  'images'
])

const ARRAY_SPLIT_COLUMNS = new Set(['characters', 'tags'])

const BOOL_COLUMNS = new Set([
  'isWishlist', 'saleReminderEnabled', 'deleted'
])

const DATE_COLUMNS = new Set(['acquiredAt', 'sellDate', 'saleAt', 'startDate', 'endDate', 'chargedAt'])

const DATE_FORMATS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
  /^(\d{4})(\d{2})(\d{2})$/
]

/** @type {Record<string, string[]>} */
export const CSV_SCHEMAS = {
  goods: [
    'id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags',
    'storageLocation', 'variant', 'price', 'actualPrice', 'currency', 'actualPriceCurrency',
    'points', 'quantity', 'acquiredAt', 'saleAt', 'saleReminderEnabled', 'saleReminderOffsets',
    'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList',
    'coverImage', 'images', 'tracks', 'note',
    'collectStatus', 'shippingFee',
    'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'unitSaleInfoList',
    'statusTimeline', 'updatedAt'
  ],
  trash: [
    'id', 'name', 'category', 'ip', 'goodsId', 'isWishlist', 'characters', 'tags',
    'storageLocation', 'variant', 'price', 'actualPrice', 'currency', 'actualPriceCurrency',
    'points', 'quantity', 'acquiredAt', 'saleAt', 'saleReminderEnabled', 'saleReminderOffsets',
    'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList',
    'coverImage', 'images', 'tracks', 'note',
    'collectStatus', 'shippingFee',
    'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'unitSaleInfoList',
    'statusTimeline', 'deletedAt', 'updatedAt'
  ],
  events: [
    'id', 'name', 'type', 'startDate', 'endDate', 'location', 'city',
    'latitude', 'longitude', 'description', 'coverImage',
    'ticketPrice', 'ticketType', 'seatInfo',
    'dayTicketList', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags',
    'deleted', 'createdAt', 'updatedAt'
  ],
  event_tracks: [
    'eventId', 'id', 'title', 'artist', 'album', 'coverUrl', 'durationMs',
    'source', 'neteaseSongId', 'qqSongId', 'bilibiliVideoId', 'lyricSource', 'lyricSongId', 'note'
  ],
  recharge: [
    'id', 'game', 'itemName', 'amount', 'chargedAt', 'note', 'image', 'deleted', 'updatedAt'
  ],
  goods_groups: [
    'id', 'name', 'type', 'summaryMode', 'totalAmount', 'currency',
    'coverMode', 'coverItemId', 'displayMode', 'note', 'deleted', 'createdAt', 'updatedAt'
  ],
  goods_group_items: [
    'id', 'groupId', 'goodsId', 'sortOrder', 'deleted', 'createdAt', 'updatedAt'
  ],
  categories: ['name'],
  ips: ['name'],
  characters: ['name', 'ip'],
  storage_locations: ['path']
}

/** 文件名 → schema key */
const FILE_TO_SCHEMA = {
  'goods.csv': 'goods',
  'wishlist.csv': 'goods',
  'trash.csv': 'trash',
  'events.csv': 'events',
  'event_tracks.csv': 'event_tracks',
  'recharge.csv': 'recharge',
  'goods_groups.csv': 'goods_groups',
  'goods_group_items.csv': 'goods_group_items',
  'categories.csv': 'categories',
  'ips.csv': 'ips',
  'characters.csv': 'characters',
  'storage_locations.csv': 'storage_locations'
}

/**
 * @param {unknown} value
 */
function cellText(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/**
 * @param {string} raw
 */
function escapeCsvCell(raw) {
  const text = String(raw ?? '')
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/**
 * 行对象 → CSV 文本（UTF-8 BOM + CRLF）。
 * @param {string[]} columns
 * @param {Array<Record<string, any>>} rows
 */
export function rowsToCsv(columns, rows) {
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(cellText(row?.[col]))).join(','))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/**
 * @param {string} value
 */
function normalizeDateValue(value) {
  for (const re of DATE_FORMATS) {
    const m = value.match(re)
    if (!m) continue
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue
    return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return value
}

/**
 * @param {string} field
 * @param {string} raw
 */
function coerceCell(field, raw) {
  const value = String(raw ?? '').trim()
  if (value === '') return undefined

  if (ARRAY_SPLIT_COLUMNS.has(field)) {
    // 兼容分号数组导出与 JSON 数组
    if (value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? '').trim()).filter(Boolean)
      } catch { /* fallthrough */ }
    }
    return value.split(/[,、;；|/]+/).map((s) => s.trim()).filter(Boolean)
  }

  if (JSON_COLUMNS.has(field) && (value.startsWith('[') || value.startsWith('{'))) {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`${field} 的 JSON 无法解析`)
    }
  }

  if (BOOL_COLUMNS.has(field)) {
    const lower = value.toLowerCase()
    if (['1', 'true', '是', 'y', 'yes'].includes(lower) || value === '✓') return true
    if (['0', 'false', '否', 'n', 'no'].includes(lower) || value === '✗') return false
    return undefined
  }

  if (DATE_COLUMNS.has(field)) {
    return normalizeDateValue(value)
  }

  if (field === 'quantity' || field === 'sortOrder' || field === 'points' || field === 'durationMs') {
    const n = Number(value.replace(/[^\d.-]/g, ''))
    if (!Number.isFinite(n)) throw new Error(`${field} 无效：「${value}」`)
    if (field === 'quantity' && n < 1) throw new Error(`quantity 必须 ≥ 1：「${value}」`)
    return field === 'quantity' || field === 'sortOrder' ? Math.floor(n) : n
  }

  if (['price', 'actualPrice', 'sellPrice', 'sellFee', 'ticketPrice', 'totalAmount', 'amount'].includes(field)) {
    const cleaned = value.replace(/[¥$€£,\s]/g, '')
    if (cleaned === '') return undefined
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`金额无法识别：「${value}」`)
    return field === 'amount' || field === 'totalAmount' ? Number(cleaned) : cleaned
  }

  if (field === 'shippingFee' || field === 'latitude' || field === 'longitude') {
    return value
  }

  if (field === 'updatedAt' || field === 'createdAt') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }

  return value
}

/**
 * 通用表 → 对象列表。
 * @param {string[]} columns
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {{ requireName?: boolean, nameField?: string }} [options]
 */
function rowsToObjects(columns, headers, rows, options = {}) {
  const nameField = options.nameField || 'name'
  const lowerToIndex = new Map()
  headers.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase()
    if (key && !lowerToIndex.has(key)) lowerToIndex.set(key, i)
  })
  // 列映射：schema 列优先；未知列忽略；schema 中缺失的列跳过
  const colIndex = new Map()
  for (const col of columns) {
    const idx = lowerToIndex.get(col.toLowerCase())
    if (idx != null) colIndex.set(col, idx)
  }

  /** @type {Array<Record<string, any>>} */
  const items = []
  /** @type {Array<{ row: number, name: string, error: string }>} */
  const errors = []

  rows.forEach((row, i) => {
    const excelRow = i + 2
    /** @type {Record<string, any>} */
    const data = {}
    try {
      for (const [col, idx] of colIndex.entries()) {
        const coerced = coerceCell(col, row[idx])
        if (coerced !== undefined) data[col] = coerced
      }
      if (options.requireName !== false && !String(data[nameField] || '').trim()) {
        errors.push({ row: excelRow, name: '', error: '名称为空' })
        return
      }
      items.push(data)
    } catch (e) {
      errors.push({
        row: excelRow,
        name: String(data[nameField] || row[lowerToIndex.get(nameField)] || ''),
        error: e instanceof Error ? e.message : String(e)
      })
    }
  })

  return { items, errors }
}

/**
 * 解析单表 CSV 文本。schemaKey 可选；缺省按表头猜测。
 * @param {string} text
 * @param {string} [schemaKey]
 * @param {string} [filename]
 */
export function parseAppCsv(text, schemaKey, filename) {
  const { headers, rows } = parseCsv(text)
  const resolved = resolveSchemaKey(schemaKey, filename, headers)
  if (!resolved) throw new Error('CSV_UNSTANDARD')
  const columns = CSV_SCHEMAS[resolved]
  const REQUIRED_NAME_SCHEMAS = new Set(['goods', 'trash', 'events', 'goods_groups', 'categories', 'ips', 'characters', 'storage_locations'])
  const nameField = resolved === 'storage_locations'
    ? 'path'
    : resolved === 'goods_group_items'
      ? 'goodsId'
      : resolved === 'recharge'
        ? 'game'
        : 'name'
  const options = {
    requireName: REQUIRED_NAME_SCHEMAS.has(resolved) || resolved === 'goods_group_items',
    nameField
  }
  const parsed = rowsToObjects(columns, headers, rows, options)
  return { schemaKey: resolved, ...parsed }
}

/**
 * @param {string} [schemaKey]
 * @param {string} [filename]
 * @param {string[]} [headers]
 */
function resolveSchemaKey(schemaKey, filename, headers) {
  if (schemaKey && CSV_SCHEMAS[schemaKey]) return schemaKey
  const base = String(filename || '').split(/[\\/]/).pop()?.toLowerCase() || ''
  if (FILE_TO_SCHEMA[base]) return FILE_TO_SCHEMA[base]
  if (!headers?.length) return null
  const lower = new Set(headers.map((h) => String(h || '').trim().toLowerCase()))
  if (lower.has('groupid') && lower.has('goodsid')) return 'goods_group_items'
  if (lower.has('eventid') && lower.has('title')) return 'event_tracks'
  if (lower.has('chargedat') && lower.has('amount')) return 'recharge'
  if (lower.has('startdate') && lower.has('enddate')) return 'events'
  if (lower.has('summarymode')) return 'goods_groups'
  if (lower.has('path') && !lower.has('name')) return 'storage_locations'
  if (lower.has('name') && lower.has('ip') && !lower.has('price')) return 'characters'
  if (lower.has('name') && !lower.has('price') && !lower.has('category')) return 'categories'
  if (lower.has('name') || lower.has('iswishlist') || lower.has('collectstatus')) return 'goods'
  return null
}

/**
 * 是否应用标准 zip 包文件名。
 * @param {string} filename
 */
export function isAppCsvZipFilename(filename) {
  return String(filename || '').toLowerCase().endsWith('.zip')
}

/**
 * 打包多表为 zip 字节。
 * @param {Record<string, string>} files 文件名 → csv 文本
 * @returns {Uint8Array}
 */
export function packAppCsvZip(files) {
  /** @type {Record<string, Uint8Array>} */
  const zipped = {}
  for (const [name, text] of Object.entries(files || {})) {
    if (!text) continue
    zipped[name] = strToU8(text)
  }
  return zipSync(zipped, { level: 6 })
}

/**
 * 从 images 主图回填 coverImage/image，便于表格里直接看到封面链接。
 * @param {Record<string, any>} item
 */
function withCoverFromImages(item) {
  const images = Array.isArray(item?.images) ? item.images : []
  const primary = images.find((entry) => entry?.isPrimary) || images[0]
  const cover = String(item?.coverImage || primary?.uri || '')
  return {
    ...item,
    coverImage: cover,
    image: cover || String(item?.image || '')
  }
}

/**
 * 解压应用 CSV zip → { filename, text }[]。
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Array<{ filename: string, text: string }>}
 */
export function unpackAppCsvZip(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const unzipped = unzipSync(input)
  const files = []
  for (const [name, data] of Object.entries(unzipped)) {
    const lower = name.toLowerCase()
    if (lower.endsWith('/')) continue
    if (!lower.endsWith('.csv') && !lower.endsWith('.tsv')) continue
    files.push({ filename: name, text: strFromU8(data) })
  }
  return files
}

/**
 * 按选择拼装导出包内容（不含 zip）。
 * @param {Object} payload
 * @param {Array<Record<string, any>>} [payload.goods]
 * @param {Array<Record<string, any>>} [payload.trash]
 * @param {Array<Record<string, any>>} [payload.events]
 * @param {Array<Record<string, any>>} [payload.recharge]
 * @param {Array<Record<string, any>>} [payload.groups]
 * @param {Array<Record<string, any>>} [payload.groupItems]
 * @param {Array<{ name: string }>} [payload.categories]
 * @param {Array<{ name: string }>} [payload.ips]
 * @param {Array<{ name: string, ip?: string }>} [payload.characters]
 * @param {Array<{ path: string }>} [payload.storageLocations]
 * @returns {Record<string, string>}
 */
export function buildAppCsvFiles(payload) {
  /** @type {Record<string, string>} */
  const files = {}
  const goods = payload?.goods
  if (Array.isArray(goods) && goods.length > 0) {
    files['goods.csv'] = rowsToCsv(CSV_SCHEMAS.goods, goods.map(withCoverFromImages))
  }
  const trash = payload?.trash
  if (Array.isArray(trash) && trash.length > 0) {
    files['trash.csv'] = rowsToCsv(CSV_SCHEMAS.trash, trash.map(withCoverFromImages))
  }
  const events = payload?.events
  if (Array.isArray(events) && events.length > 0) {
    // 曲目只写 event_tracks.csv，避免回导时与 events.tracks 重复挂载
    const eventRows = events.map((event) => {
      const { tracks: _tracks, ...rest } = event
      return rest
    })
    files['events.csv'] = rowsToCsv(CSV_SCHEMAS.events, eventRows)
    const trackRows = []
    for (const event of events) {
      const tracks = Array.isArray(event?.tracks) ? event.tracks : []
      for (const track of tracks) {
        trackRows.push({ eventId: event.id, ...track })
      }
    }
    if (trackRows.length > 0) {
      files['event_tracks.csv'] = rowsToCsv(CSV_SCHEMAS.event_tracks, trackRows)
    }
  }
  const recharge = payload?.recharge
  if (Array.isArray(recharge) && recharge.length > 0) {
    files['recharge.csv'] = rowsToCsv(CSV_SCHEMAS.recharge, recharge)
  }
  const groups = payload?.groups
  if (Array.isArray(groups) && groups.length > 0) {
    files['goods_groups.csv'] = rowsToCsv(CSV_SCHEMAS.goods_groups, groups)
  }
  const groupItems = payload?.groupItems
  if (Array.isArray(groupItems) && groupItems.length > 0) {
    files['goods_group_items.csv'] = rowsToCsv(CSV_SCHEMAS.goods_group_items, groupItems)
  }
  const categories = payload?.categories
  if (Array.isArray(categories) && categories.length > 0) {
    files['categories.csv'] = rowsToCsv(CSV_SCHEMAS.categories, categories)
  }
  const ips = payload?.ips
  if (Array.isArray(ips) && ips.length > 0) {
    files['ips.csv'] = rowsToCsv(CSV_SCHEMAS.ips, ips)
  }
  const characters = payload?.characters
  if (Array.isArray(characters) && characters.length > 0) {
    files['characters.csv'] = rowsToCsv(CSV_SCHEMAS.characters, characters)
  }
  const storageLocations = payload?.storageLocations
  if (Array.isArray(storageLocations) && storageLocations.length > 0) {
    files['storage_locations.csv'] = rowsToCsv(
      CSV_SCHEMAS.storage_locations,
      storageLocations.map((loc) => ({ path: typeof loc === 'string' ? loc : loc?.path }))
    )
  }
  return files
}

/**
 * 解析多文件输入 → 按 schema 分组。
 * @param {Array<{ filename: string, text: string }>} files
 */
export function parseAppCsvFiles(files) {
  /** @type {Record<string, { items: Array<Record<string, any>>, errors: Array<{ row: number, name: string, error: string }> }>} */
  const bySchema = {
    goods: { items: [], errors: [] },
    trash: { items: [], errors: [] },
    events: { items: [], errors: [] },
    event_tracks: { items: [], errors: [] },
    recharge: { items: [], errors: [] },
    goods_groups: { items: [], errors: [] },
    goods_group_items: { items: [], errors: [] },
    categories: { items: [], errors: [] },
    ips: { items: [], errors: [] },
    characters: { items: [], errors: [] },
    storage_locations: { items: [], errors: [] }
  }

  for (const file of files || []) {
    let parsed
    try {
      parsed = parseAppCsv(file.text, undefined, file.filename)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'CSV_UNSTANDARD') {
        throw new Error(`CSV_UNSTANDARD:${file.filename}`)
      }
      throw e
    }
    const bucket = bySchema[parsed.schemaKey]
    if (!bucket) continue
    bucket.items.push(...parsed.items)
    bucket.errors.push(...parsed.errors.map((err) => ({ ...err, source: file.filename })))
  }

  // event_tracks 挂回 events.tracks
  const trackRows = bySchema.event_tracks.items
  if (trackRows.length > 0) {
    const byEvent = new Map()
    for (const track of trackRows) {
      const eventId = String(track.eventId || '')
      if (!eventId) continue
      if (!byEvent.has(eventId)) byEvent.set(eventId, [])
      const { eventId: _drop, ...rest } = track
      byEvent.get(eventId).push(rest)
    }
    for (const event of bySchema.events.items) {
      const extra = byEvent.get(String(event.id || ''))
      if (extra?.length) {
        event.tracks = [...(Array.isArray(event.tracks) ? event.tracks : []), ...extra]
      }
    }
  }

  // wishlist.csv / goods.csv 合并到 goods（含 isWishlist）
  return bySchema
}
