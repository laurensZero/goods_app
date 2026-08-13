// src/services/mihoyoStockMonitorService.js
// 米游铺库存有货监控 —— 服务层
//
// 职责：读写用户自己的 mihoyo_monitor_goods 监控列表（RLS 仅允许操作本人行）。
// 有货检测完全在服务端完成（scan-mihoyo-stock Edge Function 定时轮询并推 QQ），
// 这里的 in_stock / last_checked_at 只是服务端最近一次检测的结果快照，供展示。

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { mihoyoRequest } from '@/utils/mihoyo/request'
import { fetchGoodsDetail } from '@/utils/mihoyo'

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
 * UNIQUE(user_id, goods_id, sku_key) 保证同一商品的同一 SKU 只监控一次。
 * @param {Object} entry
 * @param {string} entry.goodsId - 米游铺商品 ID
 * @param {string} [entry.name]
 * @param {number} [entry.priceCents]
 * @param {string} [entry.coverUrl]
 * @param {string} [entry.skuKey] - 所选 SKU 组合 key，空 = 整件商品
 * @param {string} [entry.skuName] - 所选 SKU 展示名，空 = 整件商品
 * @returns {Promise<Object>}
 */
export async function addMonitoredGoods({ goodsId, name = '', priceCents = 0, coverUrl = '', skuKey = '', skuName = '' }) {
  const db = getSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('not_logged_in')

  const { data, error } = await db
    .from(MONITOR_TABLE)
    .upsert({
      user_id: user.id,
      goods_id: String(goodsId || '').trim(),
      name: String(name || '').trim(),
      price_cents: Number(priceCents) || 0,
      cover_url: String(coverUrl || '').trim(),
      sku_key: String(skuKey || '').trim(),
      sku_name: String(skuName || '').trim(),
    }, { onConflict: 'user_id,goods_id,sku_key' })
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
 * 更新监控行的检测结果快照（仅本人行）。
 * 添加后客户端会做一次即时检测，把结果回写服务端，
 * 避免服务端定时扫描尚未跑完时刷新列表，导致商品一直显示“检测中”。
 * @param {string} id
 * @param {Object} patch - 仅可写入检测结果相关字段
 */
export async function updateMonitoredGoodsStatus(id, patch = {}) {
  const db = getSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error('not_logged_in')

  const { in_stock, stock_count, price_cents, sku_name, last_checked_at } = patch
  const { error } = await db
    .from(MONITOR_TABLE)
    .update({
      in_stock: Boolean(in_stock),
      stock_count: Number(stock_count) || 0,
      price_cents: Number(price_cents) || 0,
      sku_name: String(sku_name || ''),
      last_checked_at: last_checked_at || new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

// 找出「只有单个可选项」的维度组 key（如发货时间），这类 key 可能随批次文案变化：
// 匹配时只要求非噪音（多选项）的 key 部分命中，避免噪音 key 变化导致误判缺货。
function buildNoiseKeysFromDetail(detail) {
  const noise = new Set()
  for (const group of (Array.isArray(detail?.sale_attrs) ? detail.sale_attrs : [])) {
    const content = Array.isArray(group?.content) ? group.content : []
    if (content.length <= 1) {
      for (const item of content) {
        const ik = String(item?.key || '')
        if (ik) noise.add(ik)
      }
    }
  }
  return noise
}

function requiredKeyParts(skuKey, noiseKeys) {
  return String(skuKey || '').split('_').filter((p) => p && !noiseKeys.has(p))
}

/**
 * 按 sku_quantities（键=SKU 组合 key，值=库存）判定是否有货。
 * 与服务端 scan-mihoyo-stock 同一判定逻辑：
 * - 指定 skuKey：精确命中 key 优先；未命中则按 key 的部分组合模糊匹配（排除单选项噪音 key）；
 *   仍无则回退 detail.skus 中该 SKU（按 key/id 匹配）的 stock 字段。
 * - 未指定 skuKey（整件商品）：任一 SKU 库存 > 0 即有货。
 * @param {Object} skuQuantities
 * @param {Object} skus
 * @param {string} [skuKey]
 * @param {Set<string>} [noiseKeys] - 只有单个可选项的维度组 key 集合
 * @returns {boolean}
 */
export function resolveAvailability(skuQuantities, skus, skuKey = '', noiseKeys = new Set()) {
  const skuQty = skuQuantities && typeof skuQuantities === 'object' ? skuQuantities : {}
  const skuMap = skus && typeof skus === 'object' ? skus : {}

  if (skuKey) {
    if (skuQty[skuKey] != null) return Number(skuQty[skuKey]) > 0

    const skuParts = requiredKeyParts(skuKey, noiseKeys)
    if (skuParts.length) {
      const partial = Object.entries(skuQty).filter(([k]) => {
        const parts = String(k).split('_').filter(Boolean)
        return skuParts.every((p) => parts.includes(p))
      })
      if (partial.length) return partial.some(([, v]) => Number(v) > 0)
    }

    const matched = Object.entries(skuMap).find(([k, s]) => String(k) === skuKey || String(s?.id) === skuKey)
    if (matched) {
      const stock = Number(matched[1]?.stock ?? matched[1]?.quantity ?? matched[1]?.sku_stock ?? -1)
      return stock > 0
    }
    return false
  }

  const entries = Object.entries(skuQty)
  if (entries.length > 0) {
    return entries.some(([, v]) => Number(v) > 0)
  }
  return Object.values(skuMap).some((s) => Number(s?.stock ?? s?.quantity ?? s?.sku_stock ?? -1) > 0)
}

/**
 * 计算当前可售库存数量（供通知/即时反馈「有货 N 件」）。
 * 判定范围与 resolveAvailability 一致：
 * - 指定 skuKey：取该 SKU 的库存，未精确命中则聚合匹配的部分组合（排除单选项噪音 key）；
 * - 整件商品：聚合所有正库存之和。
 * @param {Object} skuQuantities
 * @param {Object} skus
 * @param {string} [skuKey]
 * @param {Set<string>} [noiseKeys] - 只有单个可选项的维度组 key 集合
 * @returns {number}
 */
export function resolveStock(skuQuantities, skus, skuKey = '', noiseKeys = new Set()) {
  const skuQty = skuQuantities && typeof skuQuantities === 'object' ? skuQuantities : {}
  const skuMap = skus && typeof skus === 'object' ? skus : {}
  const entries = Object.entries(skuQty)

  if (skuKey) {
    if (skuQty[skuKey] != null) return Math.max(0, Number(skuQty[skuKey]) || 0)

    const skuParts = requiredKeyParts(skuKey, noiseKeys)
    if (skuParts.length) {
      const partial = entries.filter(([k]) => {
        const parts = String(k).split('_').filter(Boolean)
        return skuParts.every((p) => parts.includes(p))
      })
      if (partial.length) {
        return partial.reduce((sum, [, v]) => sum + Math.max(0, Number(v) || 0), 0)
      }
    }

    const matched = Object.entries(skuMap).find(([k, s]) => String(k) === skuKey || String(s?.id) === skuKey)
    if (matched) {
      return Math.max(0, Number(matched[1]?.stock ?? matched[1]?.quantity ?? matched[1]?.sku_stock ?? 0) || 0)
    }
    return 0
  }

  if (entries.length > 0) {
    return entries.reduce((sum, [, v]) => sum + Math.max(0, Number(v) || 0), 0)
  }
  return Object.values(skuMap).reduce((sum, s) => {
    const st = Number(s?.stock ?? s?.quantity ?? s?.sku_stock ?? 0)
    return sum + (st > 0 ? st : 0)
  }, 0)
}

/**
 * 用商品的款式文本（如「茜特菈莉 / 立牌」）匹配出对应的 SKU key/名称。
 * 供详情页/心愿单详情页「加入监控」时把已选款式下钻到具体 SKU；
 * 匹配失败（或商品无款式/无 SKU）返回 null，调用方回退为整件商品监控。
 * @param {string} goodsId
 * @param {string} variantText - 款式文本（item.variant / item.style / 笔记中的款式）
 * @returns {Promise<{key: string, text: string} | null>}
 */
export async function resolveMonitorSkuByVariant(goodsId, variantText) {
  const target = String(variantText || '').trim()
  if (!goodsId || !target) return null
  try {
    const { skuVariants } = await fetchGoodsDetail(goodsId)
    const list = (skuVariants || []).filter((v) => v && v.key)
    if (!list.length) return null

    const targetLower = target.toLowerCase()

    const exact = list.find((v) => String(v.text || '').trim().toLowerCase() === targetLower)
    if (exact) return { key: exact.key, text: exact.text }

    const fuzzy = list.find((v) => {
      const text = String(v.text || '').trim().toLowerCase()
      return text.includes(targetLower) || targetLower.includes(text)
    })
    if (fuzzy) return { key: fuzzy.key, text: fuzzy.text }

    const parts = target.split(/[\/／\s,，、]+/).filter(Boolean)
    if (parts.length > 1) {
      const partial = list.find((v) => {
        const text = String(v.text || '').trim().toLowerCase()
        return parts.every((p) => text.includes(p.toLowerCase()))
      })
      if (partial) return { key: partial.key, text: partial.text }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 按 sku_key 从 sale_attrs 重新解析当前 SKU 展示名（文案会随商品改款变化，key 稳定）。
 * 与服务端 scan-mihoyo-stock 的 resolveSkuName 同逻辑；返回空串表示整件或无法解析。
 * @param {Object} detail
 * @param {string} [skuKey]
 * @returns {string}
 */
export function resolveSkuNameFromDetail(detail, skuKey = '') {
  const key = String(skuKey || '').trim()
  if (!key) return ''
  const keyToText = new Map()
  // 排除只有单个可选项的维度组（与 buildSkuVariantsFromDetail 一致，保证名称刷新一致）
  for (const group of (Array.isArray(detail?.sale_attrs) ? detail.sale_attrs : [])) {
    const content = Array.isArray(group?.content) ? group.content : []
    if (content.length <= 1) continue
    for (const item of content) {
      const itemKey = String(item?.key || '')
      if (itemKey) keyToText.set(itemKey, String(item?.text || '').trim())
    }
  }
  return key
    .split('_')
    .map((p) => keyToText.get(p))
    .filter(Boolean)
    .join(' / ')
}

/**
 * 客户端立即检测商品（或指定 SKU）是否有货（添加监控后即时反馈，不等下一轮服务端扫描）。
 * 与服务端 scan-mihoyo-stock 同一判定逻辑，见 resolveAvailability。
 * @param {string} goodsId
 * @param {string} [skuKey] - 指定 SKU 组合 key，空 = 整件商品
 * @returns {Promise<{ available: boolean, priceCents: number, stock: number, skuName: string } | null>} 失败返回 null
 */
export async function checkGoodsAvailability(goodsId, skuKey = '') {
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
    const noiseKeys = buildNoiseKeysFromDetail(detail)

    const available = resolveAvailability(skuQuantities, detail?.skus, skuKey, noiseKeys)
    const stock = resolveStock(skuQuantities, detail?.skus, skuKey, noiseKeys)
    const priceCents = Number(detail?.price) > 0 ? Number(detail.price) : 0
    const skuName = resolveSkuNameFromDetail(detail, skuKey)
    return { available, stock, priceCents, skuName }
  } catch {
    return null
  }
}
