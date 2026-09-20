// @ts-check
/**
 * utils/db.js
 * 统一 SQLite 数据访问层
 *
 * 底层通过 adapter 模式屏蔽平台差异：
 *   - 原生端（iOS / Android）：@capacitor-community/sqlite
 *   - Web 端（浏览器 / PWA）：sql.js + IndexedDB
 *
 * 迁移系统：
 *   - 迁移定义在 migrations.js 中，格式 { version, description, up(db) }
 *   - 使用 _schema_version 表记录当前版本号
 *   - 每个迁移函数必须幂等
 *   - 历史遗留数据库 (version >= 26) 自动重置到 0；OTA 回滚导致的略高版本号不重置
 */

import { Capacitor } from '@capacitor/core'
import { buildCloudImageUri, parseCloudImageUri } from '@/utils/goods/images'
import { parseJsonArray } from '@/utils/parseJsonArray'
import { MIGRATIONS } from './migrations'
import { createLogger } from '@/utils/logger'

const IS_NATIVE = Capacitor.isNativePlatform()
const log = createLogger('db')

/**
 * @typedef {Object} DatabaseAdapter
 * @property {() => Promise<void>} open
 * @property {(sql: string) => Promise<void>} execute
 * @property {(sql: string, params?: any[]) => Promise<void>} run
 * @property {(stmts: {statement: string, values: any[]}[]) => Promise<void>} executeSet
 * @property {(sql: string, params?: any[]) => Promise<any[]>} query
 * @property {(tableName: string) => Promise<Set<string>>} getTableColumns
 * @property {() => Promise<void>} beginTransaction
 * @property {() => Promise<void>} commitTransaction
 * @property {() => Promise<void>} rollbackTransaction
 * @property {() => Promise<void>} [flush]
 */

/** @type {DatabaseAdapter | null} */
let db = null
let isInitialized = false
let isSchemaSynced = false
let initPromise = null

async function getDb() {
  if (db) return db
  if (IS_NATIVE) {
    const { createNativeAdapter } = await import('@/utils/db/nativeAdapter')
    db = createNativeAdapter()
  } else {
    const { createWebAdapter } = await import('@/utils/db/webAdapter')
    db = createWebAdapter()
  }
  return db
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS goods (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    category   TEXT DEFAULT '',
    ip         TEXT DEFAULT '',
    goodsId    TEXT DEFAULT '',
    isWishlist INTEGER DEFAULT 0,
    characters TEXT DEFAULT '[]',
    tags       TEXT DEFAULT '[]',
    storageLocation TEXT DEFAULT '',
    variant    TEXT DEFAULT '',
    price      TEXT DEFAULT '',
    actualPrice TEXT DEFAULT '',
    acquiredAt TEXT DEFAULT '',
    saleAt TEXT DEFAULT '',
    saleReminderEnabled INTEGER DEFAULT 0,
    saleReminderOffsets TEXT DEFAULT '[]',
    unitAcquiredAtList TEXT DEFAULT '[]',
    unitActualPriceList TEXT DEFAULT '[]',
    unitCharacterList TEXT DEFAULT '[]',
    unitCollectStatusList TEXT DEFAULT '[]',
    images     TEXT DEFAULT '[]',
    tracks     TEXT DEFAULT '[]',
    note       TEXT DEFAULT '',
    quantity   INTEGER DEFAULT 1,
    points     INTEGER DEFAULT NULL,
    currency   TEXT DEFAULT 'CNY',
    actualPriceCurrency TEXT DEFAULT 'CNY',
    collectStatus TEXT DEFAULT '已拥有',
    shippingFee TEXT DEFAULT '',
    shippingEvents TEXT DEFAULT '[]',
    statusTimeline TEXT DEFAULT '[]',
    sellPrice  TEXT DEFAULT '',
    sellPlatform TEXT DEFAULT '',
    sellFee    TEXT DEFAULT '',
    sellDate   TEXT DEFAULT '',
    unitSaleInfoList TEXT DEFAULT '[]',
    manualOrders TEXT DEFAULT '{}',
    updatedAt  INTEGER DEFAULT 0,
    trashed    INTEGER DEFAULT 0,
    deletedAt TEXT DEFAULT ''
  );
`

const CREATE_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    type       TEXT DEFAULT '',
    startDate  TEXT DEFAULT '',
    endDate    TEXT DEFAULT '',
    selectedDates TEXT DEFAULT '[]',
    location   TEXT DEFAULT '',
    city       TEXT DEFAULT '',
    latitude   TEXT DEFAULT '',
    longitude  TEXT DEFAULT '',
    description TEXT DEFAULT '',
    coverImage TEXT DEFAULT '',
    coverImageData TEXT DEFAULT '{}',
    photos     TEXT DEFAULT '[]',
    ticketPrice TEXT DEFAULT '',
    ticketType TEXT DEFAULT '',
    seatInfo   TEXT DEFAULT '',
    dayTicketList TEXT DEFAULT '[]',
    otherExpenses TEXT DEFAULT '[]',
    tracks     TEXT DEFAULT '[]',
    linkedGoodsIds TEXT DEFAULT '[]',
    tags       TEXT DEFAULT '[]',
    deleted    INTEGER DEFAULT 0,
    createdAt  INTEGER DEFAULT 0,
    updatedAt  INTEGER DEFAULT 0
  );
`

const CREATE_RECHARGE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS recharge_records (
    id         TEXT PRIMARY KEY NOT NULL,
    game       TEXT DEFAULT '',
    itemName   TEXT DEFAULT '',
    amount     REAL DEFAULT 0,
    chargedAt  TEXT DEFAULT '',
    note       TEXT DEFAULT '',
    image      TEXT DEFAULT '',
    deleted    INTEGER DEFAULT 0,
    updatedAt  INTEGER DEFAULT 0
  );
`

const CREATE_GOODS_GROUPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS goods_groups (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    type         TEXT NOT NULL DEFAULT 'collection',
    summaryMode  TEXT DEFAULT 'auto',
    totalAmount  REAL DEFAULT 0,
    currency     TEXT DEFAULT 'CNY',
    coverMode    TEXT DEFAULT 'auto',
    coverItemId  TEXT DEFAULT '',
    displayMode  TEXT DEFAULT 'list',
    note         TEXT DEFAULT '',
    deleted      INTEGER DEFAULT 0,
    createdAt    INTEGER DEFAULT 0,
    updatedAt    INTEGER DEFAULT 0
  );
`

const CREATE_GOODS_GROUP_ITEMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS goods_group_items (
    id        TEXT PRIMARY KEY NOT NULL,
    groupId   TEXT NOT NULL,
    goodsId   TEXT NOT NULL,
    sortOrder INTEGER DEFAULT 0,
    deleted   INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT 0,
    updatedAt INTEGER DEFAULT 0
  );
`

const CREATE_BATCH_DRAFTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS batch_drafts (
    slot       TEXT PRIMARY KEY NOT NULL,
    batchId    TEXT NOT NULL DEFAULT '',
    isWishlist INTEGER DEFAULT 0,
    items      TEXT NOT NULL DEFAULT '[]',
    defaults   TEXT NOT NULL DEFAULT '{}',
    deleted    INTEGER DEFAULT 0,
    updatedAt  INTEGER DEFAULT 0
  );
`

const CREATE_VERSION_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL)'
// 取最后一项的 version 字段而非数组长度，避免两者脱钩时误判
const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
// 历史遗留数据库曾写入 version 26；重置阈值精确锁定该值，
// 避免 capgo OTA 回滚（新版本号略大于 LATEST_VERSION）时误触发全库迁移重跑
const LEGACY_VERSION_RESET_THRESHOLD = 26

