// @ts-check
/**
 * AI 助手轻量偏好读取：只碰 localStorage 配置串，不引入 aiChat store。
 * App 全局下拉手势在启动路径上高频判断，不能为了一个开关拉进聊天/工具依赖图。
 */

export const AI_CHAT_CONFIG_STORAGE_KEY = 'goods_ai_chat_config'

/** 默认开启：任意页面顶部下拉可唤起 AI 助手 */
export function isPullDownGestureEnabled() {
  try {
    const raw = localStorage.getItem(AI_CHAT_CONFIG_STORAGE_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw)
    return parsed?.pullDownEnabled !== false
  } catch {
    return true
  }
}
