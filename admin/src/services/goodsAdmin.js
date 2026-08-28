import { supabaseRequest } from './supabase'

// ── 谷子数据管理服务 ──
// 直接操作 Supabase 的三张业务表：goods / events / recharge_records。
//
// 重要：所有写操作自动 bump updated_at。同步管道按该时间戳做增量拉取与
// LWW「最新优先」冲突裁决，不 bump 的改动不会传播到用户设备，
// 且会在用户下次本地改动时被静默覆盖。

// 与 App 端枚举保持一致：
//   币种 → src/constants/currencies.js
//   收藏状态 → src/utils/goods/status.js VALID_COLLECT_STATUSES
export const CURRENCY_CODES = ['CNY', 'USD', 'JPY', 'EUR', 'GBP', 'HKD', 'TWD', 'KRW']
export const COLLECT_STATUSES = ['待发货', '待补款', '待补邮', '已拥有', '丢失', '已赠出', '想出', '已出', '在售']

const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({ value: code, label: code }))
const COLLECT_STATUS_OPTIONS = COLLECT_STATUSES.map((s) => ({ value: s, label: s }))
const BOOLEAN_OPTIONS = [
  { value: 1, label: '是' },
  { value: 0, label: '否' }
]

export const DATA_KINDS = {
  goods: {
    table: 'goods',
    label: '谷子',
    order: 'updated_at.desc',
    // 用 * 拉全字段，避免本地 schema 与线上库列不一致的「column does not exist」错误；
    // JSONB 列会直接以嵌套对象返回，便于在「原始数据（JSON）」中查看
    selectColumns: '*',
    // TEXT(JSON) 列：在「原始数据」里会被自动展开并美化显示，保存时再序列化回字符串
    jsonStringColumns: [
      'characters', 'tags', 'sale_reminder_offsets', 'unit_acquired_at_list',
      'unit_actual_price_list', 'unit_character_list', 'unit_collect_status_list',
      'cover_image', 'images', 'tracks', 'unit_sale_info_list', 'status_timeline'
    ],
    searchFields: ['name', 'ip', 'category', 'goods_id', 'storage_location'],
    defaultScope: 'all',
    // PostgREST 过滤参数；scope 切换即整组替换
    scopes: [
      { value: 'all', label: '全部', filters: {} },
      { value: 'collection', label: '收藏中', filters: { is_wishlist: 'eq.0', trashed: 'eq.0' } },
      { value: 'wishlist', label: '心愿单', filters: { is_wishlist: 'eq.1' } },
      { value: 'trash', label: '回收站', filters: { trashed: 'eq.1' } }
    ]
  },
  events: {
    table: 'events',
    label: '活动',
    order: 'updated_at.desc',
    selectColumns: '*',
    jsonStringColumns: ['other_expenses'],
    searchFields: ['name', 'location', 'type'],
    defaultScope: 'active',
    scopes: [
      { value: 'active', label: '未删除', filters: { deleted: 'eq.0' } },
      { value: 'deleted', label: '已删除', filters: { deleted: 'eq.1' } },
      { value: 'all', label: '全部', filters: {} }
    ]
  },
  recharge: {
    table: 'recharge_records',
    label: '充值',
    order: 'updated_at.desc',
    selectColumns: '*',
    searchFields: ['item_name', 'game', 'note'],
    defaultScope: 'active',
    scopes: [
      { value: 'active', label: '未删除', filters: { deleted: 'eq.0' } },
      { value: 'deleted', label: '已删除', filters: { deleted: 'eq.1' } },
      { value: 'all', label: '全部', filters: {} }
    ]
  }
}

