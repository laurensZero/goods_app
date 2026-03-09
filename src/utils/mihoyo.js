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
  const name = cleanGoodsName(rawName)

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

// ─── 账号订单导入 ──────────────────────────────────────────────────

const API_ORDER_LIST = `${API_BASE}/common/homeishop/v1/order/order_list`

/** 解析 Cookie 字符串为 key-value 对象 */
export function parseCookieString(cookieStr) {
  const result = {}
  cookieStr.split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx === -1) return
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) result[key] = value
  })
  return result
}

/** 检验 Cookie 是否包含米游社常見认证字段 */
export function validateMihoyoCookie(cookieStr) {
  const parsed = parseCookieString(cookieStr)
  const hasUid = !!(parsed.account_id_v2 || parsed.ltuid_v2 || parsed.account_id || parsed.ltuid)
  const hasToken = !!(parsed.cookie_token_v2 || parsed.ltoken_v2 || parsed.ltoken)
  return hasUid && hasToken
}

async function fetchOrderPage(cookieStr, page, limit) {
  const url = `${API_ORDER_LIST}?limit=${limit}&page=${page}`
  const headers = {
    'Cookie': cookieStr,
    'Referer': 'https://mihoyogift.com/',
    'x-rpc-language': 'zh-cn',
    'x-rpc-client_type': '5',
  }
  let json
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, headers })
    json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  } else {
    // 浏览器不允许 JS 设置 Cookie 头（Forbidden Header），
    // 改用自定义 x-cookie-forward，由 Vite 代理转换为真正的 Cookie
    const proxyUrl = url.replace(API_BASE, '/mihoyo-api')
    const webHeaders = {
      ...headers,
      'x-cookie-forward': encodeURIComponent(headers['Cookie'] || ''),
    }
    delete webHeaders['Cookie']
    const res = await fetch(proxyUrl, { headers: webHeaders })
    if (!res.ok) throw new Error(`请求失败（${res.status}）`)
    json = await res.json()
  }
  if (json.retcode !== 0) throw new Error(json.message || `接口错误 ${json.retcode}`)
  return json.data
}

/**
 * 获取账号全部订单（自动分页，最多 200 条）
 * @param {string} cookieStr - 完整 Cookie 字符串
 * @param {function} [onProgress] - (loaded: number, total: number) 进度回调
 */
export async function fetchAllOrders(cookieStr, onProgress) {
  const limit = 20
  const first = await fetchOrderPage(cookieStr, 1, limit)
  const total = first.count || 0
  const totalPages = Math.min(Math.ceil(total / limit), 10)
  let list = [...first.list]
  onProgress?.(list.length, total)
  for (let page = 2; page <= totalPages; page++) {
    const { list: pageList } = await fetchOrderPage(cookieStr, page, limit)
    list = [...list, ...pageList]
    onProgress?.(list.length, total)
    await new Promise((r) => setTimeout(r, 150))
  }
  return { list, total, capped: total > list.length }
}

/**
 * 将米游铺订单转换为 App 谷子格式
 * @param {Object} order - API 返回的单个订单对象
 * @returns {Object|null}
 */
/** 从商品名关键词推断分类 */
function parseCategoryFromName(name) {
  if (!name) return ''
  if (name.includes('满赠') || name.includes('赠品')) return '赠品'
  if (name.includes('手办')) return '手办'
  if (name.includes('立牌') || name.includes('亚克力')) return '立牌'
  if (name.includes('挂件') || name.includes('挂饰') || name.includes('吊件') || name.includes('钥匙扣')) return '挂件'
  if (name.includes('徽章') || name.includes('马口铁') || name.includes('胸章') ||
      name.includes('Pin') || name.includes('pin')) return '徽章'
  if (name.includes('明信片')) return '明信片'
  if (name.includes('卡片') || name.includes('随机卡') || name.includes('收藏卡') ||
      name.includes('可换卡') || name.includes('卡组')) return '卡片'
  if (name.includes('CD') || name.includes('专辑') || name.includes('唱片') ||
      name.includes('OST')) return 'CD/专辑'
  if (name.includes('色纸') || name.includes('签板')) return '色纸'
  if (name.includes('上衣') || name.includes('T恤') || name.includes('衬衫') ||
      name.includes('外套') || name.includes('卫衣') || name.includes('服饰')) return '服饰'
  if (name.includes('镭射票') || name.includes('镭射')) return '镭射票'
  return ''
}

