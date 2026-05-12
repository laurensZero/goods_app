const IDB_NAME = 'goods_idb'
const IDB_STORE = 'db'
const IDB_KEY = 'goods_app'

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

async function _saveBinaryToIDB(sqlDb) {
  try {
    const data = sqlDb.export()
    const idb = await _openIDB()
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(data, IDB_KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) { console.warn('[DB] save to IDB failed:', e) }
}

export function createAdapter() {
  let _db = null

  return {
    async open() {
      const { default: initSqlJs } = await import('sql.js')
      const SQL = await initSqlJs({ locateFile: () => '/assets/sql-wasm.wasm' })
      const saved = await _loadBinaryFromIDB()
      _db = saved ? new SQL.Database(saved) : new SQL.Database()
    },

    async execute(sql) {
      _db.run(sql)
      await _saveBinaryToIDB(_db)
    },

    async run(sql, params) {
      _db.run(sql, params)
      await _saveBinaryToIDB(_db)
    },

    async executeSet(stmts) {
      for (const { statement, values } of stmts) {
        _db.run(statement, values)
      }
      await _saveBinaryToIDB(_db)
    },

    async query(sql, params = []) {
      const result = _db.exec(sql, params)
      if (!result.length) return []
      const { columns, values } = result[0]
      return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i] ?? ''])))
    },

    async getTableColumns(tableName) {
      const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
      const result = _db.exec(`PRAGMA table_info(${safeName})`)
      if (!result.length) return new Set()
      return new Set(result[0].values.map(row => row[1]))
    }
  }
}
