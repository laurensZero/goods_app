// @ts-check
/**
 * AI 聊天写操作的一键撤回（按助手回合）。
 *
 * 原则：
 * - 只包「改数据」的写工具（谷子/充值/活动），导航、同步、播放等不进撤回。
 * - 写之前快照 before 字段；成功后挂到助手消息上，用户点「撤回」按逆序回放。
 * - 回放必须走 store（与正常写入同一路径），界面与云同步保持一致。
 */

/** 可撤回的写工具名 */
export const UNDOABLE_WRITE_TOOLS = new Set([
  'goods_add',
  'goods_update',
  'goods_delete',
  'goods_restore',
  'goods_sell',
  'recharge_add',
  'recharge_update',
  'recharge_delete',
  'events_add',
  'events_update',
  'events_delete'
])

/** 单条助手消息最多保留的撤回条目数（防止极端工具风暴） */
const MAX_UNDO_ENTRIES = 30

/**
 * @param {string} name
 */
export function isUndoableWriteTool(name) {
  return UNDOABLE_WRITE_TOOLS.has(String(name || ''))
}

/**
 * @param {unknown} value
 * @returns {any}
 */
function cloneJson(value) {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/** 兼容 store.list / trashList 的 ref 与数组两种形状 */
function listOf(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(/** @type {any} */ (value)?.value)) return /** @type {any} */ (value).value
  return []
}

function findGoodsItem(store, id) {
  const hit = listOf(store?.list).find((item) => item?.id === id)
    || listOf(store?.trashList).find((item) => item?.id === id)
  return hit || null
}

function findRechargeRecord(store, id) {
  return listOf(store?.list).find((item) => item?.id === id) || null
}

function findEvent(store, id) {
  return listOf(store?.list).find((item) => item?.id === id) || null
}

/**
 * 从写工具入参里摘出真正会落库的字段（与 writeTools 白名单一致的子集即可；
 * 未知字段交给底层 normalize，这里多拷一点也无害）。
 * @param {Record<string, any>} args
 * @param {readonly string[]} allowed
 */
function pickFields(args, allowed) {
  /** @type {Record<string, any>} */
  const data = {}
  for (const key of allowed) {
    if (args?.[key] !== undefined) data[key] = cloneJson(args[key])
  }
  return data
}

const GOODS_UPDATE_KEYS = [
  'name', 'category', 'ip', 'characters', 'tags', 'variant', 'storageLocation',
  'price', 'actualPrice', 'currency', 'actualPriceCurrency', 'quantity',
  'acquiredAt', 'isWishlist', 'note',
  'collectStatus', 'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'saleAt',
  'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList',
  'unitCollectStatusList', 'unitSaleInfoList'
]

const EVENT_UPDATE_KEYS = [
  'name', 'type', 'startDate', 'endDate', 'city', 'location',
  'ticketPrice', 'ticketType', 'seatInfo', 'description',
  'linkedGoodsIds', 'tags', 'dayTicketList', 'otherExpenses', 'tracks'
]

/**
 * 写工具执行前捕获撤回所需 before。
 * @param {string} tool
 * @param {Record<string, any>} args
 * @param {{ goodsStore: any, rechargeStore: any, eventsStore?: any }} deps
 * @returns {Promise<Record<string, any> | null>} 不可撤回/快照失败返回 null
 */
export async function captureUndoBefore(tool, args, deps) {
  switch (tool) {
    case 'goods_add':
    case 'goods_delete':
    case 'goods_restore':
      return { tool, args: cloneJson(args) }
    case 'goods_update': {
      const id = String(args?.id || '').trim()
      const item = findGoodsItem(deps.goodsStore, id)
      if (!item) return null
      // 快照「会被改掉的字段」在改前的值，而不是 args 里的新值
      const changedKeys = Object.keys(pickFields(args, GOODS_UPDATE_KEYS))
      const fields = pickFields(item, changedKeys)
      // 状态时间线可能被 collectStatus/acquiredAt 联动改写，一并快照
      if ('collectStatus' in fields || 'acquiredAt' in fields || 'quantity' in fields) {
        fields.statusTimeline = cloneJson(item.statusTimeline)
      }
      return { tool, id, fields }
    }
    case 'goods_sell': {
      const id = String(args?.id || '').trim()
      const item = findGoodsItem(deps.goodsStore, id)
      if (!item) return null
      return {
        tool,
        id,
        fields: {
          collectStatus: item.collectStatus,
          sellPrice: item.sellPrice,
          sellPlatform: item.sellPlatform,
          sellFee: item.sellFee,
          sellDate: item.sellDate,
          saleAt: item.saleAt,
          statusTimeline: cloneJson(item.statusTimeline)
        }
      }
    }
    case 'recharge_add':
      return { tool }
    case 'recharge_update': {
      const id = String(args?.id || '').trim()
      const record = findRechargeRecord(deps.rechargeStore, id)
      if (!record) return null
      const changedKeys = Object.keys(pickFields(args, ['game', 'amount', 'itemName', 'chargedAt', 'note']))
      return { tool, id, fields: pickFields(record, changedKeys) }
    }
    case 'recharge_delete': {
      const id = String(args?.id || '').trim()
      const record = findRechargeRecord(deps.rechargeStore, id)
      if (!record) return null
      return { tool, id, fields: cloneJson(record) }
    }
    case 'events_add':
      return { tool, args: cloneJson(args) }
    case 'events_update': {
      const id = String(args?.id || '').trim()
      const event = findEvent(deps.eventsStore, id)
      if (!event) return null
      // 只快照会被改掉的字段的旧值
      const changedKeys = Object.keys(pickFields(args, EVENT_UPDATE_KEYS))
      return { tool, id, fields: pickFields(event, changedKeys) }
    }
    case 'events_delete': {
      const id = String(args?.id || '').trim()
      const event = findEvent(deps.eventsStore, id)
      if (!event) return null
      return { tool, id, fields: cloneJson(event) }
    }
    default:
      return null
  }
}

