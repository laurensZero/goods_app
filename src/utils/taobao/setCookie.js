/**
 * 淘宝 Set-Cookie 解析 / Cookie 罐合并
 *
 * 代理（Vite 中间件 / CF Function）把上游多条 Set-Cookie 回传给客户端：
 *   - 新：`x-upstream-set-cookie-json` = JSON.stringify(string[])（推荐，Expires 逗号安全）
 *   - 旧：`x-upstream-set-cookie` = setCookie.join(', ')（Expires 含逗号时会碎）
 * 原生 CapacitorHttp 直连时 headers['set-cookie'] 可能是数组或同样用逗号拼接的串。
 *
 * 扫码登录 newlogin 一步会下发 ~26 条 Set-Cookie，必须按条解析并合并进会话罐；
 * 删除型（空值 / Max-Age<=0 / Expires 已过期）要从罐中剔除。
 */

/** 从响应头集合读出 Set-Cookie 列表（兼容 Headers 实例 / 普通对象 / 数组） */
export function readUpstreamSetCookieList(headers) {
  if (!headers || typeof headers !== 'object') return []

  const get = typeof headers.get === 'function'
    ? (key) => headers.get(key)
    : (key) => {
      const lower = String(key).toLowerCase()
      for (const [k, v] of Object.entries(headers)) {
        if (String(k).toLowerCase() === lower) return v
      }
      return null
    }

  const jsonRaw = get('x-upstream-set-cookie-json')
  if (jsonRaw) {
    const list = coerceSetCookieList(jsonRaw)
    if (list.length > 0) return list
  }

  const raw = get('set-cookie') ?? get('x-upstream-set-cookie') ?? ''
  return coerceSetCookieList(raw)
}

/** 把「数组 / JSON 数组串 / 逗号拼接串」统一成 string[] */
export function coerceSetCookieList(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean)
  }
  const text = String(raw).trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean)
    } catch {
      // 不是合法 JSON，按逗号拼接串继续
    }
  }
  return splitLegacySetCookieBlob(text)
}

/**
 * 拆旧版 `join(', ')` 拼接串。
 * 边界：逗号后紧跟 `name=` 才是新条目；Expires 里的 `Wed, 01 Jan…` 逗号后是空格+日期，不会误切。
 */
export function splitLegacySetCookieBlob(text) {
  const value = String(text || '').trim()
  if (!value) return []
  return value
    .split(/,\s+(?=[\w-]+=[^;,\s])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** 解析单条 Set-Cookie：取 name/value，并识别删除型（空值 / Max-Age / 过期 Expires） */
export function parseSetCookieLine(line) {
  const text = String(line || '').trim()
  if (!text) return { name: '', value: '', expired: false }

  const first = text.split(';')[0]
  const eq = first.indexOf('=')
  if (eq === -1) return { name: '', value: '', expired: false }

  const name = first.slice(0, eq).trim()
  let value = first.slice(eq + 1).trim()
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1)
  }
  if (!name) return { name: '', value: '', expired: false }

  let expired = value === ''
  const maxAgeMatch = text.match(/(?:^|;)\s*max-age\s*=\s*([^\s;]+)/i)
  if (maxAgeMatch) {
    const maxAge = Number(maxAgeMatch[1])
    if (Number.isFinite(maxAge) && maxAge <= 0) expired = true
  }
  if (!expired) {
    const expiresMatch = text.match(/(?:^|;)\s*expires\s*=\s*([^;]+)/i)
    if (expiresMatch) {
      const ts = Date.parse(expiresMatch[1].trim())
      if (Number.isFinite(ts) && ts <= Date.now()) expired = true
    }
  }

  return { name, value, expired }
}

/**
 * 把 Set-Cookie 列表合并进 Cookie 罐（name 去重，后写覆盖；删除型剔除）。
 * 扁平存储：忽略 Domain/Path（客户端只对淘宝/天猫域发这罐 Cookie）。
 * @param {string} jar 现有 `a=1; b=2`
 * @param {string[]} setCookieList
 * @returns {string}
 */
export function mergeSetCookieIntoJar(jar, setCookieList) {
  /** @type {string[]} */
  const order = []
  /** @type {Map<string, string>} */
  const values = new Map()

  for (const part of String(jar || '').split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!name) continue
    if (!values.has(name)) order.push(name)
    values.set(name, value)
  }

  for (const line of setCookieList || []) {
    const { name, value, expired } = parseSetCookieLine(line)
    if (!name) continue
    if (expired) {
      values.delete(name)
      continue
    }
    if (!values.has(name)) order.push(name)
    values.set(name, value)
  }

  return order
    .filter((name) => values.has(name))
    .map((name) => `${name}=${values.get(name)}`)
    .join('; ')
}
