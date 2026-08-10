// supabase/functions/geocode-address/index.ts
// 地址 → 城市 地理编码（高德 Web 服务）。
// verify_jwt=true（见 config.toml）：必须携带登录 JWT，防止匿名刷高德配额。
//
// 用法（客户端 supabase.functions.invoke 会自动带上 Authorization: Bearer <access_token>）：
//   POST https://<project-ref>.supabase.co/functions/v1/geocode-address
//   body: { "address": "国家会展中心(上海)" }
//   返回：{ province, city, district, adcode, location } 或 { error: <code> }
//
// 识别策略：
//   1. 境外地址启发式检测——高德 Web 服务只覆盖中国大陆（含港澳），境外地址会错配成
//      国内同名地点（实测「东京迪士尼」→ 上海迪士尼、「伦敦大本钟」→ 江苏宿迁大本钟
//      公交站）。命中境外特征即返回空，避免把错误城市写入活动记录。
//   2. place/text POI 关键词搜索优先——对场馆级关键词，geocode/geo 经常错配
//      （实测「国家会展中心(上海)」被解析成天津市津南区地铁站），而 POI 搜索
//      返回真实场馆且省/市/区正确。POI 无匹配再退回 geocode + regeo 两步法。
//
// 依赖 secrets：AMAP_WEB_API_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const AMAP_PLACE_TEXT_URL = "https://restapi.amap.com/v3/place/text"
const AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
const AMAP_REGEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo"
const MAX_ADDRESS_LENGTH = 200

// 境外地名/国家关键词（中文），命中即视为境外地址
const OVERSEAS_CN = [
  "日本", "东京", "大阪", "京都", "北海道", "名古屋", "横滨", "奈良", "广岛",
  "韩国", "首尔", "釜山", "仁川", "大邱",
  "美国", "纽约", "洛杉矶", "旧金山", "芝加哥", "西雅图", "波士顿", "拉斯维加斯", "夏威夷", "华盛顿", "迈阿密", "奥兰多",
  "英国", "伦敦", "曼彻斯特", "爱丁堡", "利物浦", "剑桥", "牛津",
  "法国", "巴黎", "里昂", "马赛", "戛纳", "尼斯",
  "德国", "柏林", "慕尼黑", "法兰克福", "汉堡", "科隆",
  "意大利", "罗马", "米兰", "威尼斯", "佛罗伦萨", "那不勒斯",
  "西班牙", "马德里", "巴塞罗那", "塞维利亚", "瓦伦西亚",
  "澳大利亚", "悉尼", "墨尔本", "布里斯班", "珀斯", "堪培拉",
  "加拿大", "多伦多", "温哥华", "蒙特利尔", "卡尔加里",
  "新加坡",
  "泰国", "曼谷", "清迈", "普吉岛", "芭提雅",
  "马来西亚", "吉隆坡", "槟城", "沙巴", "马六甲",
  "越南", "河内", "胡志明", "岘港",
  "菲律宾", "马尼拉",
  "印度尼西亚", "雅加达", "巴厘岛",
  "印度", "新德里", "孟买", "班加罗尔",
  "阿联酋", "迪拜", "阿布扎比",
  "卡塔尔", "多哈",
  "沙特", "利雅得",
  "土耳其", "伊斯坦布尔", "安卡拉",
  "瑞士", "苏黎世", "日内瓦",
  "荷兰", "阿姆斯特丹", "鹿特丹", "海牙",
  "比利时", "布鲁塞尔", "安特卫普",
  "瑞典", "斯德哥尔摩",
  "挪威", "奥斯陆", "卑尔根",
  "丹麦", "哥本哈根",
  "芬兰", "赫尔辛基",
  "奥地利", "维也纳", "萨尔茨堡",
  "俄罗斯", "莫斯科", "圣彼得堡",
  "巴西", "圣保罗", "里约热内卢",
  "墨西哥", "墨西哥城", "坎昆",
  "新西兰", "奥克兰", "惠灵顿", "基督城",
  "埃及", "开罗",
  "希腊", "雅典", "圣托里尼",
  "爱尔兰", "都柏林",
  "葡萄牙", "里斯本", "波尔图",
  "波兰", "华沙", "克拉科夫",
  "捷克", "布拉格",
  "匈牙利", "布达佩斯",
  "台湾", "台北", "台中", "高雄", "台南", "桃园", "新北",
  "香港", "九龙", "新界", "香港岛",
  "澳门", "氹仔", "路环",
]

