/**
 * 淘宝账号资料（昵称 / 头像）
 *
 * 昵称有两个来源（2026-10 实测）：
 *   1. mtop.taobao.mclaren.personal.center.index v1.0（个人中心）
 *      → data.account.snsNick 就是「我的淘宝」页上那个**可改的昵称**
 *        （实测账号 tb168334051115 的 snsNick = laurensZero，
 *          同一响应里的 nick / tbUicDisplayNick 反而是会员名）
 *   2. mtop.user.getUserSimple v1.0 → data.nick
 *      ⚠ 部分账号这里回的是**会员名**（形如 tb+数字，如 tb168334051115），需跳过
 * 头像：wwc.alicdn.com getAvatar.do
 *   → 优先 ?userId=<userNumId>（改名后仍返回真实头像）
 *   → 无 uid 时退回 ?userNick=<昵称>（改名后会退化成默认头像）
 */
import { mtopCall } from './mtop'
import { isTaobaoLoginName } from './cookie'
import { createLogger } from '@/utils/logger'

const logger = createLogger('taobao:profile')

const USER_SIMPLE_API = 'mtop.user.getUserSimple'
const PERSONAL_CENTER_API = 'mtop.taobao.mclaren.personal.center.index'
const API_VERSION = '1.0'
const PROFILE_REFERER = 'https://www.taobao.com/'

/**
 * 从 Cookie 读淘宝展示昵称。
 *
 * 顺序很关键（2026-10 实测）：`dnk` 才是**当前**展示昵称；`_nk_` / `lgc` /
 * `tracknick` 在用户改过昵称后往往还是旧名，甚至 `tracknick` 是登录名
 * （形如 tb+数字），故只作兜底。
 * @param {string} cookie
 */
export function nickFromCookie(cookie) {
  const pairs = parsePairs(cookie)
  let fallback = ''
  for (const key of ['dnk', '_nk_', 'lgc', 'tracknick']) {
    const raw = String(pairs[key] || '').trim()
    if (!raw) continue
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw).trim()
    } catch {
      decoded = raw
    }
    if (!decoded) continue
    if (isTaobaoLoginName(decoded)) {
      if (!fallback) fallback = decoded
      continue
    }
    return decoded
  }
  return fallback
}

/** 从 Cookie 读账号数字 ID（unb / aui / cookie17 / userNumId 任一） */
export function uidFromCookie(cookie) {
  const pairs = parsePairs(cookie)
  return String(
    pairs.unb || pairs.aui || pairs.cookie17 || pairs.userNumId || '',
  ).trim()
}

function parsePairs(cookie) {
  const result = {}
  String(cookie || '').split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx === -1) return
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) result[key] = value
  })
  return result
}

/**
 * 头像 CDN 直链。
 *
 * 关键（2026-10 实测）：用户改过昵称后，`userNick=` 会返回**默认头像**，
 * 而 `userId=`（userNumId，稳定不变）始终返回**真实头像**。故优先用 uid，
 * 没有 uid 时才退回按昵称。
 * @param {string} nick 展示昵称
 * @param {string} [uid] userNumId
 */
export function buildTaobaoAvatarUrl(nick, uid) {
  const id = String(uid || '').trim()
  const value = String(nick || '').trim()
  if (!id && !value) return ''
  const params = new URLSearchParams()
  if (id) params.set('userId', id)
  else params.set('userNick', value)
  params.set('_input_charset', 'UTF-8')
  params.set('width', '80')
  params.set('height', '80')
  params.set('type', 'sns')
  return `https://wwc.alicdn.com/avatar/getAvatar.do?${params.toString()}`
}

