// @ts-check
/**
 * 表格导入工具：table_dryrun / table_commit
 *
 * 两条路径：
 * A. 官方 CSV/ZIP 快速导入 — 表头命中应用标准 schema（谷子/活动/充值/预设等）时，
 *    跳过字段映射问答，直接预演计数 → 用户确认 → 走与「数据管理」相同的导入管道。
 * B. 通用映射导入 — 非标准表格：dryrun 看结构 → 模型提案映射（模糊处必须问用户）
 *    → dryrun 预演 → 用户确认 → commit 批量写入谷子。
 *
 * 两条路径的 commit 都要求 dryRunConfirmed: true，且必须先有对应 dryrun 记录。
 */

import { parseTableFile } from '@/utils/table/parseTable'
import {
  parseAppCsv,
  parseAppCsvFiles,
  unpackAppCsvZip,
  isAppCsvZipFilename
} from '@/utils/table/appDataCsv'

/** 可映射到谷子的字段（对齐 writeTools WRITABLE_FIELDS 的常用子集） */
export const MAPPABLE_FIELDS = [
  'name', 'category', 'ip', 'characters', 'tags', 'variant', 'storageLocation',
  'price', 'actualPrice', 'currency', 'quantity',
  'acquiredAt', 'isWishlist', 'note',
  'collectStatus', 'sellPrice', 'sellPlatform', 'sellDate', 'saleAt'
]

/** 需要数组的字段：单元格按分隔符自动拆 */
const ARRAY_FIELDS = new Set(['characters', 'tags'])

/** 需要布尔的字段 */
const BOOL_FIELDS = new Set(['isWishlist'])

/** 日期字段：统一尝试多种常见格式 → YYYY-MM-DD */
const DATE_FIELDS = new Set(['acquiredAt', 'sellDate', 'saleAt'])

const DATE_FORMATS = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
  /^(\d{4})年(\d{1,2})月(\d{1,2})日$/,
  /^(\d{4})(\d{2})(\d{2})$/
]

/** 官方 schema 的中文标签（展示用） */
const SCHEMA_LABELS = {
  goods: '谷子',
  trash: '回收站谷子',
  events: '活动',
  event_tracks: '活动曲目',
  recharge: '充值',
  goods_groups: '谷子组',
  goods_group_items: '谷子组条目',
  categories: '分类预设',
  ips: 'IP 预设',
  characters: '角色预设',
  storage_locations: '收纳位置'
}

/** dryrun 缓存：同 (附件+映射) 的 commit 才放行 */
const dryrunCache = new Map()
const DRYRUN_CACHE_LIMIT = 20
const DRYRUN_TTL_MS = 30 * 60 * 1000

/** @type {Array<{ name: string, description: string, inputSchema: Record<string, unknown> }>} */
export const TABLE_TOOL_DEFINITIONS = [
  {
    name: 'table_dryrun',
    description:
      '解析表格附件（xlsx/csv/zip）。不带 mapping 时：若命中应用官方 CSV 格式（按表头识别，含谷子/活动/充值/预设等）' +
      '则返回 mode=official 与各表计数（快速路径，无需字段映射）；否则返回表头与样本行（mode=structure）。' +
      '带 mapping 时按映射预演通用导入（mode=dryrun）。始终不写入数据。' +
      '官方格式预演后只需向用户简要确认即可 table_commit；非官方必须提案映射并问清模糊列。',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: '附件序号（"1"）或 att:<id>' },
        mapping: {
          type: 'object',
          description:
            '字段映射（可选，仅非官方表格需要）：键=谷子字段名，值=表头名或 0 基列序号。' +
            `可映射字段：${MAPPABLE_FIELDS.join(', ')}`
        },
        defaults: {
          type: 'object',
          description: '整表默认值：列里没有的字段用这里兜底，如 { "category": "吧唧" }'
        },
        sampleSize: { type: 'number', description: '样本/预览行数，默认 8，最大 20' }
      },
      required: ['table']
    }
  },
  {
    name: 'table_commit',
    description:
      '执行表格导入写入。官方 CSV/ZIP（dryrun 返回 mode=official）直接走应用标准导入管道；' +
      '非官方按 mapping 走通用批量写入。必须先 table_dryrun 且用户已确认；dryRunConfirmed 必须为 true。',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: '附件序号或 att:<id>' },
        mapping: {
          type: 'object',
          description: '非官方表格：与 dryrun 完全一致的字段映射。官方格式可省略。'
        },
        defaults: { type: 'object', description: '与 dryrun 一致的整表默认值' },
        dryRunConfirmed: {
          type: 'boolean',
          description: '用户已看过 dryrun 结果并明确同意导入时才传 true'
        }
      },
      required: ['table', 'dryRunConfirmed']
    }
  }
]

