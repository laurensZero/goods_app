/**
 * 淘宝链接导入与搜索服务：链接/关键词 → 登录态抓取 → 归一化草稿 / 搜索结果
 *
 * 这里只做「请求 + 解析」，不含任何 store/DB 依赖，方便单测与复用。
 * 搜索走 mtop（见 mtop.js），详情仍走 PC 详情页 SSR（request.js + detail.js）。
 */
import {
  buildTaobaoDraft,
  extractSsrRes,
  extractTaobaoItemId,
  isTaobaoItemUrl,
  buildTaobaoItemUrl,
  normalizeCdnUrl,
} from './detail'
import { getTaobaoCookie, isTaobaoCookieReady } from './cookie'
import { mtopCall } from './mtop'
import { TaobaoRequestError, classifyPageResponse, taobaoPageGet } from './request'

/** 校验 Cookie 用的样例商品（SSR 数据齐全即可，不关心商品是否还在售） */
export const TAOBAO_SAMPLE_ITEM_ID = '1026022602471'

export class TaobaoImportError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'TaobaoImportError'
    this.code = code
  }
}

function throwForResponse(response) {
  const kind = classifyPageResponse(response)
  if (kind === 'OK') return
  if (kind === 'BLOCKED') throw new TaobaoImportError('BLOCKED')
  if (kind === 'LOGIN_REQUIRED') throw new TaobaoImportError('LOGIN_REQUIRED')
  throw new TaobaoImportError('HTTP', `HTTP ${response?.status || 0}`)
}

/**
 * 抓取并解析单个商品链接
 * @param {string} input 商品链接或裸 itemId
 * @returns {Promise<ReturnType<typeof buildTaobaoDraft>>}
 */
export async function fetchTaobaoDraft(input) {
  const itemId = extractTaobaoItemId(input)
  if (!itemId) {
    if (isTaobaoItemUrl(input)) throw new TaobaoImportError('SHORT_LINK')
    throw new TaobaoImportError('INVALID_LINK')
  }

  const cookie = await getTaobaoCookie()
  if (!isTaobaoCookieReady(cookie)) throw new TaobaoImportError('NO_COOKIE')

  const url = buildTaobaoItemUrl(itemId)
  const response = await taobaoPageGet(url, { cookie })
  throwForResponse(response)

  const res = extractSsrRes(response.body)
  const draft = buildTaobaoDraft(res, { url, itemId })
  if (!draft) throw new TaobaoImportError('PARSE')
  return draft
}

/**
 * 校验 Cookie 是否可用（用样例商品页探测登录态）
 * @returns {Promise<{ok:boolean, code:string}>}
 */
export async function validateTaobaoCookie() {
  const cookie = await getTaobaoCookie()
  if (!isTaobaoCookieReady(cookie)) return { ok: false, code: 'NO_COOKIE' }
  try {
    const response = await taobaoPageGet(buildTaobaoItemUrl(TAOBAO_SAMPLE_ITEM_ID), { cookie })
    const kind = classifyPageResponse(response)
    if (kind === 'OK') return { ok: true, code: 'OK' }
    return { ok: false, code: kind === 'BLOCKED' ? 'BLOCKED' : kind === 'HTTP' ? 'HTTP' : 'LOGIN_REQUIRED' }
  } catch (error) {
    if (error instanceof TaobaoRequestError) return { ok: false, code: error.code || 'NETWORK' }
    return { ok: false, code: 'NETWORK' }
  }
}

// ── 关键词搜索（mtop） ─────────────────────────────────────

/** 搜索接口（s.taobao.com 同款通用商品搜索，appId 34385） */
const SEARCH_API = 'mtop.relationrecommend.wirelessrecommend.recommend'
const SEARCH_API_VERSION = '2.0'
const SEARCH_APP_ID = '34385'
const SEARCH_REFERER = 'https://s.taobao.com/'
/** 每页条数（与官方 H5 搜索页一致） */
export const TAOBAO_SEARCH_PAGE_SIZE = 48