/**
 * 拉取当前登录账号的昵称 / UID / 头像。
 *
 * 并行打两个接口（任一失败不影响另一个），两个都失败才抛错让上层走 Cookie 兜底：
 *   - getUserSimple：拿 userNumId（头像按 uid 生成，改名也不会退化成默认头像）
 *   - personalCenter：拿 snsNick（真实昵称，见文件头注释）
 * @param {string} [cookie] 省略时走 getTaobaoCookie（mtopCall 内部）
 * @returns {Promise<{nickname:string, avatarUrl:string, uid:string, nickRaw:string}>}
 * @throws {TaobaoRequestError} TOKEN / BLOCKED / HTTP / FAIL / PARSE / NETWORK
 */
export async function fetchTaobaoAccountProfile(cookie) {
  const failures = []
  const request = (api) => mtopCall({
    api,
    v: API_VERSION,
    data: {},
    referer: PROFILE_REFERER,
    ...(cookie ? { cookie } : {}),
  }).catch((error) => {
    failures.push(error)
    return null
  })

  const [simple, center] = await Promise.all([
    request(USER_SIMPLE_API),
    request(PERSONAL_CENTER_API),
  ])
  if (!simple && !center) throw failures[0] || new Error('taobao profile unavailable')

  const simpleData = simple?.data || {}
  const account = center?.data?.account || {}
  const uid = String(simpleData.userNumId || simpleData.userId || account.userNumId || '').trim()
  const nickname = pickNickname({
    snsNick: account.snsNick,
    apiNick: simpleData.nick,
    apiDisplayNick: simpleData.displayNick,
    cookieNick: nickFromCookie(cookie),
  })
  // 头像优先级：uid 直链（改名不影响）→ 接口给的真实头像 → 最后才按昵称
  const avatarUrl = buildTaobaoAvatarUrl('', uid)
    || pickAvatarUrl(account)
    || pickAvatarUrl(simpleData)
    || buildTaobaoAvatarUrl(nickname, '')

  logger.info('profile', {
    hasNick: Boolean(nickname),
    uidLen: uid.length,
    hasAvatar: Boolean(avatarUrl),
    sources: [simple ? 'simple' : '', center ? 'center' : ''].filter(Boolean).join('+'),
  })
  return { nickname, avatarUrl, uid, nickRaw: nickname }
}

/**
 * 选展示昵称。
 *
 * 优先级（2026-10 实测）：
 *   1. 个人中心的 `snsNick` —— 就是「我的淘宝」页上那个**可改的昵称**
 *      （实测 tb168334051115 这号的 snsNick 是 laurensZero）
 *   2. `getUserSimple.nick` —— 多数账号就是昵称，但部分账号回的是**会员名**
 *      （形如 tb+数字），这种要跳过
 *   3. `displayNick` / Cookie 兜底（改名后 Cookie 常常还是旧名，仅兜底）
 * @param {{snsNick?:string, apiNick?:string, apiDisplayNick?:string, cookieNick?:string}} sources
 */
export function pickNickname({ snsNick, apiNick, apiDisplayNick, cookieNick } = {}) {
  const sns = String(snsNick || '').trim()
  if (sns && !isTaobaoLoginName(sns)) return sns
  const nick = String(apiNick || '').trim()
  if (nick && !isTaobaoLoginName(nick)) return nick
  const display = String(apiDisplayNick || '').trim()
  if (display && !isTaobaoLoginName(display)) return display
  const cookie = String(cookieNick || '').trim()
  if (cookie) return cookie
  return sns || nick || display || ''
}

/** 接口返回的头像直链（仅部分账号给；可能是协议相对 URL）；不可用返回 '' */
function pickAvatarUrl(data) {
  const raw = String(data?.avatar || data?.avatarUrl || data?.fullAvatar || data?.headPic || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  return /^https?:\/\//i.test(raw) ? raw : ''
}

/**
 * 免接口兜底：只从 Cookie 拼资料（昵称 + 头像），用于 getUserSimple 失败时。
 * @param {string} cookie
 */
export function profileFromCookie(cookie) {
  const nickname = nickFromCookie(cookie)
  const uid = uidFromCookie(cookie)
  return {
    nickname,
    avatarUrl: buildTaobaoAvatarUrl(nickname, uid),
    uid,
  }
}
