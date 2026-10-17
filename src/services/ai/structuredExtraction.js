// @ts-check
/**
 * 结构化抽取：一张图 → 严格 JSON 字段（拍照识别用）。
 *
 * 与 `vision_analyze` 的区别：那个返回自然语言描述给人看，这个返回可编程消费的字段。
 *
 * 防编造靠三件事：
 * ① schema 强制要求 `transcript`（完整转写）+ `evidence`（每个字段的原文出处）；
 * ② 本地做出处校验，见 `services/recognition/validateGrounding.js`；
 * ③ 填错的代价由「用户确认后才落库」兜底。
 *
 * 兼容性：首选 `response_format=json_object`（最接近已验证可用的普通请求，参数最少、
 * 网关最不容易拒），端点不认时才改用 tool_calls 强制提交。两种形状的返回都从同一处解析
 * （正文 JSON 含 ```json 围栏，或工具参数）。
 */

import {
  postVisionJson,
  resolveVisionEndpoint,
  throwIfAborted,
  buildVisionUserMessage
} from './visionClient'
import { ARRAY_FIELDS } from '@/utils/goods/fieldCoercion'

/** 结构化抽取的工具名（与提示词里的要求一致） */
export const STRUCTURED_TOOL_NAME = 'submit_goods_fields'

/**
 * 抽取目标字段（名称统一用谷子字段名，队列侧的 `date` / `charactersText` 由预填适配层映射）。
 *
 * 金额刻意拆两个字段，而不是让模型在一个 `price` 里二选一：`goods.price` 是标价口径、
 * `goods.actualPrice` 是实付口径，混在一起会让统计与详情页按错口径展示。队列暂时只有
 * 标价格（缺实付格）是队列自己的事，不反向约束识别设计。
 *
 * 刻意不抽 `note` / `quantity` / `variant` 等「将来详情页也许用得上」的字段：
 * 没有消费方的抽取只增加编造面与提示词长度。后续要扩展，改这一行即可。
 * 数组字段的判定统一取自 fieldCoercion.ARRAY_FIELDS，避免两处各写一份「哪些字段是数组」。
 */
export const EXTRACTION_FIELDS = [
  { key: 'name', description: '谷子名称（订单/商品标题去掉店铺名与促销语后的主体）' },
  { key: 'category', description: '品类，如 吧唧 / 立牌 / 挂件 / 亚克力 / 毛绒' },
  { key: 'ip', description: '作品 / IP，如 原神 / 崩坏：星穹铁道' },
  { key: 'characters', description: '角色名列表' },
  { key: 'price', description: '标价 / 官方售价 / 原价（商品标价、订单里的商品原价、吊牌价）。只填数字，不要货币符号' },
  { key: 'actualPrice', description: '实付 / 成交 / 到手价（订单的实付款、闲鱼成交价；同一图里标价与实付都有时，这一项填实付）。只填数字，不要货币符号' },
  { key: 'acquiredAt', description: '下单或购入日期，格式 YYYY-MM-DD' }
]

/** 每个字段的 JSON 类型（数组字段以 fieldCoercion 为准） */
function fieldType(key) {
  return ARRAY_FIELDS.has(key) ? 'array' : 'string'
}

/** 词汇表注入提示词时的条数上限，防止超长提示词 */
const VOCAB_PROMPT_LIMIT = 200

/**
 * 组装抽取提示词。
 * @param {Object} [options]
 * @param {{ categories?: string[], ips?: string[], characters?: string[] }} [options.vocabulary]
 * @param {string} [options.extraInstructions] 调用方补充的场景说明（如「这是订单截图」）
 * @returns {string}
 */
export function buildExtractionPrompt({ vocabulary, extraInstructions } = {}) {
  const fieldLines = EXTRACTION_FIELDS
    .map((f) => `${f.key}${fieldType(f.key) === 'array' ? '（数组）' : ''}：${f.description}`)
    .join('\n')

  const vocabBlock = buildVocabularyBlock(vocabulary)
  const extra = String(extraInstructions || '').trim()

  return [
    '你在把一张截图或照片里的谷子（动漫/游戏周边）信息抽取成结构化字段。',
    '只输出一个 JSON 对象，不要输出任何其它文字，不要用 markdown 代码块。',
    '',
    '规则：',
    '1. transcript：逐字转写图中全部可见文字，保留原文，不要翻译、不要概括、不要改写。',
    '2. fields：只填图中确实存在的信息；没有或不确定就留空字符串 / 空数组，禁止靠常识补全。',
    '3. evidence：为每个已填字段给出依据的原文片段，必须逐字复制自 transcript。',
    '4. confidence：high=原文明确；medium=需要推断（如从「实付」推断成交价）；low=不确定。',
    '',
    '目标字段：',
    fieldLines,
    vocabBlock,
    extra
  ].filter((line) => line !== '').join('\n')
}