if (import.meta.env.DEV) {
  // 开发期断言：迁移版本号必须从 1 开始单调连续
  MIGRATIONS.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`[db] MIGRATIONS[${i}].version 应为 ${i + 1}，实际为 ${m.version}`)
    }
  })
}

const GOODS_REQUIRED_COLUMNS = [
  ['name', "TEXT NOT NULL DEFAULT ''"],
  ['category', "TEXT DEFAULT ''"],
  ['ip', "TEXT DEFAULT ''"],
  ['goodsId', "TEXT DEFAULT ''"],
  ['isWishlist', 'INTEGER DEFAULT 0'],
  ['characters', "TEXT DEFAULT '[]'"],
  ['tags', "TEXT DEFAULT '[]'"],
  ['storageLocation', "TEXT DEFAULT ''"],
  ['variant', "TEXT DEFAULT ''"],
  ['price', "TEXT DEFAULT ''"],
  ['actualPrice', "TEXT DEFAULT ''"],
  ['acquiredAt', "TEXT DEFAULT ''"],
  ['saleAt', "TEXT DEFAULT ''"],
  ['saleReminderEnabled', 'INTEGER DEFAULT 0'],
  ['saleReminderOffsets', "TEXT DEFAULT '[]'"],
  ['unitAcquiredAtList', "TEXT DEFAULT '[]'"],
  ['unitActualPriceList', "TEXT DEFAULT '[]'"],
  ['unitCharacterList', "TEXT DEFAULT '[]'"],
  ['unitCollectStatusList', "TEXT DEFAULT '[]'"],
  ['images', "TEXT DEFAULT '[]'"],
  ['tracks', "TEXT DEFAULT '[]'"],
  ['note', "TEXT DEFAULT ''"],
  ['quantity', 'INTEGER DEFAULT 1'],
  ['points', 'INTEGER DEFAULT NULL'],
  ['currency', "TEXT DEFAULT 'CNY'"],
  ['actualPriceCurrency', "TEXT DEFAULT 'CNY'"],
  ['collectStatus', "TEXT DEFAULT '已拥有'"],
  ['shippingFee', "TEXT DEFAULT ''"],
  ['shippingEvents', "TEXT DEFAULT '[]'"],
  ['statusTimeline', "TEXT DEFAULT '[]'"],
  ['sellPrice', "TEXT DEFAULT ''"],
  ['sellPlatform', "TEXT DEFAULT ''"],
  ['sellFee', "TEXT DEFAULT ''"],
  ['sellDate', "TEXT DEFAULT ''"],
  ['unitSaleInfoList', "TEXT DEFAULT '[]'"],
  ['manualOrders', "TEXT DEFAULT '{}'"],
  ['updatedAt', 'INTEGER DEFAULT 0'],
  ['trashed', 'INTEGER DEFAULT 0'],
  ['deletedAt', "TEXT DEFAULT ''"]
]

const EVENTS_REQUIRED_COLUMNS = [
  ['name', "TEXT NOT NULL DEFAULT ''"],
  ['type', "TEXT DEFAULT ''"],
  ['startDate', "TEXT DEFAULT ''"],
  ['endDate', "TEXT DEFAULT ''"],
  ['selectedDates', "TEXT DEFAULT '[]'"],
  ['location', "TEXT DEFAULT ''"],
  ['city', "TEXT DEFAULT ''"],
  ['latitude', "TEXT DEFAULT ''"],
  ['longitude', "TEXT DEFAULT ''"],
  ['description', "TEXT DEFAULT ''"],
  ['coverImage', "TEXT DEFAULT ''"],
  ['coverImageData', "TEXT DEFAULT '{}'"],
  ['photos', "TEXT DEFAULT '[]'"],
  ['ticketPrice', "TEXT DEFAULT ''"],
  ['ticketType', "TEXT DEFAULT ''"],
  ['seatInfo', "TEXT DEFAULT ''"],
  ['dayTicketList', "TEXT DEFAULT '[]'"],
  ['otherExpenses', "TEXT DEFAULT '[]'"],
  ['tracks', "TEXT DEFAULT '[]'"],
  ['linkedGoodsIds', "TEXT DEFAULT '[]'"],
  ['tags', "TEXT DEFAULT '[]'"],
  ['deleted', 'INTEGER DEFAULT 0'],
  ['createdAt', 'INTEGER DEFAULT 0'],
  ['updatedAt', 'INTEGER DEFAULT 0']
]

