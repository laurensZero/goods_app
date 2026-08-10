// @ts-check
/**
 * utils/events/geocodeCity.js
 * 地址 → 城市/坐标 识别工具：经 Supabase Edge Function geocode-address（高德 Web 服务）解析。
 *
 * 设计约束：
 *   - Edge Function verify_jwt=true，必须登录；未登录 / 未配置 Supabase / 调用失败
 *     一律静默返回 null，调用方降级为「城市留空」，不打断用户填写流程。
 *   - city 与 district 组合成「城市 区县」字符串（如「上海市 浦东新区」）存 events.city，
 *     供活动列表按城市关键词搜索。
 *   - 高德返回的 location（"lng,lat"）解析为 latitude/longitude 存 events，供活动地图打点。
 */

import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { getSession } from '@/utils/supabase/auth'

/**
 * 解析高德 Web 服务的 location 字符串（"经度,纬度"）为经纬度。
 * @param {string} location
 * @returns {{ latitude: string, longitude: string } | null}
 */
export function parseAmapLocation(location) {
  const raw = String(location || '').trim()
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length < 2) return null
  const lng = String(parts[0] || '').trim()
  const lat = String(parts[1] || '').trim()
  const numLng = Number(lng)
  const numLat = Number(lat)
  if (!lng || !lat || !Number.isFinite(numLng) || !Number.isFinite(numLat)) return null
  if (numLng < -180 || numLng > 180 || numLat < -90 || numLat > 90) return null
  return { latitude: lat, longitude: lng }
}

/**
 * @param {string} city
 * @param {string} district
 * @returns {string} 组合后的城市字符串
 */
export function combineCityDistrict(city, district) {
  return [String(city || '').trim(), String(district || '').trim()].filter(Boolean).join(' ')
}

/**
 * 将地址解析为城市与坐标信息。
 * @param {string} address 活动地址（如「上海新国际博览中心」）
 * @returns {Promise<{ city: string, district: string, latitude: string, longitude: string } | null>}
 *   成功返回城市/区县/经纬度；未登录、上游失败或无匹配时返回 null（静默降级）。
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
    const coords = parseAmapLocation(String(data.location || '').trim())

    return {
      city,
      district: String(data.district || '').trim(),
      latitude: coords?.latitude || '',
      longitude: coords?.longitude || ''
    }
  } catch {
    return null
  }
}
