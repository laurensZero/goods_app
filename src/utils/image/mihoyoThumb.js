/**
 * 米游铺 / 米哈游静态 CDN 图片尺寸统一改写。
 *
 * 约定：列表和详情用同一张图（约为接口原图 80% 档，972×0.8≈778），
 * 避免 hero 进详情时列表小图与详情原图不是同一张、闪白或动画炸。
 *
 * 真实地址形如：
 *   https://act-webstatic.mihoyo.com/upload/mall/.../xxx.jpg
 *     ?x-oss-process=image/resize,m_lfit,w_972,h_972,limit_1/format,webp
 */

const MIHOYO_IMAGE_CDN_HOST_RE = /(^|\.)(mihoyo\.com|hoyoverse\.com|mihoyogift\.com)$/i
const MIHOYO_STATIC_HOST_HINT_RE = /(webstatic|upload|static|act-)/i

/** 详情接口常见档 972；展示统一取其 80%，两边共用同一 URL */
export const DISPLAY_IMAGE_MAX = 778

export function isMihoyoImageUrl(url) {
  const raw = String(url || '').trim()
  if (!/^https?:\/\//i.test(raw)) return false
  try {
    const parsed = new URL(raw)
    if (!MIHOYO_IMAGE_CDN_HOST_RE.test(parsed.hostname)) return false
    // 只动静态资源域名，避免误伤 api-mall 等接口域
    return MIHOYO_STATIC_HOST_HINT_RE.test(parsed.hostname) || parsed.pathname.includes('/upload')
  } catch {
    return false
  }
}

function buildOssProcess(width, height, format) {
  const w = Math.max(16, Math.floor(Number(width) || DISPLAY_IMAGE_MAX))
  const h = Math.max(16, Math.floor(Number(height) || w))
  const fmt = String(format || 'webp').toLowerCase() === 'png' ? 'png' : 'webp'
  return `image/resize,m_lfit,w_${w},h_${h},limit_1/format,${fmt}`
}

/**
 * 改写米游铺 CDN 图片尺寸；非米游铺 URL 原样返回。
 * @param {string} url
 * @param {{ width?: number, height?: number, format?: 'webp'|'png' }} [options]
 * @returns {string}
 */
export function withMihoyoImageSize(url, options = {}) {
  const raw = String(url || '').trim()
  if (!raw || !isMihoyoImageUrl(raw)) return raw

  const width = Number(options.width) || DISPLAY_IMAGE_MAX
  const height = options.height != null ? Number(options.height) : width
  const process = buildOssProcess(width, height, options.format)

  try {
    const parsed = new URL(raw)
    const prev = parsed.searchParams.get('x-oss-process') || ''
    let next = process
    if (prev) {
      // 已有处理链：只替换宽高与输出格式，保留 m_lfit / limit_1 等
      next = prev.replace(/w_\d+/i, `w_${Math.max(16, Math.floor(width))}`)
      next = next.replace(/h_\d+/i, `h_${Math.max(16, Math.floor(height))}`)
      if (!/format,/i.test(next)) {
        next = `${next}/format,${options.format === 'png' ? 'png' : 'webp'}`
      } else {
        next = next.replace(/format,\w+/i, `format,${options.format === 'png' ? 'png' : 'webp'}`)
      }
    }
    // x-oss-process 保持与官样例一致的未编码逗号/斜杠，避免 searchParams 把 ,/ 转成 %2C%2F
    const rest = []
    for (const [key, value] of parsed.searchParams.entries()) {
      if (key === 'x-oss-process') continue
      rest.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    }
    rest.push(`x-oss-process=${next}`)
    parsed.search = rest.join('&')
    return parsed.toString()
  } catch {
    return raw
  }
}

/**
 * 列表与详情共用的展示 URL。
 *
 * 当前策略：原样返回（与 PhotoPreviewViewer 放大同一地址）。
 * 不要再改写 OSS 尺寸——hero/列表/详情/预览必须是同一 URL，
 * 否则列表改写图与预览原图不是同一张，会出现列表白屏、放大却有图。
 * 弱网若要再引入缩略图，必须整条链（含 hero）一起改。
 * @param {string} url
 */
export function toDisplayImageUrl(url) {
  return String(url || '').trim()
}

/** @deprecated 请用 toDisplayImageUrl；保留别名避免旧引用 */
export const toListThumbUrl = toDisplayImageUrl
/** @deprecated 请用 toDisplayImageUrl */
export const toDetailImageUrl = toDisplayImageUrl
/** @deprecated */
export const LIST_THUMB_MAX = DISPLAY_IMAGE_MAX
/** @deprecated */
export const DETAIL_IMAGE_MAX = DISPLAY_IMAGE_MAX