const RECHARGE_REQUIRED_COLUMNS = [
  ['game', "TEXT DEFAULT ''"],
  ['itemName', "TEXT DEFAULT ''"],
  ['amount', 'REAL DEFAULT 0'],
  ['chargedAt', "TEXT DEFAULT ''"],
  ['note', "TEXT DEFAULT ''"],
  ['image', "TEXT DEFAULT ''"],
  ['deleted', 'INTEGER DEFAULT 0'],
  ['updatedAt', 'INTEGER DEFAULT 0']
]

const GOODS_GROUPS_REQUIRED_COLUMNS = [
  ['name', "TEXT NOT NULL DEFAULT ''"],
  ['type', "TEXT NOT NULL DEFAULT 'collection'"],
  ['summaryMode', "TEXT DEFAULT 'auto'"],
  ['totalAmount', 'REAL DEFAULT 0'],
  ['currency', "TEXT DEFAULT 'CNY'"],
  ['coverMode', "TEXT DEFAULT 'auto'"],
  ['coverItemId', "TEXT DEFAULT ''"],
  ['displayMode', "TEXT DEFAULT 'list'"],
  ['note', "TEXT DEFAULT ''"],
  ['deleted', 'INTEGER DEFAULT 0'],
  ['createdAt', 'INTEGER DEFAULT 0'],
  ['updatedAt', 'INTEGER DEFAULT 0']
]

const GOODS_GROUP_ITEMS_REQUIRED_COLUMNS = [
  ['groupId', "TEXT NOT NULL"],
  ['goodsId', "TEXT NOT NULL"],
  ['sortOrder', 'INTEGER DEFAULT 0'],
  ['deleted', 'INTEGER DEFAULT 0'],
  ['createdAt', 'INTEGER DEFAULT 0'],
  ['updatedAt', 'INTEGER DEFAULT 0']
]

//  纯业务辅助函数

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function normalizeWishlistFlag(value) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true'
  }
  return false
}

/**
 * @param {Partial<import('@/types/models').GoodsItem> & { image?: string }} item
 * @returns {Record<string, any>}
 */
function prepareGoodsRecord(item) {
  const {
    id,
    name = '',
    category = '',
    ip = '',
    goodsId = '',
    isWishlist = false,
    characters = [],
    tags = [],
    storageLocation = '',
    variant = '',
    price = '',
    actualPrice = '',
    acquiredAt = '',
    saleAt = '',
    saleReminderEnabled = false,
    saleReminderOffsets = [],
    unitAcquiredAtList = [],
    unitActualPriceList = [],
    unitCharacterList = [],
    unitCollectStatusList = [],
    images = [],
    tracks = [],
    note = '',
    quantity = 1,
    points,
    updatedAt,
    currency = 'CNY',
    actualPriceCurrency = 'CNY',
    collectStatus = '已拥有',
    shippingFee = '',
    shippingEvents = [],
    sellPrice = '',
    sellPlatform = '',
    sellFee = '',
    sellDate = '',
    unitSaleInfoList = [],
    statusTimeline = [],
    manualOrders = {},
    trashed = false,
    deletedAt = ''
  } = item

  return {
    id,
    name,
    category,
    ip,
    goodsId,
    isWishlist: normalizeWishlistFlag(isWishlist) ? 1 : 0,
    charsStr: JSON.stringify(Array.isArray(characters) ? characters : []),
    tagsStr: JSON.stringify(Array.isArray(tags) ? tags : []),
    unitDatesStr: JSON.stringify(Array.isArray(unitAcquiredAtList) ? unitAcquiredAtList : []),
    unitPricesStr: JSON.stringify(Array.isArray(unitActualPriceList) ? unitActualPriceList : []),
    unitCharactersStr: JSON.stringify(Array.isArray(unitCharacterList) ? unitCharacterList : []),
    unitCollectStatusStr: JSON.stringify(Array.isArray(unitCollectStatusList) ? unitCollectStatusList : []),
    saleReminderOffsetsStr: JSON.stringify(Array.isArray(saleReminderOffsets) ? saleReminderOffsets : []),
    imagesStr: JSON.stringify(Array.isArray(images) ? images : []),
    tracksStr: JSON.stringify(Array.isArray(tracks) ? tracks : []),
    storageLocation,
    variant,
    price,
    actualPrice,
    acquiredAt,
    saleAt,
    saleReminderEnabled: normalizeWishlistFlag(saleReminderEnabled) ? 1 : 0,
    currency,
    actualPriceCurrency,
    qty: Math.max(1, Number(quantity) || 1),
    pts: points != null && /** @type {any} */ (points) !== '' ? Number(points) : null,
    note,
    ts: updatedAt || Date.now(),
    collectStatus: String(collectStatus || '已拥有'),
    shippingFee: String(shippingFee || ''),
    shippingEventsStr: JSON.stringify(Array.isArray(shippingEvents) ? shippingEvents : []),
    sellPrice: String(sellPrice || ''),
    sellPlatform: String(sellPlatform || ''),
    sellFee: String(sellFee || ''),
    sellDate: String(sellDate || ''),
    unitSaleInfoStr: JSON.stringify(Array.isArray(unitSaleInfoList) ? unitSaleInfoList : []),
    statusTimelineStr: JSON.stringify(Array.isArray(statusTimeline) ? statusTimeline : []),
    manualOrdersStr: stringifyJsonObject(manualOrders, '{}'),
    trashed: trashed ? 1 : 0,
    deletedAt: String(deletedAt || '')
  }
}

function stringifyJsonObject(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return fallback
  }
}

