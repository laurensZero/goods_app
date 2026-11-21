// @ts-check
import { getPublicBaseUrl, rebasePublicImageUrl } from '@/utils/sync/supabaseClient'

/**
 * 米哈游装扮图片地址工具（头像框 / 评论装扮）。
 *
 * 镜像/缩略图这类 Storage 公链的 host 不写死：统一按同步层测速选中的数据面
 * 端点改写（rebasePublicImageUrl + getPublicBaseUrl），云同步选了哪条线，
 * 装扮图就走哪条线。
 *
 * 取图策略（2026-11-21 定稿）：
 * - **预览**（选择器网格、列表）：优先云端预压缩的 128px 静态缩略图 `t`
 *   （动图自带首帧压平，体积最小），其次镜像，最后去参原图；
 * - **上屏**（头像外圈挂件、页面贴角装饰）：一律原图级——镜像 `m`（Storage
 *   整图副本，国内直连快）优先，没有镜像就去参原图 `u`。不再使用 OSS
 *   `x-oss-process` 实时缩放：webp 质量不可控，高 DPR 屏上放大发糊；
 * - 动图：原图本身就是动图（webp 动图 / gif），上屏时直接播，无需任何处理。
 *   官方 CDN 会删旧文件（hy:293 实测 404），所以镜像存在时永远优先镜像。
 */

/**
 * 去掉已有的 `x-oss-process` 参数，拿到原始文件地址
 * @param {string} url
 * @returns {string}
 */
export function stripDecorParams(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const idx = raw.indexOf('?')
  return idx === -1 ? raw : raw.slice(0, idx)
}

/**
 * 挂件的「内容键」：同一张图在米哈游两个 CDN 上会挂不同的条目 id / 名字
 * （HoYoLAB 目录里本身就重复收录），但文件名前缀是上传时的内容 hash，
 * 相同内容必然相同。用这个键去重，比按名字靠谱。
 *
 * 例：`.../e3e7851669f6a32f1de74aa83e49018d_2319976981667326517.png`
 *     → `e3e7851669f6a32f1de74aa83e49018d`
 *
 * @param {string} url
 * @returns {string} 取不到 hash 时返回去参后的完整地址（只在完全相同时才判重）
 */
export function pendantContentKey(url) {
  const base = stripDecorParams(url)
  if (!base) return ''
  const file = base.slice(base.lastIndexOf('/') + 1)
  const match = /^([0-9a-f]{24,})_[^.]*\./i.exec(file)
  return match ? match[1].toLowerCase() : base
}

/**
 * 按目录条目解析挂件展示地址。
 *
 * @param {{ u?: string, m?: string, t?: string }} item  目录紧凑项（u 原图 / m 镜像 / t 缩略图）
 * @param {object} [options]
 * @param {boolean} [options.preview] true = 预览场景（选择器/列表），允许 128px 缩略图；
 *                                    false/缺省 = 上屏场景，必须原图级（m → 去参 u）
 * @returns {string}
 */
/**
 * 把 Storage 公链的 host 改写成同步层当前选中的数据面端点。
 * 非内置 Supabase 公链（米哈游 CDN 原图等）原样返回。
 */
function toActiveBase(url) {
  return rebasePublicImageUrl(url, getPublicBaseUrl())
}

export function resolvePendantSrc(item, options = {}) {
  if (!item || typeof item !== 'object') return ''
  const thumb = String(item.t || '').trim()
  const mirror = String(item.m || '').trim()
  const original = stripDecorParams(item.u || '')

  // 预览：128px 缩略图（动图自带首帧压平）→ 镜像 → 去参原图
  if (options.preview === true && thumb) return toActiveBase(thumb)
  // 上屏：镜像优先（国内直连快 + 免疫官方删文件），没有镜像退去参原图
  if (mirror) return toActiveBase(mirror)
  return toActiveBase(original)
}

/**
 * 头像外圈挂件的最终取图地址（组件展示与切换预热共用同一套规则）。
 *
 * 上屏场景：永远是原图级——动图条目直接播动图原图，静态条目走镜像/去参原图。
 *
 * @param {{ u?: string, m?: string, t?: string, a?: boolean }} item
 * @param {object} [options]
 * @param {boolean} [options.preview] true = 预览场景（允许 128px 缩略图）
 * @returns {string}
 */
export function resolveAvatarPendantSrc(item, options = {}) {
  if (!item) return ''
  return resolvePendantSrc({ u: item.u, m: item.m, t: item.t }, { preview: options.preview === true })
}

/**
 * 按目录条目解析评论气泡展示地址（`services/mhyDecor/bubbles.js` 的紧凑项）。
 *
 * 气泡的动图是独立的 `gif` 字段（`u` 恒为静态底图），所以动图判断独立：
 * - `playAnimation=true` 且 gif 有值 → 直接返回 gif 原地址；
 * - 其余按挂件同款链路（preview → 缩略图；上屏 → 镜像/去参原图）。
 *
 * @param {{ u?: string, gif?: string, gif_url?: string, m?: string, t?: string }} bubble
 *        目录紧凑项（u 静态底图 / gif 动图 / m 镜像 / t 缩略图）
 * @param {object} [options]
 * @param {boolean} [options.playAnimation] true = 优先播 gif 动图
 * @param {boolean} [options.preview]       true = 预览场景（允许 128px 缩略图）
 * @returns {string}
 */
export function resolveBubbleSrc(bubble, options = {}) {
  if (!bubble || typeof bubble !== 'object') return ''
  // 兼容紧凑项（gif）与原始行（gif_url）两种入参
  const gif = String(bubble.gif ?? bubble.gif_url ?? '').trim()
  if (options.playAnimation && gif) return gif
  return resolvePendantSrc(
    { u: bubble.u ?? '', m: bubble.m ?? '', t: bubble.t ?? '' },
    { preview: options.preview === true }
  )
}
