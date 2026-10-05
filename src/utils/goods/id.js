// @ts-check

/**
 * goods 主键生成：单调递增，保证同一毫秒内也不重复。
 *
 * 纯 `String(Date.now())` 在同毫秒会生成相同 id —— 短时间连续新增时
 * 后一条走 `INSERT OR REPLACE` 覆盖前一条，表现为「加了好几条，云端只剩一条」。
 * 基线仍取真实时钟，id 的数量级与先后顺序和历史版本保持一致。
 */
let lastIdMs = 0

/**
 * @param {number} [now] 基准毫秒（默认当前时间；批量调用时可传 now + i 保持有序）
 * @returns {string}
 */
export function nextGoodsId(now = Date.now()) {
  lastIdMs = now > lastIdMs ? now : lastIdMs + 1
  return String(lastIdMs)
}
