/**
 * utils/db.js
 * 双轨 SQLite 实现：
 *   - 原生端（iOS / Android）：@capacitor-community/sqlite（真正的 .db 文件）
 *   - Web 端（浏览器开发 / PWA）：sql.js 直接驱动 + IndexedDB 持久化
 *
 * 迁移系统：
 *   - 使用 _schema_version 表记录当前数据库版本
 *   - 每次迁移执行前检查列是否已存在（幂等保护）
 *   - 只执行版本号高于当前版本的迁移
 */

import { Capacitor } from '@capacitor/core'
import { buildGistImageUri, getPrimaryGoodsImageUrl, parseGistImageUri } from '@/utils/goodsImages'
import { parseJsonArray } from '@/utils/parseJsonArray'

const IS_NATIVE = Capacitor.isNativePlatform()

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

//  Web 实现：sql.js + IndexedDB
let _sqlDb = null
const IDB_NAME = 'goods_idb'
const IDB_STORE = 'db'
const IDB_KEY = 'goods_app'

function normalizeWishlistFlag(value) {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true'
  }
  return false
}

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
    pts: points != null && points !== '' ? Number(points) : null,
    legacyImage: getPrimaryGoodsImageUrl(images, coverImage || image),
    note,
    ts: updatedAt || Date.now(),
    collectStatus: String(collectStatus || '已拥有'),
    shippingFee: String(shippingFee || '')
  }
}

//  迁移辅助函数

function _parseAlterTable(sql) {
  const m = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i)
  return m ? { table: m[1], column: m[2] } : null
}

function _escapeIdent(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '')
}

async function _getNativeTableColumns(tableName) {
  const result = await _nativeDb.query(`PRAGMA table_info(${_escapeIdent(tableName)})`)
  return new Set((result.values ?? []).map(row => row[1]))
}

function _getWebTableColumns(tableName) {
  const result = _sqlDb.exec(`PRAGMA table_info(${_escapeIdent(tableName)})`)
  if (!result.length) return new Set()
  return new Set(result[0].values.map(row => row[1]))
}

function _parseSqliteError(e) {
  const msg = String(e?.message || e || '').toLowerCase()
  return {
    isDuplicateColumn: msg.includes('duplicate column') || msg.includes('already exists'),
  }
}

async function _runMigrations(runSql, getVersion, setVersion) {
  const current = await getVersion()
  const pending = MIGRATIONS.filter(m => m.version > current)
  if (pending.length === 0) return

  for (const migration of pending) {
    // 幂等保护：解析 ALTER TABLE 并检查列是否已存在
    const info = _parseAlterTable(migration.sql)
    if (info) {
      try {
        let columns
        if (IS_NATIVE) {
          columns = await _getNativeTableColumns(info.table)
        } else {
          columns = _getWebTableColumns(info.table)
        }
        if (columns.has(info.column)) {
          // 列已存在，跳过但记录版本
          await setVersion(migration.version)
          continue
        }
      } catch {
        // PRAGMA 失败时继续尝试迁移
      }
    }

    try {
      await runSql(migration.sql)
      await setVersion(migration.version)
    } catch (e) {
      const { isDuplicateColumn } = _parseSqliteError(e)
      if (isDuplicateColumn) {
        // 列已存在（原生端 PRAGMA 不可用时的兜底），记录版本继续
        await setVersion(migration.version)
      } else {
        console.error(`[DB] Migration v${migration.version} failed:`, e)
        throw e
      }
    }
  }
}

function _openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function _loadBinaryFromIDB() {
  try {
    const db = await _openIDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const get = tx.objectStore(IDB_STORE).get(IDB_KEY)
      get.onsuccess = () => resolve(get.result ?? null)
      get.onerror = () => reject(get.error)
    })
  } catch { return null }
}

async function _saveBinaryToIDB(db) {
  try {
    const data = db.export()
    const idb = await _openIDB()
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(data, IDB_KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) { console.warn('[DB] save to IDB failed:', e) }
}

function stringifyJsonObject(value, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return fallback
  }
}

async function _initWebDB() {
  const { default: initSqlJs } = await import('sql.js')
  const SQL = await initSqlJs({ locateFile: () => '/assets/sql-wasm.wasm' })
  const saved = await _loadBinaryFromIDB()
  _sqlDb = saved ? new SQL.Database(saved) : new SQL.Database()
  _sqlDb.run(CREATE_TABLE_SQL)
  _sqlDb.run(CREATE_EVENTS_TABLE_SQL)
  _sqlDb.run(CREATE_VERSION_TABLE_SQL)

  await _runMigrations(
    (sql) => { _sqlDb.run(sql) },
    () => _getWebSchemaVersion(),
    (v) => { _sqlDb.run('UPDATE _schema_version SET version = ?', [v]) }
  )

  // 首次初始化版本表（表刚创建时无数据）
  const ver = _getWebSchemaVersion()
  if (ver === 0) {
    _sqlDb.run(INIT_VERSION_SQL, [SCHEMA_VERSION])
  }

  await _saveBinaryToIDB(_sqlDb)
}

