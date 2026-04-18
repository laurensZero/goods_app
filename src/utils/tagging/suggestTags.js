/**
 * 智能标签建议引擎
 * 融合静态词典映射与动态预设池进行文本分析打分
 */

/**
 * 清洗和文本规范化
 */
function normalizeText(text) {
  if (!text) return ''
  // 转小写、去除多余空白
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * 置信度映射
 */
function getConfidenceRating(score) {
  if (score >= 1.4) return 'high'
  if (score >= 0.8) return 'medium'
  return 'low'
}

/**
 * 执行匹配规则库（提取出候选项）
 * @param {string} text - 输入文本
 * @param {Array} rules - 静态正则匹配规则集 [{key, value, weight, ...}]
 * @param {Array} dynamicKeywords - 动态词汇列表 (精准匹配为主)
 * @param {Number} fieldWeight - 字段基础权重
 * @param {String} source - 来源说明 ('name' | 'note')
 */
function matchRules(text, rules, dynamicKeywords, fieldWeight, source) {
  const matches = []

  // 1. 匹配动态库 (全词或精确子串匹配)
  if (dynamicKeywords && dynamicKeywords.length > 0) {
    for (const keyword of dynamicKeywords) {
      if (!keyword) continue
      const lowerKeyword = keyword.toLowerCase()
      if (text.includes(lowerKeyword)) {
        matches.push({
          value: keyword,
          score: 1.0 * fieldWeight, // 动态完全匹配基础分是1.0
          reasons: [`在 ${source} 中匹配到已知项: ${keyword}`]
        })
      }
    }
  }

  // 2. 匹配静态正则规则库
  if (rules && rules.length > 0) {
    for (const rule of rules) {
      if (!rule.key || !rule.value) continue
      
      try {
        const regex = new RegExp(rule.key, 'i')
        const match = text.match(regex)
        
        if (match) {
          const ruleWeight = rule.weight || 1.0
          matches.push({
            value: rule.value,
            score: ruleWeight * fieldWeight,
            reasons: [`在 ${source} 中匹配到规则: ${rule.value} (${match[0]})`],
            ip: rule.ip // 对于角色规则可能带有所属ip信息
          })
        }
      } catch (e) {
        console.warn('无效的正规表达式规则:', rule.key)
      }
    }
  }

  return matches
}

/**
 * 根据排除词组进行降分
 */
function applyNegativeRules(text, matches, negativeRules) {
  if (!negativeRules || !negativeRules.length || !text) return

  for (const rule of negativeRules) {
    if (text.includes(rule.toLowerCase())) {
      // 存在负向词，所有置信度下降
      matches.forEach(item => {
        item.score -= 0.5
        item.reasons.push(`匹配到排除词汇: ${rule}，降低置信度`)
      })
    }
  }
}

/**
 * 汇总相同的建议值并求取最大置信分和整合理由
 */
function consolidateMatches(matches) {
  const map = new Map()

  for (const match of matches) {
    if (!map.has(match.value)) {
      map.set(match.value, { ...match })
    } else {
      const existing = map.get(match.value)
      // 分数相加或取最大？ 取最大并外加0.2的交叉奖励分
      existing.score = Math.max(existing.score, match.score) + 0.2
      // 合并理由 (去重)
      match.reasons.forEach(r => {
        if (!existing.reasons.includes(r)) {
          existing.reasons.push(r)
        }
      })
    }
  }

  // 转为数组，并计算置信度枚举，排除过低的
  return Array.from(map.values())
    .filter(item => item.score >= 0.4) // 抛弃过低的
    .map(item => ({
      value: item.value,
      confidence: getConfidenceRating(item.score),
      score: item.score,
      reasons: item.reasons,
      ip: item.ip
    }))
    .sort((a, b) => b.score - a.score)
}

/**
 * 综合关联提升权重: 如果匹配出的 character 的 ip 也在匹配出的 ip 里，双方都加分
 */
function applyRelationalBoost(ipMatches, characterMatches) {
  for (const charItem of characterMatches) {
    if (charItem.ip) {
      const ipHit = ipMatches.find(ipItem => ipItem.value === charItem.ip)
      if (ipHit) {
        // 角色和IP互相印证
        charItem.score += 0.4
        charItem.reasons.push(`IP印证提升: 该角色归属于已识别的IP ${ipHit.value}`)
        charItem.confidence = getConfidenceRating(charItem.score)

        ipHit.score += 0.4
        if (!ipHit.reasons.some(r => r.includes('角色印证'))) {
          ipHit.reasons.push(`角色印证提升: 包含该IP的已知角色 ${charItem.value}`)
        }
        ipHit.confidence = getConfidenceRating(ipHit.score)
      }
    }
  }
  // 重新排序
  ipMatches.sort((a, b) => b.score - a.score)
  characterMatches.sort((a, b) => b.score - a.score)
}


/**
 * 主入口：获取标签建议
 * 
 * @param {Object} inputContext - { name: '', note: '' }
 * @param {Object} staticDictionaries - { aliases, ipRules, characterRules, categoryRules, tagRules, negativeRules }
 * @param {Object} dynamicPresets - { categories: [], ips: [], characters: { '<ipName>': ['char1'] }, tags: [] }
 */
export function getTaggingSuggestions(inputContext, staticDictionaries, dynamicPresets) {
  const { name = '', note = '' } = inputContext || {}
  
  if (!name && !note) {
    return {
      categorySuggestion: null,
      ipSuggestion: null,
      characterSuggestions: [],
      tagSuggestions: []
    }
  }

  // 解析并清洗文本
  let normName = normalizeText(name)
  let normNote = normalizeText(note)
  const combinedText = `${normName} ${normNote}`

  // 将别名替换一下？如果影响用户本意则不要替换原文，只用于匹配。
  // 注意：真实场景中可能不需要替换原文，而是扩展搜索词汇，为简单计我们可以在副本字符串中做替换 (暂略)

  const {
    ipRules = [],
    characterRules = [],
    categoryRules = [],
    tagRules = [],
    negativeRules = []
  } = staticDictionaries || {}

  const dynamicIps = dynamicPresets?.ips || []
  const dynamicCategories = dynamicPresets?.categories || []
  const dynamicTags = dynamicPresets?.tags || []
  // 扁平化角色库用于匹配
  const dynamicCharacters = []
  if (dynamicPresets?.characters) {
    for (const [ipName, chars] of Object.entries(dynamicPresets.characters)) {
      chars.forEach(c => dynamicCharacters.push(c))
    }
  }

  let allCategoryMatches = []
  let allIpMatches = []
  let allCharacterMatches = []
  let allTagMatches = []

  // Name 权重高 (1.0)
  if (normName) {
    allCategoryMatches.push(...matchRules(normName, categoryRules, dynamicCategories, 1.0, '标题'))
    allIpMatches.push(...matchRules(normName, ipRules, dynamicIps, 1.0, '标题'))
    allCharacterMatches.push(...matchRules(normName, characterRules, dynamicCharacters, 1.0, '标题'))
    allTagMatches.push(...matchRules(normName, tagRules, dynamicTags, 1.0, '标题'))
  }

  // Note 权重中 (0.6)
  if (normNote) {
    allCategoryMatches.push(...matchRules(normNote, categoryRules, dynamicCategories, 0.6, '备注'))
    allIpMatches.push(...matchRules(normNote, ipRules, dynamicIps, 0.6, '备注'))
    allCharacterMatches.push(...matchRules(normNote, characterRules, dynamicCharacters, 0.6, '备注'))
    allTagMatches.push(...matchRules(normNote, tagRules, dynamicTags, 0.6, '备注'))
  }

  // 应用排除词组
  applyNegativeRules(combinedText, allCategoryMatches, negativeRules)
  applyNegativeRules(combinedText, allIpMatches, negativeRules)
  applyNegativeRules(combinedText, allCharacterMatches, negativeRules)
  // 不应用到 tags，以免误伤

  // 汇总去重合计算置信度
  allCategoryMatches = consolidateMatches(allCategoryMatches)
  allIpMatches = consolidateMatches(allIpMatches)
  allCharacterMatches = consolidateMatches(allCharacterMatches)
  allTagMatches = consolidateMatches(allTagMatches)

  // 互相验证提升比重
  applyRelationalBoost(allIpMatches, allCharacterMatches)

  return {
    // 类别选取最高置信度的一项
    categorySuggestion: allCategoryMatches.length > 0 ? allCategoryMatches[0] : null,
    // IP选取最高置信度一项
    ipSuggestion: allIpMatches.length > 0 ? allIpMatches[0] : null,
    // 角色最多返回5项
    characterSuggestions: allCharacterMatches.slice(0, 5),
    tagSuggestions: allTagMatches.slice(0, 5)
  }
}