const GOODS_INSERT_SQL = 'INSERT OR REPLACE INTO goods (id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,saleAt,saleReminderEnabled,saleReminderOffsets,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,unitCollectStatusList,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee,shippingEvents,sellPrice,sellPlatform,sellFee,sellDate,unitSaleInfoList,statusTimeline,manualOrders,trashed,deletedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

// SELECT 列清单须与 GOODS_INSERT_SQL 列保持一致，避免增列时漏改其中一边
const GOODS_SELECT_COLUMNS = 'id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,saleAt,saleReminderEnabled,saleReminderOffsets,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,unitCollectStatusList,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee,shippingEvents,sellPrice,sellPlatform,sellFee,sellDate,unitSaleInfoList,statusTimeline,manualOrders,trashed,deletedAt'

function goodsRecordToValues(record) {
  return [record.id, record.name, record.category, record.ip, record.goodsId, record.isWishlist, record.charsStr, record.tagsStr, record.storageLocation, record.variant, record.price, record.actualPrice, record.acquiredAt, record.saleAt, record.saleReminderEnabled, record.saleReminderOffsetsStr, record.currency, record.actualPriceCurrency, record.unitDatesStr, record.unitPricesStr, record.unitCharactersStr, record.unitCollectStatusStr, record.imagesStr, record.tracksStr, record.note, record.qty, record.pts, record.ts, record.collectStatus, record.shippingFee, record.shippingEventsStr, record.sellPrice, record.sellPlatform, record.sellFee, record.sellDate, record.unitSaleInfoStr, record.statusTimelineStr, record.manualOrdersStr, record.trashed, record.deletedAt]
}

const EVENTS_INSERT_SQL = 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,selectedDates,location,city,latitude,longitude,description,coverImage,coverImageData,photos,ticketPrice,ticketType,seatInfo,dayTicketList,otherExpenses,tracks,linkedGoodsIds,tags,deleted,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

const RECHARGE_INSERT_SQL = 'INSERT OR REPLACE INTO recharge_records (id,game,itemName,amount,chargedAt,note,image,deleted,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)'

function prepareRechargeRecord(record) {
  return [
    record.id,
    record.game || '',
    record.itemName || '',
    Number(record.amount) || 0,
    record.chargedAt || '',
    record.note || '',
    record.image || '',
    record.deleted ? 1 : 0,
    record.updatedAt || Date.now()
  ]
}

function prepareEventValues(event) {
  const {
    id, name = '', type = '', startDate = '', endDate = '', selectedDates = [],
    location = '', city = '', latitude = '', longitude = '', description = '', coverImage = '',
    coverImageData = {},
    photos = [], ticketPrice = '', ticketType = '', seatInfo = '', dayTicketList = [], otherExpenses = [], tracks = [], linkedGoodsIds = [], tags = [],
    deleted = false,
    createdAt, updatedAt
  } = event
  const coverImageDataStr = stringifyJsonObject(coverImageData)
  const photosStr = JSON.stringify(Array.isArray(photos) ? photos : [])
  const selectedDatesStr = JSON.stringify(Array.isArray(selectedDates) ? selectedDates : [])
  const dayTicketListStr = JSON.stringify(Array.isArray(dayTicketList) ? dayTicketList : [])
  const otherExpensesStr = JSON.stringify(Array.isArray(otherExpenses) ? otherExpenses : [])
  const tracksStr = JSON.stringify(Array.isArray(tracks) ? tracks : [])
  const linkedGoodsStr = JSON.stringify(Array.isArray(linkedGoodsIds) ? linkedGoodsIds : [])
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
  const ts = updatedAt || Date.now()
  const created = createdAt || ts
  return [id, name, type, startDate, endDate, selectedDatesStr, location, city, latitude, longitude, description, coverImage, coverImageDataStr, photosStr, ticketPrice, ticketType, seatInfo, dayTicketListStr, otherExpensesStr, tracksStr, linkedGoodsStr, tagsStr, deleted ? 1 : 0, created, ts]
}

async function _getSchemaVersion() {
  try {
    const rows = await db.query('SELECT version FROM _schema_version LIMIT 1')
    return rows.length ? rows[0].version : 0
  } catch {
    return 0
  }
}

async function _runMigrations() {
  const current = await _getSchemaVersion()
  const pending = MIGRATIONS.filter(m => m.version > current)
  if (pending.length === 0) return

  for (const migration of pending) {
    try {
      // up() 与版本号写入包进同一事务：中途崩溃/失败自动回滚，不留部分已改+版本号未更的状态
      await db.beginTransaction()
      try {
        await migration.up(db)
        await db.run('UPDATE _schema_version SET version = ?', [migration.version])
        await db.commitTransaction()
      } catch (txError) {
        try { await db.rollbackTransaction() } catch { /* 回滚失败时保留原始错误 */ }
        throw txError
      }
      log.info('migration:applied', { version: migration.version, description: migration.description })
    } catch (e) {
      console.error(`[DB] Migration v${migration.version} (${migration.description}) failed:`, e)
      throw e
    }
  }
}

async function _ensureTableColumns(tableName, columns) {
  const existingColumns = await db.getTableColumns(tableName)
  const lower = new Set([...existingColumns].map((c) => String(c).toLowerCase()))
  for (const [columnName, columnDefinition] of columns) {
    if (existingColumns.has(columnName) || lower.has(String(columnName).toLowerCase())) continue
    try {
      await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
      lower.add(String(columnName).toLowerCase())
    } catch (e) {
      // 并发/历史建表已含该列时不要让整次 init 挂掉
      if (!/duplicate column/i.test(String(e?.message || e))) throw e
    }
  }
}

//  统一对外 API

/**
 * 所有对外读写 API 首行 await initDB()：成功后共享同一个已解决 promise（无额外开销），
 * 失败后 initPromise 被清除、下次调用自动重试，避免在半迁移状态下静默读写。
 * 迁移内部直接持有 adapter（migration.up(db)），不经过对外 API，不会与守卫形成递归。
 * @returns {Promise<void>}
 */