/**
 * 工具成功后生成一条可序列化的撤回条目。
 * @param {string} tool
 * @param {Record<string, any>} args
 * @param {Record<string, any> | null} before
 * @param {any} result
 */
export function buildUndoEntry(tool, args, before, result) {
  if (!before || !isUndoableWriteTool(tool)) return null
  const label = undoLabelFor(tool, args, result)
  switch (tool) {
    case 'goods_add': {
      const id = String(result?.id || '').trim()
      if (!id) return null
      return { tool, id, label, undone: false }
    }
    case 'goods_delete':
    case 'goods_restore': {
      const id = String(before?.args?.id || args?.id || '').trim()
      if (!id) return null
      return { tool, id, label, undone: false }
    }
    case 'goods_update':
    case 'goods_sell':
      return { tool, id: before.id, fields: before.fields, label, undone: false }
    case 'recharge_add': {
      const id = String(result?.id || '').trim()
      if (!id) return null
      return { tool, id, label, undone: false }
    }
    case 'recharge_update':
      return { tool, id: before.id, fields: before.fields, label, undone: false }
    case 'recharge_delete': {
      const id = String(before?.id || args?.id || '').trim()
      if (!id || !before?.fields) return null
      return { tool, id, fields: before.fields, label, undone: false }
    }
    case 'events_add': {
      const id = String(result?.id || '').trim()
      if (!id) return null
      return { tool, id, label, undone: false }
    }
    case 'events_update':
      return { tool, id: before.id, fields: before.fields, label, undone: false }
    case 'events_delete': {
      const id = String(before?.id || args?.id || '').trim()
      if (!id || !before?.fields) return null
      return { tool, id, fields: before.fields, label, undone: false }
    }
    default:
      return null
  }
}

/**
 * 生成简短中文标签（展示在撤回按钮旁；多语言文案可后续抽 i18n）。
 * @param {string} tool
 * @param {Record<string, any>} args
 * @param {any} result
 */
function undoLabelFor(tool, args, result) {
  switch (tool) {
    case 'goods_add':
      return `新增「${String(result?.item?.name || args?.name || '谷子')}」`
    case 'goods_update':
      return `修改「${String(args?.id || '')}」`
    case 'goods_delete':
      return `删除「${String(args?.id || '')}」`
    case 'goods_restore':
      return `恢复「${String(args?.id || '')}」`
    case 'goods_sell':
      return `记录出售「${String(args?.id || '')}」`
    case 'recharge_add':
      return `新增充值「${String(result?.game || args?.game || '')}」`
    case 'recharge_update':
      return `修改充值「${String(args?.id || '')}」`
    case 'recharge_delete':
      return `删除充值「${String(args?.id || '')}」`
    case 'events_add':
      return `新增活动「${String(result?.item?.name || args?.name || '')}」`
    case 'events_update':
      return `修改活动「${String(args?.id || '')}」`
    case 'events_delete':
      return `删除活动「${String(args?.id || '')}」`
    default:
      return tool
  }
}

/**
 * 按逆序回放一轮写操作。
 * @param {Array<Record<string, any>>} entries
 * @param {{ goodsStore: any, rechargeStore: any, eventsStore?: any }} deps
 * @returns {Promise<{ ok: boolean, undone: number, failed: number, errors: string[] }>}
 */
