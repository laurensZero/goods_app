import { describe, it, expect } from 'vitest'
import { camelToSnake } from '@/utils/sync/columnMapping'
import {
  EVENT_BUSINESS_KEYS, EVENT_COLS, EVENT_SELECT_COLS, EVENT_JSON_KEYS,
  GOODS_BUSINESS_KEYS, GOODS_COLS, GOODS_SELECT_COLS,
  RECHARGE_BUSINESS_KEYS, RECHARGE_COLS, RECHARGE_SELECT_COLS,
  GOODS_GROUP_BUSINESS_KEYS, GOODS_GROUP_COLS, GOODS_GROUP_SELECT_COLS,
  GOODS_GROUP_ITEM_BUSINESS_KEYS, GOODS_GROUP_ITEM_COLS, GOODS_GROUP_ITEM_SELECT_COLS
} from '@/services/supabaseAdapter/helpers'
import { normalizeEvent } from '@/stores/events'
import { normalizeGoodsInput } from '@/stores/goodsHelpers'

// 同步列三方一致性：各表唯一登记处（*BUSINESS_KEYS）
// ↔ push 白名单（*COLS / store 归一化函数）↔ pull 显式 select（*_SELECT_COLS）。
// COLS/SELECT_COLS 已改为派生，这里的 golden 字面量钉住现网值：登记数组本身
// 被误改（丢键/换序）时在这里显式失败，而不是等到线上同步丢数据。
// 新增字段流程见 helpers.js 顶部注释。

// 服务器生成列 / 桶路由列：不进 push 白名单，但 pull 要读回
const SERVER_COLS = {
  goods: ['trashed', 'updated_at', 'user_id'],
  recharge_records: ['deleted', 'updated_at', 'user_id'],
  goods_groups: ['updated_at', 'created_at', 'user_id'],
  goods_group_items: ['updated_at', 'created_at', 'user_id'],
  events: ['updated_at', 'created_at', 'user_id']
}

const TABLES = [
  {
    name: 'goods',
    businessKeys: GOODS_BUSINESS_KEYS,
    cols: GOODS_COLS,
    selectCols: GOODS_SELECT_COLS,
    // 与改造前手写串逐字一致的现网值（golden）
    goldenSelect: 'id, name, category, ip, goods_id, is_wishlist, characters, tags, storage_location, variant, price, actual_price, acquired_at, sale_at, sale_reminder_enabled, sale_reminder_offsets, unit_acquired_at_list, unit_actual_price_list, unit_character_list, unit_collect_status_list, images, tracks, note, quantity, points, currency, actual_price_currency, collect_status, shipping_fee, sell_price, sell_platform, sell_fee, sell_date, unit_sale_info_list, status_timeline, trashed, updated_at, user_id'
  },
  {
    name: 'recharge_records',
    businessKeys: RECHARGE_BUSINESS_KEYS,
    cols: RECHARGE_COLS,
    selectCols: RECHARGE_SELECT_COLS,
    goldenSelect: 'id, game, item_name, amount, charged_at, note, image, deleted, updated_at, user_id'
  },
  {
    name: 'goods_groups',
    businessKeys: GOODS_GROUP_BUSINESS_KEYS,
    cols: GOODS_GROUP_COLS,
    selectCols: GOODS_GROUP_SELECT_COLS,
    goldenSelect: 'id, name, type, summary_mode, total_amount, currency, cover_mode, cover_item_id, display_mode, note, deleted, updated_at, created_at, user_id'
  },
  {
    name: 'goods_group_items',
    businessKeys: GOODS_GROUP_ITEM_BUSINESS_KEYS,
    cols: GOODS_GROUP_ITEM_COLS,
    selectCols: GOODS_GROUP_ITEM_SELECT_COLS,
    goldenSelect: 'id, group_id, goods_id, sort_order, deleted, updated_at, created_at, user_id'
  },
  {
    name: 'events',
    businessKeys: EVENT_BUSINESS_KEYS,
    cols: EVENT_COLS,
    selectCols: EVENT_SELECT_COLS,
    goldenSelect: 'id, name, type, start_date, end_date, location, city, latitude, longitude, description, cover_image, cover_image_data, photos, ticket_price, ticket_type, seat_info, day_ticket_list, other_expenses, tracks, linked_goods_ids, tags, deleted, updated_at, created_at, user_id'
  }
]

describe('sync column spec consistency', () => {
  for (const table of TABLES) {
    describe(table.name, () => {
      it('COLS is business keys plus sync meta columns only', () => {
        expect(table.cols).toEqual([...table.businessKeys, 'syncedBy', 'userId'])
      })

      it('SELECT_COLS matches the golden column list from the live schema', () => {
        expect(table.selectCols).toBe(table.goldenSelect)
      })

      it('SELECT_COLS is the snake projection of business keys plus server columns', () => {
        const expected = [...table.businessKeys.map(camelToSnake), ...SERVER_COLS[table.name]].join(', ')
        expect(table.selectCols).toBe(expected)
        // 列必须互不重复，否则 PostgREST 直接报 duplicate column
        const columns = table.selectCols.split(', ').map((c) => c.trim())
        expect(new Set(columns).size).toBe(columns.length)
      })
    })
  }

  it('EVENT_JSON_KEYS matches the golden list and is a subset of the business keys', () => {
    expect(EVENT_JSON_KEYS).toEqual(['photos', 'dayTicketList', 'otherExpenses', 'tracks', 'linkedGoodsIds', 'tags'])
    for (const key of EVENT_JSON_KEYS) {
      expect(EVENT_BUSINESS_KEYS).toContain(key)
    }
    // coverImageData 是对象，reader 单独解析
    expect(EVENT_JSON_KEYS).not.toContain('coverImageData')
  })

  it('normalizeEvent whitelist matches the events spec exactly (order included)', () => {
    // createdAt/updatedAt 为本地生成列，不参与同步 spec
    const normalizedKeys = Object.keys(normalizeEvent({})).filter((key) => !['createdAt', 'updatedAt'].includes(key))
    expect(normalizedKeys).toEqual(TABLES[4].businessKeys)
  })

  it('normalizeGoodsInput whitelist matches the goods business keys', () => {
    // coverImage 由 images 派生（云端无此列）；trashed 由桶路由决定；updatedAt 服务器生成
    const localOnlyKeys = ['coverImage', 'updatedAt', 'trashed']
    const normalizedKeys = Object.keys(normalizeGoodsInput({})).filter((key) => !localOnlyKeys.includes(key))
    expect([...normalizedKeys].sort()).toEqual([...GOODS_BUSINESS_KEYS].sort())
  })
})
