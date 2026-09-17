// batch_drafts 行归一化白名单（同步域）
// 与 helpers.js 的 BATCH_DRAFT_BUSINESS_KEYS 对齐；updatedAt 本地生成，不进同步 spec。
// dirtyFields 是编辑器本地状态，序列化进 items 条目内，不单独占列。

/**
 * @param {Partial<{ id: string, slot: string, batchId: string, isWishlist: boolean, items: any[], defaults: object, deleted: boolean|number, updatedAt: number }>} input
 */
export function normalizeBatchDraft(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const slot = String(raw.slot || raw.id || '').trim()
  const items = Array.isArray(raw.items)
    ? raw.items.filter((item) => item && typeof item === 'object')
    : []
  const defaults = raw.defaults && typeof raw.defaults === 'object' && !Array.isArray(raw.defaults)
    ? {
        ip: String(raw.defaults.ip || ''),
        category: String(raw.defaults.category || ''),
        price: String(raw.defaults.price || '')
      }
    : { ip: '', category: '', price: '' }

  return {
    id: slot,
    slot,
    batchId: String(raw.batchId || '').trim(),
    isWishlist: raw.isWishlist === true || raw.isWishlist === 1 || raw.isWishlist === '1',
    items,
    defaults
  }
}

/**
 * 分桶用：是否为已清除的墓碑行
 * @param {any} draft
 */
export function isBatchDraftDeleted(draft) {
  const flag = draft?.deleted
  return flag === true || flag === 1 || flag === '1'
}
