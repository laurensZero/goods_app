import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

export function createNativeAdapter() {
  let _db = null

  return {
    async open() {
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
      const cols = result.columns ?? []
      return (result.values ?? []).map(row =>
        Object.fromEntries(cols.map((col, i) => [col, row[i]]))
      )
    },

    async getTableColumns(tableName) {
      const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
      const result = await _db.query(`PRAGMA table_info(${safeName})`)
      return new Set((result.values ?? []).map(row => row[1]))
    }
  }
}
