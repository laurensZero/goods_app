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
 *   - 遗留数据库 (version > LATEST_VERSION) 自动重置到 0
 */

import { Capacitor } from '@capacitor/core'
import { buildGistImageUri, getPrimaryGoodsImageUrl, parseGistImageUri } from '@/utils/goods/images'
import { parseJsonArray } from '@/utils/parseJsonArray'
import { MIGRATIONS } from './migrations'

const IS_NATIVE = Capacitor.isNativePlatform()

/**
 * @typedef {Object} DatabaseAdapter
 * @property {() => Promise<void>} open
 * @property {(sql: string) => Promise<void>} execute
 * @property {(sql: string, params?: any[]) => Promise<void>} run
 * @property {(stmts: {statement: string, values: any[]}[]) => Promise<void>} executeSet
 * @property {(sql: string, params?: any[]) => Promise<any[]>} query
 * @property {(tableName: string) => Promise<Set<string>>} getTableColumns
 */

/** @type {DatabaseAdapter | null} */
let db = null
let isInitialized = false

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
    unitAcquiredAtList TEXT DEFAULT '[]',
    unitActualPriceList TEXT DEFAULT '[]',
    unitCharacterList TEXT DEFAULT '[]',
    unitCollectStatusList TEXT DEFAULT '[]',
    image      TEXT DEFAULT '',
    images     TEXT DEFAULT '[]',
    tracks     TEXT DEFAULT '[]',
    note       TEXT DEFAULT '',
    quantity   INTEGER DEFAULT 1,
    points     INTEGER DEFAULT NULL,
    currency   TEXT DEFAULT 'CNY',
    actualPriceCurrency TEXT DEFAULT 'CNY',
    collectStatus TEXT DEFAULT '已拥有',
    shippingFee TEXT DEFAULT '',
    updatedAt  INTEGER DEFAULT 0
  );