/**
 * @param {Object} deps
 * @param {() => Array<{ id?: string, uri?: string, localPath?: string, type?: string, filename?: string }>} deps.getAttachments
 * @param {(token: string) => { id?: string, uri?: string, localPath?: string, type?: string, filename?: string }} [deps.resolveSource]
 * @param {(attachmentId: string) => Promise<ArrayBuffer|string|null>} deps.readTableContent
 * @param {{ addGoodsBatch: (items: any[]) => Promise<any[]>, importGoodsBackup?: (items: any[]) => Promise<number>, importTrashBackup?: (items: any[]) => Promise<number> }} deps.goodsStore
 * @param {{ importBackup?: (list: any[]) => Promise<{ added: number, updated: number }> }} [deps.rechargeStore]
 * @param {{ importEventsBackup?: (events: any[]) => Promise<{ added: number, updated: number }> }} [deps.eventsStore]
 * @param {{ updateGroupsBackup?: (groups: any[], items: any[]) => Promise<void> }} [deps.goodsGroupStore]
 * @param {{ addCategory?: (name: string) => Promise<void>, addIp?: (name: string) => Promise<void>, addCharacter?: (name: string, ip?: string) => Promise<void>, syncStorageLocationsFromPaths?: (paths: string[]) => Promise<void> }} [deps.presetsStore]
 */
