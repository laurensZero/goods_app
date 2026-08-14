/**
 * 从已入库商品学习「商品名关键词 → 分类」映射
 *
 * 对每个商品名提取 2~4 字滑动 n-gram，统计每个 gram 出现的商品数与其所属分类，
 * 只保留「在 >= minOccurrences 个不同商品中出现」的 gram，并按多数投票选出
 * 计数最高的分类（平局则不学）。默认同时统计收藏与心愿单商品。
 * 返回形如 [{ keyword: '胶片卡', value: '卡片' }] 的列表，供分类建议引擎使用。
 */

const HAN_REGEX = /[一-鿿]/

function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** 判断一个 gram 是否应被排除（噪音过滤） */
function isBlockedGram(gram, charNames, catNames) {
  if (!HAN_REGEX.test(gram) || gram.includes(' ')) return true
  if (catNames.has(gram)) return true
  // 排除角色名片段，避免把「角色名 → 某分类」学成噪音映射
  for (const name of charNames) {
    if (gram.includes(name) || name.includes(gram)) return true
  }
  return false
}

/** 码点级滑动窗口，产出不含空格的 gram（单个名字内 gram 去重） */
function extractNameGrams(normName, windowMin, windowMax) {
  const grams = new Set()
  const chars = Array.from(normName)
  for (let width = windowMin; width <= windowMax; width += 1) {
    for (let i = 0; i + width <= chars.length; i += 1) {
      const gram = chars.slice(i, i + width).join('')
      if (!gram.includes(' ')) grams.add(gram)
    }
  }
  return grams
}

/** 从 gram 的分类直方图里选出计数最高的分类；平局返回 null（不学） */
function pickMajorityCategory(hist) {
  let winner = null
  let winnerCount = 0
  let tied = false
  for (const [category, count] of hist) {
    if (count > winnerCount) {
      winner = category
      winnerCount = count
      tied = false
    } else if (count === winnerCount) {
      tied = true
    }
  }
  return tied ? null : winner
}

/** 兼容字符串与 { name } 两种角色/分类形态 */
function toNameList(values) {
  if (!Array.isArray(values)) return []
  return values
    .map((v) => (typeof v === 'object' && v ? v.name : v))
    .filter(Boolean)
}

/**
 * @param {Array<{name?: string, category?: string, isWishlist?: boolean}>} goodsList
 * @param {Object} [options]
 * @param {Array<string|{name:string}>} [options.categories] 预设分类名（黑名单）
 * @param {Array<string|{name:string}>} [options.characters] 预设角色名（黑名单）
 * @param {number} [options.minOccurrences=2] 关键词至少在 N 个不同商品中出现
 * @param {number} [options.windowMin=2]
 * @param {number} [options.windowMax=4]
 * @param {boolean} [options.includeWishlist=true] 是否纳入心愿单商品
 * @returns {Array<{keyword: string, value: string}>}
 */
export function learnCategoryKeywords(goodsList = [], options = {}) {
  const {
    categories = [],
    characters = [],
    minOccurrences = 2,
    windowMin = 2,
    windowMax = 4,
    includeWishlist = true,
  } = options

  // 只把 >= 2 字的角色名纳入黑名单，避免单字角色过度过滤常用双字词
  const charNames = toNameList(characters)
    .map(normalizeKey)
    .filter((name) => Array.from(name).length >= 2)
  const catNames = new Set(toNameList(categories).map(normalizeKey).filter(Boolean))

  const gramHist = new Map() // gram -> Map(category -> 商品数)
  const gramItems = new Map() // gram -> Set(商品索引)

  const list = Array.isArray(goodsList) ? goodsList : []
  list.forEach((item, index) => {
    if (!item) return
    if (!includeWishlist && item.isWishlist) return
    const category = normalizeKey(item.category)
    if (!category || category === '其他') return
    const normName = normalizeKey(item.name)
    if (!HAN_REGEX.test(normName)) return

    for (const gram of extractNameGrams(normName, windowMin, windowMax)) {
      if (isBlockedGram(gram, charNames, catNames)) continue

      if (!gramItems.has(gram)) {
        gramItems.set(gram, new Set())
        gramHist.set(gram, new Map())
      }
      const itemSet = gramItems.get(gram)
      if (itemSet.has(index)) continue
      itemSet.add(index)
      const hist = gramHist.get(gram)
      hist.set(category, (hist.get(category) || 0) + 1)
    }
  })

  const result = []
  for (const [gram, hist] of gramHist) {
    const count = gramItems.get(gram).size
    if (count < minOccurrences) continue

    // 多数投票：计数最高的分类胜出；平局（无唯一多数）则跳过不学
    const winner = pickMajorityCategory(hist)
    if (!winner) continue

    result.push({ keyword: gram, value: winner, count })
  }

  // 确定性排序：更长关键词优先 → 出现商品数多优先 → 中文拼音序兜底
  result.sort(
    (a, b) =>
      b.keyword.length - a.keyword.length ||
      b.count - a.count ||
      a.keyword.localeCompare(b.keyword, 'zh-Hans-CN')
  )

  return result.map(({ keyword, value }) => ({ keyword, value }))
}
