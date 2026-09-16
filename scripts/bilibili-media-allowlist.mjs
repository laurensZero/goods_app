// B 站媒体代理域名放行：静态后缀兜底 + playurl 响应动态学习。
// 静态表覆盖常见官方 CDN；动态表用于 B 站临时/轮换域名（如 mountaintoys 边缘节点）。
// 安全边界：动态表只从本机 /bilibili-api 代理到的 playurl JSON 写入，且拒绝内网地址。

const STATIC_BILIBILI_MEDIA_HOST_RE =
  /(^|\.)(bilivideo\.(com|cn)|mountaintoys\.cn)$/i

const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i

const DYNAMIC_HOST_LIMIT = 512
const dynamicMediaHosts = new Set()

export function isPrivateMediaHost(hostname) {
  return PRIVATE_HOST_RE.test(String(hostname || ''))
}

export function isStaticBilibiliMediaHost(hostname) {
  return STATIC_BILIBILI_MEDIA_HOST_RE.test(String(hostname || ''))
}

export function isAllowedBilibiliMediaHost(hostname) {
  const host = String(hostname || '').trim()
  if (!host || isPrivateMediaHost(host)) return false
  if (isStaticBilibiliMediaHost(host)) return true
  return dynamicMediaHosts.has(host)
}

function rememberHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase()
  if (!host || isPrivateMediaHost(host) || isStaticBilibiliMediaHost(host)) return
  if (dynamicMediaHosts.has(host)) {
    // 保持“最近使用”语义：删了再加，接近 LRU
    dynamicMediaHosts.delete(host)
  }
  dynamicMediaHosts.add(host)
  while (dynamicMediaHosts.size > DYNAMIC_HOST_LIMIT) {
    const oldest = dynamicMediaHosts.values().next().value
    if (oldest === undefined) break
    dynamicMediaHosts.delete(oldest)
  }
}

function rememberUrl(url) {
  try {
    rememberHost(new URL(String(url)).hostname)
  } catch {
    // 非法 URL 忽略
  }
}

function rememberStreamUrls(stream) {
  if (!stream || typeof stream !== 'object') return
  rememberUrl(stream.baseUrl || stream.base_url)
  const backups = stream.backupUrl || stream.backup_url || []
  for (const backup of Array.isArray(backups) ? backups : [backups]) {
    rememberUrl(backup)
  }
}

/**
 * 从 playurl JSON 里收集 durl / dash 的媒体 host，写入动态白名单。
 * @param {unknown} payload
 * @returns {string[]} 本次新登记/刷新的 host
 */
export function rememberBilibiliMediaHostsFromPlayurl(payload) {
  const before = dynamicMediaHosts.size
  const data = payload && typeof payload === 'object' && 'data' in payload
    ? /** @type {any} */ (payload).data
    : payload
  if (!data || typeof data !== 'object') return []

  for (const item of Array.isArray(data.durl) ? data.durl : []) {
    rememberUrl(item?.url)
    for (const backup of Array.isArray(item?.backup_url) ? item.backup_url : []) {
      rememberUrl(backup)
    }
  }

  const dash = data.dash
  if (dash && typeof dash === 'object') {
    for (const stream of [
      ...(Array.isArray(dash.audio) ? dash.audio : []),
      ...(Array.isArray(dash.video) ? dash.video : []),
      ...(Array.isArray(dash.durl) ? dash.durl : [])
    ]) {
      rememberStreamUrls(stream)
    }
  }

  // 调试用：新域名数变化
  return before === dynamicMediaHosts.size ? [] : [...dynamicMediaHosts]
}

export function listDynamicBilibiliMediaHosts() {
  return [...dynamicMediaHosts]
}

export function clearDynamicBilibiliMediaHosts() {
  dynamicMediaHosts.clear()
}
