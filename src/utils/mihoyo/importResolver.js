import { getTaggingSuggestions } from '@/utils/tagging/suggestTags'
import { learnCategoryKeywords } from '@/utils/tagging/learnCategoryKeywords'
import staticDictionaries from '@/constants/tagging-dictionaries.json'
import { parseCategoryFromName } from '@/utils/mihoyo/index'
import {
  displayVariantText,
  normalizeCharacterName,
  isLikelyCharName,
} from '@/utils/variantText'

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

function createCategoryBlocklist(categories = [], extraCategories = []) {
  return new Set(
    uniqueList([
      ...STATIC_CATEGORY_NAMES,
      ...(Array.isArray(categories) ? categories : []),
      ...(Array.isArray(extraCategories) ? extraCategories : []),
    ])
      .map(normalizeNameKey)
      .filter(Boolean)
  )
}

/** 取上下文中学到的分类关键词列表（学到的关键词也不应被当作角色） */
function learnedKeywordList(contextData) {
  return (contextData?.learnedCategories || [])
    .map((item) => item?.keyword)
    .filter(Boolean)
}

function isCategoryName(value, categoryBlocklist) {
  const key = normalizeNameKey(value)
  return Boolean(key && categoryBlocklist?.has(key))
}

function normalizeCharacterCandidate(value, categoryBlocklist = null) {
  const normalized = normalizeCharacterName(value)
  if (!normalized || /\d{4}年?/.test(normalized) || /周年/.test(normalized)) return ''
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

function isShortCharacterName(value) {
  const normalized = normalizeCharacterCandidate(value)
  return normalized && Array.from(normalized).length <= 1
}

function hasStrictShortCharacterMention(character, texts = []) {
  const normalized = normalizeCharacterCandidate(character)
  if (!normalized) return false

  const escaped = escapeRegExp(normalized)
  const suffixPattern = SHORT_CHARACTER_SUFFIXES.map(escapeRegExp).join('|')
  const standalonePattern = new RegExp(`(^|${SHORT_CHARACTER_BOUNDARY})${escaped}($|${SHORT_CHARACTER_BOUNDARY})`, 'i')
  const suffixPatternRegex = new RegExp(`(^|${SHORT_CHARACTER_BOUNDARY})${escaped}(?:${suffixPattern})(?=$|${SHORT_CHARACTER_BOUNDARY})`, 'i')
  const labelPattern = new RegExp(`(^|${SHORT_CHARACTER_BOUNDARY})(?:角色|款式|人物)\\s*[:：]?\\s*${escaped}($|${SHORT_CHARACTER_BOUNDARY})`, 'i')

  return (Array.isArray(texts) ? texts : [texts]).some((text) => {
    const source = normalizeText(text)
    return source && (
      standalonePattern.test(source)
      || suffixPatternRegex.test(source)
      || labelPattern.test(source)
    )
  })
}

function filterDynamicCharactersForText(characters, evidenceTexts = [], categoryBlocklist = null) {
  const nextCharacters = {}

  for (const [ip, list] of Object.entries(characters || {})) {
    const filtered = normalizeCharacterList(list, categoryBlocklist)
      .filter((character) => (
        !isShortCharacterName(character)
        || hasStrictShortCharacterMention(character, evidenceTexts)
      ))

    if (filtered.length) {
      nextCharacters[ip] = filtered
    }
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
  }
}

function addTagsToContext(context, tags) {
  if (!Array.isArray(tags)) return
  for (const tag of tags) {
    const value = normalizeText(tag)
    if (value) context.tags.add(value)
  }
}

export function buildMihoyoImportContext({
  goodsList = [],
  presetCharacters = [],
  categories = [],
  ips = [],
} = {}) {
  const context = {
    categories: Array.isArray(categories) ? [...categories] : [],
    ips: Array.isArray(ips) ? [...ips] : [],
    characters: {},
    tags: new Set(),
  }

  // 先学习「名称关键词 → 分类」，学到的关键词用于角色过滤：分类词不应再当作角色
  context.learnedCategories = learnCategoryKeywords(goodsList, {
    categories,
    characters: presetCharacters,
  })
  const learnedKeywords = learnedKeywordList(context)
  const baseCategoryBlocklist = createCategoryBlocklist(context.categories, learnedKeywords)

  for (const item of Array.isArray(goodsList) ? goodsList : []) {
    const ip = normalizeText(item?.ip) || UNKNOWN_IP
    const itemCategoryBlocklist = createCategoryBlocklist(context.categories, [item?.category, ...learnedKeywords])
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
  addUniqueValue(context.categories, item?.category)
  addUniqueValue(context.ips, item?.ip)
  const categoryBlocklist = createCategoryBlocklist(context.categories, [item?.category, ...learnedKeywordList(context)])
  for (const character of normalizeCharacterList(item?.characters, categoryBlocklist)) {
    addCharacterToContext(context, character, ip, categoryBlocklist)
  }
  addTagsToContext(context, item?.tags)
  return context
}

function normalizeContext(context = {}) {
  const tags = context.tags instanceof Set
    ? [...context.tags]
    : (Array.isArray(context.tags) ? context.tags : [])

  return {
    categories: Array.isArray(context.categories) ? context.categories : [],
    learnedCategories: Array.isArray(context.learnedCategories) ? context.learnedCategories : [],
    ips: Array.isArray(context.ips) ? context.ips : [],
    characters: context.characters && typeof context.characters === 'object' ? context.characters : {},
    tags,
  }
}

function getTaggingResult({ name, note = '', chars = [] }, context, options = {}) {
  const dynamicContext = normalizeContext(context)
  return getTaggingSuggestions(
    { name, note, chars },
    staticDictionaries,
    {
      categories: [...dynamicContext.categories, ...dynamicContext.learnedCategories],
      ips: dynamicContext.ips,
      characters: filterDynamicCharactersForText(
        dynamicContext.characters,
        options.evidenceTexts || [name, note],
        options.categoryBlocklist
      ),
      tags: dynamicContext.tags,
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
  const contextData = normalizeContext(context)
  const preliminaryCategory = parseCategoryFromName(`${name} ${variant || skuText}`)
  const evidenceTexts = [name, variant || skuText, note]
  const initialCategoryBlocklist = createCategoryBlocklist(contextData.categories, [
    source?.category,
    preliminaryCategory,
    ...learnedKeywordList(contextData),
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
  const categoryBlocklist = createCategoryBlocklist(contextData.categories, [
    source?.category,
    preliminaryCategory,
    category,
    taggingResult.categorySuggestion?.value,
    ...learnedKeywordList(contextData),
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
  const contextData = normalizeContext(context)
  const preliminaryCategory = parseCategoryFromName(`${name} ${variantName}`)
  const evidenceTexts = [name, variantName]
  const initialCategoryBlocklist = createCategoryBlocklist(contextData.categories, [
    currentCategory,
    preliminaryCategory,
    ...learnedKeywordList(contextData),
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
  const categoryBlocklist = createCategoryBlocklist(contextData.categories, [
    currentCategory,
    preliminaryCategory,
    category,
    taggingResult.categorySuggestion?.value,
    ...learnedKeywordList(contextData),
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
