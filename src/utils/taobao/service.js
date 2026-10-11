/**
 * 淘宝链接导入与搜索服务：链接/关键词 → 登录态抓取 → 归一化草稿 / 搜索结果
 *
 * 这里只做「请求 + 解析」，不含任何 store/DB 依赖，方便单测与复用。
 * 搜索走 mtop（见 mtop.js），详情仍走 PC 详情页 SSR（request.js + detail.js）。
 */
import {
  buildTaobaoDraft,
  buildTaobaoDraftFromMtop,
  extractSsrRes,
  extractTaobaoItemId,
  isTaobaoItemUrl,
  buildTaobaoItemUrl,
  normalizeCdnUrl,
} from './detail'
import { getTaobaoCookie, isTaobaoCookieReady } from './cookie'
import { mtopCall } from './mtop'
import { TaobaoRequestError, classifyPageResponse, taobaoPageGet, isNativeTransport } from './request'
import { createLogger } from '@/utils/logger'

const logger = createLogger('taobao:svc')

/** Cookie 里带了哪些鉴权字段（只记字段名，不记值；用于排查「缺 sgcookie 被风控」类问题） */
function logCookieFields(stage, cookie) {
  const fields = String(cookie || '')
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter(Boolean)
  logger.info('cookie-fields', { stage, fields })
}

/** 校验 Cookie 用的样例商品（SSR 数据齐全即可，不关心商品是否还在售） */
export const TAOBAO_SAMPLE_ITEM_ID = '1026022602471'

/** mtop 详情接口（原生端 / SSR 不可用时的绕行通道，docs/taobao-mtop-api.md §3.2） */
const DETAIL_API = 'mtop.taobao.detail.getdetail'
const DETAIL_API_VERSION = '6.0'
const DETAIL_REFERER = 'https://item.taobao.com/'

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
 *
 * 通道策略（docs/taobao-mtop-api.md §8：tmd 风控 = 指纹/IP + 登录态）：
 *   - 原生端传输层是 CapacitorHttp（OkHttp），SSR 详情页会被 tmd 拦 → 直接走 mtop 详情接口
 *   - Web 端 SSR 优先（数据最全），被风控/无代理环境（生产站没有 /taobao-page）时降级 mtop
 *   - mtop getdetail 没有 SKU 树时降级为无 SKU 草稿（价格栈仍可用）
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

  if (isNativeTransport()) {
    logger.info('draft-channel', { itemId, channel: 'mtop-native' })
    return fetchTaobaoDraftFromMtop(itemId, cookie)
  }

  const url = buildTaobaoItemUrl(itemId)
  try {
    const response = await taobaoPageGet(url, { cookie })
    throwForResponse(response)
    const res = extractSsrRes(response.body)
    const draft = buildTaobaoDraft(res, { url, itemId })
    if (!draft) throw new TaobaoImportError('PARSE')
    logger.info('draft-ok', { itemId, channel: 'ssr', skus: draft.skus.length, props: draft.skuProps.length })
    return draft
  } catch (error) {
    const code = error instanceof TaobaoImportError ? error.code : ''
    if (code !== 'BLOCKED' && code !== 'LOGIN_REQUIRED' && code !== 'PARSE') throw error
    logger.info('draft-fallback', { itemId, ssrCode: code, channel: 'mtop' })
    const draft = await fetchTaobaoDraftFromMtop(itemId, cookie)
    logger.info('draft-ok', { itemId, channel: 'mtop', skus: draft.skus.length, props: draft.skuProps.length })
    return draft
  }
}

/**
 * mtop 详情接口抓取（getdetail，响应键位与 SSR 同名，见 detail.js 的 mtop 映射器）
 * @param {string} itemId
 * @param {string} [cookie] 已加载的登录 Cookie（省一次存储读取）
 * @returns {Promise<ReturnType<typeof buildTaobaoDraftFromMtop>>}
 */
async function fetchTaobaoDraftFromMtop(itemId, cookie) {
  const attemptCookie = cookie ?? (await getTaobaoCookie())
  if (!isTaobaoCookieReady(attemptCookie)) throw new TaobaoImportError('NO_COOKIE')
  let body
  try {
    body = await mtopCall({
      api: DETAIL_API,
      v: DETAIL_API_VERSION,
      data: { itemNumId: String(itemId) },
      referer: DETAIL_REFERER,
      cookie: attemptCookie,
    })
  } catch (error) {
    throw translateMtopError(error)
  }
  const draft = buildTaobaoDraftFromMtop(body?.data, { itemId })
  if (!draft) throw new TaobaoImportError('PARSE')
  return draft
}

/**
 * 校验 Cookie 是否可用（用样例商品探测登录态）
 * SSR 通道不可用（原生端 / 无代理环境）时降级为 mtop 详情探测
 * @returns {Promise<{ok:boolean, code:string}>}
 */
