import { getTaggingSuggestions } from '@/utils/tagging/suggestTags'
import { learnCategoryKeywords } from '@/utils/tagging/learnCategoryKeywords'
import staticDictionaries from '@/constants/tagging-dictionaries.json'
import { parseCategoryFromName } from '@/utils/mihoyo/index'
import {
  displayVariantText,
  normalizeCharacterName,
  isLikelyCharName,
  hasMerchandiseWord,
  MERCHANDISE_TYPE_WORDS,
  MERCHANDISE_SERIES_WORDS,
} from '@/utils/goods/variantText'

const MIN_CATEGORY_SCORE = 0.6
const MIN_IP_SCORE = 0.6
const MIN_CHARACTER_SCORE = 0.4
const UNKNOWN_IP = 'unknown'
const STATIC_CATEGORY_NAMES = [
  ...(staticDictionaries.categoryRules || []).map((rule) => rule.value),
  '满赠',
  '赠品',
  '手办',
  '立牌',
  '亚克力',
  '挂件',
  '挂饰',
  '吊件',
  '钥匙扣',
  '徽章',
  '马口铁',
  '胸章',
  '明信片',
  '卡片',
  '胶片卡',
  '随机卡',
  '收藏卡',
  '可换卡',
  '卡组',
  'CD',
  '专辑',
  '唱片',
  'OST',
  '色纸',
  '签板',
  '镭射票',
  '镭射',
  '服饰',
  '毛绒',
  '娃娃',
  '公仔',
  '抱枕',
  '玩偶',
  '摆件',
  '画册',
  // 谷子类型词：SKU / 款式文案里出现时是品类，不应被当成角色（含「毛巾」「闪卡」等）
  ...MERCHANDISE_TYPE_WORDS,
  ...MERCHANDISE_SERIES_WORDS,
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNameKey(value) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase()
}

function normalizeImageUrl(value) {
  return normalizeText(value).split('?')[0]
}

function uniqueList(list) {
  return [...new Set(list.filter(Boolean))]
}

const SHORT_CHARACTER_BOUNDARY = String.raw`[\s,，、/／|｜+＋&＆·・:：;；.!?。！？()（）\[\]【】{}<>《》"“”'‘’_-]`
const SHORT_CHARACTER_SUFFIXES = uniqueList([
  ...STATIC_CATEGORY_NAMES,
  '款',
  '角色',
  '人物',
  '周边',
]).sort((a, b) => b.length - a.length)

function addUniqueValue(list, value) {
  const normalized = normalizeText(value)
  if (!normalized || !Array.isArray(list) || list.includes(normalized)) return
  list.push(normalized)
}

// 静态分类黑名单只算一次。历史上每个商品都会把「预设分类 + 学到的关键词」
// 重新 normalize 成一个 Set，几千条收藏 × 上千个学习词时会在主线程上卡数秒。
const STATIC_CATEGORY_KEYS = uniqueList(STATIC_CATEGORY_NAMES).map(normalizeNameKey).filter(Boolean)

// 角色名规范化（去掉年份/周年/品类词）与文本无关，按原始字符串缓存，
// 避免逐条商品、逐条角色重复跑正则和品类词扫描。
const baseCharacterNameCache = new Map()
const BASE_CHARACTER_CACHE_LIMIT = 4000

/** 取上下文中学到的分类关键词列表（学到的关键词也不应被当作角色） */
function learnedKeywordList(context) {
  if (!context) return []
  if (context.__learnedKeywordList) return context.__learnedKeywordList
  const list = (context.learnedCategories || [])
    .map((item) => item?.keyword)
    .filter(Boolean)
  context.__learnedKeywordList = list
  context.__learnedKeywordKeys = list.map(normalizeNameKey).filter(Boolean)
  return list
}