// 境外地名/国家关键词（英文，小写比对）
const OVERSEAS_EN = [
  "japan", "tokyo", "osaka", "kyoto", "hokkaido", "nagoya",
  "korea", "seoul", "busan",
  "usa", "america", "new york", "los angeles", "chicago", "seattle", "boston", "las vegas", "hawaii", "san francisco",
  "united kingdom", "london", "manchester", "edinburgh", "liverpool",
  "france", "paris", "lyon", "marseille", "cannes", "nice",
  "germany", "berlin", "munich", "frankfurt", "hamburg",
  "italy", "rome", "milan", "venice", "florence",
  "spain", "madrid", "barcelona", "seville",
  "australia", "sydney", "melbourne", "brisbane", "perth",
  "canada", "toronto", "vancouver", "montreal",
  "singapore",
  "thailand", "bangkok", "phuket", "chiang mai",
  "malaysia", "kuala lumpur", "penang",
  "vietnam", "hanoi", "ho chi minh",
  "philippines", "manila",
  "indonesia", "jakarta", "bali",
  "india", "new delhi", "mumbai", "bangalore",
  "dubai", "abu dhabi",
  "doha",
  "turkey", "istanbul",
  "switzerland", "zurich", "geneva",
  "netherlands", "amsterdam", "rotterdam",
  "belgium", "brussels",
  "sweden", "stockholm",
  "norway", "oslo",
  "denmark", "copenhagen",
  "finland", "helsinki",
  "austria", "vienna", "salzburg",
  "russia", "moscow", "saint petersburg",
  "brazil", "sao paulo", "rio de janeiro",
  "mexico", "mexico city", "cancun",
  "new zealand", "auckland", "wellington",
  "egypt", "cairo",
  "greece", "athens", "santorini",
  "ireland", "dublin",
  "portugal", "lisbon", "porto",
  "poland", "warsaw", "krakow",
  "czech", "prague",
  "hungary", "budapest",
  "taiwan", "taipei", "taichung", "kaohsiung",
  "hong kong", "kowloon",
  "macau", "macao",
]

// 中国大陆城市拼音（避免把拼音形式的国内地址误判为境外）
const CN_PINYIN_CITIES = [
  "beijing", "shanghai", "guangzhou", "shenzhen", "chengdu", "hangzhou", "chongqing", "wuhan", "xian",
  "nanjing", "suzhou", "tianjin", "qingdao", "dalian", "ningbo", "xiamen", "fuzhou", "changsha", "zhengzhou",
  "hefei", "nanchang", "kunming", "guiyang", "nanning", "haikou", "sanya", "lanzhou", "xining", "yinchuan",
  "harbin", "changchun", "shenyang", "jinan", "taiyuan", "shijiazhuang", "urumqi", "hohhot",
]

/** 境外地址启发式检测：命中即视为境外，返回 true（调用方直接留空城市） */
function isOverseasAddress(address: string): boolean {
  const a = String(address || "").trim()
  if (!a) return false
  const lower = a.toLowerCase()

  // 拼音城市命中 → 国内地址（如「Shanghai National Convention Center」），提前返回
  for (const c of CN_PINYIN_CITIES) {
    if (lower.includes(c)) return false
  }

  // 中文境外地名
  for (const c of OVERSEAS_CN) {
    if (a.includes(c)) return true
  }

  // 英文境外地名
  for (const c of OVERSEAS_EN) {
    if (lower.includes(c)) return true
  }

  // 日文假名 / 韩文 / 泰文等非中文文字 → 境外
  const foreignScript = /[\u3040-\u30ff\u31f0-\u31ff\uac00-\ud7af\u0e00-\u0e7f\u0e80-\u0eff]/g
  if (foreignScript.test(a)) return true

  // 纯 ASCII（全英文/全拼音）：拼音城市已排除，其余视为境外地址
  const cjkCount = (a.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const nonAsciiCount = (a.match(/[^\x00-\x7f]/g) || []).length
  if (cjkCount === 0 && nonAsciiCount === 0) return true

  return false
}

interface CityResult {
  province: string
  city: string
  district: string
  adcode: string
  location: string
}

/** 上游网络/HTTP 失败（区别于「地址无匹配」），调用方可据此返回 502 */
class AmapUpstreamError extends Error {
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
async function fetchJson(url: string, timeoutMs = 15_000): Promise<
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
function pickCity(comp: Record<string, unknown>): string {
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

/** 从 poi 列表中取第一条命中（带 city 限定后首条即与搜索词最相关的结果） */
function pickPoi(pois: Record<string, unknown>[], _address: string): Record<string, unknown> | null {
  // 直接取 pois[0]：带 city 重查后高德按相关度排序，首条即用户输入关键词最匹配的地点。
  // 刻意不做「名称完整包含搜索词」的挑选——实测「浦发银行东方体育中心」带 city 查询首条是
  // 场馆综合点「东方体育中心」(耀体路701号)，而按名称匹配反而会跳到「浦发银行东方体育中心
  // 体育馆」(泳耀路300号)，用户要的其实是前者。
  return pois[0] || null
}

/** POI 关键词搜索。优先带 city 限定城市（不带 city 时「浦发银行XX」这类带品牌词的地址会
 *  被全城市范围搜索干扰成品牌网点，如「浦发银行东方体育中心」→ 一排浦发银行，坐标偏到网点）。
 *  性能：正常地址首条即精确命中 → 只发 1 次上游请求；仅在首条不匹配且 POI 无城市信息时才
 *  额外调 geocode 兜底。 */
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
      console.error("geocode-address:place-status", data.status, data.info, data.infocode, address)
    }
    return null
  }
  const pois = data.pois as Record<string, unknown>[]
  let poi = pickPoi(pois, address)
  const trimmed = String(address || "").trim()

  // 首条名称与搜索词不完全一致（可能被品牌词污染成「浦发银行(前滩支行)」，或命中地铁站等
  // 同名歧义点「东方体育中心(地铁站)」）→ 带 city 重查，排除干扰。
  // 城市优先取当前 POI 首条自带的 cityname/pname——实测「东方体育中心」用 geocode 拿城市会
  // 被高德错配成海南省东方市，反而把正确城市丢掉；POI 结果里的城市信息是可信的。
  // 注意：不能带 citylimit=true——实测它会让高德把关键词强制按品牌词解析（「浦发银行东方体育中心」
  // → 一排浦发银行网点），反而复现坐标偏南。
  if (poi && String(poi.name || "").trim() !== trimmed) {
    const poiCity = pickPoiCity(poi)
    let cityName = poiCity
    if (!cityName) {
      // POI 首条无城市信息才补一次 geocode（罕见，绝大多数 POI 都带 cityname/pname）
      const geo = await searchGeocode(apiKey, address, true)
      cityName = geo?.city || geo?.province || ""
    }
    if (cityName) {
      const cityUrl = new URL(AMAP_PLACE_TEXT_URL)
      cityUrl.searchParams.set("key", apiKey)
      cityUrl.searchParams.set("keywords", address)
      cityUrl.searchParams.set("city", cityName)
      cityUrl.searchParams.set("output", "JSON")
      const cityRes = await fetchJson(cityUrl.toString())
      if (cityRes.ok && cityRes.data.status === "1" && Array.isArray(cityRes.data.pois)) {
        const cityPois = cityRes.data.pois as Record<string, unknown>[]
        if (cityPois.length > 0) {
          const cityPoi = pickPoi(cityPois, address)
          if (cityPoi) poi = cityPoi
        }
      }
    }
  }

  if (!poi) return null
  if (!poi.pname && !poi.cityname) return null
  return poiResult(poi)
}

