// @ts-check
/**
 * 外框「二次编辑」配方。
 *
 * 只描述外框这一层可编辑的东西：款式 / 配色方案 / 单槽调色 / 主体占比 / 框内背景色 / 文字日期。
 * 裁切、抠图、亮度对比度饱和度**不在配方里**——它们已经烘进「去框底图」，
 * 这是 T2 能力边界（要回退需要 T3，存储再翻一倍）。见 docs/frame-reedit-plan.md。
 *
 * 本模块是纯函数，不碰 DB / 文件系统，方便单测。
 */
import { FRAME_NONE_ID, getFrameById } from '@/config/imageFrames'

export const IMAGE_EDIT_RECIPE_VERSION = 1
export const MIN_FIT_RATIO = 0.4
export const MAX_FIT_RATIO = 1
export const DEFAULT_FIT_RATIO_PERCENT = 88

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const LABEL_DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/

/**
 * @param {unknown} value
 * @returns {string} 归一化后的 #rrggbb，非法值返回空串
 */
export function normalizeHexColor(value) {
  const text = String(value ?? '').trim()
  if (!HEX_COLOR_RE.test(text)) return ''
  return text.toLowerCase()
}

/**
 * @param {unknown} value
 * @returns {number} 0.4 ~ 1
 */
export function normalizeFitRatio(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return MAX_FIT_RATIO
  return Math.round(Math.min(MAX_FIT_RATIO, Math.max(MIN_FIT_RATIO, num)) * 1000) / 1000
}

/**
 * 只保留模板登记过的色槽，顺手丢掉非法色值。
 * 模板改版删掉某个槽位后，老配方里那一项会被静默忽略而不是把颜色画错。
 * @param {unknown} raw
 * @param {any} frame
 * @returns {Record<string, string>}
 */
export function normalizeColorOverrides(raw, frame) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const validKeys = new Set(
    (frame?.colorSlots || []).map((slot) => String(slot?.key || '')).filter(Boolean)
  )
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!validKeys.has(key)) continue
    const hex = normalizeHexColor(value)
    if (hex) out[key] = hex
  }
  return out
}

/**
 * 由编辑器当前状态生成配方。
 *
 * 没套外框（`none`）时返回 `null`：此时成品图本身就是干净底图，没有可二次编辑的外框状态，
 * 也就不该为它多存一份底图文件。
 *
 * @param {{ frameId?: string, colorwayId?: string, colorOverrides?: Record<string, string>, fitRatioPercent?: number, bgColor?: string, labelsDate?: string }} state
 * @returns {null | { version: number, frameId: string, colorwayId: string, colorOverrides: Record<string, string>, fitRatio: number, bgColor: string, labelsDate: string }}
 */
export function buildImageEditRecipe(state = {}) {
  const frameId = String(state.frameId || '')
  if (!frameId || frameId === FRAME_NONE_ID) return null
  const frame = getFrameById(frameId)
  if (!frame) return null

  const percent = Number(state.fitRatioPercent)
  const fitRatio = normalizeFitRatio(percent > 0 ? percent / 100 : undefined)
  const colorways = Array.isArray(frame.colorways) ? frame.colorways : []
  const colorway = colorways.find((item) => item?.id === state.colorwayId)

  return {
    version: IMAGE_EDIT_RECIPE_VERSION,
    frameId: frame.id,
    colorwayId: colorway ? String(colorway.id) : String(colorways[0]?.id || ''),
    colorOverrides: normalizeColorOverrides(state.colorOverrides, frame),
    fitRatio,
    bgColor: normalizeHexColor(state.bgColor) || '#ffffff',
    labelsDate: LABEL_DATE_RE.test(String(state.labelsDate || '').trim())
      ? String(state.labelsDate).trim()
      : ''
  }
}

/**
 * 读回配方时的校验：模板不认识 / 版本比本机新 → 当作没有配方（UI 会顺势隐藏二次编辑入口），
 * 而不是硬套一个可能画错的框。
 *
 * @param {unknown} raw
 * @returns {ReturnType<typeof buildImageEditRecipe>}
 */
export function normalizeImageEditRecipe(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const version = Number(/** @type {any} */ (raw).version) || 0
  if (version > IMAGE_EDIT_RECIPE_VERSION) return null

  const frame = getFrameById(String(/** @type {any} */ (raw).frameId || ''))
  if (!frame) return null

  const colorways = Array.isArray(frame.colorways) ? frame.colorways : []
  const colorwayId = String(/** @type {any} */ (raw).colorwayId || '')
  const colorway = colorways.find((item) => item?.id === colorwayId)

  return {
    version: IMAGE_EDIT_RECIPE_VERSION,
    frameId: frame.id,
    colorwayId: colorway ? String(colorway.id) : String(colorways[0]?.id || ''),
    colorOverrides: normalizeColorOverrides(/** @type {any} */ (raw).colorOverrides, frame),
    fitRatio: normalizeFitRatio(/** @type {any} */ (raw).fitRatio),
    bgColor: normalizeHexColor(/** @type {any} */ (raw).bgColor) || '#ffffff',
    labelsDate: LABEL_DATE_RE.test(String(/** @type {any} */ (raw).labelsDate || '').trim())
      ? String(/** @type {any} */ (raw).labelsDate).trim()
      : ''
  }
}

/**
 * 同步白名单用的宽松版本。
 *
 * 本机不认识的配方（模板已删 / 比本机新的版本）**不能**在归一化时丢掉：
 * 那会在下一次推送时把别的设备写的新配方抹成空。所以结构看起来还像配方的就原样留着；
 * 真正要用它渲染时再走 `normalizeImageEditRecipe`（不认识的配方自然退化成普通编辑）。
 *
 * @param {unknown} raw
 * @returns {Record<string, any> | null}
 */
export function preserveImageEditRecipe(raw) {
  const normalized = normalizeImageEditRecipe(raw)
  if (normalized) return normalized
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const candidate = /** @type {Record<string, any>} */ (raw)
  if (!String(candidate.frameId || '').trim()) return null
  if (!Number.isFinite(Number(candidate.version))) return null
  return { ...candidate }
}
