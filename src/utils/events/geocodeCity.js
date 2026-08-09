// @ts-check
/**
 * utils/events/geocodeCity.js
 * 地址 → 城市 识别工具：经 Supabase Edge Function geocode-address（高德 Web 服务）解析。
 *
 * 设计约束：
 *   - Edge Function verify_jwt=true，必须登录；未登录 / 未配置 Supabase / 调用失败
 *     一律静默返回 null，调用方降级为「城市留空」，不打断用户填写流程。
 *   - city 与 district 组合成「城市 区县」字符串（如「上海市 浦东新区」）存 events.city，
 *     供活动列表按城市关键词搜索。
 */

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { getSession } from '@/utils/supabase/auth'

/**
 * @param {string} city
 * @param {string} district
 * @returns {string} 组合后的城市字符串
 */
export function combineCityDistrict(city, district) {
  return [String(city || '').trim(), String(district || '').trim()].filter(Boolean).join(' ')
}

/**
 * 将地址解析为城市信息。
 * @param {string} address 活动地址（如「上海新国际博览中心」）
 * @returns {Promise<{ city: string, district: string } | null>}
 *   成功返回城市/区县；未登录、上游失败或无匹配时返回 null（静默降级）。
 */
export async function geocodeAddressToCity(address) {
  const normalized = String(address || '').trim()
  if (!normalized) return null

  let session = null
  try {
    session = await getSession()
  } catch {
    return null
  }
  if (!session?.access_token) return null

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { address: normalized }
    })
    if (error) return null
    if (!data || typeof data !== 'object') return null

    const city = String(data.city || '').trim()
    if (!city) return null
    return {
      city,
      district: String(data.district || '').trim()
    }
  } catch {
    return null
  }
}