/** geocode + regeo 兜底路径，逻辑同旧版两步法。
 *  skipRegeo：仅拿城市用（searchPoi 兜底），跳过 regeo 以省一次上游调用。 */
async function searchGeocode(apiKey: string, address: string, skipRegeo = false): Promise<CityResult | null> {
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
  if (location && !skipRegeo) {
    const regeoUrl = new URL(AMAP_REGEOCODE_URL)
    regeoUrl.searchParams.set("key", apiKey)
    regeoUrl.searchParams.set("location", location)
    regeoUrl.searchParams.set("output", "JSON")

    const regeoRes = await fetchJson(regeoUrl.toString())
    if (!regeoRes.ok) {
      console.error("geocode-address:regeo-fetch-failed", regeoRes.status, regeoRes.reason, address)
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
 * 境外地址直接返回 null（高德只覆盖大陆/港澳，避免错配成国内同名地点）。
 * @returns 成功返回城市信息；地址无匹配或境外返回 null；上游网络失败抛 AmapUpstreamError
 */
async function lookupCity(apiKey: string, address: string): Promise<CityResult | null> {
  if (isOverseasAddress(address)) {
    console.info("geocode-address:overseas-skip", address)
    return null
  }
  const poi = await searchPoi(apiKey, address)
  if (poi) return poi
  return searchGeocode(apiKey, address)
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)

  const apiKey = Deno.env.get("AMAP_WEB_API_KEY")
  if (!apiKey) {
    console.error("geocode-address:missing-secret", "AMAP_WEB_API_KEY")
    return json({ error: "server_misconfigured" }, 500)
  }

  let address = ""
  try {
    const body = await req.json()
    address = String(body?.address || "").trim()
  } catch {
    return json({ error: "invalid_body" }, 400)
  }

  if (!address) return json({ error: "address_required" }, 400)
  if (address.length > MAX_ADDRESS_LENGTH) return json({ error: "address_too_long" }, 400)

  let result
  try {
    result = await lookupCity(apiKey, address)
  } catch (e) {
    if (e instanceof AmapUpstreamError) {
      console.error("geocode-address:upstream-failed", e.status, e.reason, address)
      return json({ error: "upstream_unreachable", detail: e.reason }, 502)
    }
    console.error("geocode-address:unexpected", String(e?.message || e), address)
    return json({ error: "internal_error" }, 500)
  }

  if (!result) {
    // 无匹配地址 / 境外地址：返回空字段（客户端据此把城市留空），与上游错误区分
    return json({ province: "", city: "", district: "", adcode: "", location: "" })
  }

  return json({
    province: result.province,
    city: result.city,
    district: result.district,
    adcode: result.adcode,
    location: result.location,
  })
})
