import { createLogger } from '@/utils/logger'

const IDB_NAME = 'goods_idb'
const IDB_STORE = 'db'
const IDB_KEY = 'goods_app'
const log = createLogger('db:web')

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

// 连续落盘失败达到阈值后升级为 error（进反馈日志缓冲），暴露配额超限等持续性故障
const IDB_SAVE_FAILURE_ESCALATE_THRESHOLD = 3
let _idbSaveFailureCount = 0

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
    _idbSaveFailureCount = 0
  } catch (e) {
    _idbSaveFailureCount++
    if (_idbSaveFailureCount >= IDB_SAVE_FAILURE_ESCALATE_THRESHOLD) {
      log.error('idb:save:failed', { consecutiveFailures: _idbSaveFailureCount, error: e })
    } else {
      log.warn('idb:save:failed', e)
    }
  }
}

export function createWebAdapter() {
  let _db = null
  let _saveTimer = null
  let _savePromise = null
  let _lifecycleListenersBound = false
  let _inTx = false

  // 串行化保存：先等在途 export 完成再发起新保存，避免并发 export 且互相覆盖 _savePromise 引用
  async function _startSave() {
    while (_savePromise) {
      await _savePromise
    }
    const p = _saveBinaryToIDB(_db)
    _savePromise = p
    await p
    if (_savePromise === p) _savePromise = null
  }

  function _scheduleSave() {
    // 显式事务期间不落盘：sql.js 的 export() 会关闭再重开连接，销毁进行中的事务
    // （commitTransaction 结束后会重新调度保存）
    if (_inTx || _saveTimer) return
    _saveTimer = setTimeout(() => {
      _saveTimer = null
      _startSave()
    }, 100)
  }

  async function _flushSave() {
    // 循环直到静止：计时器已触发但新保存仍排队在在途保存之后时，
    // 单次 await 会提前返回（最新数据未落盘），必须重查直到两者都为空
    while (_saveTimer || _savePromise) {
      if (_saveTimer) {
        clearTimeout(_saveTimer)
        _saveTimer = null
        await _startSave()
      } else {
        await _savePromise
      }
    }
  }

  // 页面隐藏/卸载时取消防抖并立即保存，堵住 100ms 防抖窗口内的丢数据风险。
  // visibilitychange/pagehide 触发时事件循环仍在运行，async IndexedDB 写入基本能完成，
  // 远比 beforeunload 可靠（移动端 WebView 被杀进程时不会触发 beforeunload）。
  function _bindLifecycleFlush() {
    if (_lifecycleListenersBound) return
    _lifecycleListenersBound = true
    const flushNow = () => { _flushSave() }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow()
    })
    window.addEventListener('pagehide', flushNow)
    // beforeunload 兜底保留（此时 async 写入不保证完成，仅尽力而为）
    window.addEventListener('beforeunload', flushNow)
  }

  return {
    async open() {
      const { default: initSqlJs } = await import('sql.js')
      // 基于 BASE_URL 解析而非根绝对路径，兼容 base: './' 与子路径部署
      const wasmUrl = new URL(
        `${import.meta.env.BASE_URL}assets/sql-wasm.wasm`,
        window.location.href
      ).href
      const SQL = await initSqlJs({ locateFile: () => wasmUrl })
      const saved = await _loadBinaryFromIDB()
      _db = saved ? new SQL.Database(saved) : new SQL.Database()
      log.debug('open:done', { restoredFromIdb: Boolean(saved), byteLength: saved?.byteLength || saved?.length || 0 })
      // 请求持久化存储，降低浏览器存储压力下 IndexedDB 整库被驱逐的风险
      // （fire-and-forget，不支持的环境静默忽略）
      try { navigator.storage?.persist?.().catch(() => {}) } catch { /* 忽略 */ }
      _bindLifecycleFlush()
    },

    async execute(sql) {
      _db.run(sql)
      _scheduleSave()
    },

    async run(sql, params) {
      _db.run(sql, params)
      _scheduleSave()
    },

    async executeSet(stmts) {
      // 已处于显式事务中时直接执行，避免嵌套 BEGIN 报错
      if (_inTx) {
        for (const { statement, values } of stmts) {
          _db.run(statement, values)
        }
        return
      }
      _db.run('BEGIN TRANSACTION')
      try {
        for (const { statement, values } of stmts) {
          _db.run(statement, values)
        }
        _db.run('COMMIT')
      } catch (e) {
        _db.run('ROLLBACK')
        throw e
      }
      _scheduleSave()
    },

    async beginTransaction() {
      _db.run('BEGIN TRANSACTION')
      _inTx = true
    },

    async commitTransaction() {
      try {
        _db.run('COMMIT')
      } finally {
        _inTx = false
      }
      _scheduleSave()
    },

    async rollbackTransaction() {
      try {
        _db.run('ROLLBACK')
      } finally {
        _inTx = false
      }
    },

    async query(sql, params = []) {
      const result = _db.exec(sql, params)
      if (!result.length) return []
      const { columns, values } = result[0]
      return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])))
    },

    async getTableColumns(tableName) {
      const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '')
      const result = _db.exec(`PRAGMA table_info(${safeName})`)
      if (!result.length) return new Set()
      return new Set(result[0].values.map(row => row[1]))
    },

    async flush() {
      await _flushSave()
    }
  }
}