export function createTableToolHandlers({
  getAttachments,
  resolveSource,
  readTableContent,
  goodsStore,
  rechargeStore,
  eventsStore,
  goodsGroupStore,
  presetsStore
}) {
  /** @type {Map<string, { kind: 'table', headers: string[], rows: string[][] } | { kind: 'official', files: Array<{ filename: string, text: string }> }>} */
  const parsedCache = new Map()

  /**
   * 解析附件：优先官方 CSV/ZIP，其次通用表格。
   * @param {string} token
   */
  async function loadParsed(token) {
    const att = resolveTableAttachment(token)
    const attId = String(att.id || token)
    const hit = parsedCache.get(attId)
    if (hit) return hit
    const content = await readTableContent(attId)
    if (content == null) throw new Error('表格内容不存在，请重新上传附件')
    const filename = String(att.filename || '').trim() || guessFilename(att)

    let result
    // ZIP：官方多表包
    if (isAppCsvZipFilename(filename) || (content instanceof ArrayBuffer && looksLikeZip(content))) {
      const files = unpackAppCsvZip(/** @type {ArrayBuffer} */ (content))
      if (files.length === 0) throw new Error('ZIP 里没有找到 CSV 文件')
      result = { kind: 'official', files }
    } else {
      const text = typeof content === 'string'
        ? content
        : new TextDecoder().decode(/** @type {ArrayBuffer} */ (content))
      // 尝试官方单表
      const official = tryParseOfficialCsv(text, filename)
      if (official) {
        result = { kind: 'official', files: [{ filename, text }] }
      } else {
        const parsed = parseTableFile(filename, content)
        result = { kind: 'table', headers: parsed.headers, rows: parsed.rows }
      }
    }

    parsedCache.set(attId, result)
    if (parsedCache.size > DRYRUN_CACHE_LIMIT) {
      const firstKey = parsedCache.keys().next().value
      if (firstKey) parsedCache.delete(firstKey)
    }
    return result
  }

  /**
   * 尝试按官方 schema 解析；失败返回 null（走通用路径）。
   * 仅当解析成功且至少有一条有效条目时才认官方——避免文件名碰巧叫 goods.csv
   * 但表头是中文/自定义的情况被误判。
   * @param {string} text
   * @param {string} filename
   */
  function tryParseOfficialCsv(text, filename) {
    try {
      const parsed = parseAppCsv(text, undefined, filename)
      // 必须有有效条目（仅 error 行不算官方——可能只是文件名碰巧匹配）
      if (parsed?.schemaKey && parsed.items.length > 0) {
        return parsed
      }
    } catch {
      // CSV_UNSTANDARD 或其他错误 → 非官方
    }
    return null
  }

  /** @param {ArrayBuffer} buf */
  function looksLikeZip(buf) {
    const view = new Uint8Array(buf, 0, Math.min(4, buf.byteLength))
    // PK\x03\x04
    return view[0] === 0x50 && view[1] === 0x4b && view[2] === 0x03 && view[3] === 0x04
  }

  /** @param {{ id?: string, uri?: string, localPath?: string, filename?: string }} att */
  function guessFilename(att) {
    const path = String(att.localPath || att.uri || '')
    const base = path.split(/[\\/]/).pop() || ''
    if (base.includes('.')) return base
    return 'table.csv'
  }

  /**
   * @param {string} token
   */
  function resolveTableAttachment(token) {
    const raw = String(token || '').trim()
    if (!raw) throw new Error('table 必填')
    if (typeof resolveSource === 'function') {
      const hit = resolveSource(raw)
      if (hit) return hit
    }
    const list = getAttachments?.() || []
    if (raw.startsWith('att:')) {
      const id = raw.slice(4).trim()
      const found = list.find((a) => a.id === id)
      if (!found) throw new Error('附件已不在当前会话中')
      return found
    }
    if (/^\d+$/.test(raw)) {
      const found = list[Number(raw) - 1]
      if (!found) throw new Error(`附件 #${raw} 不存在（当前共 ${list.length} 个）`)
      return found
    }
    const byId = list.find((a) => a.id === raw)
    if (byId) return byId
    throw new Error(`未找到表格附件：${raw}`)
  }

  /**
   * 官方文件集 → 各 schema 计数摘要。
   * @param {Array<{ filename: string, text: string }>} files
   */
  function summarizeOfficial(files) {
    const bySchema = parseAppCsvFiles(files)
    /** @type {Array<{ schema: string, label: string, count: number, errorCount: number }>} */
    const tables = []
    let totalItems = 0
    let totalErrors = 0
    for (const [schema, bucket] of Object.entries(bySchema)) {
      const count = bucket.items.length
      const errCount = bucket.errors.length
      if (count === 0 && errCount === 0) continue
      tables.push({
        schema,
        label: SCHEMA_LABELS[schema] || schema,
        count,
        errorCount: errCount
      })
      totalItems += count
      totalErrors += errCount
    }
    return { bySchema, tables, totalItems, totalErrors }
  }

  /**
   * 走应用标准导入管道（与数据管理页 CSV 导入一致）。
   * @param {ReturnType<typeof parseAppCsvFiles>} bySchema
   */
  async function importOfficial(bySchema) {
    let goods = 0
    let trash = 0
    let recharge = 0
    let eventsAdded = 0
    let eventsUpdated = 0

    if (bySchema.goods.items.length > 0) {
      const withId = bySchema.goods.items.filter((item) => item?.id)
      const withoutId = bySchema.goods.items
        .filter((item) => !item?.id)
        .map((item) => ({ ...item, updatedAt: item.updatedAt || Date.now() }))
      if (withId.length > 0 && typeof goodsStore?.importGoodsBackup === 'function') {
        goods += await goodsStore.importGoodsBackup(withId)
      }
      if (withoutId.length > 0) {
        const created = await goodsStore.addGoodsBatch(withoutId)
        goods += Array.isArray(created) ? created.length : withoutId.length
      }
    }
    if (bySchema.trash.items.length > 0 && typeof goodsStore?.importTrashBackup === 'function') {
      trash += await goodsStore.importTrashBackup(bySchema.trash.items)
    }
    if (bySchema.recharge.items.length > 0 && typeof rechargeStore?.importBackup === 'function') {
      const result = await rechargeStore.importBackup(bySchema.recharge.items)
      recharge = Number(result?.added || 0) + Number(result?.updated || 0)
    }
    if (bySchema.events.items.length > 0 && typeof eventsStore?.importEventsBackup === 'function') {
      const result = await eventsStore.importEventsBackup(bySchema.events.items)
      eventsAdded = Number(result?.added || 0)
      eventsUpdated = Number(result?.updated || 0)
    }
    if (
      (bySchema.goods_groups.items.length > 0 || bySchema.goods_group_items.items.length > 0)
      && typeof goodsGroupStore?.updateGroupsBackup === 'function'
    ) {
      await goodsGroupStore.updateGroupsBackup(bySchema.goods_groups.items, bySchema.goods_group_items.items)
    }

    if (typeof presetsStore?.addCategory === 'function') {
      for (const item of bySchema.categories.items) {
        if (item?.name) await presetsStore.addCategory(item.name)
      }
    }
    if (typeof presetsStore?.addIp === 'function') {
      for (const item of bySchema.ips.items) {
        if (item?.name) await presetsStore.addIp(item.name)
      }
    }
    if (typeof presetsStore?.addCharacter === 'function') {
      for (const item of bySchema.characters.items) {
        if (item?.name) await presetsStore.addCharacter(item.name, item.ip || '')
      }
    }
    if (typeof presetsStore?.syncStorageLocationsFromPaths === 'function') {
      const paths = [
        ...bySchema.storage_locations.items.map((item) => item.path),
        ...bySchema.goods.items.map((item) => item.storageLocation)
      ].filter(Boolean)
      if (paths.length > 0) await presetsStore.syncStorageLocationsFromPaths(paths)
    }

    return {
      goods,
      trash,
      recharge,
      eventsAdded,
      eventsUpdated,
      eventsChanged: eventsAdded + eventsUpdated
    }
  }

  /**
   * @param {string[]} headers
   * @param {string[][]} rows
   * @param {string|number} ref 表头名或 0 基列序号
   */
  function resolveColumnIndex(headers, ref) {
    if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 0 && ref < headers.length) {
      return ref
    }
    const name = String(ref ?? '').trim()
    if (!name) return -1
    let idx = headers.findIndex((h) => h === name)
    if (idx >= 0) return idx
    const lower = name.toLowerCase()
    idx = headers.findIndex((h) => String(h).trim().toLowerCase() === lower)
    if (idx >= 0) return idx
    if (/^\d+$/.test(name)) {
      const n = Number(name)
      if (n >= 0 && n < headers.length) return n
    }
    return -1
  }

  /**
   * @param {Record<string, any>} mapping
   * @param {string[]} headers
   */
  function validateMapping(mapping, headers) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new Error('mapping 需为对象：键=谷子字段，值=表头名或列序号')
    }
    /** @type {Record<string, number>} */
    const fieldToCol = {}
    const unknownFields = []
    const missingColumns = []
    for (const [field, ref] of Object.entries(mapping)) {
      if (ref == null || ref === '') continue
      if (!MAPPABLE_FIELDS.includes(field)) {
        unknownFields.push(field)
        continue
      }
      const col = resolveColumnIndex(headers, ref)
      if (col < 0) {
        missingColumns.push(`${field} → "${ref}"`)
        continue
      }
      fieldToCol[field] = col
    }
    if (unknownFields.length) {
      throw new Error(`不支持的映射字段：${unknownFields.join(', ')}。可映射：${MAPPABLE_FIELDS.join(', ')}`)
    }
    if (missingColumns.length) {
      throw new Error(`映射的列不存在：${missingColumns.join('; ')}。可用表头：${headers.join(' | ')}`)
    }
    if (!('name' in fieldToCol)) {
      throw new Error('mapping 必须包含 name（名称列）——每条谷子都必须有名称')
    }
    return fieldToCol
  }

  /**
   * @param {string} field
   * @param {string} raw
   */
  function coerceValue(field, raw) {
    const value = String(raw ?? '').trim()
    if (value === '') return undefined
    if (ARRAY_FIELDS.has(field)) {
      return value.split(/[,、;；|/]+/).map((s) => s.trim()).filter(Boolean)
    }
    if (BOOL_FIELDS.has(field)) {
      if (['1', 'true', '是', 'y', 'yes'].includes(value.toLowerCase()) || value === '✓') return true
      if (['0', 'false', '否', 'n', 'no'].includes(value.toLowerCase()) || value === '✗') return false
      return undefined
    }
    if (DATE_FIELDS.has(field)) {
      const normalized = normalizeDate(value)
      if (!normalized) throw new Error(`无法识别日期：「${value}」（需 YYYY-MM-DD）`)
      return normalized
    }
    if (field === 'quantity') {
      const n = Number(value.replace(/[^\d.-]/g, ''))
      if (!Number.isFinite(n) || n < 1) throw new Error(`数量无效：「${value}」（需 ≥ 1 的数字）`)
      return Math.floor(n)
    }
    if (field === 'price' || field === 'actualPrice' || field === 'sellPrice') {
      const cleaned = value.replace(/[¥$€£,\s]/g, '')
      if (cleaned === '') return undefined
      if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`金额格式无法识别：「${value}」`)
      return cleaned
    }
    return value
  }

  /** @param {string} value */
  function normalizeDate(value) {
    for (const re of DATE_FORMATS) {
      const m = value.match(re)
      if (!m) continue
      const y = m[1]
      const mo = String(Number(m[2])).padStart(2, '0')
      const d = String(Number(m[3])).padStart(2, '0')
      if (Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) continue
      return `${y}-${mo}-${d}`
    }
    return ''
  }

  /**
   * @param {string[]} headers
   * @param {string[][]} rows
   * @param {Record<string, number>} fieldToCol
   * @param {Record<string, any>} [defaults]
   */
  function convertRows(headers, rows, fieldToCol, defaults = {}) {
    /** @type {Array<{ rowIndex: number, data: Record<string, any> }>} */
    const valid = []
    /** @type {Array<{ rowIndex: number, name: string, error: string }>} */
    const errors = []
    rows.forEach((row, i) => {
      const excelRow = i + 2
      /** @type {Record<string, any>} */
      const data = {}
      try {
        for (const [field, col] of Object.entries(fieldToCol)) {
          const coerced = coerceValue(field, row[col])
          if (coerced !== undefined) data[field] = coerced
        }
        for (const [field, value] of Object.entries(defaults || {})) {
          if (!MAPPABLE_FIELDS.includes(field)) continue
          if (data[field] === undefined && value !== undefined && value !== '') {
            data[field] = value
          }
        }
        if (!String(data.name || '').trim()) {
          errors.push({ rowIndex: excelRow, name: '', error: '名称为空' })
          return
        }
        if (data.quantity !== undefined) {
          const q = Number(data.quantity)
          if (!Number.isFinite(q) || q < 1) {
            errors.push({ rowIndex: excelRow, name: String(data.name), error: 'quantity 必须 ≥ 1' })
            return
          }
        }
        valid.push({ rowIndex: excelRow, data })
      } catch (e) {
        errors.push({
          rowIndex: excelRow,
          name: String(data.name || row[fieldToCol.name] || ''),
          error: e instanceof Error ? e.message : String(e)
        })
      }
    })
    return { valid, errors }
  }

  function dryrunKey(attId, mapping, defaults) {
    return JSON.stringify([attId, mapping || null, defaults || {}])
  }

  function rememberDryrun(key, payload) {
    dryrunCache.set(key, { ...payload, at: Date.now() })
    if (dryrunCache.size > DRYRUN_CACHE_LIMIT) {
      const firstKey = dryrunCache.keys().next().value
      if (firstKey) dryrunCache.delete(firstKey)
    }
  }

  function getFreshDryrun(key) {
    const hit = dryrunCache.get(key)
    if (!hit) return null
    if (Date.now() - hit.at > DRYRUN_TTL_MS) {
      dryrunCache.delete(key)
      return null
    }
    return hit
  }

  // ── 工具实现 ────────────────────────────────────────────────────────────────

  /**
   * @param {Record<string, any>} args
   */
  async function table_dryrun(args) {
    const parsed = await loadParsed(args?.table)
    const sampleSize = clampInt(args?.sampleSize, 1, 20, 8)
    const mapping = args?.mapping
    const att = resolveTableAttachment(args?.table)
    const attId = String(att.id || args?.table)

    // ── 官方 CSV/ZIP：快速路径 ──
    if (parsed.kind === 'official' && (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0)) {
      const { bySchema, tables, totalItems, totalErrors } = summarizeOfficial(parsed.files)
      rememberDryrun(dryrunKey(attId, null, {}), {
        attId,
        mode: 'official',
        totalItems,
        errorCount: totalErrors
      })
      // 取一个样本条目展示（优先 goods）
      const sampleItems = bySchema.goods.items.slice(0, Math.min(3, sampleSize))
      return {
        ok: true,
        mode: 'official',
        official: true,
        tables,
        totalItems,
        errorCount: totalErrors,
        errors: Object.values(bySchema).flatMap((b) => b.errors).slice(0, 10),
        sample: sampleItems,
        hint:
          '这是应用官方导出格式（按表头识别）。无需字段映射。' +
          `请向用户简要说明将导入 ${totalItems} 条（${tables.map((t) => `${t.label} ${t.count}`).join('、')}），` +
          '用户同意后直接 table_commit（dryRunConfirmed: true，可不传 mapping）。',
        mappableFields: MAPPABLE_FIELDS
      }
    }

    // ── 通用表格结构（无映射） ──
    if (parsed.kind === 'table' && (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0)) {
      const sample = parsed.rows.slice(0, sampleSize)
      return {
        ok: true,
        mode: 'structure',
        official: false,
        headers: parsed.headers,
        headerCount: parsed.headers.length,
        rowCount: parsed.rows.length,
        sampleRows: sample,
        sampleCount: sample.length,
        mappableFields: MAPPABLE_FIELDS,
        hint:
          '未识别为官方格式。请根据表头与样本行提出字段映射提案。' +
          '任何含义模糊、可能对应多个字段、或样本值格式异常的列，先向用户确认再继续；' +
          '确认映射后再次调用 table_dryrun（带 mapping）预演，用户确认后再 table_commit。'
      }
    }

    // ── 通用表格 + 映射：完整 dryrun ──
    if (parsed.kind !== 'table') {
      throw new Error('官方格式不支持自定义 mapping；请直接 table_commit')
    }
    const { headers, rows } = parsed
    const fieldToCol = validateMapping(mapping, headers)
    const defaults = normalizeDefaults(args?.defaults)
    const { valid, errors } = convertRows(headers, rows, fieldToCol, defaults)

    rememberDryrun(dryrunKey(attId, mapping, defaults), {
      attId,
      mode: 'dryrun',
      mapping: { ...mapping },
      defaults: { ...defaults },
      totalRows: rows.length,
      validCount: valid.length,
      errorCount: errors.length
    })

    return {
      ok: true,
      mode: 'dryrun',
      official: false,
      headers,
      mappingUsed: fieldToCol,
      defaults,
      totalRows: rows.length,
      validCount: valid.length,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      preview: valid.slice(0, sampleSize).map((entry) => ({
        row: entry.rowIndex,
        data: entry.data
      })),
      hint:
        errors.length > 0
          ? `有 ${errors.length} 行存在问题（见 errors）。请把有效条数、问题行与预览展示给用户，确认无误后再 table_commit（dryRunConfirmed: true）。`
          : '请把有效条数与前几条预览展示给用户，得到明确同意后再 table_commit（dryRunConfirmed: true）。'
    }
  }

  /**
   * @param {Record<string, any>} args
   */
  async function table_commit(args) {
    if (args?.dryRunConfirmed !== true) {
      throw new Error(
        '拒绝写入：dryRunConfirmed 不为 true。' +
        '必须先 table_dryrun，把预演结果展示给用户并获得明确同意后，再传 dryRunConfirmed: true 调用本工具。'
      )
    }
    const parsed = await loadParsed(args?.table)
    const mapping = args?.mapping
    const att = resolveTableAttachment(args?.table)
    const attId = String(att.id || args?.table)

    // ── 官方快速导入 ──
    if (parsed.kind === 'official' && (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0)) {
      const key = dryrunKey(attId, null, {})
      const prior = getFreshDryrun(key)
      if (!prior || prior.mode !== 'official') {
        throw new Error('拒绝写入：未找到对应的有效 dryrun 记录（官方格式）。请先 table_dryrun。')
      }
      if (prior.totalItems === 0) {
        throw new Error('官方格式解析后没有可导入的条目，已取消写入')
      }
      const { bySchema, totalItems, totalErrors } = summarizeOfficial(parsed.files)
      if (totalItems === 0) {
        throw new Error('没有可导入的有效条目，已取消写入')
      }
      let result
      try {
        result = await importOfficial(bySchema)
      } catch (e) {
        throw new Error(`官方导入失败：${e instanceof Error ? e.message : String(e)}`)
      }
      dryrunCache.delete(key)
      return {
        ok: true,
        official: true,
        requested: totalItems,
        ...result,
        errorCount: totalErrors,
        errors: Object.values(bySchema).flatMap((b) => b.errors).slice(0, 10),
        hint: '已按官方格式完成导入。告知用户各类数据的导入数量；如有跳过行请说明。'
      }
    }

    // ── 通用映射写入 ──
    if (!goodsStore || typeof goodsStore.addGoodsBatch !== 'function') {
      throw new Error('收藏模块不可用')
    }
    if (parsed.kind !== 'table') {
      throw new Error('官方格式不支持自定义 mapping；请省略 mapping 后重试')
    }
    const { headers, rows } = parsed
    const fieldToCol = validateMapping(mapping, headers)
    const defaults = normalizeDefaults(args?.defaults)

    const key = dryrunKey(attId, mapping, defaults)
    const prior = getFreshDryrun(key)
    if (!prior) {
      throw new Error('拒绝写入：未找到对应的有效 dryrun 记录。请先调用 table_dryrun 并让用户确认结果。')
    }
    if (prior.validCount === 0) {
      throw new Error('没有可导入的有效行（dryrun 全部校验失败），已取消写入')
    }

    const { valid, errors } = convertRows(headers, rows, fieldToCol, defaults)
    if (valid.length === 0) {
      throw new Error('没有可导入的有效行，已取消写入')
    }

    const items = valid.map((entry) => entry.data)
    let created = []
    try {
      created = await goodsStore.addGoodsBatch(items)
    } catch (e) {
      throw new Error(`批量写入失败：${e instanceof Error ? e.message : String(e)}`)
    }
    const createdList = Array.isArray(created) ? created : []
    dryrunCache.delete(key)

    return {
      ok: true,
      official: false,
      requested: items.length,
      createdCount: createdList.length || items.length,
      skippedCount: errors.length,
      skipped: errors.slice(0, 10),
      ids: createdList.slice(0, 20).map((item) => item?.id).filter(Boolean),
      hint: '已写入。可告知用户导入数量；若有跳过行请说明原因。'
    }
  }

  return { table_dryrun, table_commit }
}

/**
 * @param {Record<string, any>} [defaults]
 * @returns {Record<string, any>}
 */
function normalizeDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return {}
  /** @type {Record<string, any>} */
  const out = {}
  for (const [key, value] of Object.entries(defaults)) {
    if (!MAPPABLE_FIELDS.includes(key)) continue
    if (value === undefined || value === null || value === '') continue
    out[key] = value
  }
  return out
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}
