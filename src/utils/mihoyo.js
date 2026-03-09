/**
 * 米游铺商品链接解析工具
 * 策略：调用米游铺官方内部 JSON API（无需登录，不依赖 HTML 解析）
 *
 * API 由逆向分析 Nuxt bundle 获得：
 *   GET https://api-mall.mihoyogift.com/common/homeishop/v1/goods/get_goods_spu_detail
 *   参数：goods_id=<19位商品ID>
 *   响应：{ retcode: 0, data: { detail: { name, cover_url, price, ... } } }
 *   price 单位：分（÷100 = 元）
 *
 * CORS 说明：
 *   - Android APK（Capacitor 原生）：使用 CapacitorHttp，无 CORS 限制
 *   - 浏览器 / Web：使用 fetch，跨域会被拦截（开发阶段正常，APK 内正常）
 */
import { CapacitorHttp, Capacitor } from '@capacitor/core'

const API_BASE = 'https://api-mall.mihoyogift.com'
const API_GOODS_DETAIL = `${API_BASE}/common/homeishop/v1/goods/get_goods_spu_detail`

// 从商品名称中提取 IP 和去掉前缀的商品名
// 支持：【原神】xxx  /  「崩坏：星穹铁道」xxx
export function parseTitleIpName(title) {
  if (!title) return { ip: '', name: title || '' }

  // 格式1: 【IP名(/附注)】商品名
  const bracketMatch = title.match(/^【([^】]+)】\s*(.+)$/)
  if (bracketMatch) {
    const rawIp = bracketMatch[1].split('/')[0].trim()
    const name = bracketMatch[2].trim()
    return { ip: rawIp, name }
  }

  // 格式2: 「IP名」商品名
  const quoteMatch = title.match(/^「([^」]+)」\s*(.+)$/)
  if (quoteMatch) {
    const rawIp = quoteMatch[1].split('·')[0].trim()
    const name = quoteMatch[2].trim()
    return { ip: rawIp, name }
  }

  return { ip: '', name: title }
}

const MIHOYO_GIFT_HOST = 'mihoyogift.com'

