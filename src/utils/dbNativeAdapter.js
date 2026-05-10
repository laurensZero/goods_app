export function createNativeAdapter() {
  let _db = null

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
      await _db.execute(sql)
    },

    async run(sql, params) {
      await _db.run(sql, params)
    },

    async executeSet(stmts) {
      await _db.executeSet(stmts)
    },

    async query(sql, params = []) {
      const result = await _db.query(sql, params)
      const rows = result.values ?? []
      if (rows.length === 0) return []
      // Capacitor SQLite 可能返回对象数组或位置数组
      // 如果第一行已经是对象，直接返回
      if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) return rows
      // 否则用 columns 做位置映射
      const cols = result.columns ?? []
      if (cols.length === 0) return rows
      return rows.map(row => Object.fromEntries(cols.map((col, i) => [col, row[i]])))
    },

    async getTableColumns(tableName) {
      const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
      const result = await _db.query(`PRAGMA table_info(${safeName})`)
      return new Set((result.values ?? []).map(row => row[1]))
    }
  }
}
