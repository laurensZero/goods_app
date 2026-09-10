// @ts-check
/**
 * 视觉工具：vision_analyze
 *
 * 设计约束：聊天里即使已附带图片，也不自动送多模态——只有用户明确要求
 * 查看/识别/分析图片内容时，模型才应调用本工具（见 aiChat 系统提示词）。
 *
 * image 参数可填：
 * - 附件序号（"1"、"2"…，对应当前消息附件列表）
 * - att:<id>（同会话历史附件）
 * - 完整 data: URL / http(s) URL
 * - cloud-image:// 文件引用
 * - goods_detail / event_tracks 返回的图片 uri
 */

import { runVisionCompletion } from './visionClient'
import { resolveImageForVision } from './visionImage'

/** @type {import('@/services/mcp/toolDefinitions').McpToolDefinition[]} */
export const VISION_TOOL_DEFINITIONS = [
  {
    name: 'vision_analyze',
    description:
      '调用多模态模型查看一张图片并返回描述。仅当用户明确要求查看/识别/描述/分析图片内容时才调用；用户只是发图闲聊或问收藏数据时不要调用。image 可为附件序号（如 "1"）、att:<id>、图片 URL、cloud-image 链接或工具返回的图片 uri。',
    inputSchema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: '附件序号（"1"/"2"）、att:<id> 或图片地址（data:/http(s)/cloud-image:// 等）'
        },
        question: {
          type: 'string',
          description: '想了解什么（角色、IP、成色、文字、是否同款等）；缺省做客观描述'
        }
      },
      required: ['image']
    }
  }
]

/**
 * @param {Object} deps
 * @param {() => { baseUrl: string, model: string, apiKey: string, visionModel?: string }} deps.getConfig
 * @param {() => Array<{ id?: string, uri: string, localPath?: string }>} deps.getAttachments 当前会话待分析附件
 * @param {(token: string) => { uri: string, localPath?: string }} [deps.resolveSource]
 *   自定义取图（序号 / att:<id> / 原样 URI）；缺省时纯数字走 getAttachments，其余当 URI
 * @param {(cloudFileName: string) => Promise<string | null>} [deps.restoreCloud] 云端图片 → data URL
 */
export function createVisionToolHandlers({ getConfig, getAttachments, resolveSource, restoreCloud }) {
  /** @param {Record<string, any>} args */
  async function vision_analyze(args) {
    const raw = String(args?.image || '').trim()
    if (!raw) throw new Error('image 必填')

    const source = typeof resolveSource === 'function'
      ? resolveSource(raw)
      : fallbackResolveSource(raw, getAttachments)
    const config = getConfig()
    const description = await runVisionCompletion({
      config,
      visionModel: config.visionModel,
      imageUrl: await resolveImageForVision({
        uri: source.uri,
        localPath: source.localPath,
        restoreCloud
      }),
      prompt: String(args?.question || '').trim()
    })
    return { description }
  }

  return { vision_analyze }
}

/**
 * @param {string} raw
 * @param {() => Array<{ uri: string, localPath?: string }>} getAttachments
 */
function fallbackResolveSource(raw, getAttachments) {
  if (/^\d+$/.test(raw)) {
    const list = getAttachments?.() || []
    const hit = list[Number(raw) - 1]
    if (!hit?.uri && !hit?.localPath) {
      throw new Error(`附件 #${raw} 不存在（当前共 ${list.length} 张）`)
    }
    return hit
  }
  return { uri: raw }
}
