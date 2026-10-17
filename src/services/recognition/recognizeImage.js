// @ts-check
/**
 * 拍照识别编排：图片 → data URL → 结构化抽取 → 出处校验 → 词表收敛 → 类型收敛。
 *
 * 三道收敛各自独立可测：
 * - 出处校验 `validateGrounding`：模型说这段原文在图里，就得真的在它自己的转写里；
 * - 词表收敛 `mapToPresets`：对齐用户已有品类 / IP / 角色写法；
 * - 类型收敛 `coerceValue`：日期 / 金额格式与表格导入共用同一套规则。
 *
 * 失败原因一律以 **错误码**（`{ code, field }`）返回，不返回中文句子——
 * 文案由 UI 层按 i18n key 渲染（5 语言）。
 */

import { coerceValue, ARRAY_FIELDS } from '@/utils/goods/fieldCoercion'
import { warmPinyinCache } from '@/utils/pinyin'
import { resolveImageForVision } from '@/services/ai/visionImage'
import { applyGrounding } from './validateGrounding'
import { mapFieldToPresets, vocabularyTexts } from './mapToPresets'
import { resolveRecognitionBackend } from './backends'

/** 需要对齐用户词表的字段（其余字段原样做类型收敛） */
const VOCAB_FIELDS = new Set(['category', 'ip', 'characters'])

/** 置信度由低到高 */
const CONFIDENCE_LEVELS = ['low', 'medium', 'high']

/** 未知/缺失的置信度按 medium 处理：可疑但不武断 */
function normalizeConfidence(value) {
  const level = String(value ?? '').trim().toLowerCase()
  return CONFIDENCE_LEVELS.includes(level) ? level : 'medium'
}

function cappedAt(level, cap) {
  return CONFIDENCE_LEVELS.indexOf(level) <= CONFIDENCE_LEVELS.indexOf(cap) ? level : cap
}

function raisedTo(level, floor) {
  return CONFIDENCE_LEVELS.indexOf(level) >= CONFIDENCE_LEVELS.indexOf(floor) ? level : floor
}

/**
 * 识别一张图片。
 * @param {Object} options
 * @param {{ uri: string, localPath?: string, restoreCloud?: (cloudFileName: string) => Promise<string | null> }} options.image
 * @param {import('./backends/types').Vocabulary} [options.vocabulary]
 * @param {string} [options.extraInstructions]
 * @param {string} [options.backendId] 缺省用第一个可用后端
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{
 *   fields: Record<string, { value: any, confidence: string, verified: boolean | null }>,
 *   transcript: string,
 *   warnings: Array<{ code: string, field: string }>
 * }>}
 */
export async function recognizeImage({ image, vocabulary, extraInstructions, backendId, signal }) {
  const backend = resolveRecognitionBackend(backendId)
  if (!backend) {
    throw new Error('还没有可用的识别模型：请先在 AI 助手里配置接口地址、API Key 与「视觉模型」')
  }

  const imageUrl = await resolveImageForVision(image)
  const raw = await backend.extract({ imageUrl, vocabulary, extraInstructions, signal })

  const { fields: grounded, warnings } = applyGrounding(raw?.fields, raw?.evidence, raw?.transcript)
  const transcript = String(raw?.transcript || '')
  if (!transcript.trim()) warnings.push({ code: 'transcript_empty', field: '' })

  await warmVocabularyMatching(grounded, vocabulary)

  /** @type {Record<string, { value: any, confidence: string, verified: boolean | null }>} */
  const fields = {}
  for (const [field, entry] of Object.entries(grounded)) {
    const resolved = resolveField({
      field,
      entry,
      modelConfidence: raw?.confidence?.[field],
      vocabulary,
      warnings
    })
    if (resolved) fields[field] = resolved
  }

  return { fields, transcript, warnings }
}

/**
 * 拼音匹配前预热缓存（pinyin-pro 是动态导入）。失败不影响主流程：
 * 匹配会自动降级为「原文子串」这一级。
 */
async function warmVocabularyMatching(grounded, vocabulary) {
  /** @type {string[]} */
  const texts = [...vocabularyTexts(vocabulary)]
  for (const entry of Object.values(grounded)) {
    if (Array.isArray(entry.value)) texts.push(...entry.value.map(String))
    else texts.push(String(entry.value))
  }
  try {
    await warmPinyinCache(texts)
  } catch {
    // 拼音只是匹配增强项，加载失败时忽略
  }
}

/**
 * 单字段收敛：置信度定级 → 词表对齐 → 类型校验。返回 null 表示这个字段最终留空。
 * @param {Object} params
 * @param {string} params.field
 * @param {{ value: any, sourceText: string, verified: boolean | null }} params.entry
 * @param {string} [params.modelConfidence]
 * @param {import('./backends/types').Vocabulary} [params.vocabulary]
 * @param {Array<{ code: string, field: string }>} params.warnings
 */
function resolveField({ field, entry, modelConfidence, vocabulary, warnings }) {
  let level = normalizeConfidence(modelConfidence)
  let value = entry.value

  // 模型没给出处（无法验证）→ 不采信高置信
  if (entry.verified === null) level = cappedAt(level, 'medium')

  if (VOCAB_FIELDS.has(field)) {
    const mapped = mapFieldToPresets(field, value, vocabulary)
    value = mapped.value
    if (mapped.match === 'exact') {
      // 值恰好等于用户词表里的写法：比模型自评更可信，抬到 high
      level = raisedTo(level, 'high')
    } else {
      level = cappedAt(level, 'medium')
      if (mapped.match === 'none' || mapped.match === 'mixed') {
        warnings.push({ code: 'vocabulary_mismatch', field })
      }
    }
  }

  // low 一律留空：宁可少填，也不让用户去删一个不确定的值
  if (level === 'low') {
    warnings.push({ code: 'low_confidence', field })
    return null
  }

  if (ARRAY_FIELDS.has(field)) {
    const list = (Array.isArray(value) ? value : [value])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
    if (list.length === 0) return null
    return { value: list, confidence: level, verified: entry.verified }
  }

  /** @type {any} */
  let coerced
  try {
    coerced = coerceValue(field, value)
  } catch {
    // 日期 / 金额 / 数量格式不可识别：和表格导入一致地丢弃而不是写脏值
    warnings.push({ code: 'invalid_value', field })
    return null
  }
  if (coerced === undefined) return null

  return { value: coerced, confidence: level, verified: entry.verified }
}

export { CONFIDENCE_LEVELS }
