// @ts-check
/**
 * 上下文压缩：工具结果截断 + 历史 tool 结果清空（对齐业界 tool-result clearing / context editing）。
 * 目标是压住每轮固定开销之外「越滚越大」的对话历史。
 */

/** 单条工具结果写入历史时的最大 JSON 字符数（约 2–3k token） */
export const TOOL_RESULT_MAX_CHARS = 4000

/** 保留完整内容的最近 tool 轮数（更早的 tool 结果清成占位符） */
export const DEFAULT_KEEP_RECENT_TOOL_ROUNDS = 1

const CLEARED_TOOL_PLACEHOLDER = '（历史工具结果已省略）'

/**
 * @param {unknown} payload
 * @param {number} [maxChars]
 * @returns {string}
 */
export function serializeToolResult(payload, maxChars = TOOL_RESULT_MAX_CHARS) {
  let json = JSON.stringify(payload ?? null)
  if (json.length > maxChars) {
    json = `${json.slice(0, maxChars)}…[已截断]`
  }
  return json
}

/**
 * @param {Array<Record<string, any>>} convo
 * @returns {number}
 */
export function estimateConvoChars(convo) {
  let n = 0
  for (const msg of convo || []) {
    if (typeof msg?.content === 'string') n += msg.content.length
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
  const maxChars = options.maxChars ?? 48000
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
