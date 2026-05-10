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
 *   - 使用 _schema_version 表记录当前数据库版本
 *   - 每次迁移执行前检查列是否已存在（幂等保护）
 *   - 只执行版本号高于当前版本的迁移
 */

import { Capacitor } from '@capacitor/core'
import { buildGistImageUri, getPrimaryGoodsImageUrl, parseGistImageUri } from '@/utils/goodsImages'
import { parseJsonArray } from '@/utils/parseJsonArray'
import { createNativeAdapter } from '@/utils/dbNativeAdapter'
import { createWebAdapter } from '@/utils/dbWebAdapter'

const IS_NATIVE = Capacitor.isNativePlatform()
const db = IS_NATIVE ? createNativeAdapter() : createWebAdapter()

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
    image      TEXT DEFAULT '',
    images     TEXT DEFAULT '[]',
    tracks     TEXT DEFAULT '[]',
    note       TEXT DEFAULT '',
    quantity   INTEGER DEFAULT 1,
    points     INTEGER DEFAULT NULL,
    currency   TEXT DEFAULT 'CNY',
    actualPriceCurrency TEXT DEFAULT 'CNY',
    collectStatus TEXT DEFAULT '已拥有',
    shippingFee TEXT DEFAULT ''
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

//  版本化数据库迁移
const CREATE_VERSION_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL)'
const INIT_VERSION_SQL = 'INSERT INTO _schema_version (version) VALUES (?)'

const MIGRATIONS = [
  { version: 1,  sql: "ALTER TABLE goods ADD COLUMN ip TEXT DEFAULT ''" },
  { version: 2,  sql: "ALTER TABLE goods ADD COLUMN goodsId TEXT DEFAULT ''" },
  { version: 3,  sql: "ALTER TABLE goods ADD COLUMN isWishlist INTEGER DEFAULT 0" },
  { version: 4,  sql: "ALTER TABLE goods ADD COLUMN characters TEXT DEFAULT '[]'" },
  { version: 5,  sql: "ALTER TABLE goods ADD COLUMN tags TEXT DEFAULT '[]'" },
  { version: 6,  sql: "ALTER TABLE goods ADD COLUMN storageLocation TEXT DEFAULT ''" },
  { version: 7,  sql: "ALTER TABLE goods ADD COLUMN variant TEXT DEFAULT ''" },
  { version: 8,  sql: "ALTER TABLE goods ADD COLUMN actualPrice TEXT DEFAULT ''" },
  { version: 9,  sql: "ALTER TABLE goods ADD COLUMN quantity INTEGER DEFAULT 1" },
  { version: 10, sql: "ALTER TABLE goods ADD COLUMN points INTEGER DEFAULT NULL" },
  { version: 11, sql: "ALTER TABLE goods ADD COLUMN images TEXT DEFAULT '[]'" },
  { version: 12, sql: "ALTER TABLE goods ADD COLUMN unitAcquiredAtList TEXT DEFAULT '[]'" },
  { version: 13, sql: "ALTER TABLE goods ADD COLUMN unitActualPriceList TEXT DEFAULT '[]'" },
  { version: 14, sql: "ALTER TABLE goods ADD COLUMN unitCharacterList TEXT DEFAULT '[]'" },
  { version: 15, sql: "ALTER TABLE goods ADD COLUMN tracks TEXT DEFAULT '[]'" },
  { version: 16, sql: "ALTER TABLE goods ADD COLUMN updatedAt INTEGER DEFAULT 0" },
  { version: 17, sql: "ALTER TABLE goods ADD COLUMN currency TEXT DEFAULT 'CNY'" },
  { version: 18, sql: "ALTER TABLE goods ADD COLUMN actualPriceCurrency TEXT DEFAULT 'CNY'" },
  { version: 19, sql: "ALTER TABLE goods ADD COLUMN collectStatus TEXT DEFAULT '已拥有'" },
  { version: 20, sql: "ALTER TABLE goods ADD COLUMN shippingFee TEXT DEFAULT ''" },
  { version: 21, sql: "ALTER TABLE events ADD COLUMN ticketType TEXT DEFAULT ''" },
  { version: 22, sql: "ALTER TABLE events ADD COLUMN seatInfo TEXT DEFAULT ''" },
  { version: 23, sql: "ALTER TABLE events ADD COLUMN tracks TEXT DEFAULT '[]'" },
  { version: 24, sql: "ALTER TABLE events ADD COLUMN linkedGoodsIds TEXT DEFAULT '[]'" },
  { version: 25, sql: "ALTER TABLE events ADD COLUMN tags TEXT DEFAULT '[]'" },
  { version: 26, sql: "ALTER TABLE events ADD COLUMN coverImageData TEXT DEFAULT '{}'" },
]