function _getWebSchemaVersion() {
  try {
    const result = _sqlDb.exec('SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1')
    return result.length ? result[0].values[0][0] : 0
  } catch {
    return 0
  }
}

function _webQuery(sql, params = []) {
  if (!_sqlDb) return []
  const result = _sqlDb.exec(sql, params)
  if (!result.length) return []
  const { columns, values } = result[0]
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i] ?? ''])))
}

//  原生实现：@capacitor-community/sqlite
let _nativeDb = null

async function _getNativeSchemaVersion() {
  try {
    const result = await _nativeDb.query('SELECT version FROM _schema_version ORDER BY version DESC LIMIT 1')
    return result.values?.length ? result.values[0][0] : 0
  } catch {
    return 0
  }
}

async function _initNativeDB() {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const consistency = await sqlite.checkConnectionsConsistency()
  const isConn = (await sqlite.isConnection('goods_app', false)).result
  if (consistency.result && isConn) {
    _nativeDb = await sqlite.retrieveConnection('goods_app', false)
  } else {
    _nativeDb = await sqlite.createConnection('goods_app', false, 'no-encryption', 1, false)
  }
  await _nativeDb.open()
  await _nativeDb.execute(CREATE_TABLE_SQL)
  await _nativeDb.execute(CREATE_EVENTS_TABLE_SQL)
  await _nativeDb.execute(CREATE_VERSION_TABLE_SQL)

  await _runMigrations(
    (sql) => _nativeDb.execute(sql),
    () => _getNativeSchemaVersion(),
    async (v) => { await _nativeDb.run('UPDATE _schema_version SET version = ?', [v]) }
  )

  // 首次初始化版本表
  const ver = await _getNativeSchemaVersion()
  if (ver === 0) {
    await _nativeDb.run(INIT_VERSION_SQL, [SCHEMA_VERSION])
  }
}

//  统一对外 API
export async function initDB() {
  if (IS_NATIVE) { await _initNativeDB() } else { await _initWebDB() }
}

