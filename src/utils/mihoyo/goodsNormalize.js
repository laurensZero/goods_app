/**
 * 米游铺商品数据的统一规整层。
 * API 原始字段（snake_case / cover_url 与 img_url 混用 / 价格单位不定）
 * 只在这里做一次防御性归一，下游组合层统一消费归一后的结构。
 */
import { normalizeCharacterName, displayVariantText } from '@/utils/goods/variantText'
import { pinyinIncludes } from '@/utils/pinyin'

/** 搜索/款式提示词规整：去引号与书名号等包裹符号 */
export function normalizeSearchHintText(value) {
  return String(value || '')
    .trim()
    .replace(/[「」『』【】《》〈〉]/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim()
}

/**
 * 从任意来源（搜索结果 / 订单行 / 队列项）取规范化的商品摘要字段。
 * 统一 camelCase 输出：{ goodsId, name, coverUrl, price }
 */
export function normalizeMihoyoGoodsSummary(raw) {
  const source = raw || {}
  const goodsId = String(
    source.goodsId || source.goods_id || source._goodsId || ''
  ).trim()
  const name = String(source.name || source.goods_name || '').trim()
  const coverUrl = String(
    source.coverUrl || source.cover_url || source.image || source.img_url || ''
  ).trim()
  const rawPrice = Number(source.price)
  return {
    goodsId,
    name,
    coverUrl,
    price: Number.isFinite(rawPrice) ? rawPrice : null,
  }
}

/**
 * 规整单个款式条目为队列/选择器标准结构 { text, key, cover_url, price }。
 * key 缺失视为无效返回 null；cover 依次回退 img_url 与 fallbackCover。
 */
export function normalizeMihoyoVariantEntry(v, { fallbackCover = '' } = {}) {
  if (!v || !v.key) return null
  return {
    text: String(v.text || v.key),
    key: String(v.key),
    cover_url: String(v.cover_url || v.img_url || fallbackCover || ''),
    price: v.price != null ? Number(v.price) : null,
  }
}

/** 规整款式列表：过滤无效项 */
export function normalizeMihoyoVariantList(list, options) {
  return (Array.isArray(list) ? list : [])
    .map((v) => normalizeMihoyoVariantEntry(v, options))
    .filter(Boolean)
}

/**
 * 按提示词匹配款式（三级优先）：
 * 1) 角色名精确匹配（normalizeCharacterName 相等）
 * 2) 文本包含（展示文本 / 规整角色名 / 原始文本）
 * 3) 拼音匹配（仅 pinyin: true，队列自动选款用；搜索侧保持现状不启用）
 * 返回命中的款式数组；调用方按各自策略消费（搜索取末位封面，队列要求唯一命中）。
 */
export function matchVariantsByHint(variants, hint, { pinyin = false } = {}) {
  const normalizedHint = normalizeSearchHintText(hint).toLowerCase()
  if (!normalizedHint || !Array.isArray(variants) || !variants.length) return []

  const targets = variants.map((variant) => ({
    variant,
    raw: String(variant?.text || '').trim().toLowerCase(),
    display: displayVariantText(variant?.text).trim().toLowerCase(),
    normalizedChar: normalizeCharacterName(variant?.text).trim().toLowerCase(),
  }))

  const exact = targets.filter((t) => t.normalizedChar && t.normalizedChar === normalizedHint)
  if (exact.length) return exact.map((t) => t.variant)

  const fuzzy = targets.filter((t) => (
    t.display.includes(normalizedHint) ||
    t.normalizedChar.includes(normalizedHint) ||
    t.raw.includes(normalizedHint)
  ))
  if (fuzzy.length) return fuzzy.map((t) => t.variant)

  if (pinyin) {
    const pinyinMatched = targets.filter((t) => (
      pinyinIncludes(t.variant?.text, normalizedHint) ||
      pinyinIncludes(t.display, normalizedHint)
    ))
    if (pinyinMatched.length) return pinyinMatched.map((t) => t.variant)
  }

  return []
}