export function initDB() {
  // 并发调用共享同一个初始化 promise，避免建表/迁移竞态；失败后清除以允许重试
  if (!initPromise) {
    initPromise = _doInitDB().catch((e) => {
      initPromise = null
      throw e
    })
  }
  return initPromise
}

async function _doInitDB() {
  if (isInitialized && isSchemaSynced && db) {
    return
  }

  db = await getDb()
  
  const t1 = performance.now()
  await db.open()
  const openTime = performance.now() - t1
  
  // Only create tables on first init (skip if they already exist)
  const t2 = performance.now()
  if (!isInitialized) {
    // Combine all CREATE TABLE statements into a single execute() call
    // to reduce overhead of multiple SQL.js invocations
    // (CREATE TABLE IF NOT EXISTS is idempotent, safe for re-init)
    const allCreateSQL = [
      CREATE_TABLE_SQL,
      CREATE_EVENTS_TABLE_SQL,
      CREATE_RECHARGE_TABLE_SQL,
      CREATE_GOODS_GROUPS_TABLE_SQL,
      CREATE_GOODS_GROUP_ITEMS_TABLE_SQL,
      CREATE_BATCH_DRAFTS_TABLE_SQL,
      CREATE_VERSION_TABLE_SQL
    ].map(sql => sql.trim()).filter(Boolean).join(';\n') + ';'

    await db.execute(allCreateSQL)
    isInitialized = true
  }
  const createTablesTime = performance.now() - t2

  const t2b = performance.now()
  await Promise.all([
    _ensureTableColumns('goods', GOODS_REQUIRED_COLUMNS),
    _ensureTableColumns('events', EVENTS_REQUIRED_COLUMNS),
    _ensureTableColumns('recharge_records', RECHARGE_REQUIRED_COLUMNS),
    _ensureTableColumns('goods_groups', GOODS_GROUPS_REQUIRED_COLUMNS),
    _ensureTableColumns('goods_group_items', GOODS_GROUP_ITEMS_REQUIRED_COLUMNS)
  ])
  const backfillColumnsTime = performance.now() - t2b

  // Always check version and run migrations
  const t3 = performance.now()
  const currentVersion = await _getSchemaVersion()
  if (currentVersion === 0) {
    await db.run('INSERT OR IGNORE INTO _schema_version (version) VALUES (0)')
  } else if (currentVersion > LATEST_VERSION && currentVersion >= LEGACY_VERSION_RESET_THRESHOLD) {
    // 历史遗留数据库 (version 26) → 重置到 0 让新迁移跑；
    // 仅锁定遗留值，OTA 回滚产生的略高版本号（新 schema 为超集）不重置
    await db.run('UPDATE _schema_version SET version = 0')
  }
  const versionCheckTime = performance.now() - t3

  const t4 = performance.now()
  await _runMigrations()
  const migrationsTime = performance.now() - t4
  isSchemaSynced = true

  // info 级：进日志缓冲，反馈日志可见 DB 初始化耗时与适配器类型
  log.info('init:timings', {
    adapter: IS_NATIVE ? 'native' : 'web',
    openMs: Number(openTime.toFixed(1)),
    createTablesMs: Number(createTablesTime.toFixed(1)),
    backfillColumnsMs: Number(backfillColumnsTime.toFixed(1)),
    versionCheckMs: Number(versionCheckTime.toFixed(1)),
    migrationsMs: Number(migrationsTime.toFixed(1))
  })
}

/**
 * 将未落盘的写入立即刷入持久化存储
 * Web 端：取消防抖并立刻导出到 IndexedDB；原生端 SQLite 写入即落盘，为 no-op
 * @returns {Promise<void>}
 */
export async function flushDbWrites() {
  if (!db || typeof db.flush !== 'function') return
  try {
    await db.flush()
  } catch (e) {
    console.error('[db] flushDbWrites failed:', e)
  }
}

/** @returns {Promise<import('@/types/models').GoodsItem[]>} */
export async function getItems() {
  await initDB()
  try {
    // ORDER BY rowid DESC：「最近写入在前」语义。INSERT OR REPLACE 会重建 rowid，
    // 整批保存会把行挪到最前，顺序不稳定；主页展示由 sortHomeGoodsList 按业务字段
    // 在内存重排，上层勿直接依赖此顺序
    // WHERE (trashed IS NULL OR trashed = 0)：活跃桶读取；回收站桶经 getTrashedItems()
    // 按 trashed=1 从同一张 goods 表读取（同表软删除，单行唯一归属一个桶）
    const rows = await db.query(`SELECT ${GOODS_SELECT_COLUMNS} FROM goods WHERE (trashed IS NULL OR trashed = 0) ORDER BY rowid DESC`)
    return rows.map(mapGoodsRow)
  } catch (e) {
    console.error('[db] getItems failed:', e)
    throw e
  }
}

/**
 * 回收站桶：goods 表内 trashed=1 的软删除行。
 * 与活跃桶同表读取，同 id 不可能同时出现在两个桶（主键唯一 + trashed 标记分桶）。
 * @returns {Promise<import('@/types/models').TrashGoodsItem[]>}
 */
export async function getTrashedItems() {
  await initDB()
  try {
    const rows = await db.query(`SELECT ${GOODS_SELECT_COLUMNS} FROM goods WHERE trashed = 1 ORDER BY rowid DESC`)
    return rows.map(mapGoodsRow)
  } catch (e) {
    console.error('[db] getTrashedItems failed:', e)
    throw e
  }
}

