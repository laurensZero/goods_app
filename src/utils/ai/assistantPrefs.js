// @ts-check
/**
 * AI 助手轻量偏好读取：只碰 localStorage 配置串，不引入 aiChat store。
 * App 全局下拉手势在启动路径上高频判断，不能为了一个开关拉进聊天/工具依赖图。
 */

export const AI_CHAT_CONFIG_STORAGE_KEY = 'goods_ai_chat_config'

/**
 * 只读 AI 配置（不引 aiChat store / chatClient）。
 *
 * 这里刻意只声明识别路径真正用到的 4 个键，而不是复用 chatClient 的
 * `DEFAULT_AI_CONFIG`——那个模块会连带拉进工具循环与上下文压缩依赖图，
 * 而本函数会在添加面板等启动路径上被调用。
 * @returns {{ baseUrl: string, model: string, visionModel: string, apiKey: string }}
 */
export function readAiConfig() {
  const fallback = { baseUrl: '', model: '', visionModel: '', apiKey: '' }
  try {
    const raw = localStorage.getItem(AI_CHAT_CONFIG_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    return {
      baseUrl: String(parsed.baseUrl || '').trim(),
      model: String(parsed.model || '').trim(),
      visionModel: String(parsed.visionModel || '').trim(),
      apiKey: String(parsed.apiKey || '').trim()
    }
  } catch {
    return fallback
  }
}

/** 是否已配置可用于拍照识别（看图）的端点：地址 + Key + 至少一个模型名 */
export function hasVisionRecognitionConfig() {
  const config = readAiConfig()
  return Boolean(config.baseUrl && config.apiKey && (config.visionModel || config.model))
}

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
