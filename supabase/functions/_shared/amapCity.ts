// supabase/functions/_shared/amapCity.ts
// 高德地址 → 城市/区县 识别共享逻辑（POI 关键词搜索为主，地理编码 + 逆地理编码兜底）。
// 被 geocode-address（客户端实时识别）与 backfill-event-cities（存量回填）复用。
//
// 为什么 POI 搜索优先于地理编码：
//   geocode/geo 对场馆级关键词经常错配。实测「国家会展中心(上海)」被解析成天津市津南区
//   （命中地铁站）、「鸟巢」被解析成江西省上饶市鄱阳县。而 place/text POI 关键词搜索
//   返回的是真实场馆，省/市/区齐全且正确（「国家会展中心(上海)」→ 上海市 青浦区，
//   「鸟巢」→ 北京市 朝阳区）。因此先试 POI 搜索，拿不到结果再退回 geocode + regeo。
//
// 依赖 secrets：AMAP_WEB_API_KEY（由调用方传入）

const AMAP_PLACE_TEXT_URL = "https://restapi.amap.com/v3/place/text"
const AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
const AMAP_REGEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo"

export interface CityResult {
  province: string
  city: string
  district: string
  adcode: string
  location: string
}

/** 上游网络/HTTP 失败（区别于「地址无匹配」），调用方可据此返回 502 */
export class AmapUpstreamError extends Error {
  status: number | null
  reason: string

  constructor(status: number | null, reason: string) {
    super(reason)
    this.status = status
    this.reason = reason
  }
}

/**
 * 拉取 JSON。返回 { ok: true, data } 或 { ok: false, status, reason }。
 * 区分「网络失败」与「HTTP 非 2xx」，便于诊断上游问题。
 */
export async function fetchJson(url: string, timeoutMs = 15_000): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; status: number | null; reason: string }
> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // 手动 AbortController 超时：AbortSignal.timeout() 在部分 Deno/Edge Runtime 版本不可用，
    // 直接使用会导致 fetch 抛 TypeError 而完全失败
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return { ok: false, status: res.status, reason: `http_${res.status}` }
      return { ok: true, data: await res.json() }
    } catch (e) {
      // 瞬时网络失败重试；最后一次失败返回失败原因由调用方记录/降级
      const reason = e?.name === "AbortError" ? "timeout" : String(e?.message || e)
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        continue
      }
      return { ok: false, status: null, reason }
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, status: null, reason: "unknown" }
}

/** 从 addressComponent 中取 city，兼容「city 为空数组 / 空串」的直辖市情况 */
export function pickCity(comp: Record<string, unknown>): string {
  const raw = comp.city
  const city = Array.isArray(raw) ? String(raw[0] || "").trim() : String(raw || "").trim()
  if (city) return city
  return String(comp.province || "").trim()
}

/** POI 结果中取 city，兼容部分结果 cityname 为空的场景 */
function pickPoiCity(poi: Record<string, unknown>): string {
  const raw = poi.cityname
  const city = Array.isArray(raw) ? String(raw[0] || "").trim() : String(raw || "").trim()
  if (city) return city
  return String(poi.pname || "").trim()
}

function poiResult(poi: Record<string, unknown>): CityResult {
  return {
    province: String(poi.pname || "").trim(),
    city: pickPoiCity(poi),
    district: String(poi.adname || "").trim(),
    adcode: String(poi.adcode || "").trim(),
    location: String(poi.location || "").trim(),
  }
}

/** POI 关键词搜索，返回第一条命中的结果；无匹配返回 null。网络失败抛 AmapUpstreamError */
async function searchPoi(apiKey: string, address: string): Promise<CityResult | null> {
  const url = new URL(AMAP_PLACE_TEXT_URL)
  url.searchParams.set("key", apiKey)
  url.searchParams.set("keywords", address)
  url.searchParams.set("output", "JSON")

  const res = await fetchJson(url.toString())
  if (!res.ok) throw new AmapUpstreamError(res.status, res.reason)
  const data = res.data
  if (data.status !== "1" || !Array.isArray(data.pois) || data.pois.length === 0) {
    if (data.status !== "1") {
      // 关键词触发的引擎级错误（如某些带括号的写法）——降级走 geocode，不当作失败
      console.error("amapCity:place-status", data.status, data.info, data.infocode, address)
    }
    return null
  }
  const poi = (data.pois as Record<string, unknown>[])[0] || {}
  if (!poi.pname && !poi.cityname) return null
  return poiResult(poi)
}

/** geocode + regeo 兜底路径，逻辑同旧版两步法 */
async function searchGeocode(apiKey: string, address: string): Promise<CityResult | null> {
  const geoUrl = new URL(AMAP_GEOCODE_URL)
  geoUrl.searchParams.set("key", apiKey)
  geoUrl.searchParams.set("address", address)
  geoUrl.searchParams.set("output", "JSON")

  const geoRes = await fetchJson(geoUrl.toString())
  if (!geoRes.ok) throw new AmapUpstreamError(geoRes.status, geoRes.reason)
  const geoData = geoRes.data
  if (geoData.status !== "1" || !Array.isArray(geoData.geocodes) || geoData.geocodes.length === 0) {
    return null
  }
  const geo = (geoData.geocodes as Record<string, unknown>[])[0] || {}
  const location = String(geo.location || "").trim()

  const result: CityResult = {
    province: String(geo.province || "").trim(),
    city: String(geo.city || "").trim() || String(geo.province || "").trim(),
    district: String(geo.district || "").trim(),
    adcode: String(geo.adcode || "").trim(),
    location,
  }

  // regeo 补全区县（geocode 对 POI 精确地址 district 可能为空）；失败不阻断
  if (location) {
    const regeoUrl = new URL(AMAP_REGEOCODE_URL)
    regeoUrl.searchParams.set("key", apiKey)
    regeoUrl.searchParams.set("location", location)
    regeoUrl.searchParams.set("output", "JSON")

    const regeoRes = await fetchJson(regeoUrl.toString())
    if (!regeoRes.ok) {
      console.error("amapCity:regeo-fetch-failed", regeoRes.status, regeoRes.reason, address)
    } else {
      const comp = (regeoRes.data.regeocode as Record<string, unknown> | undefined)
        ?.addressComponent as Record<string, unknown> | undefined
      if (comp) {
        const compProvince = String(comp.province || "").trim()
        const compCity = pickCity(comp)
        const compDistrict = String(comp.district || "").trim()
        const compAdcode = String(comp.adcode || "").trim()
        if (compProvince) result.province = compProvince
        if (compCity) result.city = compCity
        if (compDistrict) result.district = compDistrict
        if (compAdcode) result.adcode = compAdcode
      }
    }
  }

  if (!result.city && !result.province) return null
  return result
}

/**
 * 地址 → 城市信息。POI 搜索优先，失败/无匹配退回 geocode + regeo。
 * @returns 成功返回城市信息；地址无匹配返回 null；上游网络失败抛 AmapUpstreamError
 */
export async function lookupCity(apiKey: string, address: string): Promise<CityResult | null> {
  const poi = await searchPoi(apiKey, address)
  if (poi) return poi
  return searchGeocode(apiKey, address)
}
