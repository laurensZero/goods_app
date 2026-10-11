/**
 * 从已入库商品学习「商品名关键词 → 分类」映射
 *
 * 对每个商品名提取 2~4 字滑动 n-gram，统计每个 gram 出现的商品数与其所属分类，
 * 只保留「在 >= minOccurrences 个不同商品中出现」的 gram，并按多数投票选出
 * 计数最高的分类（平局则不学）。默认同时统计收藏与心愿单商品。
 * 返回形如 [{ keyword: '胶片卡', value: '卡片' }] 的列表，供分类建议引擎使用。
 *
 * 提供两种用法：
 * - learnCategoryKeywords(...)：一次性全量学习（纯函数，行为不变）；
 * - createCategoryKeywordAggregator(...)：增量聚合器，支持按商品 upsert/remove、
 *   syncList 增量同步，避免频繁更新时反复全量重扫 n-gram（共享缓存使用）。
 */

const HAN_REGEX = /[一-鿿]/

function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
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
 * 增量聚合器：保持与 learnCategoryKeywords 完全一致的统计语义，
 * 但维护持久聚合状态，可对单商品 upsert/remove 或按列表 syncList 增量同步。
 * 预设分类/角色（黑名单）变化时没有增量路径，需重建（rebuild）。
 */
export function createCategoryKeywordAggregator(options = {}) {
  const {
    categories = [],
    characters = [],
    minOccurrences = 2,
    windowMin = 2,
    windowMax = 4,
    includeWishlist = true,
  } = options

  // 规范化分类名 → 原始写法（预设分类优先，其次商品上首次出现的写法），
  // 学到的映射 value 需用原始大小写，否则会把「CD/专辑」建议成「cd/专辑」
  const categoryDisplayNames = new Map()
  const registerCategory = (raw) => {
    const key = normalizeKey(raw)
    if (!key || categoryDisplayNames.has(key)) return
    categoryDisplayNames.set(key, String(raw))
  }
  toNameList(categories).forEach(registerCategory)

  // 只把 >= 2 字的角色名纳入黑名单，避免单字角色过度过滤常用双字词
  const charNames = toNameList(characters)
    .map(normalizeKey)
    .filter((name) => Array.from(name).length >= 2)
  const catNames = new Set(toNameList(categories).map(normalizeKey).filter(Boolean))

  // 角色名黑名单子串索引：把「gram 是否包含角色名 / 角色名是否包含 gram」
  // 从逐个角色名双向 includes 扫描（O(gram × 角色名数)，是全量学习的主耗时）
  // 降为两个小集合查询。全量重建因此降到十几毫秒级，冷启动/预设变化
  // 可直接走全量路径，无需持久化复用旧聚合状态。
  const charNameSet = new Set(charNames) // 用于 gram 包含角色名：枚举 gram 子串查此集合
  const charNameSubstrings = new Set() // 用于角色名包含 gram：预计算各角色名的窗口内子串
  for (const name of charNames) {
    const nameChars = Array.from(name)
    for (let w = windowMin; w <= windowMax && w <= nameChars.length; w += 1) {
      for (let i = 0; i + w <= nameChars.length; i += 1) {
        charNameSubstrings.add(nameChars.slice(i, i + w).join(''))
      }
    }
  }

  /** 噪音过滤：汉字/空格/分类名/角色名片段（等价于旧的双向 includes 扫描） */
  const isBlockedGram = (gram) => {
    if (!HAN_REGEX.test(gram) || gram.includes(' ')) return true
    if (catNames.has(gram)) return true
    if (charNameSubstrings.has(gram)) return true
    const gramChars = Array.from(gram)
    for (let w = 2; w <= gramChars.length; w += 1) {
      for (let i = 0; i + w <= gramChars.length; i += 1) {
        if (charNameSet.has(gramChars.slice(i, i + w).join(''))) return true
      }
    }
    return false
  }

  // gram -> Map(商品 key -> 规范化分类)
  const gramMembers = new Map()
  // 商品 key -> { input, grams? } — input 为资格指纹（分类+名称+心愿单），grams 缺省表示无贡献
  const snap = new Map()

  const contributionInput = (item) =>
    JSON.stringify([
      normalizeKey(item?.category),
      normalizeKey(item?.name),
      item?.isWishlist ? 1 : 0,
    ])

  const removeKey = (key) => {
    const s = snap.get(key)
    if (!s) return
    snap.delete(key)
    if (!s.grams) return
    for (const gram of s.grams) {
      const members = gramMembers.get(gram)
      if (!members) continue
      members.delete(key)
      if (members.size === 0) gramMembers.delete(gram)
    }
  }

  const upsertKey = (key, item) => {
    if (!item) {
      snap.set(key, { input: null })
      return
    }
    const input = contributionInput(item)
    // 默认按「无贡献」记录，下面逐项资格检查通过后才写入 grams
    snap.set(key, { input })
    if (!includeWishlist && item.isWishlist) return
    const category = normalizeKey(item.category)
    if (!category || category === '其他') return
    registerCategory(item.category)
    const normName = normalizeKey(item.name)
    if (!HAN_REGEX.test(normName)) return

    const grams = new Set()
    for (const gram of extractNameGrams(normName, windowMin, windowMax)) {
      if (isBlockedGram(gram)) continue
      grams.add(gram)
      let members = gramMembers.get(gram)
      if (!members) {
        members = new Map()
        gramMembers.set(gram, members)
      }
      members.set(key, category)
    }
    snap.set(key, { input, grams })
  }

  /** 全量重建（预设变化 / 冷启动）；keyFn(item, index) 返回稳定 key，缺省用 item 本身 */
  const rebuild = (list, keyFn) => {
    gramMembers.clear()
    snap.clear()
    const arr = Array.isArray(list) ? list : []
    arr.forEach((item, index) => {
      const key = keyFn ? keyFn(item, index) : item
      upsertKey(key, item)
    })
  }

  /**
   * 增量同步：只处理新增/内容变化/删除的商品，未变商品零成本跳过。
   * 内容指纹（分类+名称+心愿单）相同则不重算 n-gram。
   */
  const syncList = (list, keyFn) => {
    const arr = Array.isArray(list) ? list : []
    const presentKeys = new Set()
    const seenRefs = new Set()
    arr.forEach((item, index) => {
      if (!item) return
      if (seenRefs.has(item)) return
      seenRefs.add(item)
      const key = keyFn ? keyFn(item, index) : item
      presentKeys.add(key)
      const input = contributionInput(item)
      const prev = snap.get(key)
      if (prev && prev.input === input) return
      removeKey(key)
      upsertKey(key, item)
    })
    for (const key of [...snap.keys()]) {
      if (!presentKeys.has(key)) removeKey(key)
    }
  }

  /** 从聚合状态产出结果；顺序与语义与原全量实现一致 */
  const finalize = () => {
    const result = []
    for (const [gram, members] of gramMembers) {
      const count = members.size
      if (count < minOccurrences) continue

      // 多数投票：计数最高的分类胜出；平局（无唯一多数）则跳过不学
      const hist = new Map()
      for (const category of members.values()) {
        hist.set(category, (hist.get(category) || 0) + 1)
      }
      const winner = pickMajorityCategory(hist)
      if (!winner) continue

      result.push({ keyword: gram, value: categoryDisplayNames.get(winner) || winner, count })
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

  return { rebuild, syncList, finalize, removeKey, upsertKey }
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
  const aggregator = createCategoryKeywordAggregator(options)
  aggregator.rebuild(goodsList, (item, index) => index)
  return aggregator.finalize()
}
