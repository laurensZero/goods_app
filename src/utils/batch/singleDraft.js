// 单个谷子新增草稿的条目识别/构造。
//
// 单个草稿与批量队列草稿共用同一 batch_drafts 行（slot 主键，收藏/心愿各一行）：
// 为了不动同步 schema，单个草稿不占新列，而是作为「唯一一个带 singleForm 的条目」
// 塞进既有的 items JSON 列。items 在对端拉取时原样保留，旧版本不会丢字段。
// 队列草稿的 items 里绝不会出现 singleForm（队列项用 imageUri/name/...）。

/** 单个草稿条目的载荷键名（同时是判别标记） */
export const SINGLE_DRAFT_FORM_KEY = 'singleForm'

/**
 * 构造承载单个表单快照的 items 条目
 * @param {object} form 表单快照
 * @returns {{ id: string, singleForm: object, savedAt: number }}
 */
export function buildSingleDraftItem(form) {
  return {
    id: 'single',
    [SINGLE_DRAFT_FORM_KEY]: form && typeof form === 'object' && !Array.isArray(form) ? form : {},
    savedAt: Date.now()
  }
}

/**
 * 是否为单个草稿条目
 * @param {any} item
 * @returns {boolean}
 */
export function isSingleDraftItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false
  const form = item[SINGLE_DRAFT_FORM_KEY]
  return !!form && typeof form === 'object' && !Array.isArray(form)
}

/**
 * 从草稿行取出单个草稿条目（仅当 items 恰好只有一个且是单个草稿时才成立）
 * @param {any} draft
 * @returns {object | null}
 */
export function getSingleDraftEntry(draft) {
  const items = Array.isArray(draft?.items) ? draft.items : []
  if (items.length === 1 && isSingleDraftItem(items[0])) return items[0]
  return null
}
