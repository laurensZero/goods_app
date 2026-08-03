// @ts-check
/**
 * utils/migrations.js
 * 数据库迁移定义
 *
 * 迁移格式：{ version, description, up(db) }
 *   - version: 单调递增的版本号
 *   - description: 人类可读描述，用于调试
 *   - up: 幂等的迁移函数，接收 DatabaseAdapter
 *
 * 当前仅有 v1 作为遗留修补器（确保 goods.updatedAt 存在）。
 * 未来的 schema 变更（索引、列重命名、数据转换）追加到此数组。
 */

/**
 * @typedef {import('./db').DatabaseAdapter} DatabaseAdapter
 */

/** @type {{ version: number, description: string, up: (db: DatabaseAdapter) => Promise<void> }[]} */
export const MIGRATIONS = [
  {
    version: 1,
    description: 'Consolidated schema: ensure all columns exist',
    up: async (db) => {
      const cols = await db.getTableColumns('goods')
      if (!cols.has('updatedAt')) {
        await db.run("ALTER TABLE goods ADD COLUMN updatedAt INTEGER DEFAULT 0")
      }
    }
  },
  {
    version: 2,
    description: 'Persist per-unit collect statuses',
    up: async (db) => {
      const cols = await db.getTableColumns('goods')
      if (!cols.has('unitCollectStatusList')) {
        await db.run("ALTER TABLE goods ADD COLUMN unitCollectStatusList TEXT DEFAULT '[]'")
      }
    }
  },
  {
    version: 3,
    description: 'Persist event expense items',
    up: async (db) => {
      const cols = await db.getTableColumns('events')
      if (!cols.has('otherExpenses')) {
        await db.run("ALTER TABLE events ADD COLUMN otherExpenses TEXT DEFAULT '[]'")
      }
    }
  },
  {
    version: 4,
    description: 'Create goods_groups and goods_group_items tables',
    up: async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS goods_groups (
          id           TEXT PRIMARY KEY NOT NULL,
          name         TEXT NOT NULL DEFAULT '',
          type         TEXT NOT NULL DEFAULT 'collection',
          summaryMode  TEXT DEFAULT 'auto',
          totalAmount  REAL DEFAULT 0,
          coverMode    TEXT DEFAULT 'auto',
          coverItemId  TEXT DEFAULT '',
          displayMode  TEXT DEFAULT 'list',
          note         TEXT DEFAULT '',
          createdAt    INTEGER DEFAULT 0,
          updatedAt    INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS goods_group_items (
          id        TEXT PRIMARY KEY NOT NULL,
          groupId   TEXT NOT NULL,
          goodsId   TEXT NOT NULL,
          sortOrder INTEGER DEFAULT 0,
          createdAt INTEGER DEFAULT 0,
          updatedAt INTEGER DEFAULT 0
        );
      `)
    }
  },
  {
    version: 5,
    description: 'Persist sale reminder fields',
    up: async (db) => {
      const cols = await db.getTableColumns('goods')
      if (!cols.has('saleAt')) {
        await db.run("ALTER TABLE goods ADD COLUMN saleAt TEXT DEFAULT ''")
      }
      if (!cols.has('saleReminderEnabled')) {
        await db.run('ALTER TABLE goods ADD COLUMN saleReminderEnabled INTEGER DEFAULT 0')
      }
      if (!cols.has('saleReminderOffsets')) {
        await db.run("ALTER TABLE goods ADD COLUMN saleReminderOffsets TEXT DEFAULT '[]'")
      }
    }
  },
  {
    version: 6,
    description: 'Persist status timeline history',
    up: async (db) => {
      const cols = await db.getTableColumns('goods')
      if (!cols.has('statusTimeline')) {
        await db.run("ALTER TABLE goods ADD COLUMN statusTimeline TEXT DEFAULT '[]'")
      }
      // 为已有的谷子初始化时间线数据，用 acquiredAt 作为日期。
      // 状态限购入语义——「已出/在售」等原样写入会造出「卖出日期=购入日期」的假卖出记录;
      // 日期必须是 YYYY-MM-DD,否则被 normalizeStatusTimeline 静默丢弃,表现为时间线时有时无
      const ACQUISITION_STATUSES = new Set(['已拥有', '待发货', '待补款', '待补邮'])
      const now = new Date()
      // 本地时区当天(toISOString 是 UTC,东八区凌晨会差一天)
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const rows = await db.query("SELECT id, collectStatus, acquiredAt FROM goods WHERE statusTimeline = '[]' OR statusTimeline IS NULL")
      // 收集后一次 executeSet:避免逐行 run 各自隐式事务(native 端含 fsync)拖慢冷启动
      const updates = []
      for (const row of rows) {
        if (!row.collectStatus) continue
        const rawStatus = String(row.collectStatus).trim()
        const status = ACQUISITION_STATUSES.has(rawStatus) ? rawStatus : '已拥有'
        const rawDate = String(row.acquiredAt || '').trim()
        const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : localToday
        const timeline = JSON.stringify([{ status, at: date }])
        updates.push({ statement: 'UPDATE goods SET statusTimeline = ? WHERE id = ?', values: [timeline, row.id] })
      }
      if (updates.length) await db.executeSet(updates)
    }
  },
  {
    version: 7,
    description: 'Repair v6 timeline artifacts',
    up: async (db) => {
      // 旧版 v6 迁移(已在存量设备执行,无法重跑)的两类产物:
      // ① collectStatus 为「已出/在售」等时被写入 `已出@购入日期` 单条时间线——
      //    出谷账本会把它当成交日期,表现为「卖出日期=购入日期」
      // ② acquiredAt 非 YYYY-MM-DD 时写入非法日期条目,加载时被静默丢弃,时间线时有时无
      // 修复特征锁定 v6 产物:单条、无 unitIndex、无卖出字段(price/platform/fee)
      const EXIT_STATUSES = new Set(['已出', '在售', '想出', '已赠出', '丢失'])
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
      const now = new Date()
      const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const rows = await db.query("SELECT id, acquiredAt, statusTimeline FROM goods WHERE statusTimeline IS NOT NULL AND statusTimeline != '[]'")
      const updates = []
      for (const row of rows) {
        let timeline
        try {
          timeline = JSON.parse(row.statusTimeline)
        } catch {
          continue
        }
        if (!Array.isArray(timeline) || timeline.length !== 1) continue
        const entry = timeline[0]
        if (!entry || typeof entry !== 'object') continue
        if (entry.price || entry.platform || entry.fee || entry.unitIndex != null) continue
        const acquiredAt = String(row.acquiredAt || '').trim()
        const status = String(entry.status || '').trim()
        const at = String(entry.at || '').trim()
        const isFakeSale = EXIT_STATUSES.has(status) && (!acquiredAt || at === acquiredAt)
        const isInvalidDate = !DATE_RE.test(at)
        if (!isFakeSale && !isInvalidDate) continue
        const fixed = {
          status: isFakeSale ? '已拥有' : status,
          at: DATE_RE.test(at) ? at : (DATE_RE.test(acquiredAt) ? acquiredAt : localToday)
        }
        if (entry.note) fixed.note = entry.note
        updates.push({ statement: 'UPDATE goods SET statusTimeline = ? WHERE id = ?', values: [JSON.stringify([fixed]), row.id] })
      }
      if (updates.length) await db.executeSet(updates)
    }
  },
  {
    version: 8,
    description: 'Add sale info columns (sellPrice/sellPlatform/sellFee/sellDate/unitSaleInfoList)',
    up: async (db) => {
      // 出谷信息独立列:含义由 collectStatus/unitCollectStatusList 决定(在售=挂牌,已出=成交)
      const cols = await db.getTableColumns('goods')
      const additions = [
        ['sellPrice', "TEXT DEFAULT ''"],
        ['sellPlatform', "TEXT DEFAULT ''"],
        ['sellFee', "TEXT DEFAULT ''"],
        ['sellDate', "TEXT DEFAULT ''"],
        ['unitSaleInfoList', "TEXT DEFAULT '[]'"]
      ]
      for (const [name, type] of additions) {
        if (!cols.has(name)) {
          await db.run(`ALTER TABLE goods ADD COLUMN ${name} ${type}`)
        }
      }
    }
  },
  {
    version: 9,
    description: 'Add trashed column for local soft-delete (tombstone parity with Supabase)',
    up: async (db) => {
      // 本地软删除:与远端 trashed 墓碑对齐。存量行该列取 NULL，读取时按 0（未删除）处理
      const cols = await db.getTableColumns('goods')
      if (!cols.has('trashed')) {
        await db.run('ALTER TABLE goods ADD COLUMN trashed INTEGER DEFAULT 0')
      }
    }
  },
]