// 编辑表单 schema（单条编辑抽屉与批量修改共用；batchable 标记可批量修改的字段）
export const KIND_FIELDS = {
  goods: [
    { key: 'name', label: '名称', type: 'text' },
    { key: 'category', label: '分类', type: 'text' },
    { key: 'ip', label: 'IP', type: 'text' },
    { key: 'variant', label: '款式', type: 'text' },
    { key: 'goods_id', label: '商品编号', type: 'text' },
    { key: 'storage_location', label: '存储位置', type: 'text' },
    { key: 'price', label: '标价', type: 'text' },
    { key: 'currency', label: '标价币种', type: 'select', options: CURRENCY_OPTIONS },
    { key: 'actual_price', label: '实付', type: 'text' },
    { key: 'actual_price_currency', label: '实付币种', type: 'select', options: CURRENCY_OPTIONS },
    { key: 'quantity', label: '数量', type: 'number' },
    { key: 'collect_status', label: '收藏状态', type: 'select', options: COLLECT_STATUS_OPTIONS },
    { key: 'acquired_at', label: '购入日期', type: 'text' },
    { key: 'note', label: '备注', type: 'textarea' },
    { key: 'is_wishlist', label: '心愿单', type: 'boolean' },
    { key: 'trashed', label: '回收站', type: 'boolean' }
  ],
  events: [
    { key: 'name', label: '活动名称', type: 'text' },
    { key: 'type', label: '类型', type: 'text' },
    { key: 'start_date', label: '开始日期', type: 'text' },
    { key: 'end_date', label: '结束日期', type: 'text' },
    { key: 'location', label: '地点', type: 'text' },
    { key: 'ticket_price', label: '票价', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea' },
    { key: 'deleted', label: '已删除', type: 'boolean' }
  ],
  recharge: [
    { key: 'game', label: '游戏', type: 'text' },
    { key: 'item_name', label: '项目名称', type: 'text' },
    { key: 'amount', label: '金额', type: 'number' },
    { key: 'charged_at', label: '充值时间', type: 'text' },
    { key: 'note', label: '备注', type: 'textarea' },
    { key: 'deleted', label: '已删除', type: 'boolean' }
  ]
}

// ── 查询构造 ──

// 关键词里这些字符会破坏 PostgREST or=() 表达式，直接剔除
function sanitizeKeyword(raw) {
  return String(raw || '').trim().replace(/[,()"*]/g, '')
}

export function buildQueryParams(kind, { userId, scope, keyword } = {}) {
  const def = DATA_KINDS[kind]
  if (!def) throw new Error(`未知数据类型：${kind}`)
  const scopeDef = def.scopes.find((s) => s.value === scope) || def.scopes[0]
  const params = { ...scopeDef.filters }
  if (userId) params.user_id = `eq.${userId}`
  const kw = sanitizeKeyword(keyword)
  if (kw) {
    const conditions = def.searchFields.map((f) => `${f}.ilike.*${kw}*`).join(',')
    params.or = `(${conditions})`
  }
  return params
}

export async function fetchRows(kind, baseParams, { limit = 50, offset = 0 } = {}) {
  const def = DATA_KINDS[kind]
  const data = await supabaseRequest(`/rest/v1/${def.table}`, {
    params: {
      ...baseParams,
      select: def.selectColumns,
      order: def.order,
      limit,
      offset
    }
  })
  return Array.isArray(data) ? data : []
}

export async function fetchCount(kind, baseParams) {
  return supabaseRequest(`/rest/v1/${DATA_KINDS[kind].table}`, {
    params: { ...baseParams, select: 'id', limit: 1 },
    returnCount: true
  })
}

// ── 写操作 ──

const CHUNK_SIZE = 50

function chunkIds(ids) {
  const list = Array.from(ids || [])
  const chunks = []
  for (let i = 0; i < list.length; i += CHUNK_SIZE) chunks.push(list.slice(i, i + CHUNK_SIZE))
  return chunks.length ? chunks : [[]]
}

function inFilter(ids) {
  // PostgREST in.() 列表统一加双引号，避免特殊字符破坏表达式
  return `in.(${ids.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',')})`
}

function withUpdatedAt(body) {
  return { updated_at: new Date().toISOString(), ...body }
}

export function patchRow(kind, id, body) {
  return supabaseRequest(`/rest/v1/${DATA_KINDS[kind].table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: withUpdatedAt(body)
  })
}

export async function patchRowsByIds(kind, ids, body) {
  for (const chunk of chunkIds(ids)) {
    await supabaseRequest(`/rest/v1/${DATA_KINDS[kind].table}?id=${inFilter(chunk)}`, {
      method: 'PATCH',
      body: withUpdatedAt(body)
    })
  }
}

export async function deleteRowsByIds(kind, ids) {
  for (const chunk of chunkIds(ids)) {
    await supabaseRequest(`/rest/v1/${DATA_KINDS[kind].table}?id=${inFilter(chunk)}`, {
      method: 'DELETE'
    })
  }
}
