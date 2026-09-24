// @ts-check
/**
 * 上下文压缩：工具结果截断 + 历史 tool 结果清空（对齐业界 tool-result clearing / context editing）。
 * 目标是压住每轮固定开销之外「越滚越大」的对话历史。
 *
 * 截断策略：结构化裁剪优先（裁大数组尾部/长字符串，保持合法 JSON 并留下「还有多少」标记），
 * 最后才硬切——硬切会把 JSON 切断，模型既读不到剩余曲目也不知道还有更多。
 */

/** 单条工具结果写入历史时的最大 JSON 字符数（约 2–3k token） */
export const TOOL_RESULT_MAX_CHARS = 4000

/**
 * 按工具放宽上限：完整歌单/专辑曲目/搜索列表等一次要给全的数据，4k 不够一场演唱会 setlist。
 * 未列出的工具走默认 4000。
 */
export const TOOL_RESULT_MAX_CHARS_BY_TOOL = {
  event_tracks: 12000,
  goods_detail: 8000,
  goods_search: 8000,
  music_search: 6000,
  music_lyrics: 10000,
  events_list: 6000,
  trash_list: 6000,
  groups_list: 6000,
  collection_overview: 6000,
  wishlist_overview: 6000
}

/** 保留完整内容的最近 tool 轮数（更早的 tool 结果清成占位符） */
export const DEFAULT_KEEP_RECENT_TOOL_ROUNDS = 1

/** 发送前对话历史字符预算（超过就从旧到新裁） */
export const CONVO_MAX_CHARS = 48000

const CLEARED_TOOL_PLACEHOLDER = '（历史工具结果已省略）'

/** 粗算 token：中英混排约 2 字符/token，仅用于 UI 展示「约 X」 */
export function estimateTokensFromChars(chars) {
  return Math.max(0, Math.round((Number(chars) || 0) / 2))
}

/**
 * 估算整段对话字符数（content + reasoning + tool_calls 参数）。
 * @param {Array<Record<string, any>>} convo
 * @returns {number}
 */
export function estimateConvoChars(convo) {
  let n = 0
  for (const msg of convo || []) {
    if (typeof msg?.content === 'string') n += msg.content.length
    if (typeof msg?.reasoning === 'string') n += msg.reasoning.length
    if (Array.isArray(msg?.tool_calls)) {
      for (const call of msg.tool_calls) {
        n += String(call?.function?.name || '').length
        n += String(call?.function?.arguments || '').length
      }
    }
  }
  return n
}

/**
 * 工具结果写入历史时的字符预算。
 * @param {string} [toolName]
 * @returns {number}
 */
export function maxCharsForTool(toolName) {
  return TOOL_RESULT_MAX_CHARS_BY_TOOL[toolName] ?? TOOL_RESULT_MAX_CHARS
}

/** @param {unknown} value */
function jsonLen(value) {
  try {
    return JSON.stringify(value ?? null)?.length ?? 0
  } catch {
    return String(value ?? '').length
  }
}

/**
 * 结构化裁剪到 maxChars：
 * - 数组：从尾部丢元素，末尾留一条「已省略 N 项，共 M 项」标记（模型知道还有更多）
 * - 对象：反复裁最大字段（数组/对象递归，字符串截断）
 * @param {unknown} value
 * @param {number} maxChars
 * @returns {unknown}
 */
function shrinkValueToFit(value, maxChars) {
  if (jsonLen(value) <= maxChars) return value

  if (typeof value === 'string') {
    const cut = Math.max(16, maxChars - 16)
    return value.length > cut ? `${value.slice(0, cut)}…[已截断]` : value
  }

  if (Array.isArray(value)) {
    const MARKER_RESERVE = 36
    /** @type {unknown[]} */
    const kept = []
    let used = 2
    for (const item of value) {
      const itemSize = jsonLen(item) + (kept.length ? 1 : 0)
      if (used + itemSize + MARKER_RESERVE > maxChars) break
      kept.push(item)
      used += itemSize
    }
    const omitted = value.length - kept.length
    if (omitted > 0) {
      kept.push(`…[已省略 ${omitted} 项，共 ${value.length} 项]`)
    }
    if (kept.length === 0) return [`…[已省略 ${value.length} 项，共 ${value.length} 项]`]
    return kept
  }

  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const out = { ...value }
    for (let guard = 0; guard < 16 && jsonLen(out) > maxChars; guard += 1) {
      let heaviest = ''
      let heaviestSize = 0
      for (const [key, v] of Object.entries(out)) {
        const size = jsonLen(v)
        if (size > heaviestSize) {
          heaviestSize = size
          heaviest = key
        }
      }
      if (!heaviest || heaviestSize <= 4) break
      const current = out[heaviest]
      const share = Math.max(64, Math.floor((maxChars * heaviestSize) / Math.max(1, jsonLen(out))) - 24)
      if (Array.isArray(current) || (current && typeof current === 'object')) {
        const next = shrinkValueToFit(current, share)
        if (jsonLen(next) < heaviestSize) {
          out[heaviest] = next
        } else if (Array.isArray(current)) {
          out[heaviest] = current.length > 1
            ? [current[0], `…[已省略 ${current.length - 1} 项，共 ${current.length} 项]`]
            : [`…[已省略 ${current.length} 项]`]
        } else {
          out[heaviest] = '…[已省略]'
        }
      } else if (typeof current === 'string') {
        const cut = Math.max(32, share - 16)
        out[heaviest] = current.length > cut ? `${current.slice(0, cut)}…[已截断]` : current
      } else {
        out[heaviest] = '…[已省略]'
      }
    }
    return out
  }

  return value
}

