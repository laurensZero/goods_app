// @ts-check
/**
 * 米哈游 CDN 图片地址工具（头像挂件 / 评论装扮 / 主页背景）。
 *
 * 结论（实测 2026-11）：
 * - 四个图片域名都**不校验 Referer**，原生 App 裸请求直接 200，可以直接热链；
 * - 都支持 OSS 的 `x-oss-process` 实时缩放，静态挂件 96px 只要 ~4.7 KB；
 * - 动态 WebP 缩放后**仍然是动图**（4.5 MB → 96px 509 KB）；
 *   `format,png|jpg` 会把动图压成首帧静态图（96px ~7 KB）。
 *
 * 因此列表/选择器用 still 静态首帧，详情页才加载动图。
 */

/** CDN 允许的缩放宽度档位。档位固定才能命中 OSS 的 URL 级缓存。 */
export const DECOR_WIDTH_STEPS = Object.freeze([48, 64, 96, 128, 192, 256, 400])

/**
 * 动图缩放宽度上限。动图体积随宽度近似线性增长
 * （实测 100 帧 webp：w_96 509 KB / w_128 749 KB / w_192 1.3 MB / 原图 4.5 MB），
 * 挂件最大也就 120px 级，超过 192 只是白烧流量和解码时间。
 */
export const DECOR_ANIM_MAX_WIDTH = 192

/** 已知的米哈游图片域名 */
const DECOR_HOST_RE = /(^|\.)(miyoushe\.com|mihoyo\.com|mihoyogift\.com|hoyoverse\.com|hoyolab\.com)$/i

/**
 * 是否为米哈游 CDN 图片地址
 * @param {string} url
 */
export function isMhyDecorUrl(url) {
  try {
    return DECOR_HOST_RE.test(new URL(String(url)).hostname)
  } catch {
    return false
  }
}

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
 * 把请求宽度吸附到最近的合法档位，避免出现 w_97 / w_98 这种一次性 URL
 * @param {number} width
 * @returns {number}
 */
export function snapDecorWidth(width) {
  const value = Math.round(Number(width) || 0)
  if (!Number.isFinite(value) || value <= 0) return 0
  let best = DECOR_WIDTH_STEPS[0]
  let bestDelta = Infinity
  for (const step of DECOR_WIDTH_STEPS) {
    const delta = Math.abs(step - value)
    // 平局取小档，避免同尺寸出现两个 URL
    if (delta < bestDelta) {
      best = step
      bestDelta = delta
    }
  }
  return best
}

/**
 * 构造挂件图片地址。
 *
 * @param {string} url            原始 CDN 地址（或带参数的地址，会被规整）
 * @param {object} [options]
 * @param {number} [options.width]   目标宽度（px），会吸附到 DECOR_WIDTH_STEPS；0/缺省 = 原图
 * @param {boolean} [options.flatten] true = 强制静态首帧（动图会被压平），用于列表缩略图
 * @returns {string}
 */
export function buildDecorUrl(url, options = {}) {
  const base = stripDecorParams(url)
  if (!base) return ''

  const width = snapDecorWidth(options.width || 0)
  // 只有米哈游自家的图床才认 x-oss-process，其它地址原样返回
  if (!width || !isMhyDecorUrl(base)) return base

  // png/jpg 都会丢掉动画帧；webp 保留动图（但体积大，列表里别用）
  const format = options.flatten ? 'png' : 'webp'
  const process = `image/resize,w_${width}/format,${format}`
  return `${base}?x-oss-process=${process}`
}

/**
 * 详情/大图地址：动图按原样给，静态图给 webp
 * @param {string} url
 * @param {{ width?: number }} [options]
 */
export function buildDecorDetailUrl(url, options = {}) {
  return buildDecorUrl(url, { width: options.width || 0, flatten: false })
}