function mapGoodsRow(r) {
  return {
    ...r,
    trashed: Boolean(r.trashed),
    deletedAt: String(r.deletedAt || ''),
    isWishlist: normalizeWishlistFlag(r.isWishlist),
    goodsId: String(r.goodsId || '').trim(),
    characters: parseJsonArray(r.characters),
    tags: parseJsonArray(r.tags),
    saleReminderEnabled: normalizeWishlistFlag(r.saleReminderEnabled),
    saleReminderOffsets: parseJsonArray(r.saleReminderOffsets),
    unitAcquiredAtList: parseJsonArray(r.unitAcquiredAtList),
    unitActualPriceList: parseJsonArray(r.unitActualPriceList),
    unitCharacterList: parseJsonArray(r.unitCharacterList),
    unitCollectStatusList: parseJsonArray(r.unitCollectStatusList),
    images: parseJsonArray(r.images),
    tracks: parseJsonArray(r.tracks),
    storageLocation: String(r.storageLocation || '').trim(),
    variant: String(r.variant || '').trim(),
    actualPrice: String(r.actualPrice || '').trim(),
    quantity: Number(r.quantity ?? 1) || 1,
    points: r.points != null && r.points !== '' ? Number(r.points) : undefined,
    updatedAt: Number(r.updatedAt) || 0,
    currency: String(r.currency || '').trim() || 'CNY',
    actualPriceCurrency: String(r.actualPriceCurrency || '').trim() || 'CNY',
    sellPrice: String(r.sellPrice || '').trim(),
    sellPlatform: String(r.sellPlatform || '').trim(),
    sellFee: String(r.sellFee || '').trim(),
    sellDate: String(r.sellDate || '').trim(),
    unitSaleInfoList: parseJsonArray(r.unitSaleInfoList),
    shippingEvents: parseJsonArray(r.shippingEvents),
    statusTimeline: parseJsonArray(r.statusTimeline),
    manualOrders: (() => {
      try {
        const parsed = typeof r.manualOrders === 'string' ? JSON.parse(r.manualOrders || '{}') : r.manualOrders
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        return {}
      }
    })()
  }
}

/** @param {Partial<import('@/types/models').GoodsItem>} item */
export async function addItem(item) {
  await initDB()
  try {
    const record = prepareGoodsRecord(item)
    await db.run(GOODS_INSERT_SQL, goodsRecordToValues(record))
  } catch (e) {
    console.error('[db] addItem failed:', e)
    throw e
  }
}

/** @param {Partial<import('@/types/models').GoodsItem>[]} items */
export async function saveItems(items) {
  if (!items || items.length === 0) return
  await initDB()
  try {
    const stmts = items.map(item => {
      const record = prepareGoodsRecord(item)
      return { statement: GOODS_INSERT_SQL, values: goodsRecordToValues(record) }
    })
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] saveItems failed:', e)
    throw e
  }
}

