// @ts-check
/**
 * 多模态（视觉）补全：把一张图 + 提问发给 OpenAI 兼容接口的 chat/completions。
 * 仅在用户明确要求看图时由 vision_analyze 工具调用，不在附图消息上自动触发。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'

const VISION_TIMEOUT_MS = 120000

/** 视觉请求用的默认描述提示词（用户未给问题时） */
export const DEFAULT_VISION_PROMPT =
  '请客观描述这张图片：主体内容、关键特征（颜色/文字/图案/物品类型），以及任何可识别的细节。如果是谷子/周边商品，请说明可能的角色、IP、品类与成色线索。'

/** @param {AbortSignal} [signal] */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('已停止生成', 'AbortError')
}

/**
 * 用户中止：让调用方立刻结束等待（底层 HTTP 在原生端无法真正 cancel，只能放弃结果）。
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
function raceWithAbort(promise, signal) {
  if (!signal) return promise
  throwIfAborted(signal)
  let onAbort
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      onAbort = () => reject(new DOMException('已停止生成', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
    })
  ]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  })
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {unknown} body
 * @param {AbortSignal} [externalSignal]
 * @returns {Promise<any>}
 */
async function postJson(url, headers, body, externalSignal) {
  throwIfAborted(externalSignal)

  if (Capacitor.isNativePlatform()) {
    let timeoutId
    try {
      // CapacitorHttp 无法真正中断在途请求；race 外部 abort 让用户点停止后立刻放行
      const response = await raceWithAbort(
        Promise.race([
          CapacitorHttp.request({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            data: body,
            connectTimeout: VISION_TIMEOUT_MS,
            readTimeout: VISION_TIMEOUT_MS
          }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error(`视觉请求超时（${VISION_TIMEOUT_MS / 1000}s）`)),
              VISION_TIMEOUT_MS
            )
          })
        ]),
        externalSignal
      )
      const status = Number(response?.status || 0)
      const data = typeof response?.data === 'string' ? tryParse(response.data) : response?.data
      if (status >= 400) throw new Error(`视觉请求失败（HTTP ${status}）：${extractDetail(data)}`)
      return data
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`视觉请求失败（HTTP ${response.status}）：${extractDetail(text)}`)
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      if (externalSignal?.aborted) throw new DOMException('已停止生成', 'AbortError')
      throw new Error(`视觉请求超时（${VISION_TIMEOUT_MS / 1000}s）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

/** @param {string} text */
function tryParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** @param {unknown} data */
function extractDetail(data) {
  if (typeof data === 'string') return data.slice(0, 300) || '(空响应)'
  const message = data?.error?.message || data?.message
  if (typeof message === 'string') return message
  try {
    return JSON.stringify(data).slice(0, 300)
  } catch {
    return '(无法解析的响应)'
  }
}

/**
 * 执行一次视觉对话补全（非流式，单轮，无工具）。
 * @param {Object} options
 * @param {{ baseUrl: string, model: string, apiKey: string }} options.config
 * @param {string} [options.visionModel] 留空则用 config.model
 * @param {string} options.imageUrl 已是 data:image/...;base64,... 或可公开访问的 http(s) URL
 * @param {string} [options.prompt] 用户想了解的内容；缺省用 DEFAULT_VISION_PROMPT
 * @param {AbortSignal} [options.signal] 用户停止生成时中断等待（抛 AbortError）
 * @returns {Promise<string>} 模型对图片的描述文本
 */
export async function runVisionCompletion({ config, visionModel, imageUrl, prompt, signal }) {
  throwIfAborted(signal)
  const baseUrl = String(config?.baseUrl || '').trim().replace(/\/+$/, '')
  const model = String(visionModel || config?.model || '').trim()
  const apiKey = String(config?.apiKey || '').trim()
  if (!baseUrl) throw new Error('未配置 AI 接口地址')
  if (!model) throw new Error('未配置模型名称')
  if (!apiKey) throw new Error('未配置 API Key')
  if (!imageUrl) throw new Error('缺少图片数据')

  const data = await postJson(
    `${baseUrl}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: String(prompt || '').trim() || DEFAULT_VISION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
      // 刻意不传 max_tokens：部分推理/网关会把 tiny 上限整个烧在思考上返回空 content
    },
    signal
  )

  const choice = data?.choices?.[0]
  const message = choice?.message || {}
  const content = String(message.content || '').trim()
  if (content) return content

  // 推理模型常见：正文在 content 为空、答案写在 reasoning / reasoning_content
  const reasoning = String(message.reasoning_content ?? message.reasoning ?? '').trim()
  if (reasoning) return reasoning

  const finishReason = String(choice?.finish_reason || '')
  if (finishReason === 'length') {
    throw new Error('视觉模型输出被截断（finish_reason=length），请换用支持图片输入且输出充足的视觉模型')
  }
  throw new Error(
    '视觉模型返回了空回复。请在设置里把「视觉模型」改成支持图片输入的多模态模型（如 gpt-4o / qwen-vl 等），再重试'
  )
}