/**
 * 按目录条目解析挂件展示地址，取图优先级：缩略图 t → 镜像 m → OSS 实时缩放。
 *
 * 为什么是这个顺序：
 * 1. `t`（云端预压缩的 128px 静态 webp）体积最小、动图自带首帧压平，
 *    小尺寸展示没必要再让 OSS 现场缩一遍，能命中就直接用；
 * 2. `m`（Supabase Storage 整图镜像）国内直连快，但它是不带缩放的原图，
 *    只该在 t 不够用（大图/播放动图）时兜底；
 * 3. 都没有就走 `buildDecorUrl`：米游社图床支持 x-oss-process 实时缩放，
 *    HoYoLAB 原图则原样返回。
 *
 * 注意 `animate`：`t` 一定是静态首帧、`m` 是原图（动图有几百 KB 到几 MB），
 * 想播动画时两条捷径都不能走，只能让 OSS 现场缩成动画 webp。
 *
 * @param {{ u?: string, m?: string, t?: string }} item  目录紧凑项（u 原图 / m 镜像 / t 缩略图）
 * @param {object} [options]
 * @param {number} [options.width]    目标宽度（px），会吸附到 DECOR_WIDTH_STEPS；0/缺省 = 原图
 * @param {boolean} [options.flatten] true = 强制静态首帧
 * @param {boolean} [options.animate] true = 必须保留动画帧（覆盖 flatten/缩略图规则）
 * @returns {string}
 */
export function resolvePendantSrc(item, options = {}) {
  if (!item || typeof item !== 'object') return ''
  const thumb = String(item.t || '').trim()
  const mirror = String(item.m || '').trim()
  const original = String(item.u || '').trim()
  const width = snapDecorWidth(options.width || 0)

  // 播动画：t 是静态首帧，m 是未缩放原图，都不能用；OSS 现场缩最小
  if (options.animate) {
    if (original) {
      const animWidth = Math.min(width || DECOR_ANIM_MAX_WIDTH, DECOR_ANIM_MAX_WIDTH) || DECOR_ANIM_MAX_WIDTH
      return buildDecorUrl(original, { width: animWidth, flatten: false })
    }
    return mirror || thumb
  }

  // 缩略图：强制静态（列表/选择器压平动图），或展示尺寸本来就 ≤128px。
  // width=0 是「要原图」的语义，128px 缩略图顶不上清晰度，不套用这条规则。
  if (thumb && ((options.flatten === true) || (width > 0 && width <= 128))) {
    return thumb
  }
  // 镜像：原图尺寸但国内直连快，用于缩略图不够清晰的场景
  if (mirror) return mirror
  return buildDecorUrl(original, options)
}

/**
 * 头像上挂件的最终取图地址（组件展示与切换预热共用同一套规则）。
 *
 * `item.a` 缺失时按静态处理；`playAnimation` 只有配合动图才有意义。
 *
 * @param {{ u?: string, m?: string, t?: string, a?: boolean }} item
 * @param {{ size?: number, playAnimation?: boolean }} [options]
 * @returns {string}
 */
export function resolveAvatarPendantSrc(item, options = {}) {
  if (!item) return ''
  const size = Math.max(16, Number(options.size) || 44)
  const animated = item.a === true
  const animate = animated && options.playAnimation === true
  return resolvePendantSrc(
    { u: item.u, m: item.m, t: item.t },
    { width: size * 2, flatten: animated && !animate, animate }
  )
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
 * 按目录条目解析评论气泡展示地址（`services/mhyDecor/bubbles.js` 的紧凑项）。
 *
 * 气泡与挂件的取图差异在动图：气泡的动图是独立的 `gif` 字段（`u` 恒为静态底图），
 * 不像挂件那样同一张 webp 既可动又可压平，所以这里没有 flatten 语义：
 * - `playAnimation=true` 且 gif 有值 → 直接返回 gif 原地址。gif 不走 OSS
 *   `x-oss-process`：动图缩放费解码、URL 也更长，而 gif 本来就按贴角尺寸出图；
 * - 其余情况复用 `resolvePendantSrc` 的静态链（t ≤128 → m → OSS 缩放 u），
 *   静态底图天然无动画帧，不需要压平。
 *
 * @param {{ u?: string, gif?: string, gif_url?: string, m?: string, t?: string }} bubble
 *        目录紧凑项（u 静态底图 / gif 动图 / m 镜像 / t 缩略图）
 * @param {object} [options]
 * @param {boolean} [options.playAnimation] true = 优先播 gif 动图
 * @param {number} [options.width]    目标宽度（px），会吸附到 DECOR_WIDTH_STEPS；0/缺省 = 原图（仅静态链使用）
 * @returns {string}
 */
export function resolveBubbleSrc(bubble, options = {}) {
  if (!bubble || typeof bubble !== 'object') return ''
  // 兼容紧凑项（gif）与原始行（gif_url）两种入参
  const gif = String(bubble.gif ?? bubble.gif_url ?? '').trim()
  if (options.playAnimation && gif) return gif
  return resolvePendantSrc(
    { u: bubble.u ?? '', m: bubble.m ?? '', t: bubble.t ?? '' },
    { width: options.width || 0, flatten: false }
  )
}