export async function applyUndoEntries(entries, deps) {
  const list = Array.isArray(entries) ? [...entries].filter((e) => e && !e.undone) : []
  let undone = 0
  let failed = 0
  /** @type {string[]} */
  const errors = []

  for (const entry of list.reverse()) {
    try {
      await applyUndoEntry(entry, deps)
      entry.undone = true
      undone += 1
    } catch (e) {
      failed += 1
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return { ok: failed === 0, undone, failed, errors }
}

/**
 * 单条撤回。
 * @param {Record<string, any>} entry
 * @param {{ goodsStore: any, rechargeStore: any, eventsStore?: any }} deps
 */
export async function applyUndoEntry(entry, deps) {
  const tool = String(entry?.tool || '')
  const id = String(entry?.id || '').trim()
  if (!id) throw new Error('撤回条目缺少 id')
  const { goodsStore, rechargeStore, eventsStore } = deps

  switch (tool) {
    case 'goods_add': {
      // 新增撤回 = 移入回收站（与 goods_delete 对称，可再次恢复）
      if (!goodsStore) throw new Error('谷子模块不可用')
      await goodsStore.removeGoods(id)
      return
    }
    case 'goods_delete': {
      if (!goodsStore) throw new Error('谷子模块不可用')
      await goodsStore.restoreTrashItem(id)
      return
    }
    case 'goods_restore': {
      if (!goodsStore) throw new Error('谷子模块不可用')
      await goodsStore.removeGoods(id)
      return
    }
    case 'goods_update':
    case 'goods_sell': {
      if (!goodsStore) throw new Error('谷子模块不可用')
      const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : null
      if (!fields || Object.keys(fields).length === 0) {
        throw new Error('撤回缺少字段快照')
      }
      await goodsStore.updateGoods(id, fields)
      return
    }
    case 'recharge_add': {
      if (!rechargeStore) throw new Error('充值模块不可用')
      const ok = await rechargeStore.deleteRecord(id)
      if (!ok) throw new Error(`未找到充值记录 ${id}`)
      return
    }
    case 'recharge_update': {
      if (!rechargeStore) throw new Error('充值模块不可用')
      const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : null
      if (!fields || Object.keys(fields).length === 0) {
        throw new Error('撤回缺少充值字段快照')
      }
      const existing = findRechargeRecord(rechargeStore, id)
      if (!existing) throw new Error(`未找到充值记录 ${id}`)
      const ok = await rechargeStore.updateRecord(id, { ...existing, ...fields, id })
      if (!ok) throw new Error(`回放充值修改失败：${id}`)
      return
    }
    case 'recharge_delete': {
      if (!rechargeStore) throw new Error('充值模块不可用')
      const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : null
      if (!fields) throw new Error('撤回缺少充值快照')
      // 软删除逆操作：把 deleted 翻回 false 再写回
      const ok = await rechargeStore.updateRecord(id, { ...fields, deleted: false })
      if (!ok) throw new Error(`恢复充值失败：${id}`)
      return
    }
    case 'events_add': {
      if (!eventsStore) throw new Error('活动模块不可用')
      await eventsStore.removeEventRecord(id)
      return
    }
    case 'events_update': {
      if (!eventsStore) throw new Error('活动模块不可用')
      const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : null
      if (!fields || Object.keys(fields).length === 0) {
        throw new Error('撤回缺少活动字段快照')
      }
      const existing = findEvent(eventsStore, id)
      if (!existing) throw new Error(`未找到活动 ${id}`)
      await eventsStore.updateEventRecord(id, { ...existing, ...fields, id })
      return
    }
    case 'events_delete': {
      if (!eventsStore) throw new Error('活动模块不可用')
      const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : null
      if (!fields) throw new Error('撤回缺少活动快照')
      // 软删除逆操作：整条快照写回并取消 deleted
      await eventsStore.updateEventRecord(id, { ...fields, id, deleted: false })
      return
    }
    default:
      throw new Error(`不支持撤回的操作：${tool || '未知'}`)
  }
}

/**
 * 包装一轮 send 内的写工具调用，成功写入后把 entry 推进 turnEntries。
 * deps 可传对象，或 lazy getter（避免 send 建参时强制加载 recharge/events store）。
 * @param {(name: string, args: Record<string, any>) => Promise<any>} runHandler
 * @param {{ goodsStore: any, rechargeStore: any, eventsStore?: any } | (() => { goodsStore: any, rechargeStore: any, eventsStore?: any })} deps
 * @param {Array<Record<string, any>>} turnEntries
 */
export function createUndoTrackingExecutor(runHandler, deps, turnEntries) {
  const resolveDeps = () => (typeof deps === 'function' ? deps() : deps)
  return async (/** @type {string} */ name, /** @type {Record<string, any>} */ args) => {
    if (!isUndoableWriteTool(name)) {
      return runHandler(name, args)
    }
    const before = await captureUndoBefore(name, args, resolveDeps())
    const result = await runHandler(name, args)
    const entry = buildUndoEntry(name, args, before, result)
    if (entry && turnEntries.length < MAX_UNDO_ENTRIES) {
      turnEntries.push(entry)
    }
    return result
  }
}

/**
 * 清洗持久化/加载时的 undoJournal，去掉坏数据。
 * @param {unknown} journal
 */
export function sanitizeUndoJournal(journal) {
  if (!journal || typeof journal !== 'object') return null
  const entries = Array.isArray(/** @type {any} */ (journal).entries)
    ? /** @type {any} */ (journal).entries.filter((e) => e && typeof e.tool === 'string' && typeof e.id === 'string' && e.id)
    : []
  if (entries.length === 0) return null
  return {
    entries,
    undone: Boolean(/** @type {any} */ (journal).undone)
  }
}