/** 上下文的基础分类黑名单：静态分类 + 预设分类 + 学习词。只构建一次，分类增长时增量维护。 */
function getBaseCategoryBlocklist(context) {
  if (!context) return new Set(STATIC_CATEGORY_KEYS)
  if (context.__baseCategoryBlocklist) return context.__baseCategoryBlocklist
  const set = new Set(STATIC_CATEGORY_KEYS)
  for (const category of context.categories || []) {
    const key = normalizeNameKey(category)
    if (key) set.add(key)
  }
  learnedKeywordList(context)
  for (const key of context.__learnedKeywordKeys || []) set.add(key)
  context.__baseCategoryBlocklist = set
  return set
}

/**
 * 在基础黑名单上追加少量本次条目的分类词。
 * 绝大多数 extra 已经在基础集合里，直接复用；只有真正新增时才复制一份并缓存。
 */
function getExtendedCategoryBlocklist(context, extras = []) {
  const base = getBaseCategoryBlocklist(context)
  const extraKeys = []
  for (const extra of extras) {
    const key = normalizeNameKey(extra)
    if (key && !base.has(key) && !extraKeys.includes(key)) extraKeys.push(key)
  }
  if (extraKeys.length === 0) return base

  let cache = context.__categoryBlocklistExtras
  if (!cache) cache = context.__categoryBlocklistExtras = new Map()
  const cacheKey = extraKeys.sort().join('\u0001')
  let set = cache.get(cacheKey)
  if (!set) {
    set = new Set(base)
    for (const key of extraKeys) set.add(key)
    cache.set(cacheKey, set)
  }
  return set
}

/** 分类增长时同步维护缓存，避免下一条又从头 normalize 全量分类 */
function addContextCategory(context, value) {
  if (!context) return
  if (!Array.isArray(context.categories)) context.categories = []
  const before = context.categories.length
  addUniqueValue(context.categories, value)
  if (context.categories.length === before) return

  const normalized = normalizeText(value)
  if (context.__taggingCategories && normalized) context.__taggingCategories.push(normalized)
  const key = normalizeNameKey(normalized)
  if (key && context.__baseCategoryBlocklist) context.__baseCategoryBlocklist.add(key)
  // 旧扩展集合里没有刚加进来的分类，清掉缓存，后续按新基础集合重建
  context.__categoryBlocklistExtras = null
}

/** 传给标签引擎的分类池（预设分类 + 学习词），每条只准备一次 */
function getTaggingCategories(context) {
  if (!context) return []
  if (context.__taggingCategories) return context.__taggingCategories
  const list = [...(context.categories || [])]
  for (const item of context.learnedCategories || []) {
    const keyword = item?.keyword
    if (!keyword) continue
    list.push({
      keyword,
      value: item.value,
      _lowerKeyword: String(keyword).toLowerCase(),
    })
  }
  context.__taggingCategories = list
  return list
}

function getContextTags(context) {
  if (!context) return []
  if (Array.isArray(context.tags)) return context.tags
  if (context.tags instanceof Set) {
    if (!context.__tagsArray) context.__tagsArray = [...context.tags]
    return context.__tagsArray
  }
  return []
}

function isCategoryName(value, categoryBlocklist) {
  const key = normalizeNameKey(value)
  return Boolean(key && categoryBlocklist?.has(key))
}

/** 与上下文无关的角色名规范化（年份/周年/品类词过滤） */
function normalizeCharacterCandidateBase(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (baseCharacterNameCache.has(raw)) return baseCharacterNameCache.get(raw)

  const normalized = normalizeCharacterName(raw)
  let result = ''
  if (
    normalized
    && !/\d{4}年?/.test(normalized)
    && !/周年/.test(normalized)
    && !hasMerchandiseWord(normalized)
  ) {
    result = normalized
  }

  if (baseCharacterNameCache.size >= BASE_CHARACTER_CACHE_LIMIT) baseCharacterNameCache.clear()
  baseCharacterNameCache.set(raw, result)
  return result
}

function normalizeCharacterCandidate(value, categoryBlocklist = null) {
  const normalized = normalizeCharacterCandidateBase(value)
  if (!normalized) return ''
  if (isCategoryName(normalized, categoryBlocklist)) return ''
  return normalized
}

