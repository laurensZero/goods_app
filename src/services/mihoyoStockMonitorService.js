// src/services/mihoyoStockMonitorService.js
// 米游铺库存有货监控 —— 服务层
//
// 职责：读写用户自己的 mihoyo_monitor_goods 监控列表（RLS 仅允许操作本人行）。
// 有货检测完全在服务端完成（scan-mihoyo-stock Edge Function 定时轮询并推 QQ），
// 这里的 in_stock / last_checked_at 只是服务端最近一次检测的结果快照，供展示。

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { mihoyoRequest } from '@/utils/mihoyo/request'

const MONITOR_TABLE = 'mihoyo_monitor_goods'
const GOODS_DETAIL_PATH = '/common/homeishop/v1/goods/detail'

/**
 * 拉取当前用户的监控列表（按添加时间倒序）。
 * @returns {Promise<Array>}
 */
export async function listMonitoredGoods() {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from(MONITOR_TABLE)
    .select('*')
    .order('added_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * 添加（或重复添加时更新快照）一个监控商品。
 * UNIQUE(user_id, goods_id) 保证同一商品只监控一次。
 * @param {Object} entry
 * @param {string} entry.goodsId - 米游铺商品 ID
 * @param {string} [entry.shopCode]
 * @param {string} [entry.name]
 * @param {number} [entry.priceCents]
 * @param {string} [entry.coverUrl]
 * @returns {Promise<Object>}
 */
export async function addMonitoredGoods({ goodsId, shopCode = '', name = '', priceCents = 0, coverUrl = '' }) {
  const db = getSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('not_logged_in')

  const { data, error } = await db
    .from(MONITOR_TABLE)
    .upsert({
      user_id: user.id,
      goods_id: String(goodsId || '').trim(),
      shop_code: String(shopCode || '').trim(),
      name: String(name || '').trim(),
      price_cents: Number(priceCents) || 0,
      cover_url: String(coverUrl || '').trim(),
    }, { onConflict: 'user_id,goods_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * 移除一个监控商品。
 * @param {string} id
 */
export async function removeMonitoredGoods(id) {
  const db = getSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('not_logged_in')

  const { error } = await db
    .from(MONITOR_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

/**
 * 客户端立即检测商品是否有货（添加监控后即时反馈，不等下一轮服务端扫描）。
 * 与服务端 scan-mihoyo-stock 同一判定逻辑：优先 sku_quantities，回退 skus。
 * @param {string} goodsId
 * @returns {Promise<{ available: boolean, priceCents: number } | null>} 失败返回 null
 */
export async function checkGoodsAvailability(goodsId) {
  try {
    const json = await mihoyoRequest(`${GOODS_DETAIL_PATH}?goods_id=${goodsId}`, {
      headers: {
        'Referer': 'https://www.mihoyogift.com/',
        'x-rpc-language': 'zh-cn',
      },
    })
    if (json?.retcode !== 0) return null

    const detail = json?.data?.goods?.detail ?? {}
    const goodsQuantity = json?.data?.goods?.quantity ?? detail?.quantity ?? {}
    const skuQuantities = goodsQuantity?.sku_quantities || {}

    let available = false
    const entries = Object.entries(skuQuantities)
    if (entries.length > 0) {
      available = entries.some(([, v]) => Number(v) > 0)
    }
    if (!available && detail?.skus && typeof detail.skus === 'object') {
      const skus = Object.values(detail.skus)
      available = skus.some((s) => Number(s?.stock ?? s?.quantity ?? s?.sku_stock ?? -1) > 0)
    }

    const priceCents = Number(detail?.price) > 0 ? Number(detail.price) : 0
    return { available, priceCents }
  } catch {
    return null
  }
}
