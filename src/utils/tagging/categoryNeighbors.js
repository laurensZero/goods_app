/**
 * 分类「相似商品投票」（kNN）兜底。
 *
 * 解决关键词/学习词的硬边界：新品类词第一次出现时规则必漏，学习词又要出现 ≥2 次。
 * 这里直接拿用户已入库的商品当样本：对商品名做字符 n-gram + IDF 加权，
 * 找最相似的历史商品，用它的分类兜底。
 *
 * 设计取舍：
 * - 纯离线、零训练，索引可随商品列表重建；
 * - 品类词通常在名称末尾，末尾 n-gram 额外加权，避免被系列名/角色名淹没；
 * - 只认「明显更相似」的最近邻：与第二名分类不同且差距不足时宁可留空；
 * - 分类为空或「其他」的商品不参与投票。
 */

const DEFAULT_OPTIONS = {
  minGram: 2,
  maxGram: 3,
  topK: 8,
  // 低于该相似度的邻居直接丢掉
  minSimilarity: 0.2,
  // 最近邻本身必须够像，才允许采纳
  minTopSimilarity: 0.55,
  // 最近邻与「不同分类的第二名」差距小于该值时视为歧义，留空
  minMargin: 0.08,
  // 要求名称末尾的品类尾词一致，避免「同系列不同品类」被系列名带跑
  requireTailMatch: true,
}

const IGNORED_CATEGORIES = new Set(['', '其他'])

// 名称末尾的通用词不提供品类信息，不能用来做「同品类」判断
const GENERIC_TAILS = [
  '系列', '周边', '联名', '限定', '特典', '预售', '现货',
  '再版', '复刻', '版本', '款', '版',
]

/** 统一名称：去掉【】噪音、标点/空白和常见批次后缀，保留品类词 */
export function normalizeNeighborName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/【[^】]*】/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    // 「第二弹 / 异色版 / 预售」这类批次文案不参与相似度，否则会把同一个商品判成不够像
    .replace(/(?:第[一二三四五六七八九十\d]+[弹批期版]|(?:异色|限定|特典|再|复刻|初回|通常|豪华|典藏)版|再版|复刻|预售|现货|周边)+$/g, '')
}

/**
 * 取名称末尾的「品类尾词」：先剥掉英文/数字和通用后缀，再取最后 2 个字。
 * 例：「花绪之约系列亚克力票根 第二弹」→「票根」；「角色立绘系列手机支架 Genshin」→「支架」。
 * 剥完不足 2 字或只剩通用词时返回空串，表示这条名称没有可靠的品类尾词。
 */
export function categoryTailOf(value) {
  let text = normalizeNeighborName(value).replace(/[a-z0-9]+$/g, '')
  let changed = true
  while (changed) {
    changed = false
    for (const word of GENERIC_TAILS) {
      if (text.endsWith(word)) {
        text = text.slice(0, -word.length)
        changed = true
      }
    }
    const stripped = text.replace(/[a-z0-9]+$/g, '')
    if (stripped !== text) {
      text = stripped
      changed = true
    }
  }
  return text.length >= 2 ? text.slice(-2) : ''
}

/** 尾词相同，或至少最后一个字相同（如「镭射收藏票」与「镭射票」） */
function tailsCompatible(left, right) {
  if (!left || !right) return false
  return left === right || left.slice(-1) === right.slice(-1)
}

/** 商品名 → gram → 该 gram 最后一次出现的结束位置（用于末尾加权） */
function collectGramPositions(name, minGram, maxGram) {
  const chars = Array.from(name)
  const positions = new Map()
  for (let width = minGram; width <= maxGram; width += 1) {
    for (let start = 0; start + width <= chars.length; start += 1) {
      const gram = chars.slice(start, start + width).join('')
      positions.set(gram, start + width)
    }
  }
  return positions
}

/** 越靠后的 gram 越可能是品类词，给更高权重 */
function suffixBoost(end, length) {
  if (end >= length - 2) return 2.2
  if (end >= length - 5) return 1.5
  return 1
}

function normalizeExcludeKeys(excludeKeys) {
  if (!excludeKeys) return new Set()
  return excludeKeys instanceof Set ? excludeKeys : new Set(excludeKeys)
}