/** 从店铺名推断 IP（比从商品名解析更稳定） */
function shopToIp(shopName) {
  if (!shopName) return ''
  if (shopName.includes('原神万有铺子')) return '原神'
  if (shopName.includes('货全杂货铺')) return '崩坏：星穹铁道'
  if (shopName.includes('绝区零')) return '绝区零'
  if (shopName.includes('空港集市')) return '崩坏3'
  if (shopName.includes('未名商城')) return '未定事件簿'
  if (shopName.includes('千羽万事屋')) return '崩坏学园2nd'
  if (shopName.includes('别野百货') || shopName.includes('派对'))  return '米游铺周边'
  return ''
}

/** 去除商品名中的预售类前缀，如 【预售，预计3月发货】 */
function cleanGoodsNameLegacy(str) {
  return String(str || '')
    .replace(/【(?:预售|预计)[^】]*】/g, '')
    .replace(/（(?:预售|预计)?[^）]*(?:到仓|发货|补款|预售)[^）]*）/g, '')
    .replace(/\((?:预售|预计)?[^)]*(?:到仓|发货|补款|预售)[^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 去除 sku 属性值中的所有括号前缀（角色名等应为纯文本）
 *  同时去除末尾常见变体字母 A-E（如 "昔涟B" → "昔涟"，"叶瞬光A" → "叶瞬光"）
 */
function cleanGoodsName(str) {
  return String(str || '')
    .replace(/【(?:预售|预计|现货)[^】]*】/g, '')
    .replace(/（(?:预售|预计|现货)?[^）]*(?:到仓|发货|补款|预售|现货)[^）]*）/g, '')
    .replace(/\((?:预售|预计|现货)?[^)]*(?:到仓|发货|补款|预售|现货)[^)]*\)/g, '')
    .replace(/[（(【\[]?现货[】\])）]?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanAttrValue(str) {
  return (str || '')
    .replace(/【[^】]*】/g, '')  // 清除 【...】 括号内容
    .replace(/[A-E]$/, '')       // 去除末尾变体字母 A-E
    .trim()
}

/** 尝试从"款式"属性值推断角色名（米游铺特定规律）
 *  "昔涟B" → "昔涟" (2-6 汉字，去掉末尾变体字母 A-E)
 *  "竖版" / "红色" / "彩色" → 跳过（在常见非角色词表中）
 */
function cleanStyleValue(str) {
  return String(str || '')
    .replace(/【预售[^】]*】/g, '')
    .replace(/（预售[^）]*）/g, '')
    .replace(/\(预售[^)]*\)/g, '')
    .replace(/【预计[^】]*】/g, '')
    .replace(/（预计[^）]*）/g, '')
    .replace(/\(预计[^)]*\)/g, '')
    .trim()
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function getAftersalesStatusText(aftersalesInfo = {}) {
  const code = Number(aftersalesInfo?.aftersales_status)
  const explicitText = firstNonEmpty(
    aftersalesInfo?.aftersales_status_text,
    aftersalesInfo?.status_text,
    aftersalesInfo?.status_desc,
    aftersalesInfo?.status,
  )

  if (explicitText) return explicitText
  if (!code) return ''

  if (code >= 400) return '退款完成'
  if (code >= 300) return '退款中'
  if (code >= 200) return '售后中'
  return '售后中'
}

function extractItemStatusText(goodsWrapper = {}, goods = {}) {
  const aftersalesText = firstNonEmpty(
    getAftersalesStatusText(goodsWrapper.aftersales_info),
    getAftersalesStatusText(goods.aftersales_info),
  )

  return firstNonEmpty(
    aftersalesText,
    goodsWrapper.after_sale_status_text,
    goodsWrapper.after_sale_text,
    goodsWrapper.refund_status_text,
    goodsWrapper.refund_text,
    goodsWrapper.rights_status_text,
    goodsWrapper.rights_text,
    goodsWrapper.status_text,
    goodsWrapper.manage_status_text,
    goodsWrapper.status_desc,
    goodsWrapper.manage_status_desc,
    goodsWrapper.status,
    goods.after_sale_status_text,
    goods.after_sale_text,
    goods.refund_status_text,
    goods.refund_text,
    goods.rights_status_text,
    goods.rights_text,
    goods.status_text,
    goods.manage_status_text,
    goods.status_desc,
    goods.manage_status_desc,
    goods.status,
  )
}

const NON_CHAR_STYLE = new Set([
  '竖版', '横版', '立式', '挂式', '竖排', '横排',
  '彩色', '单色', '全彩', '黑白', '双色',
  '个人', '团体', '全员', '集体',
  '线稿', '线图', '草稿', '线图版',
  '小', '中', '大', '特大', '加大',
  '明信片',
])

// 商品类型后缀：款式值以这些词结尾时，只取前面的角色名部分
const STYLE_PRODUCT_SUFFIXES = [
  '套盒', '套组', '套装', '礼盒', '礼包',
  '小鸟', '宠物', '玩偶', '公仔', '毛绒',
]

function tryCharFromStyle(attrValue) {
  // cleanAttrValue 已去括号 + 去末尾 A-E
  const cleaned = cleanAttrValue(attrValue)

  // 先剥离商品类型后缀，提取前面的角色名（2-3 字）
  for (const suf of STYLE_PRODUCT_SUFFIXES) {
    if (cleaned.endsWith(suf)) {
      const prefix = cleaned.slice(0, cleaned.length - suf.length)
      if (
        /^[\u4e00-\u9fa5]{2,3}$/.test(prefix) &&
        !NON_CHAR_STYLE.has(prefix) &&
        !/[的与你我他她版款弹期辑章集号场幕套组盒]/.test(prefix)
      ) {
        return prefix
      }
      return null // 有商品类型后缀但前缀不像角色名，整体排除
    }
  }

  // 2-5 个纯汉字才认定为角色名（活动名往往 6 字以上）
  if (!/^[\u4e00-\u9fa5]{2,5}$/.test(cleaned)) return null
  // 排除常见非角色描述词
  if (NON_CHAR_STYLE.has(cleaned)) return null
  // 含有产品/语法词 → 是描述短语，不是名字
  if (/[的与你我他她版款弹期辑章集号场幕套组盒]/.test(cleaned)) return null
  return cleaned
}

/** 将单件商品 meta_info 转换为 App 谷子格式（内部辅助） */
function metaToGoods(order, goods, index = 0, goodsWrapper = {}) {
  const rawName = cleanGoodsName(
    goods.goods_name || goods.name || goods.title ||
    goods.commodity_name || goods.commodityName || ''
  )
  const coverUrl =
    goods.cover_url || goods.img_url || goods.cover ||
    goods.goods_img || goods.image || ''
  const rawPrice =
    goods.price ?? goods.sale_price ?? goods.current_price ??
    goods.activity_price ?? goods.actual_price ?? 0
  const skuList =
    goods.sku_sales ||
    goods.sku_list ||
    goods.sku_attrs ||
    goods.attrs ||
    goodsWrapper.sku_sales ||
    goodsWrapper.sku_list ||
    goodsWrapper.sku_attrs ||
    goodsWrapper.attrs ||
    []

  // IP 优先从店铺名推断；其次从商品名解析
  const shopName = order.shop?.shop_name || goods.shop_name || ''
  const ipFromShop = shopToIp(shopName)
  const { ip: ipFromName, name } = parseTitleIpName(rawName)
  const ip = ipFromShop || ipFromName

  // 提取角色名：
  //   1. attr_name 含 "角色" → attr_value 是角色名 (如 "角色":"流萤", "角色-对空六课":"比利")
  //   2. attr_name === "款式" → attr_value 可能是"角色名+变体字母" (如 "款式":"昔涟B")
  const charSet = new Set()
  const styleSet = new Set()
  for (const s of skuList) {
    const attrName = s.attr_name || s.attrName || ''
    const attrVal  = s.attr_value || s.attrValue || ''
    if (attrName.includes('角色')) {
      const c = cleanAttrValue(attrVal)
      if (c) charSet.add(c)
    } else if (attrName.includes('款式')) {
      const style = cleanStyleValue(attrVal)
      if (style) styleSet.add(style)
      const c = tryCharFromStyle(attrVal)
      if (c) charSet.add(c)
    }
  }
  const characters = [...charSet]
  const fallbackVariant = firstNonEmpty(
    goods.sku_name,
    goods.sku_title,
    goods.sku_desc,
    goods.spec_name,
    goods.spec_title,
    goods.spec_value,
    goods.spec,
    goods.style,
    goods.style_name,
    goods.variant,
    goodsWrapper.sku_name,
    goodsWrapper.sku_title,
    goodsWrapper.sku_desc,
    goodsWrapper.spec_name,
    goodsWrapper.spec_title,
    goodsWrapper.spec_value,
    goodsWrapper.spec,
    goodsWrapper.style,
    goodsWrapper.style_name,
    goodsWrapper.variant,
  )
  const variant = [...styleSet].join(' / ') || String(fallbackVariant || '').trim()
  const itemStatusText = extractItemStatusText(goodsWrapper, goods)
  const payTime =
    order.payment_info?.pay_time || order.payment_info?.payTime ||
    order.pay_time || order.payTime || order.order_time || order.orderTime
  const acquiredAt = payTime
    ? new Date(Number(payTime) * 1000).toISOString().split('T')[0]
    : ''
  const orderNo = order.order_no || order.orderNo || ''
  const goodsId = goods.goods_id || goods.goodsId || goods.sku_id || ''
  // 加上 index 防止同订单内 goods_id 相同时 key 碰撞
  const itemKey = `${orderNo}_${index}_${goodsId}`
  return {
    name: name || rawName,
    ip: ip || '',
    characters,
    image: coverUrl,
    price: String(Math.round(Number(rawPrice) / 100)),
    acquiredAt,
    category: parseCategoryFromName(name || rawName),
    quantity: Math.max(
      1,
      Number(goods.quantity) ||
      Number(goodsWrapper.quantity) ||
      Number(goods.buy_num) ||
      Number(goodsWrapper.buy_num) ||
      1
    ),
    variant,
    note: `来自米游铺订单 #${orderNo}`,
    // 元数据（不入库）
    _itemKey: itemKey,
    _orderNo: orderNo,
    _statusText: itemStatusText ||
                 order.status_text || order.statusText || order.manage_status_text || '',
    // 仅商品级别的独立状态（不含订单 fallback），用于单件状态徽章
    _wrapperStatus: itemStatusText,
    _coverUrl: coverUrl,
  }
}

/**
 * 将米游铺订单展开为所有商品（一个订单可能含多件），返回数组
 * @param {Object} order
 * @returns {Object[]}
 */
export function orderToGoodsList(order) {
  const wrappers = order.goods_list || order.commodity_list || []
  return wrappers
    .map((w, index) => {
      const goods = w.meta_info || w
      return metaToGoods(order, goods, index, w)  // 传入 wrapper 以获取商品级状态
    })
    .filter((g) => g.name)  // 过滤掉没有名称的条目
}

/**
 * 将米游铺订单转换为 App 谷子格式（仅取第一件，兼容旧调用）
 * @param {Object} order
 * @returns {Object|null}
 */
export function orderToGoods(order) {
  return orderToGoodsList(order)[0] || null
}

