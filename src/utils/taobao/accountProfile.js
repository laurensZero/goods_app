/**
 * 淘宝账号资料（昵称 / 头像）
 *
 * 昵称：mtop.user.getUserSimple v1.0（无 data 参数，登录 Cookie 必需）
 *   → { ret, data: { nick, userNumId, displayNick, avatar } }
 * 头像：wwc.alicdn.com getAvatar.do（按 userNick 生成，免登录可用）
 *   → https://wwc.alicdn.com/avatar/getAvatar.do?userNick=…&width=80&height=80&type=sns
 */
import { mtopCall } from './mtop'
import { createLogger } from '@/utils/logger'

const logger = createLogger('taobao:profile')

const USER_SIMPLE_API = 'mtop.user.getUserSimple'
const USER_SIMPLE_VERSION = '1.0'
const PROFILE_REFERER = 'https://www.taobao.com/'

/** 从 Cookie 读淘宝昵称字段（tracknick / _nk_ / dnk，可能是 URL 编码中文） */
export function nickFromCookie(cookie) {
  const pairs = parsePairs(cookie)
  for (const key of ['tracknick', '_nk_', 'dnk', 'lgc']) {
    const raw = String(pairs[key] || '').trim()
    if (!raw) continue
    try {
      const decoded = decodeURIComponent(raw).trim()
      if (decoded) return decoded
    } catch {
      return raw
    }
  }
  return ''
}

/** 从 Cookie 读账号数字 ID（unb） */
export function unbFromCookie(cookie) {
  return String(parsePairs(cookie).unb || '').trim()
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

/** 头像 CDN 直链（按昵称生成；昵称为空时返回 ''） */
export function buildTaobaoAvatarUrl(nick) {
  const value = String(nick || '').trim()
  if (!value) return ''
  const params = new URLSearchParams({
    userNick: value,
    _input_charset: 'UTF-8',
    width: '80',
    height: '80',
    type: 'sns',
  })
  return `https://wwc.alicdn.com/avatar/getAvatar.do?${params.toString()}`
}

/**
 * 拉取当前登录账号的昵称 / UID / 头像。
 * @param {string} [cookie] 省略时走 getTaobaoCookie（mtopCall 内部）
 * @returns {Promise<{nickname:string, avatarUrl:string, uid:string, nickRaw:string}>}
 * @throws {TaobaoRequestError} TOKEN / BLOCKED / HTTP / FAIL / PARSE / NETWORK
 */
export async function fetchTaobaoAccountProfile(cookie) {
  const body = await mtopCall({
    api: USER_SIMPLE_API,
    v: USER_SIMPLE_VERSION,
    data: {},
    referer: PROFILE_REFERER,
    ...(cookie ? { cookie } : {}),
  })
  const data = body?.data || {}
  const nickRaw = String(data.nick || data.displayNick || '').trim()
  const nickname = nickRaw
  const uid = String(data.userNumId || data.userId || '').trim()
  const avatarUrl = buildTaobaoAvatarUrl(nickname)
  logger.info('profile', { hasNick: Boolean(nickname), uidLen: uid.length, hasAvatar: Boolean(avatarUrl) })
  return { nickname, avatarUrl, uid, nickRaw }
}

/**
 * 免接口兜底：只从 Cookie 拼资料（昵称 + 头像），用于 getUserSimple 失败时。
 * @param {string} cookie
 */
export function profileFromCookie(cookie) {
  const nickname = nickFromCookie(cookie)
  return {
    nickname,
    avatarUrl: buildTaobaoAvatarUrl(nickname),
    uid: unbFromCookie(cookie),
  }
}
