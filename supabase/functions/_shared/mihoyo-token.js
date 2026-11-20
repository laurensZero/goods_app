/**
 * 米哈游账号 token 续期工具（本地与 Edge Function 共用）。
 *
 * 解决「Cookie 会过期」：stoken_v2 是长效凭证（改密码/登出才会失效），拿它运行时
 * 换新鲜的 cookie_token / ltoken，就不用人工定期换 Cookie secret 了。
 * 两条链路（2026-11 对齐 seriaati/genshin.py 与本仓 scripts/mihoyo-get-stoken.mjs）：
 *
 *   米游社 GET  https://passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken
 *           → data: { uid, cookie_token }            headers: ds(app_login) + x-rpc-app_id bll8iq97cem8
 *   HoYoLAB POST https://sg-public-api.hoyoverse.com/account/ma-passport/token/getBySToken
 *           body { dst_token_types: [2, 4] }
 *           → data.tokens: [{token_type:2 → ltoken_v2}, {token_type:4 → cookie_token_v2}]
 *                                                    headers: ds(app_login) + x-rpc-app_id c9oqaq3s3gu8
 *
 * DS 签名（app_login 盐）：md5(`salt=${SALT}&t=${t}&r=${r}&b=${body}&q=${query}`)
 */

export const DS_SALT_APP_LOGIN = "IZPgfb0dRPtBeLuFkdDznSZ6f4wWt6y2"
const MIYOUSHE_REFRESH_URL = "https://passport-api.mihoyo.com/account/auth/api/getCookieAccountInfoBySToken"
const HOYOLAB_REFRESH_URL = "https://sg-public-api.hoyoverse.com/account/ma-passport/token/getBySToken"

// ---------------- MD5（纯 JS，Deno/Node 通用；WebCrypto 不提供 md5） ----------------
/* eslint-disable no-bitwise */
function md5hex(input) {
  const msg = typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(String(input))
    : Uint8Array.from(String(input).split("").map((c) => c.charCodeAt(0) & 0xff))

  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]
  const K = new Array(64)
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)

  // 预填充 + 长度（小端）
  const bitLen = msg.length * 8
  const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) * 64)
  padded.set(msg)
  padded[msg.length] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, bitLen >>> 0, true)
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < padded.length; off += 64) {
    const M = new Array(16)
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F, g
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + K[i] + M[g]) >>> 0
      A = D; D = C; C = B
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  // 小端十六进制输出
  const hex = [a0, b0, c0, d0].map((n) =>
    [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
      .map((b) => b.toString(16).padStart(2, "0")).join("")).join("")
  return hex
}
/* eslint-enable no-bitwise */

/**
 * Passport app_login DS 签名。query/body 必须与实际请求完全一致。
 * @param {{ query?: string, body?: string, t?: string, r?: string }} options
 */
export function makeDsAppLogin({ query = "", body = "", t, r } = {}) {
  const ts = t || String(Math.floor(Date.now() / 1000))
  const rand = r || String(Math.floor(Math.random() * 100000) + 100000)
  const sign = md5hex(`salt=${DS_SALT_APP_LOGIN}&t=${ts}&r=${rand}&b=${body}&q=${query}`)
  return `${ts},${rand},${sign}`
}

// ---------------- secret 解析 ----------------

/**
 * 解析 STOKEN secret。约定格式（可从 scripts/mihoyo-get-stoken.mjs 产出的
 * stoken.txt 直接复制）：`stoken_v2=<v>; mid=<m>; aid=<uid>`（分号/逗号分隔均可）
 * @param {string} raw
 * @returns {{ stoken: string, mid: string, aid: string } | null}
 */
export function parseStokenSecret(raw) {
  const map = {}
  for (const part of String(raw || "").split(/[;,\s]+/)) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
  }
  const stoken = map.stoken_v2 || map.stoken || ""
  const mid = map.mid || map.stmid || ""
  const aid = map.aid || map.stuid || map.uid || ""
  if (!stoken || !mid) return null
  return { stoken, mid, aid }
}

