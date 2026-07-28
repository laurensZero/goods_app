export function createNativeAdapter() {
  let _db = null
  // 显式事务激活期间，execute/run/executeSet 需传 transaction=false，
  // 避免插件默认的隐式事务与显式事务嵌套报错
  let _inTx = false

  return {
    async open() {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite')
      const sqlite = new SQLiteConnection(CapacitorSQLite)
      const consistency = await sqlite.checkConnectionsConsistency()
      const isConn = (await sqlite.isConnection('goods_app', false)).result
      if (consistency.result && isConn) {
        _db = await sqlite.retrieveConnection('goods_app', false)
      } else {
        _db = await sqlite.createConnection('goods_app', false, 'no-encryption', 1, false)
      }
      await _db.open()
    },

    async execute(sql) {
      await _db.execute(sql, !_inTx)
    },

    async run(sql, params) {
      await _db.run(sql, params, !_inTx)
    },

    async executeSet(stmts) {
      await _db.executeSet(stmts, !_inTx)
    },

    async beginTransaction() {
      await _db.beginTransaction()
      _inTx = true
    },

    async commitTransaction() {
      try {
        await _db.commitTransaction()
      } finally {
        _inTx = false
      }
    },

    async rollbackTransaction() {
      try {
        await _db.rollbackTransaction()
      } finally {
        _inTx = false
      }
    },

    async query(sql, params = []) {
      const result = await _db.query(sql, params)
      const rows = result.values ?? []
      if (rows.length === 0) return []
      // Capacitor SQLite 可能返回对象数组或位置数组
      // 如果第一行已经是对象，直接返回
      if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
        // DEBUG
        const keys = Object.keys(rows[0])
        const imgIdx = keys.indexOf('images')
        console.warn('[nativeAdapter] OBJ mode imagesIdx=' + imgIdx + ' totalCols=' + keys.length + ' firstImages=' + String(rows[0].images || '').substring(0, 100))
        return rows
      }
      // 否则用 columns 做位置映射
      const cols = result.columns ?? []
      // DEBUG
      const imgIdx2 = cols.indexOf('images')
      if (imgIdx2 >= 0 && rows.length > 0) {
        console.warn('[nativeAdapter] POS mode imagesCol=' + imgIdx2 + ' totalCols=' + cols.length + ' firstImagesLen=' + String(rows[0][imgIdx2] || '').length + ' firstImages=' + String(rows[0][imgIdx2] || '').substring(0, 100))
      } else {
        console.warn('[nativeAdapter] POS mode images NOT FOUND in cols, totalCols=' + cols.length + ' cols=' + cols.join(',').substring(0, 200))
      }
      if (cols.length === 0) return rows
      return rows.map(row => Object.fromEntries(cols.map((col, i) => [col, row[i]])))
    },

    async getTableColumns(tableName) {
      const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
      const result = await _db.query(`PRAGMA table_info(${safeName})`)
      const rows = result.values ?? []
      if (rows.length === 0) return new Set()
      // 兼容不同 Capacitor SQLite 版本的返回格式：
      // 旧版返回 [[cid, name, type, ...], ...]，新版可能返回 [{cid, name, type, ...}, ...]
      if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
        return new Set(rows.map(row => row.name))
      }
      return new Set(rows.map(row => row[1]))
    }
  }
}