/**
 * @param {Array<{id?: string, name?: string, category?: string}>} goodsList
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 */
export function createCategoryNeighborIndex(goodsList, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options }
  const docs = []
  const documentFrequency = new Map()
  const postings = new Map()

  for (const item of Array.isArray(goodsList) ? goodsList : []) {
    const category = String(item?.category || '').trim()
    if (IGNORED_CATEGORIES.has(category)) continue

    const normalized = normalizeNeighborName(item?.name)
    if (!normalized) continue

    const positions = collectGramPositions(normalized, config.minGram, config.maxGram)
    if (positions.size === 0) continue

    const doc = {
      key: item?.id != null ? `id:${item.id}` : `ref:${docs.length}`,
      name: String(item?.name || ''),
      category,
      length: Array.from(normalized).length,
      tail: categoryTailOf(normalized),
      gramPositions: positions,
      norm: 1,
    }
    docs.push(doc)
    for (const gram of positions.keys()) {
      documentFrequency.set(gram, (documentFrequency.get(gram) || 0) + 1)
    }
  }

  const maxIdf = Math.log(docs.length + 1) + 1
  const idf = new Map()
  for (const [gram, frequency] of documentFrequency) {
    idf.set(gram, Math.log((docs.length + 1) / (frequency + 1)) + 1)
  }
  const idfOf = (gram) => idf.get(gram) ?? maxIdf

  // 文档向量权重：IDF × 末尾加权；同时写入倒排表
  for (const doc of docs) {
    let squared = 0
    for (const [gram, end] of doc.gramPositions) {
      const weight = idfOf(gram) * suffixBoost(end, doc.length)
      squared += weight * weight
      let list = postings.get(gram)
      if (!list) {
        list = []
        postings.set(gram, list)
      }
      list.push({ doc, weight })
    }
    doc.norm = Math.sqrt(squared) || 1
  }

  /**
   * @param {string} name
   * @param {{ excludeKeys?: Iterable<string>|Set<string>, topK?: number }} [queryOptions]
   * @returns {null | { category: string, similarity: number, neighbors: Array<{name: string, category: string, similarity: number}> }}
   */
  function query(name, queryOptions = {}) {
    if (docs.length === 0) return null

    const normalized = normalizeNeighborName(name)
    if (!normalized) return null

    const positions = collectGramPositions(normalized, config.minGram, config.maxGram)
    if (positions.size === 0) return null

    const length = Array.from(normalized).length
    const queryTail = categoryTailOf(normalized)
    const exclude = normalizeExcludeKeys(queryOptions.excludeKeys)
    const scores = new Map()
    let querySquared = 0

    for (const [gram, end] of positions) {
      const queryWeight = idfOf(gram) * suffixBoost(end, length)
      querySquared += queryWeight * queryWeight
      const list = postings.get(gram)
      if (!list) continue
      for (const entry of list) {
        if (exclude.has(entry.doc.key)) continue
        scores.set(entry.doc, (scores.get(entry.doc) || 0) + queryWeight * entry.weight)
      }
    }

    if (scores.size === 0) return null
    const queryNorm = Math.sqrt(querySquared) || 1
    const topK = Math.max(1, queryOptions.topK || config.topK)

    const ranked = []
    for (const [doc, dot] of scores) {
      if (config.requireTailMatch && !tailsCompatible(queryTail, doc.tail)) continue
      const similarity = dot / (queryNorm * doc.norm)
      if (similarity < config.minSimilarity) continue
      ranked.push({
        name: doc.name,
        category: doc.category,
        similarity,
      })
    }
    if (ranked.length === 0) return null

    ranked.sort((a, b) => b.similarity - a.similarity)
    const best = ranked[0]
    if (best.similarity < config.minTopSimilarity) return null

    // 分类不同的第二名如果和第一名咬得太紧，说明样本本身歧义，不猜
    const runnerUp = ranked.slice(1, topK).find((item) => item.category !== best.category)
    if (runnerUp && best.similarity - runnerUp.similarity < config.minMargin) return null

    return {
      category: best.category,
      similarity: best.similarity,
      neighbors: ranked.slice(0, Math.min(5, topK)),
    }
  }

  return { size: docs.length, query }
}

/**
 * 把最近邻结果转成与 getTaggingSuggestions 一致的分类建议结构。
 * 供编辑器的智能建议面板复用。
 */
export function buildNeighborCategorySuggestion(index, name) {
  const neighbor = index?.query?.(name)
  if (!neighbor) return null
  return {
    value: neighbor.category,
    confidence: neighbor.similarity >= 0.75 ? 'high' : 'medium',
    score: neighbor.similarity,
    reasons: [`与 ${neighbor.neighbors.length} 件相似商品一致`],
    decisive: false,
    source: 'neighbor',
  }
}
