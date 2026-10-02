/**
 * 外框模板注册表。
 *
 * 每个模板按 1200×1200 设计空间书写几何，渲染器负责缩放到预览/导出尺寸。
 * 新增模板只需要加进 ALL_FRAMES，UI 分类、调色、导出会自动带上。
 *
 * 模板字段：
 *   id              唯一标识，会被存进编辑会话（撤销/重做）
 *   nameKey         i18n key（各语言 common.json 里的扁平 key）
 *   category        分类 id，见 FRAME_CATEGORIES
 *   palette         模板自带配色（画布外层、卡纸、装饰）
 *   colorSlots      用户可调的色槽 [{ key, nameKey }]
 *   colorways       一键配色方案 [{ id, nameKey, palette }]
 *   acceptsBackgroundColor 是否接受导出设置里的「框内背景」颜色
 *   defaultFitRatio 主体在内窗里的默认占比（切换模板时应用）
 *   window          { x, y, w, h, radius } 内窗（设计空间）
 *   drawBehind(api) 主体之下：底纹、卡纸、投影、框内背板
 *   clipSubject(api) 可选，把主体裁成内窗形状
 *   drawOverlay(api) 主体之上：描边、装饰
 *   drawLabels(api, labels) 可选，文字槽位
 */
import { collageFrame, waveFrame } from '@/config/frames/collage'
import { waFrame, vintageFrame } from '@/config/frames/heritage'
import { minimalFrame, photocardFrame } from '@/config/frames/simple'
import { acrylicFrame, filmFrame } from '@/config/frames/texture'

export const FRAME_NONE_ID = 'none'

export const FRAME_CATEGORIES = [
  { id: 'simple', nameKey: 'imageEditor.frameCategorySimple' },
  { id: 'collage', nameKey: 'imageEditor.frameCategoryCollage' },
  { id: 'texture', nameKey: 'imageEditor.frameCategoryTexture' },
  { id: 'classic', nameKey: 'imageEditor.frameCategoryClassic' },
  { id: 'oriental', nameKey: 'imageEditor.frameCategoryOriental' }
]

/** 展示顺序即分类顺序，分类内按设计稿的轻重排。 */
export const ALL_FRAMES = [
  minimalFrame,
  photocardFrame,
  waveFrame,
  collageFrame,
  acrylicFrame,
  filmFrame,
  vintageFrame,
  waFrame
]

export const IMAGE_FRAMES = ALL_FRAMES

export {
  acrylicFrame,
  collageFrame,
  filmFrame,
  minimalFrame,
  photocardFrame,
  vintageFrame,
  waFrame,
  waveFrame
}

export function getFrameById(id) {
  if (!id || id === FRAME_NONE_ID) return null
  return ALL_FRAMES.find((frame) => frame.id === id) || null
}

export function isKnownFrameId(id) {
  return !id || id === FRAME_NONE_ID || ALL_FRAMES.some((frame) => frame.id === id)
}

export function getFramesByCategory(categoryId) {
  if (!categoryId) return ALL_FRAMES
  return ALL_FRAMES.filter((frame) => frame.category === categoryId)
}

export function getColorway(frame, colorwayId) {
  if (!frame || !Array.isArray(frame.colorways)) return null
  return frame.colorways.find((colorway) => colorway.id === colorwayId) || null
}

/**
 * 解析这次要用的色槽值：模板默认 → 选中的配色方案 → 用户逐个色槽的改动。
 * 只输出 colorSlots 里登记的键，未登记的装饰色永远走模板 palette。
 */
export function resolveFrameColors(frame, colorwayId, overrides) {
  if (!frame) return {}
  const resolved = {}
  for (const slot of frame.colorSlots || []) {
    if (frame.palette?.[slot.key]) resolved[slot.key] = frame.palette[slot.key]
  }
  const colorway = getColorway(frame, colorwayId)
  if (colorway) {
    for (const key of Object.keys(resolved)) {
      if (colorway.palette?.[key]) resolved[key] = colorway.palette[key]
    }
  }
  if (overrides && typeof overrides === 'object') {
    for (const key of Object.keys(resolved)) {
      if (overrides[key]) resolved[key] = overrides[key]
    }
  }
  return resolved
}