export async function getItems() {
  try {
    let rows = []
    if (IS_NATIVE) {
      if (!_nativeDb) return []
      rows = (await _nativeDb.query('SELECT * FROM goods ORDER BY rowid DESC')).values ?? []
    } else {
      rows = _webQuery('SELECT id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee FROM goods ORDER BY rowid DESC')
    }
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

export async function addItem(item) {
  try {
    const record = prepareGoodsRecord(item)
    const SQL = 'INSERT OR REPLACE INTO goods (id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    const p = [record.id, record.name, record.category, record.ip, record.goodsId, record.isWishlist, record.charsStr, record.tagsStr, record.storageLocation, record.variant, record.price, record.actualPrice, record.acquiredAt, record.currency, record.actualPriceCurrency, record.unitDatesStr, record.unitPricesStr, record.unitCharactersStr, record.legacyImage, record.imagesStr, record.tracksStr, record.note, record.qty, record.pts, record.ts, record.collectStatus, record.shippingFee]
    if (IS_NATIVE) {
      if (!_nativeDb) return
      await _nativeDb.run(SQL, p)
    } else {
      if (!_sqlDb) return
      _sqlDb.run(SQL, p)
      await _saveBinaryToIDB(_sqlDb)
    }
  } catch (e) {
    console.error('[db] addItem failed:', e)
    throw e
  }
}

export async function saveItems(items) {
  if (!items || items.length === 0) return
  try {
    if (IS_NATIVE) {
      if (!_nativeDb) return
      const stmts = []
      for (const item of items) {
        const record = prepareGoodsRecord(item)
        stmts.push({
          statement: 'INSERT OR REPLACE INTO goods (id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          values: [record.id, record.name, record.category, record.ip, record.goodsId, record.isWishlist, record.charsStr, record.tagsStr, record.storageLocation, record.variant, record.price, record.actualPrice, record.acquiredAt, record.currency, record.actualPriceCurrency, record.unitDatesStr, record.unitPricesStr, record.unitCharactersStr, record.legacyImage, record.imagesStr, record.tracksStr, record.note, record.qty, record.pts, record.ts, record.collectStatus, record.shippingFee]
        })
      }
      await _nativeDb.executeSet(stmts)
    } else {
      if (!_sqlDb) return
      for (const item of items) {
        const record = prepareGoodsRecord(item)
        _sqlDb.run(
          'INSERT OR REPLACE INTO goods (id,name,category,ip,goodsId,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,currency,actualPriceCurrency,unitAcquiredAtList,unitActualPriceList,unitCharacterList,image,images,tracks,note,quantity,points,updatedAt,collectStatus,shippingFee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [record.id, record.name, record.category, record.ip, record.goodsId, record.isWishlist, record.charsStr, record.tagsStr, record.storageLocation, record.variant, record.price, record.actualPrice, record.acquiredAt, record.currency, record.actualPriceCurrency, record.unitDatesStr, record.unitPricesStr, record.unitCharactersStr, record.legacyImage, record.imagesStr, record.tracksStr, record.note, record.qty, record.pts, record.ts, record.collectStatus, record.shippingFee]
        )
      }
      await _saveBinaryToIDB(_sqlDb)
    }
  } catch (e) {
    console.error('[db] saveItems failed:', e)
    throw e
  }
}

export async function deleteItems(ids) {
  if (!ids || ids.length === 0) return
  try {
    if (IS_NATIVE) {
      if (!_nativeDb) return
      const stmts = ids.map(id => ({
        statement: 'DELETE FROM goods WHERE id = ?',
        values: [id]
      }))
      await _nativeDb.executeSet(stmts)
    } else {
      if (!_sqlDb) return
      for (const id of ids) {
        _sqlDb.run('DELETE FROM goods WHERE id = ?', [id])
      }
      await _saveBinaryToIDB(_sqlDb)
    }
  } catch (e) {
    console.error('[db] deleteItems failed:', e)
    throw e
  }
}

export async function getEvents() {
  try {
    let rows = []
    if (IS_NATIVE) {
      if (!_nativeDb) return []
      rows = (await _nativeDb.query('SELECT * FROM events ORDER BY startDate DESC')).values ?? []
    } else {
      if (!_sqlDb) return []
      rows = _webQuery('SELECT * FROM events ORDER BY startDate DESC')
    }
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

export async function addEvent(event) {
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
  const SQL = 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,coverImageData,photos,ticketPrice,ticketType,seatInfo,tracks,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  const p = [id, name, type, startDate, endDate, location, description, coverImage, coverImageDataStr, photosStr, ticketPrice, ticketType, seatInfo, tracksStr, linkedGoodsStr, tagsStr, created, ts]
  if (IS_NATIVE) {
    if (!_nativeDb) return
    await _nativeDb.run(SQL, p)
  } else {
    if (!_sqlDb) return
    _sqlDb.run(SQL, p)
    await _saveBinaryToIDB(_sqlDb)
  }
}

export async function saveEvents(events) {
  if (!events || events.length === 0) return
  if (IS_NATIVE) {
    if (!_nativeDb) return
    const stmts = []
    for (const event of events) {
      const {
        id, name = '', type = '', startDate = '', endDate = '',
        location = '', description = '', coverImage = '', coverImageData = {},
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
      stmts.push({
        statement: 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,coverImageData,photos,ticketPrice,ticketType,seatInfo,tracks,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        values: [id, name, type, startDate, endDate, location, description, coverImage, coverImageDataStr, photosStr, ticketPrice, ticketType, seatInfo, tracksStr, linkedGoodsStr, tagsStr, created, ts]
      })
    }
    await _nativeDb.executeSet(stmts)
  } else {
    if (!_sqlDb) return
    for (const event of events) {
      const {
        id, name = '', type = '', startDate = '', endDate = '',
        location = '', description = '', coverImage = '', coverImageData = {},
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
      _sqlDb.run(
        'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,coverImageData,photos,ticketPrice,ticketType,seatInfo,tracks,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, name, type, startDate, endDate, location, description, coverImage, coverImageDataStr, photosStr, ticketPrice, ticketType, seatInfo, tracksStr, linkedGoodsStr, tagsStr, created, ts]
      )
    }
    await _saveBinaryToIDB(_sqlDb)
  }
}

export async function deleteEvents(ids) {
  if (!ids || ids.length === 0) return
  if (IS_NATIVE) {
    if (!_nativeDb) return
    const stmts = ids.map(id => ({
      statement: 'DELETE FROM events WHERE id = ?',
      values: [id]
    }))
    await _nativeDb.executeSet(stmts)
  } else {
    if (!_sqlDb) return
    for (const id of ids) {
      _sqlDb.run('DELETE FROM events WHERE id = ?', [id])
    }
    await _saveBinaryToIDB(_sqlDb)
  }
}
