/**
 * 意境外框的贴纸/字体素材（Twemoji 图形 CC-BY 4.0、Baloo 2 字体 SIL OFL 1.1，署名见「关于」页）。
 *
 * SVG 以 ?raw 打包进 JS，运行时拼成 data URL 再加载成 Image：
 * - data URL 在 Capacitor file:// / tauri:// / http(s) 下都不会污染画布，也不依赖 base 路径；
 * - Twemoji 的 SVG 根节点只有 viewBox 没有宽高，drawImage 需要固有尺寸，这里统一注入。
 *
 * 加载完成后会「烘焙」一圈白色模切边（沿 alpha 轮廓向 12 个方向偏移取并集再上白），
 * 让贴纸图呈现手帐贴纸的压边质感；烘焙失败时退化为原图。
 * 艺术字字体（FrameArt）也在这里一并预载，失败时模板退回系统字体。
 */
import { ART_FONT_B64 } from './sweetsFont'
import cloudSvg from './stickers/2601.svg?raw'
import cookieSvg from './stickers/1f36a.svg?raw'
import croissantSvg from './stickers/1f950.svg?raw'
import leafSvg from './stickers/1f343.svg?raw'
import moonSvg from './stickers/1f315.svg?raw'
import puddingSvg from './stickers/1f36e.svg?raw'
import rabbitSvg from './stickers/1f407.svg?raw'
import riceSvg from './stickers/1f33e.svg?raw'
import sakuraSvg from './stickers/1f338.svg?raw'
import shortcakeSvg from './stickers/1f370.svg?raw'
import sparklesSvg from './stickers/2728.svg?raw'
import strawberrySvg from './stickers/1f353.svg?raw'
import sunSvg from './stickers/2600.svg?raw'

const RAW_SVGS = {
  cloud: cloudSvg,
  cookie: cookieSvg,
  croissant: croissantSvg,
  leaf: leafSvg,
  moon: moonSvg,
  pudding: puddingSvg,
  rabbit: rabbitSvg,
  rice: riceSvg,
  sakura: sakuraSvg,
  shortcake: shortcakeSvg,
  sparkles: sparklesSvg,
  strawberry: strawberrySvg,
  sun: sunSvg
}

/** 贴纸原图按 512px 光栅，四周再留出白边烘焙空间。 */
const RASTER_SIZE = 512
const BAKE_BORDER = 22
const BAKE_PAD = BAKE_BORDER + 6

const dataUrlCache = new Map()
const imageCache = new Map()
let loadPromise = null

/** 甜点手帐标题的艺术字（Baloo 2）；加载失败时模板退回系统字体。 */
function ensureArtFont() {
  return (async () => {
    try {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return
      const face = new FontFace('FrameArt', `url(data:font/woff2;base64,${ART_FONT_B64})`, { weight: '700' })
      await face.load()
      document.fonts.add(face)
    } catch (error) {
      // 字体不可用不影响出图
    }
  })()
}

function toDataUrl(name) {
  const cached = dataUrlCache.get(name)
  if (cached) return cached
  const raw = RAW_SVGS[name]
  if (!raw) return ''
  const withSize = raw.replace('<svg ', `<svg width="${RASTER_SIZE}" height="${RASTER_SIZE}" `)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withSize)}`
  dataUrlCache.set(name, url)
  return url
}

/** 给贴纸图烘焙一圈白色模切边；环境不支持时返回 null。 */
function bakeDieCutBorder(image) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = RASTER_SIZE + BAKE_PAD * 2
    canvas.height = RASTER_SIZE + BAKE_PAD * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // 12 个方向偏移叠加 → alpha 轮廓向外膨胀一圈；再整面上白，得到白边剪影
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2
      ctx.drawImage(
        image,
        BAKE_PAD + Math.cos(angle) * BAKE_BORDER,
        BAKE_PAD + Math.sin(angle) * BAKE_BORDER,
        RASTER_SIZE,
        RASTER_SIZE
      )
    }
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(image, BAKE_PAD, BAKE_PAD, RASTER_SIZE, RASTER_SIZE)
    return canvas
  } catch (error) {
    return null
  }
}

/** 同步取已就绪的贴纸图（已带白边）；未预载完成时返回 null（模板跳过这张贴纸）。 */
export function getStickerImage(name) {
  return imageCache.get(name) || null
}

/** 预载并烘焙全部贴纸 + 艺术字字体，幂等；失败不 reject（缺的自动跳过，画面退化但不阻塞导出）。 */
export function ensureStickerImages() {
  if (!loadPromise) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      loadPromise = Promise.resolve()
      return loadPromise
    }
    loadPromise = Promise.all([
      ...Object.keys(RAW_SVGS).map(
        (name) =>
          new Promise((resolve) => {
            const image = new Image()
            image.onload = () => {
              imageCache.set(name, bakeDieCutBorder(image) || image)
              resolve()
            }
            image.onerror = () => resolve()
            image.src = toDataUrl(name)
          })
      ),
      ensureArtFont()
    ])
  }
  return loadPromise
}

/** 仅供测试：确认素材清单完整。 */
export const STICKER_NAMES = Object.keys(RAW_SVGS)