// ---------------- 米游社（国服） ----------------

/**
 * stoken_v2 → { uid, cookie_token }
 * @param {{ stoken: string, mid: string }} auth
 * @returns {Promise<{ uid: string, cookieToken: string }>}
 */
export async function refreshMiyousheToken(auth) {
  const cookie = `mid=${auth.mid};stoken=${auth.stoken}`
  const res = await fetch(MIYOUSHE_REFRESH_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/2.106.2",
      "x-rpc-app_id": "bll8iq97cem8",
      "x-rpc-client_type": "2",
      ds: makeDsAppLogin({}),
      cookie,
    },
  })
  const body = await res.json()
  if (body?.retcode !== 0) {
    throw new Error(`miyoushe stoken 续期失败 retcode=${body?.retcode} ${body?.message || ""}`)
  }
  return { uid: String(body.data?.uid || ""), cookieToken: String(body.data?.cookie_token || "") }
}

/** 拼米游社 bbs-api 可用的登录 Cookie */
export function buildMiyousheCookie(auth, refreshed) {
  const parts = [
    `account_id=${auth.aid || refreshed.uid}`,
    `account_id_v2=${auth.aid || refreshed.uid}`,
    `account_mid_v2=${auth.mid}`,
    `cookie_token=${refreshed.cookieToken}`,
    `cookie_token_v2=${refreshed.cookieToken}`,
    `ltmid_v2=${auth.mid}`,
    `ltuid=${auth.aid || refreshed.uid}`,
    `ltuid_v2=${auth.aid || refreshed.uid}`,
    `login_uid=${auth.aid || refreshed.uid}`,
    `mid=${auth.mid}`,
    `stoken=${auth.stoken}`,
    `stoken_v2=${auth.stoken}`,
  ]
  return parts.join("; ")
}

// ---------------- HoYoLAB（国际服） ----------------

/**
 * stoken_v2 → { ltokenV2, cookieTokenV2 }
 * @param {{ stoken: string, mid: string }} auth
 * @returns {Promise<{ ltokenV2: string, cookieTokenV2: string }>}
 */
export async function refreshHoyolabToken(auth) {
  const body = JSON.stringify({ dst_token_types: [2, 4] })
  const res = await fetch(HOYOLAB_REFRESH_URL, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/2.106.2",
      "x-rpc-app_id": "c9oqaq3s3gu8",
      "x-rpc-app_version": "1.5.0",
      "x-rpc-client_type": "4",
      "x-rpc-language": "zh-cn",
      ds: makeDsAppLogin({ body }),
      cookie: `mid=${auth.mid};stoken=${auth.stoken}`,
      "Content-Type": "application/json",
    },
    body,
  })
  const json = await res.json()
  if (json?.retcode !== 0) {
    throw new Error(`hoyolab stoken 续期失败 retcode=${json?.retcode} ${json?.message || ""}`)
  }
  let ltokenV2 = ""
  let cookieTokenV2 = ""
  for (const token of json.data?.tokens || []) {
    if (token?.token_type === 2) ltokenV2 = String(token.token || "")
    if (token?.token_type === 4) cookieTokenV2 = String(token.token || "")
  }
  if (!ltokenV2 && !cookieTokenV2) throw new Error("hoyolab stoken 续期返回空 tokens")
  return { ltokenV2, cookieTokenV2 }
}

/** 拼 HoYoLAB bbs-api-os 可用的登录 Cookie */
export function buildHoyolabCookie(auth, refreshed) {
  const parts = [
    `account_mid_v2=${auth.mid}`,
    `cookie_token_v2=${refreshed.cookieTokenV2}`,
    `ltmid_v2=${auth.mid}`,
    `ltoken_v2=${refreshed.ltokenV2}`,
    `mid=${auth.mid}`,
    `stoken_v2=${auth.stoken}`,
  ]
  if (auth.aid) {
    parts.push(`account_id=${auth.aid}`, `account_id_v2=${auth.aid}`, `ltuid=${auth.aid}`, `ltuid_v2=${auth.aid}`)
  }
  return parts.join("; ")
}
