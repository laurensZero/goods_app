// @ts-check

/**
 * 图片请求的 Referer 策略。
 *
 * 背景（实测）：B 站图片 CDN（*.hdslb.com）只接受「不带 Referer」或「B 站自己的 Referer」，
 * 带上别的来源一律 403（空 body，且不带 CORS 头）；不带 Referer 时正常 200。
 *
 *   curl -H 'Referer: https://goodsapp.de5.net/'  i1.hdslb.com/...  → 403
 *   curl -H 'Referer: https://www.bilibili.com/'  i1.hdslb.com/...  → 200
 *   curl（无 Referer）                            i1.hdslb.com/...  → 200
 *
 * 而应用页面来源对 hdslb 永远是「外站」：Capacitor 下是 `server.hostname`
 * （https://goodsapp.de5.net），开发态是 http://localhost:5173。于是：
 *
 * 1. 图片缓存管线的 fetch 必然 403 → 只能回退原始 URL，等于永远读不到持久缓存；
 * 2. 解码探测用的 `new Image()`（没有 referrerpolicy）会带上来源 Referer 被 403，
 *    而 Blink 的内存缓存按 **URL** 复用资源：紧随其后、正确声明
 *    `referrerpolicy="no-referrer"` 的 `<img>` 会复用这条「在途的失败请求」一起 error。
 *
 * 表现就是「编辑活动首次添加 B 站曲目时封面加载失败」，退到后台再回来（缓存刷新走
 * 另一条 set-src-after-probe 的时序）才出图。因此对这类 host 统一按 no-referrer 发请求。
 *
 * 网易云（p1.music.126.net）等 CDN 实测与 Referer 无关，不做处理。
 */
const NO_REFERRER_IMAGE_HOST_PATTERNS = [
  /(^|\.)hdslb\.com$/i,
  /(^|\.)biliimg\.com$/i
]

const LOCAL_URI_PATTERN = /^(blob:|data:|file:|content:|capacitor:)/i

/**
 * 该图片 URL 应该使用的 `referrerPolicy`。
 * 只在已知「外站 Referer 会被拒」的 host 上返回 `'no-referrer'`，其余返回 `''`（保持默认行为）。
 * @param {string} url
 * @returns {'no-referrer' | ''}
 */
export function resolveImageRequestReferrerPolicy(url) {
  const raw = String(url || '').trim()
  if (!raw || LOCAL_URI_PATTERN.test(raw)) return ''

  let host = ''
  try {
    host = new URL(raw, 'https://localhost').hostname
  } catch {
    return ''
  }
  if (!host) return ''

  return NO_REFERRER_IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(host)) ? 'no-referrer' : ''
}