// 从 URL 提取 goods_id，支持桌面页和移动页：
// - https://www.mihoyogift.com/goods/123
// - https://www.mihoyogift.com/m/goods/123?...
function extractGoodsId(url) {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith(MIHOYO_GIFT_HOST)) return null

    const match = parsed.pathname.match(/^\/(?:m\/)?goods\/(\d+)(?:\/)?$/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// 验证是否是米游铺商品链接
export function isMihoyoGiftUrl(url) {
  return extractGoodsId(url) != null
}

/**
 * 解析米游铺商品链接
 * - 原生 Android/iOS：使用 CapacitorHttp（直连，无 CORS 限制）
 * - 浏览器 Web（开发）：使用 fetch + Vite 代理 /mihoyo-api（绕过 CORS）
 */
export async function parseMihoyoUrl(url) {
  if (!isMihoyoGiftUrl(url)) {
    throw new Error('请输入米游铺商品链接，例如：https://www.mihoyogift.com/goods/... 或 https://www.mihoyogift.com/m/goods/...')
  }

  const goodsId = extractGoodsId(url)
  if (!goodsId) throw new Error('无法解析商品 ID，请检查链接')

  const reqHeaders = {
    'Referer': 'https://www.mihoyogift.com/',
    'x-rpc-language': 'zh-cn',
  }

  let json
  if (Capacitor.isNativePlatform()) {
    // 原生平台（Android / iOS）：CapacitorHttp 不受浏览器 CORS 限制
    const apiUrl = `${API_GOODS_DETAIL}?goods_id=${goodsId}`
    const res = await CapacitorHttp.get({ url: apiUrl, headers: reqHeaders })
    json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  } else {
    // Web / 浏览器开发：通过 Vite proxy（/mihoyo-api → api-mall.mihoyogift.com）
    const proxyPath = `/mihoyo-api/common/homeishop/v1/goods/get_goods_spu_detail?goods_id=${goodsId}`
    const res = await fetch(proxyPath, { headers: reqHeaders })
    if (!res.ok) throw new Error(`请求失败（${res.status}）`)
    json = await res.json()
  }

  if (json.retcode !== 0) {
    throw new Error(`接口返回错误：${json.message || json.retcode}`)
  }

  const detail = json?.data?.detail
  if (!detail || !detail.name) {
    throw new Error('未能识别商品信息，请确认链接有效')
  }

  const { ip, name: rawName } = parseTitleIpName(detail.name)
  // 去掉标题中的预售标注
  const name = rawName.replace(/[（(]预售[）)]/g, '').trim()

  // price 单位是"分"，÷100 转成元；含"赠品"的商品默认 0 元
  const isGift = detail.name.includes('赠品')
  const priceYuan = isGift ? 0 : (detail.price != null ? detail.price / 100 : null)

  // sale_attrs 是数组，每个元素有 name + content[]
  // 例：[{ name: "角色", content: [{text, key, img_url}, ...], is_open }]
  const variants = []
  const attrGroups = Array.isArray(detail.sale_attrs)
    ? detail.sale_attrs
    : (detail.sale_attrs ? [detail.sale_attrs] : [])

  for (const group of attrGroups) {
    if (!group.content?.length) continue
    for (const item of group.content) {
      if (item.text) variants.push({
        text: item.text,
        key: item.key || '',
        img_url: item.img_url || '',
        cover_url: item.cover_url || '',
      })
    }
  }

  return {
    raw: detail.name,
    name,
    ip,
    price: priceYuan,
    image: detail.cover_url || '',
    banners: detail.banner_url || [],
    goodsId,           // 商品 ID，供后续懒加载 main_url 用
    variants,  // { text, key, img_url }[] —— 原始 SKU 选项
  }
}

/**
 * 获取 detail 接口数据：
 *   mainImages  - main_url 展示图数组
 *   skuCovers   - { [key]: cover_url } 每个 SKU 的专属封面图
 */
export async function fetchGoodsDetail(goodsId) {
  const reqHeaders = {
    'Referer': 'https://www.mihoyogift.com/',
    'x-rpc-language': 'zh-cn',
  }
  try {
    let json
    if (Capacitor.isNativePlatform()) {
      const apiUrl = `${API_BASE}/common/homeishop/v1/goods/detail?goods_id=${goodsId}`
      const res = await CapacitorHttp.get({ url: apiUrl, headers: reqHeaders })
      json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    } else {
      const res = await fetch(`/mihoyo-api/common/homeishop/v1/goods/detail?goods_id=${goodsId}`, { headers: reqHeaders })
      if (!res.ok) return { mainImages: [], skuCovers: {}, coverUrl: '' }
      json = await res.json()
    }
    const detail =
      json?.data?.goods?.detail ||
      json?.data?.detail ||
      json?.data?.goods ||
      null
    const mainImages = Array.isArray(detail?.main_url)
      ? detail.main_url
      : Array.isArray(detail?.banner_url)
        ? detail.banner_url
        : []
    // skus 是以 key 为属性名的对象，每条有 cover_url
    const skuCovers = {}
    if (detail?.skus && typeof detail.skus === 'object') {
      for (const [key, sku] of Object.entries(detail.skus)) {
        if (!sku?.cover_url) continue

        skuCovers[key] = sku.cover_url

        // 星铁这类商品的 sale_attrs.content[].key 往往只对应 sale_attr1_key，
        // 但 detail.skus 的对象键是 "sale_attr1_key_sale_attr2_key" 组合键。
        // 额外回填一份主属性 key，便于前端按角色 key 取到对应封面。
        const primaryKey = sku.sale_attr1_key || String(key).split('_')[0]
        if (primaryKey) {
          skuCovers[primaryKey] = sku.cover_url
        }
      }
    }
    if (Array.isArray(detail?.sale_attrs)) {
      for (const group of detail.sale_attrs) {
        if (!Array.isArray(group?.content)) continue

        for (const item of group.content) {
          if (item?.key && item?.cover_url) {
            skuCovers[item.key] = item.cover_url
          }
        }
      }
    }
    return { mainImages, skuCovers, coverUrl: detail?.cover_url || '' }
  } catch {
    return { mainImages: [], skuCovers: {}, coverUrl: '' }
  }
}
