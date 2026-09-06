// @ts-check
/**
 * MCP 可写工具实现：新增/更新/删除（移入回收站）/恢复谷子。
 *
 * 必须走 goodsStore 而不是直接写 db：store 负责内存状态、字段归一化、
 * 状态时间线与云同步推送，绕过它会让界面与云端不一致。
 *
 * 这组工具不在 MCP 外部服务的工具列表里（外部保持只读），当前只供
 * 应用内 AI 聊天窗口使用。
 */

/** goods_add / goods_update 允许透传给 store 的字段白名单 */
const WRITABLE_FIELDS = new Set([
  'name', 'category', 'ip', 'characters', 'tags', 'variant', 'storageLocation',
  'price', 'actualPrice', 'currency', 'actualPriceCurrency', 'quantity',
  'acquiredAt', 'isWishlist', 'note'
])

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 校验并裁剪输入：只保留白名单字段，校验 name/quantity/日期格式。
 * @param {Record<string, any>} args
 * @param {{ requireName?: boolean }} [options]
 */
function sanitizeWritable(args, options = {}) {
  /** @type {Record<string, any>} */
  const data = {}
  for (const [key, value] of Object.entries(args || {})) {
    if (!WRITABLE_FIELDS.has(key) || value === undefined) continue
    data[key] = value
  }
  if (options.requireName && !String(data.name || '').trim()) {
    throw new Error('name 必填')
  }
  if (data.quantity !== undefined) {
    const quantity = Number(data.quantity)
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error('quantity 必须为不小于 1 的数字')
    data.quantity = Math.floor(quantity)
  }
  if (data.acquiredAt !== undefined && data.acquiredAt !== '' && !DATE_PATTERN.test(String(data.acquiredAt))) {
    throw new Error('acquiredAt 需为 YYYY-MM-DD 格式')
  }
  if (data.characters !== undefined && !Array.isArray(data.characters)) {
    throw new Error('characters 需为字符串数组')
  }
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    throw new Error('tags 需为字符串数组')
  }
  return data
}

/**
 * @typedef {Object} GoodsStoreLike
 * @property {(data: any) => Promise<any>} addGoods
 * @property {(id: string, data: any) => Promise<any>} updateGoods
 * @property {(id: string) => Promise<void>} removeGoods
 * @property {(id: string) => Promise<any>} restoreTrashItem
 * @property {{ value: any[] }} list
 * @property {{ value: any[] }} trashList
 */

/**
 * @param {{ goodsStore: GoodsStoreLike }} params
 */
export function createMcpWriteToolHandlers({ goodsStore }) {
  return {
    /**
     * @param {Record<string, any>} args
     */
    async goods_add(args) {
      const data = sanitizeWritable(args, { requireName: true })
      const created = await goodsStore.addGoods(data)
      if (!created?.id) throw new Error('新增失败')
      return {
        ok: true,
        id: created.id,
        item: {
          id: created.id,
          name: created.name,
          category: created.category,
          ip: created.ip,
          characters: created.characters,
          isWishlist: Boolean(created.isWishlist),
          quantity: created.quantity,
          acquiredAt: created.acquiredAt
        }
      }
    },

    /**
     * @param {Record<string, any>} args
     */
    async goods_update(args) {
      const { id, ...rest } = args || {}
      const targetId = String(id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!goodsStore.list.value.some((item) => item?.id === targetId)) {
        throw new Error(`未找到 id 为 ${targetId} 的条目（回收站中的条目请先用 goods_restore 恢复）`)
      }
      const data = sanitizeWritable(rest)
      if (Object.keys(data).length === 0) {
        throw new Error('没有可更新的字段')
      }
      await goodsStore.updateGoods(targetId, data)
      return { ok: true, id: targetId }
    },

    /**
     * @param {Record<string, any>} args
     */
    async goods_delete(args) {
      const targetId = String(args?.id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!goodsStore.list.value.some((item) => item?.id === targetId)) {
        throw new Error(`未找到 id 为 ${targetId} 的条目`)
      }
      await goodsStore.removeGoods(targetId)
      return { ok: true, id: targetId, note: '已移入回收站，可用 goods_restore 恢复' }
    },

    /**
     * @param {Record<string, any>} args
     */
    async goods_restore(args) {
      const targetId = String(args?.id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!goodsStore.trashList.value.some((item) => item?.id === targetId)) {
        throw new Error(`回收站中未找到 id 为 ${targetId} 的条目`)
      }
      await goodsStore.restoreTrashItem(targetId)
      return { ok: true, id: targetId }
    }
  }
}
