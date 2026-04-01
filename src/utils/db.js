/**
 * utils/db.js
 * 双轨 SQLite 实现：
 *   - 原生端（iOS / Android）：@capacitor-community/sqlite（真正的 .db 文件）
 *   - Web 端（浏览器开发 / PWA）：sql.js 直接驱动 + IndexedDB 持久化
 */

import { Capacitor } from '@capacitor/core'
import { getPrimaryGoodsImageUrl } from '@/utils/goodsImages'

const IS_NATIVE = Capacitor.isNativePlatform()

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS goods (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    category   TEXT DEFAULT '',
    ip         TEXT DEFAULT '',
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
    image      TEXT DEFAULT '',
    images     TEXT DEFAULT '[]',
    note       TEXT DEFAULT '',
    quantity   INTEGER DEFAULT 1,
    points     INTEGER DEFAULT NULL
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
    photos     TEXT DEFAULT '[]',
    ticketPrice TEXT DEFAULT '',
    ticketType TEXT DEFAULT '',
    seatInfo   TEXT DEFAULT '',
    linkedGoodsIds TEXT DEFAULT '[]',
    tags       TEXT DEFAULT '[]',
    createdAt  INTEGER DEFAULT 0,
    updatedAt  INTEGER DEFAULT 0
  );
`

const MIGRATE_ADD_IP  = "ALTER TABLE goods ADD COLUMN ip TEXT DEFAULT ''"
const MIGRATE_ADD_WISHLIST = 'ALTER TABLE goods ADD COLUMN isWishlist INTEGER DEFAULT 0'
const MIGRATE_ADD_CHR = "ALTER TABLE goods ADD COLUMN characters TEXT DEFAULT '[]'"
const MIGRATE_ADD_TAGS = "ALTER TABLE goods ADD COLUMN tags TEXT DEFAULT '[]'"
const MIGRATE_ADD_LOC = "ALTER TABLE goods ADD COLUMN storageLocation TEXT DEFAULT ''"
const MIGRATE_ADD_VAR = "ALTER TABLE goods ADD COLUMN variant TEXT DEFAULT ''"
const MIGRATE_ADD_ACTUAL_PRICE = "ALTER TABLE goods ADD COLUMN actualPrice TEXT DEFAULT ''"
const MIGRATE_ADD_QTY = "ALTER TABLE goods ADD COLUMN quantity INTEGER DEFAULT 1"
const MIGRATE_ADD_PTS = "ALTER TABLE goods ADD COLUMN points INTEGER DEFAULT NULL"
const MIGRATE_ADD_IMAGES = "ALTER TABLE goods ADD COLUMN images TEXT DEFAULT '[]'"
const MIGRATE_ADD_UNIT_DATES = "ALTER TABLE goods ADD COLUMN unitAcquiredAtList TEXT DEFAULT '[]'"
const MIGRATE_ADD_UNIT_PRICES = "ALTER TABLE goods ADD COLUMN unitActualPriceList TEXT DEFAULT '[]'"
const MIGRATE_ADD_UPDATED_AT = "ALTER TABLE goods ADD COLUMN updatedAt INTEGER DEFAULT 0"
const MIGRATE_EVENT_ADD_TICKET_TYPE = "ALTER TABLE events ADD COLUMN ticketType TEXT DEFAULT ''"
const MIGRATE_EVENT_ADD_SEAT_INFO = "ALTER TABLE events ADD COLUMN seatInfo TEXT DEFAULT ''"

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

async function _initWebDB() {
  const { default: initSqlJs } = await import('sql.js')
  const SQL = await initSqlJs({ locateFile: () => '/assets/sql-wasm.wasm' })
  const saved = await _loadBinaryFromIDB()
  _sqlDb = saved ? new SQL.Database(saved) : new SQL.Database()
  _sqlDb.run(CREATE_TABLE_SQL)
  try { _sqlDb.run(MIGRATE_ADD_IP) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_WISHLIST) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_CHR) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_TAGS) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_LOC) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_VAR) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_ACTUAL_PRICE) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_QTY) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_PTS) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_IMAGES) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_UNIT_DATES) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_UNIT_PRICES) } catch (e) { /* column already exists */ }
  try { _sqlDb.run(MIGRATE_ADD_UPDATED_AT) } catch (e) { /* column already exists */ }
  await _saveBinaryToIDB(_sqlDb)
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
  try { await _nativeDb.execute(MIGRATE_ADD_IP) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_WISHLIST) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_CHR) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_TAGS) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_LOC) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_VAR) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_ACTUAL_PRICE) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_QTY) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_PTS) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_IMAGES) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_UNIT_DATES) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_UNIT_PRICES) } catch (e) { /* column already exists */ }
  try { await _nativeDb.execute(MIGRATE_ADD_UPDATED_AT) } catch (e) { /* column already exists */ }
}

async function _initEventsTable() {
  if (IS_NATIVE) {
    if (!_nativeDb) return
    try { await _nativeDb.execute(CREATE_EVENTS_TABLE_SQL) } catch { /* already exists */ }
    try { await _nativeDb.execute(MIGRATE_EVENT_ADD_TICKET_TYPE) } catch { /* column already exists */ }
    try { await _nativeDb.execute(MIGRATE_EVENT_ADD_SEAT_INFO) } catch { /* column already exists */ }
  } else {
    if (!_sqlDb) return
    try { _sqlDb.run(CREATE_EVENTS_TABLE_SQL) } catch { /* already exists */ }
    try { _sqlDb.run(MIGRATE_EVENT_ADD_TICKET_TYPE) } catch { /* column already exists */ }
    try { _sqlDb.run(MIGRATE_EVENT_ADD_SEAT_INFO) } catch { /* column already exists */ }
    await _saveBinaryToIDB(_sqlDb)
  }
}

//  统一对外 API 
export async function initDB() {
  if (IS_NATIVE) { await _initNativeDB() } else { await _initWebDB() }
  await _initEventsTable()
}

export async function getItems() {
  let rows = []
  if (IS_NATIVE) {
    if (!_nativeDb) return []
    rows = (await _nativeDb.query('SELECT * FROM goods ORDER BY rowid DESC')).values ?? []
  } else {
    rows = _webQuery('SELECT id,name,category,ip,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,unitAcquiredAtList,unitActualPriceList,image,images,note,quantity,points,updatedAt FROM goods ORDER BY rowid DESC')
  }
  return rows.map(r => ({
    ...r,
    isWishlist: normalizeWishlistFlag(r.isWishlist),
    characters: (() => { try { return JSON.parse(r.characters || '[]') } catch { return [] } })(),
    tags: (() => { try { return JSON.parse(r.tags || '[]') } catch { return [] } })(),
    unitAcquiredAtList: (() => { try { return JSON.parse(r.unitAcquiredAtList || '[]') } catch { return [] } })(),
    unitActualPriceList: (() => { try { return JSON.parse(r.unitActualPriceList || '[]') } catch { return [] } })(),
    images: (() => { try { return JSON.parse(r.images || '[]') } catch { return [] } })(),
    storageLocation: String(r.storageLocation || '').trim(),
    variant: String(r.variant || '').trim(),
    actualPrice: String(r.actualPrice || '').trim(),
    quantity: Number(r.quantity ?? 1) || 1,
    points: r.points != null && r.points !== '' ? Number(r.points) : undefined,
    updatedAt: Number(r.updatedAt) || 0
  }))
}

export async function addItem(item) {
  const { id, name = '', category = '', ip = '', isWishlist = false, characters = [], tags = [], storageLocation = '', variant = '', price = '', actualPrice = '', acquiredAt = '', unitAcquiredAtList = [], unitActualPriceList = [], image = '', coverImage = '', images = [], note = '', quantity = 1, points, updatedAt } = item
  const charsStr = JSON.stringify(Array.isArray(characters) ? characters : [])
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
  const unitDatesStr = JSON.stringify(Array.isArray(unitAcquiredAtList) ? unitAcquiredAtList : [])
  const unitPricesStr = JSON.stringify(Array.isArray(unitActualPriceList) ? unitActualPriceList : [])
  const imagesStr = JSON.stringify(Array.isArray(images) ? images : [])
  const qty = Math.max(1, Number(quantity) || 1)
  const pts = points != null && points !== '' ? Number(points) : null
  const legacyImage = getPrimaryGoodsImageUrl(images, coverImage || image)
  const ts = updatedAt || Date.now()
  const SQL = 'INSERT OR REPLACE INTO goods (id,name,category,ip,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,unitAcquiredAtList,unitActualPriceList,image,images,note,quantity,points,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  const p = [id, name, category, ip, normalizeWishlistFlag(isWishlist) ? 1 : 0, charsStr, tagsStr, storageLocation, variant, price, actualPrice, acquiredAt, unitDatesStr, unitPricesStr, legacyImage, imagesStr, note, qty, pts, ts]
  if (IS_NATIVE) {
    if (!_nativeDb) return
    await _nativeDb.run(SQL, p)
  } else {
    if (!_sqlDb) return
    _sqlDb.run(SQL, p)
    await _saveBinaryToIDB(_sqlDb)
  }
}

export async function saveItems(items) {
  if (!items || items.length === 0) return

  if (IS_NATIVE) {
    if (!_nativeDb) return
    const stmts = []
    for (const item of items) {
      const { id, name = '', category = '', ip = '', isWishlist = false, characters = [], tags = [], storageLocation = '', variant = '', price = '', actualPrice = '', acquiredAt = '', unitAcquiredAtList = [], unitActualPriceList = [], image = '', coverImage = '', images = [], note = '', quantity = 1, points, updatedAt } = item
      const charsStr = JSON.stringify(Array.isArray(characters) ? characters : [])
      const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
      const unitDatesStr = JSON.stringify(Array.isArray(unitAcquiredAtList) ? unitAcquiredAtList : [])
      const unitPricesStr = JSON.stringify(Array.isArray(unitActualPriceList) ? unitActualPriceList : [])
      const imagesStr = JSON.stringify(Array.isArray(images) ? images : [])
      const qty = Math.max(1, Number(quantity) || 1)
      const pts = points != null && points !== '' ? Number(points) : null
      const legacyImage = getPrimaryGoodsImageUrl(images, coverImage || image)
      const ts = updatedAt || Date.now()
      stmts.push({
        statement: 'INSERT OR REPLACE INTO goods (id,name,category,ip,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,unitAcquiredAtList,unitActualPriceList,image,images,note,quantity,points,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        values: [id, name, category, ip, normalizeWishlistFlag(isWishlist) ? 1 : 0, charsStr, tagsStr, storageLocation, variant, price, actualPrice, acquiredAt, unitDatesStr, unitPricesStr, legacyImage, imagesStr, note, qty, pts, ts]
      })
    }
    await _nativeDb.executeSet(stmts)
  } else {
    if (!_sqlDb) return
    for (const item of items) {
      const { id, name = '', category = '', ip = '', isWishlist = false, characters = [], tags = [], storageLocation = '', variant = '', price = '', actualPrice = '', acquiredAt = '', unitAcquiredAtList = [], unitActualPriceList = [], image = '', coverImage = '', images = [], note = '', quantity = 1, points, updatedAt } = item
      const charsStr = JSON.stringify(Array.isArray(characters) ? characters : [])
      const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
      const unitDatesStr = JSON.stringify(Array.isArray(unitAcquiredAtList) ? unitAcquiredAtList : [])
      const unitPricesStr = JSON.stringify(Array.isArray(unitActualPriceList) ? unitActualPriceList : [])
      const imagesStr = JSON.stringify(Array.isArray(images) ? images : [])
      const qty = Math.max(1, Number(quantity) || 1)
      const pts = points != null && points !== '' ? Number(points) : null
      const legacyImage = getPrimaryGoodsImageUrl(images, coverImage || image)
      const ts = updatedAt || Date.now()
      _sqlDb.run(
        'INSERT OR REPLACE INTO goods (id,name,category,ip,isWishlist,characters,tags,storageLocation,variant,price,actualPrice,acquiredAt,unitAcquiredAtList,unitActualPriceList,image,images,note,quantity,points,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, name, category, ip, normalizeWishlistFlag(isWishlist) ? 1 : 0, charsStr, tagsStr, storageLocation, variant, price, actualPrice, acquiredAt, unitDatesStr, unitPricesStr, legacyImage, imagesStr, note, qty, pts, ts]
      )
    }
    await _saveBinaryToIDB(_sqlDb)
  }
}

export async function deleteItems(ids) {
  if (!ids || ids.length === 0) return

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
}

export async function getEvents() {
  let rows = []
  if (IS_NATIVE) {
    if (!_nativeDb) return []
    rows = (await _nativeDb.query('SELECT * FROM events ORDER BY startDate DESC')).values ?? []
  } else {
    if (!_sqlDb) return []
    rows = _webQuery('SELECT * FROM events ORDER BY startDate DESC')
  }
  return rows.map(r => ({
    ...r,
    photos: (() => { try { return JSON.parse(r.photos || '[]') } catch { return [] } })(),
    linkedGoodsIds: (() => { try { return JSON.parse(r.linkedGoodsIds || '[]') } catch { return [] } })(),
    tags: (() => { try { return JSON.parse(r.tags || '[]') } catch { return [] } })(),
    createdAt: Number(r.createdAt) || 0,
    updatedAt: Number(r.updatedAt) || 0
  }))
}

export async function addEvent(event) {
  const {
    id, name = '', type = '', startDate = '', endDate = '',
    location = '', description = '', coverImage = '',
    photos = [], ticketPrice = '', ticketType = '', seatInfo = '', linkedGoodsIds = [], tags = [],
    createdAt, updatedAt
  } = event
  const photosStr = JSON.stringify(Array.isArray(photos) ? photos : [])
  const linkedGoodsStr = JSON.stringify(Array.isArray(linkedGoodsIds) ? linkedGoodsIds : [])
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
  const ts = updatedAt || Date.now()
  const created = createdAt || ts
  const SQL = 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,photos,ticketPrice,ticketType,seatInfo,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  const p = [id, name, type, startDate, endDate, location, description, coverImage, photosStr, ticketPrice, ticketType, seatInfo, linkedGoodsStr, tagsStr, created, ts]
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
        location = '', description = '', coverImage = '',
        photos = [], ticketPrice = '', ticketType = '', seatInfo = '', linkedGoodsIds = [], tags = [],
        createdAt, updatedAt
      } = event
      const photosStr = JSON.stringify(Array.isArray(photos) ? photos : [])
      const linkedGoodsStr = JSON.stringify(Array.isArray(linkedGoodsIds) ? linkedGoodsIds : [])
      const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
      const ts = updatedAt || Date.now()
      const created = createdAt || ts
      stmts.push({
        statement: 'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,photos,ticketPrice,ticketType,seatInfo,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        values: [id, name, type, startDate, endDate, location, description, coverImage, photosStr, ticketPrice, ticketType, seatInfo, linkedGoodsStr, tagsStr, created, ts]
      })
    }
    await _nativeDb.executeSet(stmts)
  } else {
    if (!_sqlDb) return
    for (const event of events) {
      const {
        id, name = '', type = '', startDate = '', endDate = '',
        location = '', description = '', coverImage = '',
        photos = [], ticketPrice = '', ticketType = '', seatInfo = '', linkedGoodsIds = [], tags = [],
        createdAt, updatedAt
      } = event
      const photosStr = JSON.stringify(Array.isArray(photos) ? photos : [])
      const linkedGoodsStr = JSON.stringify(Array.isArray(linkedGoodsIds) ? linkedGoodsIds : [])
      const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : [])
      const ts = updatedAt || Date.now()
      const created = createdAt || ts
      _sqlDb.run(
        'INSERT OR REPLACE INTO events (id,name,type,startDate,endDate,location,description,coverImage,photos,ticketPrice,ticketType,seatInfo,linkedGoodsIds,tags,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, name, type, startDate, endDate, location, description, coverImage, photosStr, ticketPrice, ticketType, seatInfo, linkedGoodsStr, tagsStr, created, ts]
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
