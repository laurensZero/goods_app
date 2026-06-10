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
]