export async function validateTaobaoCookie() {
  const cookie = await getTaobaoCookie()
  if (!isTaobaoCookieReady(cookie)) return { ok: false, code: 'NO_COOKIE' }
  logCookieFields('validate', cookie)

  if (isNativeTransport()) {
    const result = await validateCookieViaMtop(cookie)
    logger.info('validate-done', { channel: 'mtop-native', ok: result.ok, code: result.code })
    return result
  }

  try {
    const response = await taobaoPageGet(buildTaobaoItemUrl(TAOBAO_SAMPLE_ITEM_ID), { cookie })
    const kind = classifyPageResponse(response)
    if (kind === 'OK') {
      logger.info('validate-done', { channel: 'ssr', ok: true, code: 'OK' })
      return { ok: true, code: 'OK' }
    }
    if (kind !== 'BLOCKED' && kind !== 'LOGIN_REQUIRED') {
      logger.info('validate-done', { channel: 'ssr', ok: false, code: kind })
      return { ok: false, code: kind === 'HTTP' ? 'HTTP' : 'LOGIN_REQUIRED' }
    }
    logger.info('validate-fallback', { ssrCode: kind, channel: 'mtop' })
    const result = await validateCookieViaMtop(cookie)
    logger.info('validate-done', { channel: 'mtop', ok: result.ok, code: result.code })
    return result
  } catch (error) {
    const code = error instanceof TaobaoRequestError ? (error.code || 'NETWORK') : 'NETWORK'
    logger.info('validate-done', { channel: 'ssr', ok: false, code })
    if (error instanceof TaobaoRequestError) return { ok: false, code: error.code || 'NETWORK' }
    return { ok: false, code: 'NETWORK' }
  }
}

/** mtop 通道探测登录态：getdetail 成功即 Cookie 有效 */
async function validateCookieViaMtop(cookie) {
  try {
    await mtopCall({
      api: DETAIL_API,
      v: DETAIL_API_VERSION,
      data: { itemNumId: TAOBAO_SAMPLE_ITEM_ID },
      referer: DETAIL_REFERER,
      cookie,
    })
    return { ok: true, code: 'OK' }
  } catch (error) {
    if (error instanceof TaobaoRequestError) {
      if (error.code === 'BLOCKED') return { ok: false, code: 'BLOCKED' }
      if (error.code === 'TOKEN' || error.code === 'FAIL') return { ok: false, code: 'LOGIN_REQUIRED' }
      if (error.code === 'HTTP') return { ok: false, code: 'HTTP' }
    }
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
/** 搜索请求带 bx-ua=fast-load（真实 s.taobao.com 首屏 recommend 请求同款，见 mtop.js lean 模式） */
const SEARCH_BX_UA = 'fast-load'

// 搜索内层 params 模板（对齐真实 s.taobao.com recommend 请求，docs/taobao_mtop_client.py SEARCH_PARAMS_TMPL）
// 真实请求带 clientType/myCNA/userAgent 等设备与会话字段；缺字段时网关风控分数更低。
const SEARCH_PARAMS_TMPL = {
  device: 'HMA-AL00', brand: 'HUAWEI', client_os: 'Android',
  from: 'nt_history', index: '4', schemaType: 'auction',
  isEnterSrpSearch: 'true', homePageVersion: 'v7',
  search_action: 'initiative', style: 'list', sugg: '_4_1',
  sversion: '13.6', ttid: '600000@taobao_pc_10.7.0',
  needTabs: 'true', areaCode: 'CN', vm: 'nw', countryNum: '156',
  m: 'pc', n: 48, pageSize: 48, totalPage: 100, totalResults: 4800,
  sourceS: '0', sort: '_coefp', qSource: 'url', tab: 'all',
  // 真实请求附带的设备/会话字段（缺省值与 s.taobao.com 首屏一致）
  isBeta: 'false', grayHair: 'false', info: 'wifi', rainbow: '',
  elderHome: 'false', newSearch: 'false', network: 'wifi', subtype: '',
  hasPreposeFilter: 'false', prepositionVersion: 'v2', gpsEnabled: 'false',
  searchDoorFrom: 'srp', debug_rerankNewOpenCard: 'false', searchElderHomeOpen: 'false',
  pageSource: '', channelSrp: '', bcoffset: '', ntoffset: '', filterTag: '',
  service: '', prop: '', loc: '',
  start_price: null, end_price: null, startPrice: null, endPrice: null,
  itemIds: null, p4pIds: null, p4pS: null, categoryp: '', ha3Kvpairs: null,
  couponUnikey: '', subTabId: '', np: '',
  clientType: 'h5', isNewDomainAb: 'false', forceOldDomain: 'false',
  screenResolution: '1707x1067', viewResolution: '1021x1516',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
}

/** 从 Cookie 提取 cna 值填入 params.myCNA（真实请求会带当前会话的 cna） */
function myCnaFromCookie(cookie) {
  const match = String(cookie || '').match(/(?:^|;\s*)cna=([^;]+)/)
  return match ? match[1].trim() : ''
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
  const myCna = myCnaFromCookie(cookie)
  if (myCna) params.myCNA = myCna
  const data = { appId: SEARCH_APP_ID, params: JSON.stringify(params) }

  let body
  try {
    // lean + bx-ua：对齐真实 s.taobao.com recommend 请求，避开搜索网关对 AntiCreep 请求的软拒
    body = await mtopCall({
      api: SEARCH_API,
      v: SEARCH_API_VERSION,
      data,
      referer: SEARCH_REFERER,
      cookie,
      lean: true,
      extraQuery: { 'bx-ua': SEARCH_BX_UA },
    })
  } catch (error) {
    throw translateMtopError(error)
  }

  const source = Array.isArray(body?.data?.itemsArray) ? body.data.itemsArray : []
  const items = source.map(normalizeSearchItem).filter(Boolean)
  return { items, page }
}
