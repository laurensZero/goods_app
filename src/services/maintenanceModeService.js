// src/services/maintenanceModeService.js
// 维护模式服务 - 基于 sync_manifest.maintenance_mode 缓存，零额外网络请求
//
// 维护模式状态从 sync_manifest 表的 maintenance_mode JSONB 字段读取，
// 在每次同步时自动缓存到 sync store 的 maintenanceMode ref 中。
// 本模块只提供检查工具函数，不做网络请求。

// 功能标识符
export const FEATURE_KEYS = {
  GOODS_IMAGE: 'goods_image',
  EVENT_PHOTO: 'event_photo',
  GOODS_DATA: 'goods_data',
  FEEDBACK_ATTACHMENT: 'feedback_attachment',
  SYNC_ALL: 'sync_all'
}

/**
 * 检查维护模式是否禁用了某个功能
 * @param {Object|null} maintenanceMode - 从 sync manifest 缓存的维护模式状态
 * @param {string} featureKey - 功能标识符
 * @returns {boolean} true 表示功能被禁止
 */
export function isFeatureBlocked(maintenanceMode, featureKey) {
  if (!maintenanceMode || !maintenanceMode.enabled) return false
  const blocks = maintenanceMode.blocks || []
  // sync_all 禁止所有功能
  if (blocks.includes(FEATURE_KEYS.SYNC_ALL)) return true
  return blocks.includes(featureKey)
}

/**
 * 获取维护模式提示信息
 * @param {Object|null} maintenanceMode - 从 sync manifest 缓存的维护模式状态
 * @param {string} featureKey - 功能标识符
 * @returns {string|null} 提示信息，如果功能可用则返回 null
 */
export function getMaintenanceMessage(maintenanceMode, featureKey) {
  if (!isFeatureBlocked(maintenanceMode, featureKey)) return null
  return maintenanceMode.message || '该功能正在维护中，请稍后再试'
}

/**
 * 检查是否允许上传商品图片
 */
export function canUploadGoodsImage(maintenanceMode) {
  return !isFeatureBlocked(maintenanceMode, FEATURE_KEYS.GOODS_IMAGE)
}

/**
 * 检查是否允许上传活动照片
 */
export function canUploadEventPhoto(maintenanceMode) {
  return !isFeatureBlocked(maintenanceMode, FEATURE_KEYS.EVENT_PHOTO)
}

/**
 * 检查是否允许同步商品数据
 */
export function canSyncGoodsData(maintenanceMode) {
  return !isFeatureBlocked(maintenanceMode, FEATURE_KEYS.GOODS_DATA)
}

/**
 * 检查是否允许上传反馈附件
 */
export function canUploadFeedbackAttachment(maintenanceMode) {
  return !isFeatureBlocked(maintenanceMode, FEATURE_KEYS.FEEDBACK_ATTACHMENT)
}

/**
 * 检查是否允许同步功能
 */
export function canSync(maintenanceMode) {
  return !isFeatureBlocked(maintenanceMode, FEATURE_KEYS.SYNC_ALL)
}

/**
 * 创建维护模式错误
 */
export class MaintenanceModeError extends Error {
  constructor(featureKey, message) {
    super(message)
    this.name = 'MaintenanceModeError'
    this.featureKey = featureKey
  }
}
