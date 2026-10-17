// @ts-check
/**
 * 「自己的 API」识别后端（P0 唯一实现）。
 *
 * 把图片交给用户自己配置的 OpenAI 兼容多模态端点做结构化抽取。
 * 刻意不自带任何默认 baseUrl / 模型：识别永远只走用户显式配置的端点，
 * 不做任何「悄悄切到别的后端」的兜底（那会花用户自己的额度）。
 */

import { readAiConfig, hasVisionRecognitionConfig } from '@/utils/ai/assistantPrefs'
import { runStructuredExtraction } from '@/services/ai/structuredExtraction'

/** @type {import('./types').RecognitionBackend} */
export const visionBackend = {
  id: 'vision',

  /** @returns {boolean} 是否已配置到可用（同步，仅读 localStorage） */
  available() {
    return hasVisionRecognitionConfig()
  },

  /**
   * @param {import('./types').ExtractOptions} options
   * @returns {Promise<import('./types').RawExtraction>}
   */
  async extract({ imageUrl, vocabulary, extraInstructions, signal }) {
    const config = readAiConfig()
    return runStructuredExtraction({
      config,
      visionModel: config.visionModel,
      imageUrl,
      vocabulary,
      extraInstructions,
      signal
    })
  }
}