// 搜索内层 params 模板（见 docs/taobao_mtop_client.py SEARCH_PARAMS_TMPL）
const SEARCH_PARAMS_TMPL = {
  device: 'HMA-AL00', brand: 'HUAWEI', client_os: 'Android',
  from: 'nt_history', index: '4', schemaType: 'auction',
  isEnterSrpSearch: 'true', homePageVersion: 'v7',
  search_action: 'initiative', style: 'list', sugg: '_4_1',
  sversion: '13.6', ttid: '600000@taobao_pc_10.7.0',
  needTabs: 'true', areaCode: 'CN', vm: 'nw', countryNum: '156',
  m: 'pc', n: 48, pageSize: 48, totalPage: 100, totalResults: 4800,
  sourceS: '0', sort: '_coefp', qSource: 'url', tab: 'all',
}

/** mtop 请求错误 → 领域错误（服务层统一出口） */
function translateMtopError(error) {
  if (error instanceof TaobaoImportError) return error
  if (error instanceof TaobaoRequestError) {
    if (error.code === 'BLOCKED') return new TaobaoImportError('BLOCKED')
    if (error.code === 'TOKEN') return new TaobaoImportError('LOGIN_REQUIRED')
    if (error.code === 'HTTP') return new TaobaoImportError('HTTP', error.message)
    if (error.code === 'FAIL' || error.code === 'PARSE') return new TaobaoImportError('SEARCH', error.message)
    return new TaobaoImportError('NETWORK', error.message)
  }
  return new TaobaoImportError('NETWORK', error?.message || '')
}

/** 单条搜索结果归一化（去标题高亮标签、CDN 协议头、价格带 ¥） */
function normalizeSearchItem(item) {
  const itemId = String(item?.item_id || item?.itemId || '')
  if (!itemId) return null
  const title = String(item.title || '').replace(/<[^>]+>/g, '').trim()
  const rawPrice = String(item.price || item.priceShow?.priceText || '').trim()
  const price = /^\d+(\.\d+)?$/.test(rawPrice) ? `¥${rawPrice}` : rawPrice
  const shop = String(item.shopInfo?.shopName || item.nick || '').trim()
  const pic = normalizeCdnUrl(item.pic_path || item.picPath || '')
  const sales = String(item.realSales || '').trim()
  return { itemId, title, price, shop, pic, sales }
}

/**
 * 按关键词搜索淘宝商品（mtop，登录 Cookie 必需）
 * @param {string} query 关键词
 * @param {{page?:number, pageSize?:number}} [options] 页码从 1 开始
 * @returns {Promise<{items:Array<{itemId:string,title:string,price:string,shop:string,pic:string,sales:string}>, page:number}>}
 * @throws {TaobaoImportError} NO_COOKIE / LOGIN_REQUIRED / BLOCKED / SEARCH / HTTP / NETWORK
 */
export async function searchTaobaoItems(query, options = {}) {
  const keyword = String(query || '').trim()
  if (!keyword) throw new TaobaoImportError('INVALID_QUERY', 'empty query')
  const page = Math.max(1, Number(options.page) || 1)
  const pageSize = Math.max(1, Number(options.pageSize) || TAOBAO_SEARCH_PAGE_SIZE)

  const cookie = await getTaobaoCookie()
  if (!isTaobaoCookieReady(cookie)) throw new TaobaoImportError('NO_COOKIE')

  const params = { ...SEARCH_PARAMS_TMPL, q: keyword, page, pageSize, n: pageSize }
  const data = { appId: SEARCH_APP_ID, params: JSON.stringify(params) }

  let body
  try {
    body = await mtopCall({ api: SEARCH_API, v: SEARCH_API_VERSION, data, referer: SEARCH_REFERER, cookie })
  } catch (error) {
    throw translateMtopError(error)
  }

  const source = Array.isArray(body?.data?.itemsArray) ? body.data.itemsArray : []
  const items = source.map(normalizeSearchItem).filter(Boolean)
  return { items, page }
}