/**
 * 词汇表段落：提示模型优先用用户已有写法，但不限制它照实填写新名称。
 * @param {{ categories?: string[], ips?: string[], characters?: string[] }} [vocabulary]
 */
function buildVocabularyBlock(vocabulary) {
  const lines = []
  const push = (label, list) => {
    const values = (Array.isArray(list) ? list : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, VOCAB_PROMPT_LIMIT)
    if (values.length > 0) lines.push(`${label}：${values.join('、')}`)
  }
  push('用户已有品类', vocabulary?.categories)
  push('用户已有 IP', vocabulary?.ips)
  push('用户已有角色', vocabulary?.characters)
  if (lines.length === 0) return ''
  return ['', '用户已有词汇（同一事物请优先使用以下完全一致的写法；图中出现的其它名称照实填写）：', ...lines].join('\n')
}

/**
 * 组装提交字段的工具定义（JSON Schema）。
 * 刻意不用 enum 限定词汇：模型在拿不准时会把值硬塞进最接近的枚举项，比留空更糟，
 * 也会丢掉用户词表里还没有的新 IP/角色。约束交给「出处校验 + 置信度 + 用户确认」。
 * @param {{ categories?: string[], ips?: string[], characters?: string[] }} [vocabulary]
 */
export function buildExtractionTool(vocabulary) {
  /** @type {Record<string, any>} */
  const fieldProps = {}
  /** @type {Record<string, any>} */
  const evidenceProps = {}
  /** @type {Record<string, any>} */
  const confidenceProps = {}
  for (const field of EXTRACTION_FIELDS) {
    fieldProps[field.key] = fieldType(field.key) === 'array'
      ? { type: 'array', items: { type: 'string' }, description: field.description }
      : { type: 'string', description: field.description }
    evidenceProps[field.key] = { type: 'string', description: `字段 ${field.key} 依据的原文片段` }
    confidenceProps[field.key] = { type: 'string', enum: ['high', 'medium', 'low'] }
  }

  return {
    type: 'function',
    function: {
      name: STRUCTURED_TOOL_NAME,
      description: '提交从图片中抽取到的谷子字段。',
      parameters: {
        type: 'object',
        properties: {
          transcript: { type: 'string', description: '图中全部可见文字的逐字转写' },
          fields: { type: 'object', properties: fieldProps, description: '抽取到的字段；未识别到的字段不要出现或留空' },
          evidence: { type: 'object', properties: evidenceProps, description: '每个已填字段的原文出处' },
          confidence: { type: 'object', properties: confidenceProps, description: '每个已填字段的置信度' }
        },
        required: ['transcript', 'fields']
      }
    }
  }
}

/**
 * 执行一次结构化抽取。
 * @param {Object} options
 * @param {{ baseUrl: string, model: string, apiKey: string }} options.config
 * @param {string} [options.visionModel] 留空则用 config.model
 * @param {string} options.imageUrl data URL 或可公开访问的 URL
 * @param {{ categories?: string[], ips?: string[], characters?: string[] }} [options.vocabulary]
 * @param {string} [options.extraInstructions]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ transcript: string, fields: Record<string, any>, evidence: Record<string, string>, confidence: Record<string, string> }>}
 */
export async function runStructuredExtraction({
  config,
  visionModel,
  imageUrl,
  vocabulary,
  extraInstructions,
  signal
}) {
  throwIfAborted(signal)
  const { url, model, headers } = resolveVisionEndpoint(config, visionModel)
  if (!imageUrl) throw new Error('缺少图片数据')

  const messages = [buildVisionUserMessage(buildExtractionPrompt({ vocabulary, extraInstructions }), imageUrl)]

  // 形状一（首选）：纯 JSON 模式。
  // 刻意贴紧**已验证可用**的 vision_analyze——那个请求只发 { model, messages }。
  // 每多一个参数就多一个「网关不认 → 400 或干脆卡住不返回」的地方，所以这里
  // 既不传 temperature，也不强制工具调用。强制 tool_choice 尤其危险：推理模型
  // 会一直推理却不产出工具调用，请求在服务端空转到超时（实测症状：聊天里
  // vision_analyze 秒回，识别按钮等满 120s 报超时）。
  /** @type {any} */
  let data
  try {
    data = await postVisionJson(url, headers, {
      model,
      messages,
      response_format: { type: 'json_object' }
    }, signal)
  } catch (e) {
    // 形状二（兜底）：端点不认 response_format 时，改用工具调用提交。
    // 只在「被明确拒绝」时换形状；超时不换——超时说明端点在忙/在慢，
    // 换一个更重的 payload 只会把等待重来一遍。
    if (!isShapeUnsupportedError(e)) throw e
    throwIfAborted(signal)
    data = await postVisionJson(url, headers, {
      model,
      messages,
      tools: [buildExtractionTool(vocabulary)],
      tool_choice: { type: 'function', function: { name: STRUCTURED_TOOL_NAME } }
    }, signal)
  }

  throwIfAborted(signal)
  return normalizeExtraction(extractStructuredPayload(data))
}