`

const CREATE_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    type       TEXT DEFAULT '',
    startDate  TEXT DEFAULT '',
    endDate    TEXT DEFAULT '',
    location   TEXT DEFAULT '',
    description TEXT DEFAULT '',
    coverImage TEXT DEFAULT '',
    coverImageData TEXT DEFAULT '{}',
    photos     TEXT DEFAULT '[]',
    ticketPrice TEXT DEFAULT '',
    ticketType TEXT DEFAULT '',
    seatInfo   TEXT DEFAULT '',
    tracks     TEXT DEFAULT '[]',
    linkedGoodsIds TEXT DEFAULT '[]',
    tags       TEXT DEFAULT '[]',
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

const CREATE_VERSION_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL)'
const LATEST_VERSION = MIGRATIONS.length

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
  ['unitAcquiredAtList', "TEXT DEFAULT '[]'"],
  ['unitActualPriceList', "TEXT DEFAULT '[]'"],
  ['unitCharacterList', "TEXT DEFAULT '[]'"],
  ['unitCollectStatusList', "TEXT DEFAULT '[]'"],
  ['image', "TEXT DEFAULT ''"],
  ['images', "TEXT DEFAULT '[]'"],
  ['tracks', "TEXT DEFAULT '[]'"],
  ['note', "TEXT DEFAULT ''"],
  ['quantity', 'INTEGER DEFAULT 1'],
  ['points', 'INTEGER DEFAULT NULL'],
  ['currency', "TEXT DEFAULT 'CNY'"],
  ['actualPriceCurrency', "TEXT DEFAULT 'CNY'"],
  ['collectStatus', "TEXT DEFAULT '已拥有'"],
  ['shippingFee', "TEXT DEFAULT ''"],
  ['updatedAt', 'INTEGER DEFAULT 0']
]

const EVENTS_REQUIRED_COLUMNS = [
  ['name', "TEXT NOT NULL DEFAULT ''"],
  ['type', "TEXT DEFAULT ''"],
  ['startDate', "TEXT DEFAULT ''"],
  ['endDate', "TEXT DEFAULT ''"],
  ['location', "TEXT DEFAULT ''"],
  ['description', "TEXT DEFAULT ''"],
  ['coverImage', "TEXT DEFAULT ''"],
  ['coverImageData', "TEXT DEFAULT '{}'"],
  ['photos', "TEXT DEFAULT '[]'"],
  ['ticketPrice', "TEXT DEFAULT ''"],
  ['ticketType', "TEXT DEFAULT ''"],
  ['seatInfo', "TEXT DEFAULT ''"],
  ['tracks', "TEXT DEFAULT '[]'"],
  ['linkedGoodsIds', "TEXT DEFAULT '[]'"],
  ['tags', "TEXT DEFAULT '[]'"],
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
    unitAcquiredAtList = [],
    unitActualPriceList = [],
    unitCharacterList = [],
    unitCollectStatusList = [],
    image = '',
    coverImage = '',
    images = [],
    tracks = [],
    note = '',
    quantity = 1,
    points,
    updatedAt,
    currency = 'CNY',
    actualPriceCurrency = 'CNY',
    collectStatus = '已拥有',
    shippingFee = ''
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
    imagesStr: JSON.stringify(Array.isArray(images) ? images : []),
    tracksStr: JSON.stringify(Array.isArray(tracks) ? tracks : []),
    storageLocation,
    variant,
    price,
    actualPrice,
    acquiredAt,
    currency,
    actualPriceCurrency,
    qty: Math.max(1, Number(quantity) || 1),
    pts: points != null && /** @type {any} */ (points) !== '' ? Number(points) : null,
    legacyImage: getPrimaryGoodsImageUrl(images, coverImage || image),
    note,
    ts: updatedAt || Date.now(),
    collectStatus: String(collectStatus || '已拥有'),
    shippingFee: String(shippingFee || '')
  }
}

function stringifyJsonObject(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return fallback
  }
}

const GOODS_INSERT_SQL = 'INSERT OR REPLACE INTO goods (id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,unitCollectStatusList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

function goodsRecordToValues(record) {
  return [record.id, record.name, record.category, record.ip, record.goodsId, record.isWishlist, record.charsStr, record.tagsStr, record.storageLocation, record.variant, record.price, record.actualPrice, record.acquiredAt, record.currency, record.actualPriceCurrency, record.unitDatesStr, record.unitPricesStr, record.unitCharactersStr, record.unitCollectStatusStr, record.legacyImage, record.imagesStr, record.tracksStr, record.note, record.qty, record.pts, record.ts, record.collectStatus, record.shippingFee]
}

const EVENTS_INSERT_SQL = 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,coverImageData,photos,ticketPrice,ticketType,seatInfo,tracks,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

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
    id, name = '', type = '', startDate = '', endDate = '',
    location = '', description = '', coverImage = '',
    coverImageData = {},
    photos = [], ticketPrice = '', ticketType = '', seatInfo = '', tracks = [], linkedGoodsIds = [], tags = [],
    createdAt, updatedAt
  } = event
  const coverImageDataStr = stringifyJsonObject(coverImageData)
  const photosStr = JSON.stringify(Array.isArray(photos) ? photos : [])
  const tracksStr = JSON.stringify(Array.isArray(tracks) ? tracks : [])
  const linkedGoodsStr = JSON.stringify(Array.isArray(linkedGoodsIds) ? linkedGoodsIds : [])
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
  const ts = updatedAt || Date.now()
  const created = createdAt || ts
  return [id, name, type, startDate, endDate, location, description, coverImage, coverImageDataStr, photosStr, ticketPrice, ticketType, seatInfo, tracksStr, linkedGoodsStr, tagsStr, created, ts]
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
      await migration.up(db)
      await db.run('UPDATE _schema_version SET version = ?', [migration.version])
    } catch (e) {
      console.error(`[DB] Migration v${migration.version} (${migration.description}) failed:`, e)
      throw e
    }
  }
}

async function _ensureTableColumns(tableName, columns) {
  const existingColumns = await db.getTableColumns(tableName)
  for (const [columnName, columnDefinition] of columns) {
    if (existingColumns.has(columnName)) continue
    await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
  }
}

//  统一对外 API

/** @returns {Promise<void>} */
export async function initDB() {
  db = await getDb()
  
  const t1 = performance.now()
  await db.open()
  const openTime = performance.now() - t1
  
  // Only create tables on first init (skip if they already exist)
  const t2 = performance.now()
  if (!isInitialized) {
    // Combine all CREATE TABLE statements into a single execute() call
    // to reduce overhead of multiple SQL.js invocations
    const allCreateSQL = [
      CREATE_TABLE_SQL,
      CREATE_EVENTS_TABLE_SQL,
      CREATE_RECHARGE_TABLE_SQL,
      CREATE_VERSION_TABLE_SQL
    ].map(sql => sql.trim()).filter(Boolean).join(';\n') + ';'
    
    await db.execute(allCreateSQL)
    isInitialized = true
  }
  const createTablesTime = performance.now() - t2

  const t2b = performance.now()
  await _ensureTableColumns('goods', GOODS_REQUIRED_COLUMNS)
  await _ensureTableColumns('events', EVENTS_REQUIRED_COLUMNS)
  await _ensureTableColumns('recharge_records', RECHARGE_REQUIRED_COLUMNS)
  const backfillColumnsTime = performance.now() - t2b

  // Always check version and run migrations
  const t3 = performance.now()
  const currentVersion = await _getSchemaVersion()
  if (currentVersion === 0) {
    await db.run('INSERT OR IGNORE INTO _schema_version (version) VALUES (0)')
  } else if (currentVersion > LATEST_VERSION) {
    // 遗留数据库 (version 26) → 重置到 0 让新迁移跑
    await db.run('UPDATE _schema_version SET version = 0')
  }
  const versionCheckTime = performance.now() - t3

  const t4 = performance.now()
  await _runMigrations()
  const migrationsTime = performance.now() - t4

  // Log detailed timings only in development
  if (import.meta.env.DEV) {
    console.log(
      '[db] initDB detailed timings (ms):\n' +
      `  db.open: ${openTime.toFixed(1)}\n` +
      `  createTables: ${createTablesTime.toFixed(1)}\n` +
      `  backfillColumns: ${backfillColumnsTime.toFixed(1)}\n` +
      `  versionCheck: ${versionCheckTime.toFixed(1)}\n` +
      `  migrations: ${migrationsTime.toFixed(1)}`
    )
  }
}

/** @returns {Promise<import('@/types/models').GoodsItem[]>} */
export async function getItems() {
  try {
    const rows = await db.query('SELECT id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,unitCollectStatusList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee FROM goods ORDER BY rowid DESC')
    return rows.map(r => ({
      ...r,
      isWishlist: normalizeWishlistFlag(r.isWishlist),
      goodsId: String(r.goodsId || '').trim(),
      characters: parseJsonArray(r.characters),
      tags: parseJsonArray(r.tags),
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
      actualPriceCurrency: String(r.actualPriceCurrency || '').trim() || 'CNY'
    }))
  } catch (e) {
    console.error('[db] getItems failed:', e)
    throw e
  }
}

/** @param {Partial<import('@/types/models').GoodsItem>} item */
export async function addItem(item) {
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
  try {
    const rows = await db.query('SELECT * FROM events ORDER BY startDate DESC')
    return rows.map(r => {
      let parsedCoverImageData = null
      try {
        const parsed = JSON.parse(r.coverImageData || '{}')
        parsedCoverImageData = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
      } catch {
        parsedCoverImageData = null
      }

      const coverImageFileName = String(parsedCoverImageData?.gistFileName || parseGistImageUri(r.coverImage) || '').trim()
      const coverImageData = coverImageFileName
        ? {
            ...parsedCoverImageData,
            uri: parsedCoverImageData?.uri || buildGistImageUri(coverImageFileName),
            storageMode: parsedCoverImageData?.storageMode || 'gist-local',
            gistFileName: coverImageFileName
          }
        : parsedCoverImageData

      return {
        ...r,
        coverImageData,
        photos: parseJsonArray(r.photos),
        tracks: parseJsonArray(r.tracks),
        linkedGoodsIds: parseJsonArray(r.linkedGoodsIds),
        tags: parseJsonArray(r.tags),
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