function normalizeCharacterList(list, categoryBlocklist = null) {
  if (!Array.isArray(list)) return []
  return uniqueList(list.map((item) => normalizeCharacterCandidate(item, categoryBlocklist)))
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 单字角色名的三种证据正则只和角色名有关：后缀表编译一次，角色图案按名缓存。
// 原实现每个商品×每个单字角色都会新建 4 个 RegExp，角色多时是纯浪费。
const SHORT_CHARACTER_SUFFIX_PATTERN = SHORT_CHARACTER_SUFFIXES.map(escapeRegExp).join('|')
const shortCharacterPatternCache = new Map()
const SHORT_CHARACTER_PATTERN_CACHE_LIMIT = 200

function getShortCharacterPatterns(name) {
  const cached = shortCharacterPatternCache.get(name)
  if (cached) return cached

  const escaped = escapeRegExp(name)
  const patterns = [
    new RegExp(`(^|${SHORT_CHARACTER_BOUNDARY})${escaped}($|${SHORT_CHARACTER_BOUNDARY})`, 'i'),
    new RegExp(`(^|${SHORT_CHARACTER_BOUNDARY})${escaped}(?:${SHORT_CHARACTER_SUFFIX_PATTERN})(?=$|${SHORT_CHARACTER_BOUNDARY})`, 'i'),
    new RegExp(`(^|${SHORT_CHARACTER_BOUNDARY})(?:角色|款式|人物)\\s*[:：]?\\s*${escaped}($|${SHORT_CHARACTER_BOUNDARY})`, 'i'),
  ]

  if (shortCharacterPatternCache.size >= SHORT_CHARACTER_PATTERN_CACHE_LIMIT) {
    shortCharacterPatternCache.clear()
  }
  shortCharacterPatternCache.set(name, patterns)
  return patterns
}

function isShortCharacterName(value) {
  const normalized = normalizeCharacterCandidateBase(value)
  return Boolean(normalized) && Array.from(normalized).length <= 1
}

function hasStrictShortCharacterMention(character, texts = []) {
  const normalized = normalizeCharacterCandidateBase(character)
  if (!normalized) return false

  const [standalonePattern, suffixPatternRegex, labelPattern] = getShortCharacterPatterns(normalized)

  return (Array.isArray(texts) ? texts : [texts]).some((text) => {
    const source = normalizeText(text)
    return source && (
      standalonePattern.test(source)
      || suffixPatternRegex.test(source)
      || labelPattern.test(source)
    )
  })
}

/** 上下文里的角色名只规范化一次；每条商品只做按分类黑名单过滤和短名证据判断 */
function getNormalizedCharacterMap(context) {
  if (!context) return {}
  if (context.__normalizedCharacters) return context.__normalizedCharacters

  const map = {}
  for (const [ip, list] of Object.entries(context.characters || {})) {
    const seen = new Set()
    const entries = []
    for (const value of Array.isArray(list) ? list : []) {
      const name = normalizeCharacterCandidateBase(value)
      if (!name || seen.has(name)) continue
      seen.add(name)
      entries.push({ name, short: Array.from(name).length <= 1 })
    }
    if (entries.length) map[ip] = entries
  }
  context.__normalizedCharacters = map
  return map
}

function filterDynamicCharactersForText(context, evidenceTexts = [], categoryBlocklist = null) {
  const normalizedCharacters = getNormalizedCharacterMap(context)
  const nextCharacters = {}

  for (const [ip, entries] of Object.entries(normalizedCharacters)) {
    const filtered = []
    for (const { name, short } of entries) {
      if (isCategoryName(name, categoryBlocklist)) continue
      if (short && !hasStrictShortCharacterMention(name, evidenceTexts)) continue
      filtered.push(name)
    }
    if (filtered.length) nextCharacters[ip] = filtered
  }

  return nextCharacters
}

function getPresetCharacterName(item) {
  if (typeof item === 'string') return item
  return item?.name || ''
}

function getPresetCharacterIp(item) {
  if (!item || typeof item === 'string') return ''
  return item.ip || ''
}

function addCharacterToContext(context, character, ip = '', categoryBlocklist = null) {
  const normalized = normalizeCharacterCandidate(character, categoryBlocklist)
  if (!normalized) return

  const key = normalizeText(ip) || UNKNOWN_IP
  if (!context.characters[key]) context.characters[key] = []
  if (!context.characters[key].includes(normalized)) {
    context.characters[key].push(normalized)
    context.__normalizedCharacters = null
  }
}

function addTagsToContext(context, tags) {
  if (!Array.isArray(tags)) return
  for (const tag of tags) {
    const value = normalizeText(tag)
    if (value) {
      const size = context.tags.size
      context.tags.add(value)
      if (context.tags.size !== size) context.__tagsArray = null
    }
  }
}

export function buildMihoyoImportContext({
  goodsList = [],
  presetCharacters = [],
  categories = [],
  ips = [],
  learnedCategories = null,
} = {}) {
  const context = {
    categories: Array.isArray(categories) ? [...categories] : [],
    ips: Array.isArray(ips) ? [...ips] : [],
    characters: {},
    tags: new Set(),
  }

  // 先学习「名称关键词 → 分类」，学到的关键词用于角色过滤：分类词不应再当作角色。
  // 传入外部共享缓存（learnedCategories）时直接复用，避免重复全量扫描
  context.learnedCategories = Array.isArray(learnedCategories)
    ? learnedCategories
    : learnCategoryKeywords(goodsList, {
        categories,
        characters: presetCharacters,
      })

  // 基础黑名单只构建一次：以前每个商品都会重新 normalize 全部分类 + 学习词，
  // 几千条收藏时本身就是一次主线程长任务。这里按分类缓存扩展结果。
  const baseCategoryBlocklist = getBaseCategoryBlocklist(context)

  for (const item of Array.isArray(goodsList) ? goodsList : []) {
    const ip = normalizeText(item?.ip) || UNKNOWN_IP
    const itemCategoryBlocklist = getExtendedCategoryBlocklist(context, [item?.category])
    for (const character of normalizeCharacterList(item?.characters, itemCategoryBlocklist)) {
      addCharacterToContext(context, character, ip, itemCategoryBlocklist)
    }
    addTagsToContext(context, item?.tags)
  }

  for (const item of Array.isArray(presetCharacters) ? presetCharacters : []) {
    addCharacterToContext(context, getPresetCharacterName(item), getPresetCharacterIp(item), baseCategoryBlocklist)
  }

  return context
}

export function addMihoyoImportContextItem(context, item) {
  if (!context) return context
  const ip = normalizeText(item?.ip) || UNKNOWN_IP
  addContextCategory(context, item?.category)
  addUniqueValue(context.ips, item?.ip)
  const categoryBlocklist = getExtendedCategoryBlocklist(context, [item?.category])
  for (const character of normalizeCharacterList(item?.characters, categoryBlocklist)) {
    addCharacterToContext(context, character, ip, categoryBlocklist)
  }
  addTagsToContext(context, item?.tags)
  return context
}

function getTaggingResult({ name, note = '', chars = [] }, context, options = {}) {
  const filteredCharacters = filterDynamicCharactersForText(
    context,
    options.evidenceTexts || [name, note],
    options.categoryBlocklist
  )
  // 扁平角色列表在标签引擎里按条商品展开；这里直接给出去，省掉重复 Object.entries
  const flatCharacters = []
  for (const list of Object.values(filteredCharacters)) flatCharacters.push(...list)

  return getTaggingSuggestions(
    { name, note, chars },
    staticDictionaries,
    {
      categories: getTaggingCategories(context),
      ips: Array.isArray(context?.ips) ? context.ips : [],
      characters: filteredCharacters,
      tags: getContextTags(context),
      _flatCharacters: flatCharacters,
    }
  )
}

function getScoredSuggestion(suggestion, minScore) {
  return suggestion && suggestion.score >= minScore ? normalizeText(suggestion.value) : ''
}

function resolveCategory({ name, variant, currentCategory, taggingResult }) {
  return normalizeText(currentCategory)
    || parseCategoryFromName(variant)
    || parseCategoryFromName(name)
    || getScoredSuggestion(taggingResult.categorySuggestion, MIN_CATEGORY_SCORE)
}

function resolveIp({ currentIp, taggingResult }) {
  return normalizeText(currentIp)
    || getScoredSuggestion(taggingResult.ipSuggestion, MIN_IP_SCORE)
}

function variantMatchesCharacter(variant, character) {
  const target = normalizeCharacterCandidate(character).toLowerCase()
  if (!target) return false

  const candidates = [
    variant?.text,
    displayVariantText(variant?.text),
    normalizeCharacterName(variant?.text),
  ].map((item) => normalizeText(item).toLowerCase())

  return candidates.some((item) => item === target || item.includes(target))
}

function resolvePreferredCharacter(preferredCharacter, variants, categoryBlocklist = null) {
  const preferred = normalizeCharacterCandidate(preferredCharacter, categoryBlocklist)
  if (!preferred || !isLikelyCharName(preferred)) return ''
  if (!Array.isArray(variants) || variants.length === 0) return preferred
  return variants.some((variant) => variantMatchesCharacter(variant, preferred)) ? preferred : ''
}


function collectExplicitCharacters(source, preferredCharacter = '', categoryBlocklist = null) {
  const directCharacters = normalizeCharacterList(source?.characters, categoryBlocklist)
  if (directCharacters.length) return directCharacters

  const preferred = resolvePreferredCharacter(preferredCharacter, source?.variants, categoryBlocklist)
  if (preferred) return [preferred]

  // 降级：从 SKU 属性中提取的角色名（API 明确标注的）
  const skuCharacters = normalizeCharacterList(source?.skuCharacters, categoryBlocklist)
  if (skuCharacters.length) return skuCharacters

  return []
}

function resolveCharacters({ explicitCharacters, taggingResult, categoryBlocklist = null, evidenceTexts = [] }) {
  if (explicitCharacters.length) return normalizeCharacterList(explicitCharacters, categoryBlocklist)

  const suggested = taggingResult.characterSuggestions?.find((item) => item.score >= MIN_CHARACTER_SCORE)
  const character = normalizeCharacterCandidate(suggested?.value, categoryBlocklist)
  if (isShortCharacterName(character) && !hasStrictShortCharacterMention(character, evidenceTexts)) return []
  return character ? [character] : []
}

export function normalizeMihoyoImageList(images) {
  return uniqueList(
    (Array.isArray(images) ? images : [])
      .map((url) => normalizeImageUrl(url))
  )
}

export function getDefaultMihoyoImages(images) {
  const normalized = normalizeMihoyoImageList(images)
  return [normalized[0]].filter(Boolean)
}

function resolveImageCandidates(source) {
  const variants = Array.isArray(source?.variants) ? source.variants : []
  const hasVariants = variants.length > 0
  return normalizeMihoyoImageList([
    source?.image || source?.coverImage || source?._coverUrl || '',
    ...(hasVariants ? [] : (source?.banners || [])),
    ...(source?.images || []).map((image) => (typeof image === 'string' ? image : image?.uri)),
  ])
}

export function resolveMihoyoImportDraft(source, { context, preferredCharacter = '' } = {}) {
  const variants = Array.isArray(source?.variants) ? source.variants : []
  const name = normalizeText(source?.name)
  const variant = normalizeText(source?.variant || source?.selectedVariantName)
  // 当 variant 为空（URL 导入等场景），从 variants[].text 中提取 SKU 文本用于分类推断
  const skuText = !variant
    ? normalizeText(variants.map((v) => v?.text).filter(Boolean).join(' / '))
    : ''
  const note = normalizeText(source?.note || source?.notes)
  const preliminaryCategory = parseCategoryFromName(`${name} ${variant || skuText}`)
  const evidenceTexts = [name, variant || skuText, note]
  const initialCategoryBlocklist = getExtendedCategoryBlocklist(context, [
    source?.category,
    preliminaryCategory,
  ])
  const explicitCharacters = collectExplicitCharacters({ ...source, variants, variant }, preferredCharacter, initialCategoryBlocklist)
  const taggingResult = getTaggingResult({
    name: [name, variant].filter(Boolean).join(' '),
    note,
    chars: explicitCharacters,
  }, context, {
    evidenceTexts,
    categoryBlocklist: initialCategoryBlocklist,
  })
  const category = resolveCategory({
    name,
    variant: variant || skuText,
    currentCategory: source?.category,
    taggingResult,
  })
  const categoryBlocklist = getExtendedCategoryBlocklist(context, [
    source?.category,
    preliminaryCategory,
    category,
    taggingResult.categorySuggestion?.value,
  ])
  const imageCandidates = resolveImageCandidates({ ...source, variants })
  const defaultImages = getDefaultMihoyoImages(imageCandidates)
  const primaryImage = defaultImages[0] || normalizeImageUrl(source?.image || source?.coverImage || source?._coverUrl)

  return {
    ...source,
    name,
    category,
    ip: resolveIp({
      currentIp: source?.ip,
      taggingResult,
    }),
    goodsId: normalizeText(source?.goodsId || source?.goods_id),
    image: primaryImage,
    _coverUrl: source?._coverUrl || primaryImage,
    images: defaultImages,
    price: source?.price == null ? '' : String(source.price),
    // 订单导入优惠分摊后的入手价；无则空串交给编辑器/统计回退标价
    actualPrice:
      source?.actualPrice == null || source.actualPrice === ''
        ? ''
        : String(source.actualPrice),
    unitActualPriceList: Array.isArray(source?.unitActualPriceList)
      ? source.unitActualPriceList.map((v) => String(v ?? ''))
      : [],
    notes: source?.notes || '',
    characters: resolveCharacters({ explicitCharacters, taggingResult, categoryBlocklist, evidenceTexts }),
    variant,
    baseParsedImages: imageCandidates,
    parsedImages: imageCandidates,
    variants,
  }
}

export function resolveMihoyoVariantDraft({
  name,
  variant,
  context,
  preferredCharacter = '',
  currentCategory = '',
} = {}) {
  const variantName = displayVariantText(variant?.text)
  const preliminaryCategory = parseCategoryFromName(`${name} ${variantName}`)
  const evidenceTexts = [name, variantName]
  const initialCategoryBlocklist = getExtendedCategoryBlocklist(context, [
    currentCategory,
    preliminaryCategory,
  ])
  const preferred = resolvePreferredCharacter(preferredCharacter, [variant], initialCategoryBlocklist)
  const explicitCharacters = preferred ? [preferred] : []
  const taggingResult = getTaggingResult({
    name: [name, variantName].filter(Boolean).join(' '),
    chars: explicitCharacters,
  }, context, {
    evidenceTexts,
    categoryBlocklist: initialCategoryBlocklist,
  })
  const category = resolveCategory({
    name,
    variant: variantName,
    currentCategory: '',
    taggingResult,
  })
  const categoryBlocklist = getExtendedCategoryBlocklist(context, [
    currentCategory,
    preliminaryCategory,
    category,
    taggingResult.categorySuggestion?.value,
  ])
  const characters = resolveCharacters({ explicitCharacters, taggingResult, categoryBlocklist, evidenceTexts })

  return {
    variantName,
    selectedCharacterName: characters[0] || '',
    category,
  }
}

export function applyMihoyoVariantMedia(variant, baseImages, currentImage = '') {
  const raw = normalizeImageUrl(variant?.cover_url || variant?.img_url)
  const nextImages = normalizeMihoyoImageList(baseImages)

  if (raw) {
    return {
      parsedImages: [raw, ...nextImages.filter((url) => url !== raw)],
      images: [raw],
      image: raw,
      price: variant?.price ?? null,
    }
  }

  const images = getDefaultMihoyoImages(nextImages)
  return {
    parsedImages: nextImages,
    images,
    image: images[0] || nextImages[0] || currentImage || '',
    price: variant?.price ?? null,
  }
}