/** 端点「不支持这种请求形状」的报错特征（response_format / json_object / tools） */
const SHAPE_UNSUPPORTED_PATTERN = /tool|function|response_format|response format|json_object|json mode/i

/**
 * 判断错误是否属于「该端点不支持这种请求形状」——只有被明确拒绝才值得换形状重试。
 * 超时与网络错误一律不算：那不是形状问题，重试只会让用户多等一遍。
 * @param {unknown} error
 */
function isShapeUnsupportedError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/超时|timeout/i.test(message)) return false
  return SHAPE_UNSUPPORTED_PATTERN.test(message)
}

/**
 * 从响应里取出结构化载荷：优先 tool_calls，其次正文 JSON。
 * @param {any} data
 * @returns {Record<string, any>}
 */
function extractStructuredPayload(data) {
  const calls = Array.isArray(data?.choices?.[0]?.message?.tool_calls)
    ? data.choices[0].message.tool_calls
    : []
  const named = calls.find((call) => String(call?.function?.name || '') === STRUCTURED_TOOL_NAME)
  const target = named || calls[0]
  const args = target?.function?.arguments
  if (typeof args === 'string' && args.trim()) {
    const parsed = parseJsonLoose(args)
    if (parsed) return parsed
  } else if (args && typeof args === 'object') {
    return /** @type {Record<string, any>} */ (args)
  }

  const text = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content
    : ''
  const fromText = parseJsonLoose(text)
  if (fromText) return fromText

  if (calls.length > 0) throw new Error('模型返回的字段参数不是合法 JSON，请重试或换用更稳定的多模态模型')
  throw new Error(
    '结构化抽取失败：模型既没有调用提交工具，正文也不是 JSON。' +
    '请确认「视觉模型」支持工具调用或 JSON 输出（如 gpt-4o / qwen-vl-max 等），再重试'
  )
}

/**
 * 宽松 JSON 解析：容忍 ```json 围栏与前后废话。
 * @param {string} text
 * @returns {Record<string, any> | null}
 */
export function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const candidates = [raw]
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const braces = sliceFirstJsonObject(raw)
  if (braces) candidates.push(braces)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // 试下一个候选
    }
  }
  return null
}

/**
 * 取第一个花括号平衡的 JSON 对象片段（处理「以下是结果：{...}」这类包装）。
 * @param {string} text
 */
function sliceFirstJsonObject(text) {
  const start = text.indexOf('{')
  if (start < 0) return ''
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return ''
}

/**
 * 形状归一：只保留已知字段，空白值一律丢弃（「没识别到」与「空字符串」统一为空缺）。
 * @param {Record<string, any>} payload
 * @returns {{ transcript: string, fields: Record<string, any>, evidence: Record<string, string>, confidence: Record<string, string> }}
 */
function normalizeExtraction(payload) {
  const transcript = String(payload?.transcript || '').trim()

  /** @type {Record<string, any>} */
  const fields = {}
  const rawFields = payload?.fields && typeof payload.fields === 'object' ? payload.fields : {}
  for (const field of EXTRACTION_FIELDS) {
    const value = rawFields[field.key]
    if (fieldType(field.key) === 'array') {
      const list = (Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
      if (list.length > 0) fields[field.key] = list
      continue
    }
    const text = String(value ?? '').trim()
    if (text) fields[field.key] = text
  }

  return {
    transcript,
    fields,
    evidence: pickStringValues(payload?.evidence),
    confidence: pickStringValues(payload?.confidence)
  }
}

/**
 * 只保留字符串值的浅层拷贝（脏结构不往下传）。
 * @param {any} source
 * @returns {Record<string, string>}
 */
function pickStringValues(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, value] of Object.entries(source)) {
    const text = String(value ?? '').trim()
    if (text) out[key] = text
  }
  return out
}