/**
 * @param {unknown} payload
 * @param {number} [maxChars]
 * @returns {string}
 */
export function serializeToolResult(payload, maxChars = TOOL_RESULT_MAX_CHARS) {
  if (typeof payload === 'string') {
    return payload.length <= maxChars ? payload : `${payload.slice(0, Math.max(0, maxChars - 12))}…[已截断]`
  }
  let json = JSON.stringify(payload ?? null)
  if (json.length <= maxChars) return json

  const shrunk = shrinkValueToFit(payload ?? null, Math.max(32, maxChars - 2))
  json = JSON.stringify(shrunk)
  if (json.length <= maxChars) return json
  return `${json.slice(0, Math.max(0, maxChars - 12))}…[已截断]`
}

/**
 * 清空较旧的 tool 结果，保留最近 keepRecentToolRounds 轮完整内容。
 * 不改消息条数与 tool_calls 配对结构，避免 OpenAI 协议校验失败。
 * @param {Array<Record<string, any>>} convo
 * @param {{ keepRecentToolRounds?: number }} [options]
 */
export function compactConvo(convo, options = {}) {
  const keepRecentToolRounds = Math.max(0, options.keepRecentToolRounds ?? DEFAULT_KEEP_RECENT_TOOL_ROUNDS)
  if (!Array.isArray(convo) || convo.length === 0) return convo || []

  /** 从后往前数 tool 轮（每段连续 tool 消息算一轮） */
  const toolMsgIndexes = []
  for (let i = 0; i < convo.length; i += 1) {
    if (convo[i]?.role === 'tool') toolMsgIndexes.push(i)
  }
  if (toolMsgIndexes.length === 0) return convo

  // 按「assistant.tool_calls 后紧跟的 tool 消息」分组成轮
  /** @type {number[][]} */
  const rounds = []
  /** @type {number[]} */
  let current = []
  for (const idx of toolMsgIndexes) {
    const prev = current.length ? current[current.length - 1] : -2
    if (idx === prev + 1) current.push(idx)
    else {
      if (current.length) rounds.push(current)
      current = [idx]
    }
  }
  if (current.length) rounds.push(current)

  const keepFromRound = Math.max(0, rounds.length - keepRecentToolRounds)
  const clearIndexes = new Set()
  for (let r = 0; r < keepFromRound; r += 1) {
    for (const idx of rounds[r]) clearIndexes.add(idx)
  }
  if (clearIndexes.size === 0) return convo

  return convo.map((msg, i) => {
    if (!clearIndexes.has(i) || msg?.role !== 'tool') return msg
    if (typeof msg.content === 'string' && msg.content.includes('已省略')) return msg
    return { ...msg, content: CLEARED_TOOL_PLACEHOLDER }
  })
}

/**
 * 发送前整备历史：先清旧 tool 结果，再按字符预算从旧到新裁（保持 tool_calls 配对）。
 * @param {Array<Record<string, any>>} convo
 * @param {{ keepRecentToolRounds?: number, maxChars?: number }} [options]
 */
export function prepareConvoForRequest(convo, options = {}) {
  const maxChars = options.maxChars ?? CONVO_MAX_CHARS
  let next = compactConvo(convo, options)
  // 字符预算裁剪：尽量从含 tool 的旧块开刀
  while (estimateConvoChars(next) > maxChars && next.length > 2) {
    // 保留 system(0) + 最近 2 条；其余从最旧可裁消息下手
    let cutIndex = -1
    for (let i = 1; i < next.length - 2; i += 1) {
      const msg = next[i]
      if (msg?.role === 'tool' || msg?.role === 'assistant') {
        cutIndex = i
        break
      }
    }
    if (cutIndex < 0) cutIndex = 1
    // 不能切断 tool 与其 assistant.tool_calls 的配对：若 cutIndex 是 tool，往前找到对应 assistant
    if (next[cutIndex]?.role === 'tool') {
      for (let j = cutIndex - 1; j >= 1; j -= 1) {
        if (Array.isArray(next[j]?.tool_calls)) {
          cutIndex = j
          break
        }
      }
    }
    // 若 cutIndex 是带 tool_calls 的 assistant，连同后续 tool 一起删
    let end = cutIndex + 1
    if (Array.isArray(next[cutIndex]?.tool_calls)) {
      while (end < next.length && next[end]?.role === 'tool') end += 1
    }
    next = [...next.slice(0, cutIndex), ...next.slice(end)]
  }
  return next
}
