// @ts-check
/**
 * Whisper 兼容语音识别：把录音文件 POST 到 `{baseUrl}/audio/transcriptions`。
 * 与聊天/视觉同一套 baseUrl + apiKey；asrModel 缺省 whisper-1。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { normalizeBaseUrl } from './chatClient'

const ASR_TIMEOUT_MS = 90000

/** MediaRecorder MIME → 上传文件扩展名（Whisper 接受的常见容器） */
const MIME_EXT = [
  ['audio/webm', '.webm'],
  ['audio/ogg', '.ogg'],
  ['audio/mp4', '.m4a'],
  ['audio/x-m4a', '.m4a'],
  ['audio/mpeg', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/wave', '.wav'],
  ['audio/x-wav', '.wav']
]

/**
 * @param {string} mime
 * @returns {string}
 */
export function pickAudioExtension(mime) {
  const value = String(mime || '').toLowerCase()
  for (const [prefix, ext] of MIME_EXT) {
    if (value.includes(prefix)) return ext
  }
  return '.webm'
}

/** @param {string} baseUrl */
export function buildTranscriptionsUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/audio/transcriptions`
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

/** @param {string} text */
function tryParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @param {Record<string, string>} headers
 * @param {string} url
 * @param {string} model
 * @returns {Promise<any>}
 */
async function postTranscriptionNative(blob, filename, headers, url, model) {
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', model)

  let timeoutId
  try {
    const response = await Promise.race([
      CapacitorHttp.request({
        url,
        method: 'POST',
        headers,
        data: form,
        connectTimeout: ASR_TIMEOUT_MS,
        readTimeout: ASR_TIMEOUT_MS
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`语音识别超时（${ASR_TIMEOUT_MS / 1000}s）`)),
          ASR_TIMEOUT_MS
        )
      })
    ])
    const status = Number(response?.status || 0)
    const data = typeof response?.data === 'string' ? tryParse(response.data) : response?.data
    if (status >= 400) {
      throw new Error(`语音识别失败（HTTP ${status}）：${extractDetail(data)}`)
    }
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @param {Record<string, string>} headers
 * @param {string} url
 * @param {string} model
 * @returns {Promise<any>}
 */
async function postTranscriptionWeb(blob, filename, headers, url, model) {
  const base = normalizeBaseUrl(url.replace(/\/audio\/transcriptions$/, ''))
  const isDev = import.meta.env.DEV
  const requestUrl = isDev
    ? `${window.location.origin}/ai-proxy/audio/transcriptions`
    : url
  const requestHeaders = isDev
    ? { ...headers, 'x-ai-target': base }
    : { ...headers }

  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', model)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ASR_TIMEOUT_MS)
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: form,
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`语音识别失败（HTTP ${response.status}）：${extractDetail(text)}`)
    }
    return tryParse(text)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`语音识别超时（${ASR_TIMEOUT_MS / 1000}s）`)
    }
    if (e instanceof TypeError) {
      throw new Error('网络请求失败：请检查接口地址是否可达（或 dev server 的 /ai-proxy 是否可用）')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 识别一段录音，返回文本。
 * @param {Object} options
 * @param {{ baseUrl: string, apiKey: string, asrModel?: string }} options.config
 * @param {Blob} options.blob MediaRecorder 产出的音频
 * @param {string} [options.mimeType]
 * @returns {Promise<string>}
 */
export async function transcribeAudio({ config, blob, mimeType }) {
  const baseUrl = String(config?.baseUrl || '').trim()
  const apiKey = String(config?.apiKey || '').trim()
  if (!baseUrl || !apiKey) {
    throw new Error('请先填写接口地址和 API Key')
  }
  if (!blob || blob.size === 0) {
    throw new Error('录音为空，请重试')
  }

  const model = String(config?.asrModel || '').trim() || 'whisper-1'
  const filename = `voice${pickAudioExtension(mimeType || blob.type)}`
  const url = buildTranscriptionsUrl(baseUrl)
  const headers = { Authorization: `Bearer ${apiKey}` }

  const data = Capacitor.isNativePlatform()
    ? await postTranscriptionNative(blob, filename, headers, url, model)
    : await postTranscriptionWeb(blob, filename, headers, url, model)

  const text = String(
    (data && typeof data === 'object' && 'text' in data ? data.text : data) ?? ''
  ).trim()
  if (!text) {
    throw new Error('语音识别未返回文字（端点可能不支持 /audio/transcriptions）')
  }
  return text
}
