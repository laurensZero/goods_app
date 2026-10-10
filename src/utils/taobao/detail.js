/**
 * 淘宝详情页解析（纯函数，不发网络请求）
 *
 * 数据源是 PC 详情页 SSR HTML（包 @ali/tbpc-pc-detail-ssr-2025），
 * 页面把全量数据内嵌在 `<script>` 的 `var b = {...};` 里：
 *   b.loaderData.<route>.data.res
 * 这一路只需要「桌面 UA + 登录 Cookie」，不需要 mtop 签名。
 *
 * 字段易错点（详见 docs/taobao-mtop-api.md 第 4 节）：
 *   - 主图（轮播封面）= res.componentsVO.headImageVO.images
 *   - SKU 图           = res.skuBase.props[].values[].image
 *   - res.item.images  = 详情长图，不是主图
 */

/** 从输入里提取 itemId，支持 PC/天猫/H5/裸数字 */
export function extractTaobaoItemId(input) {
  const text = String(input || '').trim()
  if (!text) return ''

  if (/^\d{6,}$/.test(text)) return text

  let url
  try {
    url = new URL(text.startsWith('//') ? `https:${text}` : (/^https?:\/\//i.test(text) ? text : `https://${text}`))
  } catch {
    return ''
  }

  const fromQuery = url.searchParams.get('id') || url.searchParams.get('itemId') || url.searchParams.get('item_id')
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery

  const pathMatch = url.pathname.match(/\/item\/(\d+)/) || url.pathname.match(/\/(\d{9,})\.shtml/)
  if (pathMatch) return pathMatch[1]

  return ''
}

/** 是否是淘宝/天猫商品链接（含无法提取 id 的短链） */
export function isTaobaoItemUrl(input) {
  const text = String(input || '').trim()
  if (!text) return false
  if (/^\d{6,}$/.test(text)) return true
  let url
  try {
    url = new URL(text.startsWith('//') ? `https:${text}` : (/^https?:\/\//i.test(text) ? text : `https://${text}`))
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  if (host === 'm.tb.cn' || host.endsWith('.tb.cn')) return true
  return /(^|\.)taobao\.com$/.test(host) || /(^|\.)tmall\.com$/.test(host)
}

/** 拼一个稳定的 PC 详情页地址 */
export function buildTaobaoItemUrl(itemId) {
  return `https://item.taobao.com/item.htm?id=${encodeURIComponent(String(itemId || ''))}`
}

/**
 * 从 SSR HTML 里取出 `var b = {...}` 的 JSON
 * 用括号配对扫描（字符串/转义敏感），避免懒惰正则被字符串里的 `};` 截断
 * @param {string} html
 * @returns {any|null}
 */
export function extractSsrAppData(html) {
  const source = String(html || '')
  const markerIndex = source.indexOf('var b = ')
  if (markerIndex < 0) return null
  const openIndex = source.indexOf('{', markerIndex + 8)
  if (openIndex < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(openIndex, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * 从 `var b` 里挑出详情 res 对象（loaderData 的 key 会随路由变化）
 * @param {string} html
 * @returns {any|null}
 */
export function extractSsrRes(html) {
  const appData = extractSsrAppData(html)
  if (!appData || typeof appData !== 'object') return null

  const loaderData = appData.loaderData
  if (!loaderData || typeof loaderData !== 'object') return null

  const candidates = [loaderData.home, ...Object.values(loaderData)]
  for (const entry of candidates) {
    const res = entry?.data?.res
    if (res && typeof res === 'object' && res.item && (res.skuBase || res.componentsVO)) return res
  }
  return null
}

/**
 * 搜索结果图片域 `*.search.alicdn.com` / `*.search3.alicdn.com` 的服务端证书只覆盖
 * `*.alicdn.com`（SAN 不含多级搜索域），浏览器直连会报 ERR_CERT_COMMON_NAME_INVALID
 * 图片裂开；同一路径在 g-search1.alicdn.com 上可正常取到。
 */
const SEARCH_CDN_HOST = 'g-search1.alicdn.com'

/** 换掉证书不被信任的搜索 CDN 域（只替换 host，路径与查询串原样保留） */
function rewriteSearchCdnHost(url) {
  if (!/^https?:\/\/(?:[^/?#]*\.)?search\d*\.alicdn\.com(?=[/:?#]|$)/i.test(url)) return url
  return url.replace(/^(https?:\/\/)[^/?#]+/i, `$1${SEARCH_CDN_HOST}`)
}

/** 统一图片地址：协议相对/裸路径补全为 https，去掉明显的缩略参数 */
export function normalizeCdnUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('//')) return rewriteSearchCdnHost(`https:${value}`)
  if (/^http:\/\//i.test(value)) return rewriteSearchCdnHost(`https://${value.slice(7)}`)
  if (/^https:\/\//i.test(value)) return rewriteSearchCdnHost(value)
  if (value.includes('/') && !value.startsWith('data:')) return rewriteSearchCdnHost(`https://${value}`)
  return ''
}

function uniq(list) {
  const seen = new Set()
  const result = []
  for (const value of list) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

/** 主图（轮播封面），不是 res.item.images */
export function extractMainImages(res) {
  const fromHead = res?.componentsVO?.headImageVO?.images
  const list = Array.isArray(fromHead) ? fromHead : []
  const normalized = uniq(list.map(normalizeCdnUrl).filter(Boolean))
  if (normalized.length > 0) return normalized
  // 兜底：mtop 口径里 item.images 才是主图；SSR 的 item.images 是详情长图
  return []
}

/** 详情长图（易与主图混淆，单独取） */
export function extractDetailImages(res) {
  const list = Array.isArray(res?.item?.images) ? res.item.images : []
  return uniq(list.map(normalizeCdnUrl).filter(Boolean))
}

function resolvePropValue(prop, vid) {
  if (!prop) return null
  const key = String(vid)
  if (prop.valueMap && prop.valueMap[key]) return prop.valueMap[key]
  if (Array.isArray(prop.values)) return prop.values.find((value) => String(value?.vid) === key) || null
  return null
}

/**
 * propPath 的属性对分隔符：单规格没有分隔符；多规格实测为 `;`
 * （如 `20509:3234322;0:-11`），兼容 `,` 口径。
 * @param {string} path
 * @returns {string[]} 形如 `pid:vid` 的属性对列表
 */
export function splitSkuPath(path) {
  return String(path || '').split(/[,;]/).filter(Boolean)
}

/**
 * 解析 SKU 列表（规格名 / 价格 / 规格图 / 库存）
 * @param {any} res
 * @returns {Array<{id:string,name:string,price:string,image:string,quantity:number,logistics:string}>}
 */
export function extractSkus(res) {
  const props = Array.isArray(res?.skuBase?.props) ? res.skuBase.props : []
  const skus = Array.isArray(res?.skuBase?.skus) ? res.skuBase.skus : []
  const sku2info = res?.skuCore?.sku2info || {}
  if (skus.length === 0) return []

  const propByPid = new Map(props.map((prop) => [String(prop?.pid), prop]))

  return skus.map((sku) => {
    const path = String(sku?.propPath || '')
    const values = splitSkuPath(path).map((part) => {
      const [pid, vid] = part.split(':')
      return resolvePropValue(propByPid.get(String(pid)), vid)
    }).filter(Boolean)

    const name = values.map((value) => String(value?.name || '').trim()).filter(Boolean).join(' / ')
    const image = normalizeCdnUrl(values.find((value) => value?.image)?.image || '')
    const info = sku2info[String(sku?.skuId || '')] || {}
    return {
      id: String(sku?.skuId || ''),
      path,
      name,
      image,
      price: String(info?.price?.priceText || ''),
      quantity: Number(info?.quantity) || 0,
      logistics: String(info?.logisticsTime || ''),
    }
  }).filter((sku) => sku.name || sku.price || sku.image)
}

/**
 * 解析 SKU 属性树（多级规格选择的分组依据，如 颜色 / 尺寸 各一级）
 * @param {any} res
 * @returns {Array<{pid:string,name:string,values:Array<{vid:string,name:string,image:string}>}>}
 */
export function extractSkuProps(res) {
  const props = Array.isArray(res?.skuBase?.props) ? res.skuBase.props : []
  return props.map((prop) => ({
    pid: String(prop?.pid || ''),
    name: String(prop?.name || '').trim(),
    values: (Array.isArray(prop?.values) ? prop.values : []).map((value) => ({
      vid: String(value?.vid || ''),
      name: String(value?.name || '').trim(),
      image: normalizeCdnUrl(value?.image || ''),
    })).filter((value) => value.vid || value.name),
  })).filter((prop) => prop.pid && prop.values.length > 0)
}

/** 页面展示价：priceVO.priceText（多规格时带「起」或区间） */
export function extractPrice(res) {
  const price = res?.componentsVO?.priceVO?.price || {}
  const text = String(price?.priceText || '').trim()
  const desc = String(price?.priceDesc || '').trim()
  if (!text) return { priceText: '', price: '', priceRange: false }

  const priceRange = /[-~～]/.test(text) || desc === '起'
  const numeric = text.replace(/[^\d.]/g, '')
  return {
    priceText: text,
    price: priceRange ? '' : numeric,
    priceRange,
    priceDesc: desc,
  }
}

/**
 * 把 SSR res 映射成导入草稿
 * @param {any} res
 * @param {{url?:string, itemId?:string}} [context]
 * @returns {any|null}
 */
export function buildTaobaoDraft(res, context = {}) {
  if (!res || typeof res !== 'object') return null

  const title = String(res?.item?.title || res?.componentsVO?.titleVO?.title?.title || '').trim()
  if (!title) return null

  const price = extractPrice(res)
  const skus = extractSkus(res)
  const skuProps = extractSkuProps(res)
  const seller = res.seller || {}
  const store = res.componentsVO?.storeCardVO || {}

  const images = extractMainImages(res)
  const detailImages = extractDetailImages(res)
  const skuWithImage = skus.find((sku) => sku.image)

  return {
    itemId: String(res?.item?.itemId || context.itemId || ''),
    url: context.url || buildTaobaoItemUrl(res?.item?.itemId || context.itemId || ''),
    title,
    price: price.price,
    priceText: price.priceText,
    priceRange: price.priceRange,
    priceDesc: price.priceDesc || '',
    // 主图；没有主图时退化为第一张有图的 SKU 图
    images: images.length > 0 ? images : (skuWithImage ? [skuWithImage.image] : []),
    detailImages,
    skus,
    skuProps,
    shopName: String(store.shopName || seller.shopName || seller.sellerNick || ''),
    shopUrl: normalizeCdnUrl(store.shopUrl || seller.pcShopUrl || ''),
    sellCount: String(res?.item?.vagueSellCount || res?.componentsVO?.titleVO?.salesDesc || ''),
  }
}