/** @param {string[]} ids */
export async function deleteItems(ids) {
  if (!ids || ids.length === 0) return
  await initDB()
  try {
    const stmts = ids.map(id => ({
      statement: 'DELETE FROM goods WHERE id = ?',
      values: [id]
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] deleteItems failed:', e)
    throw e
  }
}

/** @returns {Promise<import('@/types/models').EventItem[]>} */
export async function getEvents() {
  await initDB()
  try {
    const rows = await db.query(
      'SELECT * FROM events ORDER BY startDate DESC, updatedAt DESC, createdAt DESC, name ASC, id ASC'
    )
    return rows.map(r => {
      let parsedCoverImageData = null
      try {
        const parsed = JSON.parse(r.coverImageData || '{}')
        parsedCoverImageData = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      } catch {
        parsedCoverImageData = null
      }

      const coverImageFileName = String(parsedCoverImageData?.cloudFileName || parseCloudImageUri(r.coverImage) || '').trim()
      const coverImageData = coverImageFileName
        ? {
            ...parsedCoverImageData,
            uri: parsedCoverImageData?.uri || buildCloudImageUri(coverImageFileName),
            storageMode: parsedCoverImageData?.storageMode || 'cloud-local',
            cloudFileName: coverImageFileName
          }
        : parsedCoverImageData

      return {
        ...r,
        coverImageData,
        photos: parseJsonArray(r.photos),
        selectedDates: parseJsonArray(r.selectedDates),
        dayTicketList: parseJsonArray(r.dayTicketList),
        otherExpenses: parseJsonArray(r.otherExpenses),
        tracks: parseJsonArray(r.tracks),
        linkedGoodsIds: parseJsonArray(r.linkedGoodsIds),
        tags: parseJsonArray(r.tags),
        deleted: Boolean(r.deleted),
        createdAt: Number(r.createdAt) || 0,
        updatedAt: Number(r.updatedAt) || 0
      }
    })
  } catch (e) {
    console.error('[db] getEvents failed:', e)
    throw e
  }
}

/** @param {Partial<import('@/types/models').EventItem>} event */
export async function addEvent(event) {
  await initDB()
  try {
    await db.run(EVENTS_INSERT_SQL, prepareEventValues(event))
  } catch (e) {
    console.error('[db] addEvent failed:', e)
    throw e
  }
}

/** @param {Partial<import('@/types/models').EventItem>[]} events */
export async function saveEvents(events) {
  if (!events || events.length === 0) return
  await initDB()
  try {
    const stmts = events.map(event => ({
      statement: EVENTS_INSERT_SQL,
      values: prepareEventValues(event)
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] saveEvents failed:', e)
    throw e
  }
}

/** @param {string[]} ids */
export async function deleteEvents(ids) {
  if (!ids || ids.length === 0) return
  await initDB()
  try {
    const stmts = ids.map(id => ({
      statement: 'DELETE FROM events WHERE id = ?',
      values: [id]
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] deleteEvents failed:', e)
    throw e
  }
}

/** @returns {Promise<Array>} */
export async function getRechargeRecords() {
  await initDB()
  try {
    const rows = await db.query('SELECT * FROM recharge_records ORDER BY updatedAt DESC')
    return rows.map(r => ({
      ...r,
      amount: Number(r.amount) || 0,
      deleted: Boolean(r.deleted),
      updatedAt: Number(r.updatedAt) || 0
    }))
  } catch (e) {
    console.error('[db] getRechargeRecords failed:', e)
    throw e
  }
}

/** @param {object} record */
export async function addRechargeRecord(record) {
  await initDB()
  try {
    await db.run(RECHARGE_INSERT_SQL, prepareRechargeRecord(record))
  } catch (e) {
    console.error('[db] addRechargeRecord failed:', e)
    throw e
  }
}

/** @param {object[]} records */
export async function saveRechargeRecords(records) {
  if (!records || records.length === 0) return
  await initDB()
  try {
    const stmts = records.map(record => ({
      statement: RECHARGE_INSERT_SQL,
      values: prepareRechargeRecord(record)
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] saveRechargeRecords failed:', e)
    throw e
  }
}

/** @param {string[]} ids */
export async function deleteRechargeRecords(ids) {
  if (!ids || ids.length === 0) return
  await initDB()
  try {
    const stmts = ids.map(id => ({
      statement: 'DELETE FROM recharge_records WHERE id = ?',
      values: [id]
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] deleteRechargeRecords failed:', e)
    throw e
  }
}

// ── Goods Groups CRUD ──

const GROUPS_INSERT_SQL = 'INSERT OR REPLACE INTO goods_groups (id,name,type,summaryMode,totalAmount,currency,coverMode,coverItemId,displayMode,note,deleted,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'

const GROUP_ITEMS_INSERT_SQL = 'INSERT OR REPLACE INTO goods_group_items (id,groupId,goodsId,sortOrder,deleted,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)'

function prepareGroupRecord(group) {
  const now = Date.now()
  return [
    group.id,
    group.name || '',
    group.type || 'collection',
    group.summaryMode || 'auto',
    Number(group.totalAmount) || 0,
    group.currency || 'CNY',
    group.coverMode || 'auto',
    group.coverItemId || '',
    group.displayMode || 'list',
    group.note || '',
    group.deleted ? 1 : 0,
    group.createdAt || now,
    group.updatedAt || now
  ]
}

function prepareGroupItemRecord(item) {
  const now = Date.now()
  return [
    item.id,
    item.groupId,
    item.goodsId,
    Number(item.sortOrder) || 0,
    item.deleted ? 1 : 0,
    item.createdAt || now,
    item.updatedAt || now
  ]
}

/** @returns {Promise<import('@/types/models').GoodsGroup[]>} */
export async function getGroups() {
  await initDB()
  try {
    const rows = await db.query('SELECT * FROM goods_groups ORDER BY updatedAt DESC')
    return rows.map(r => ({
      ...r,
      totalAmount: Number(r.totalAmount) || 0,
      deleted: Boolean(r.deleted),
      createdAt: Number(r.createdAt) || 0,
      updatedAt: Number(r.updatedAt) || 0
    }))
  } catch (e) {
    console.error('[db] getGroups failed:', e)
    throw e
  }
}

/** @param {object} group */
export async function addGroup(group) {
  await initDB()
  try {
    await db.run(GROUPS_INSERT_SQL, prepareGroupRecord(group))
  } catch (e) {
    console.error('[db] addGroup failed:', e)
    throw e
  }
}

/** @param {object[]} groups */
export async function saveGroups(groups) {
  if (!groups || groups.length === 0) return
  await initDB()
  try {
    const stmts = groups.map(group => ({
      statement: GROUPS_INSERT_SQL,
      values: prepareGroupRecord(group)
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] saveGroups failed:', e)
    throw e
  }
}

/** @param {string[]} ids */
export async function deleteGroups(ids) {
  if (!ids || ids.length === 0) return
  await initDB()
  try {
    const stmts = ids.map(id => ({
      statement: 'DELETE FROM goods_groups WHERE id = ?',
      values: [id]
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] deleteGroups failed:', e)
    throw e
  }
}

/** @returns {Promise<import('@/types/models').GoodsGroupItem[]>} */
export async function getGroupItems() {
  await initDB()
  try {
    const rows = await db.query('SELECT * FROM goods_group_items ORDER BY sortOrder ASC')
    return rows.map(r => ({
      ...r,
      sortOrder: Number(r.sortOrder) || 0,
      deleted: Boolean(r.deleted),
      createdAt: Number(r.createdAt) || 0,
      updatedAt: Number(r.updatedAt) || 0
    }))
  } catch (e) {
    console.error('[db] getGroupItems failed:', e)
    throw e
  }
}

/** @param {object} item */
export async function addGroupItem(item) {
  await initDB()
  try {
    await db.run(GROUP_ITEMS_INSERT_SQL, prepareGroupItemRecord(item))
  } catch (e) {
    console.error('[db] addGroupItem failed:', e)
    throw e
  }
}

/** @param {object[]} items */
export async function saveGroupItems(items) {
  if (!items || items.length === 0) return
  await initDB()
  try {
    const stmts = items.map(item => ({
      statement: GROUP_ITEMS_INSERT_SQL,
      values: prepareGroupItemRecord(item)
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] saveGroupItems failed:', e)
    throw e
  }
}

/** @param {string[]} ids */
export async function deleteGroupItems(ids) {
  if (!ids || ids.length === 0) return
  await initDB()
  try {
    const stmts = ids.map(id => ({
      statement: 'DELETE FROM goods_group_items WHERE id = ?',
      values: [id]
    }))
    await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] deleteGroupItems failed:', e)
    throw e
  }
}

/** @param {string} groupId */
export async function deleteGroupItemsByGroupId(groupId) {
  if (!groupId) return
  await initDB()
  try {
    await db.run('DELETE FROM goods_group_items WHERE groupId = ?', [groupId])
  } catch (e) {
    console.error('[db] deleteGroupItemsByGroupId failed:', e)
    throw e
  }
}

/** @param {string} goodsId */
export async function deleteGroupItemsByGoodsId(goodsId) {
  if (!goodsId) return
  await initDB()
  try {
    await db.run('DELETE FROM goods_group_items WHERE goodsId = ?', [goodsId])
  } catch (e) {
    console.error('[db] deleteGroupItemsByGoodsId failed:', e)
    throw e
  }
}

// ── Batch Drafts CRUD ──
// 槽位主键：collection（收藏批量）| wishlist（心愿单批量）
// items/defaults 为 JSON 字符串；图片只存 URI 引用，不把二进制塞进 DB
// deleted：软删墓碑（一键清除 / saveAll 后标 1），同步域靠它传播「对端已清」；活跃读过滤 deleted=0

const BATCH_DRAFT_INSERT_SQL = 'INSERT OR REPLACE INTO batch_drafts (slot,batchId,isWishlist,items,defaults,deleted,updatedAt) VALUES (?,?,?,?,?,?,?)'

function mapBatchDraftRow(row) {
  let items = []
  let defaults = {}
  try { items = JSON.parse(row.items || '[]') } catch { items = [] }
  try { defaults = JSON.parse(row.defaults || '{}') } catch { defaults = {} }
  if (!Array.isArray(items)) items = []
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) defaults = {}
  return {
    id: String(row.slot),
    slot: String(row.slot),
    batchId: String(row.batchId || ''),
    isWishlist: normalizeWishlistFlag(row.isWishlist),
    items,
    defaults,
    deleted: Number(row.deleted) === 1,
    updatedAt: Number(row.updatedAt) || 0
  }
}

/**
 * 读活跃草稿（deleted=0 且 items 非空才视为可恢复）
 * @param {string} slot
 * @returns {Promise<object | null>}
 */
export async function getBatchDraft(slot) {
  if (!slot) return null
  await initDB()
  try {
    const rows = await db.query(
      'SELECT slot,batchId,isWishlist,items,defaults,deleted,updatedAt FROM batch_drafts WHERE slot = ?',
      [slot]
    )
    if (!rows.length) return null
    const draft = mapBatchDraftRow(rows[0])
    if (draft.deleted) return null
    return draft
  } catch (e) {
    console.error('[db] getBatchDraft failed:', e)
    throw e
  }
}

/**
 * 同步 push 用：全量行（含 deleted=1 墓碑）
 * @returns {Promise<object[]>}
 */
export async function getAllBatchDrafts() {
  await initDB()
  try {
    const rows = await db.query(
      'SELECT slot,batchId,isWishlist,items,defaults,deleted,updatedAt FROM batch_drafts ORDER BY slot ASC'
    )
    return rows.map(mapBatchDraftRow)
  } catch (e) {
    console.error('[db] getAllBatchDrafts failed:', e)
    throw e
  }
}

/**
 * @param {{ slot: string, batchId?: string, isWishlist?: boolean, items: any[], defaults?: Record<string, any>, deleted?: boolean, updatedAt?: number }} draft
 */
export async function saveBatchDraft(draft) {
  const slot = String(draft?.slot || draft?.id || '')
  if (!slot) throw new Error('[db] saveBatchDraft: slot is required')
  await initDB()
  try {
    const items = Array.isArray(draft.items) ? draft.items : []
    const defaults = draft.defaults && typeof draft.defaults === 'object' && !Array.isArray(draft.defaults) ? draft.defaults : {}
    await db.run(BATCH_DRAFT_INSERT_SQL, [
      slot,
      String(draft.batchId || ''),
      draft.isWishlist ? 1 : 0,
      JSON.stringify(items),
      JSON.stringify(defaults),
      draft.deleted ? 1 : 0,
      Number(draft.updatedAt) || Date.now()
    ])
  } catch (e) {
    console.error('[db] saveBatchDraft failed:', e)
    throw e
  }
}

/**
 * 软删墓碑：清 items、deleted=1、刷 updatedAt，供同步传播清除
 * @param {string} slot
 */
export async function softDeleteBatchDraft(slot) {
  if (!slot) return
  await initDB()
  try {
    const existing = await db.query('SELECT slot FROM batch_drafts WHERE slot = ?', [slot])
    if (!existing.length) return
    await db.run(
      'UPDATE batch_drafts SET deleted = 1, items = \'[]\', updatedAt = ? WHERE slot = ?',
      [Date.now(), slot]
    )
  } catch (e) {
    console.error('[db] softDeleteBatchDraft failed:', e)
    throw e
  }
}

/**
 * 同步 pull 合并入口：LWW 由调用方（mergeBatchDraftsFromRemote）保证后整行写入
 * @param {object[]} drafts
 */
export async function saveBatchDrafts(drafts) {
  if (!drafts || drafts.length === 0) return
  await initDB()
  try {
    const stmts = drafts.map((draft) => {
      const slot = String(draft?.slot || draft?.id || '')
      if (!slot) return null
      const items = Array.isArray(draft.items) ? draft.items : []
      const defaults = draft.defaults && typeof draft.defaults === 'object' && !Array.isArray(draft.defaults) ? draft.defaults : {}
      return {
        statement: BATCH_DRAFT_INSERT_SQL,
        values: [
          slot,
          String(draft.batchId || ''),
          draft.isWishlist ? 1 : 0,
          JSON.stringify(items),
          JSON.stringify(defaults),
          draft.deleted ? 1 : 0,
          Number(draft.updatedAt) || Date.now()
        ]
      }
    }).filter(Boolean)
    if (stmts.length) await db.executeSet(stmts)
  } catch (e) {
    console.error('[db] saveBatchDrafts failed:', e)
    throw e
  }
}

/**
 * 硬删行——仅测试/损坏修复用；业务清除走 softDeleteBatchDraft
 * @param {string} slot
 */
export async function deleteBatchDraft(slot) {
  if (!slot) return
  await initDB()
  try {
    await db.run('DELETE FROM batch_drafts WHERE slot = ?', [slot])
  } catch (e) {
    console.error('[db] deleteBatchDraft failed:', e)
    throw e
  }
}