const SCHEMA_VERSION = MIGRATIONS.length

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

const GOODS_INSERT_SQL = 'INSERT OR REPLACE INTO goods (id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

function goodsRecordToValues(record) {
  return [record.id, record.name, record.category, record.ip, record.goodsId, record.isWishlist, record.charsStr, record.tagsStr, record.storageLocation, record.variant, record.price, record.actualPrice, record.acquiredAt, record.currency, record.actualPriceCurrency, record.unitDatesStr, record.unitPricesStr, record.unitCharactersStr, record.legacyImage, record.imagesStr, record.tracksStr, record.note, record.qty, record.pts, record.ts, record.collectStatus, record.shippingFee]
}

const EVENTS_INSERT_SQL = 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,coverImageData,photos,ticketPrice,ticketType,seatInfo,tracks,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'

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

//  迁移系统

function _parseAlterTable(sql) {
  const m = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i)
  return m ? { table: m[1], column: m[2] } : null
}

function _parseSqliteError(e) {
  const msg = String(e?.message || e || '').toLowerCase()
  return {
    isDuplicateColumn: msg.includes('duplicate column') || msg.includes('already exists'),
  }
}

async function _getSchemaVersion() {
  try {
    const rows = await db.query('SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1')
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
    const info = _parseAlterTable(migration.sql)
    if (info) {
      try {
        const columns = await db.getTableColumns(info.table)
        if (columns.has(info.column)) {
          await db.run('UPDATE _schema_version SET version = ?', [migration.version])
          continue
        }
      } catch {
        // PRAGMA 失败时继续尝试迁移
      }
    }

    try {
      await db.run(migration.sql)
      await db.run('UPDATE _schema_version SET version = ?', [migration.version])
    } catch (e) {
      const { isDuplicateColumn } = _parseSqliteError(e)
      if (isDuplicateColumn) {
        await db.run('UPDATE _schema_version SET version = ?', [migration.version])
      } else {
        console.error(`[DB] Migration v${migration.version} failed:`, e)
        throw e
      }
    }
  }
}

//  统一对外 API

/** @returns {Promise<void>} */
export async function initDB() {
  await db.open()
  await db.execute(CREATE_TABLE_SQL)
  await db.execute(CREATE_EVENTS_TABLE_SQL)
  await db.execute(CREATE_VERSION_TABLE_SQL)
  await _runMigrations()

  const ver = await _getSchemaVersion()
  if (ver === 0) {
    await db.run(INIT_VERSION_SQL, [SCHEMA_VERSION])
  }
}

/** @returns {Promise<import('@/types/models').GoodsItem[]>} */
export async function getItems() {
  try {
    const rows = await db.query('SELECT id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee FROM goods ORDER BY rowid DESC')
    return rows.map(r => ({
      ...r,
      isWishlist: normalizeWishlistFlag(r.isWishlist),
      goodsId: String(r.goodsId || '').trim(),
      characters: parseJsonArray(r.characters),
      tags: parseJsonArray(r.tags),
      unitAcquiredAtList: parseJsonArray(r.unitAcquiredAtList),
      unitActualPriceList: parseJsonArray(r.unitActualPriceList),
      unitCharacterList: parseJsonArray(r.unitCharacterList),
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
