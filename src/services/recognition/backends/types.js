// @ts-check
/**
 * 识别后端的共享类型（JSDoc，无运行时产物）。
 */

/**
 * @typedef {Object} Vocabulary
 * @property {string[]} [categories]
 * @property {string[]} [ips]
 * @property {string[]} [characters]
 */

/**
 * @typedef {Object} RawExtraction
 * @property {string} transcript 模型回写的完整转写
 * @property {Record<string, any>} fields 抽取到的字段
 * @property {Record<string, string>} evidence 每个字段依据的原文片段
 * @property {Record<string, string>} confidence 每个字段的置信度 high/medium/low
 */

/**
 * @typedef {Object} ExtractOptions
 * @property {string} imageUrl data URL 或可公开访问的 URL
 * @property {Vocabulary} [vocabulary] 用户已有词表（注入提示词，并用于本地收敛）
 * @property {string} [extraInstructions] 调用方补充的场景说明
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} RecognitionBackend
 * @property {string} id
 * @property {() => boolean} available
 * @property {(options: ExtractOptions) => Promise<RawExtraction>} extract
 */

export {}
