// 精细导出字段注册表：字段定义 / 取值 / 封面回退 / 自定义字段展开 / 筛选与配置归一化。
// 这一层保持纯函数，UI 只负责把 i18n 文案挂到 label 上。
import i18n from '@/locales'
import { buildSearchText, GOODS_FILTER_COLLECT_STATUS_OPTIONS } from '@/utils/goods/filters'
import { getPrimaryGoodsImage } from '@/utils/goods/images'
import { rebaseExportImageUrl } from '@/utils/sync/exportImageUrls'
import {
  DEFAULT_CUSTOM_FIELD_SCOPES,
  isCustomFieldInScope,
  normalizeCustomFieldDefs
} from '@/utils/goods/customFields'
import { resolvePrimaryCollectStatus } from '@/utils/goods/status'

export const FINE_EXPORT_CONFIG_STORAGE_KEY = 'goods:fine-export-config:v1'
export const FINE_EXPORT_FORMAT_CSV = 'csv'
export const FINE_EXPORT_FORMAT_XLSX = 'xlsx'

export const FINE_EXPORT_STATUS_VALUES = GOODS_FILTER_COLLECT_STATUS_OPTIONS.map((option) => option.value)

export const DEFAULT_FINE_EXPORT_FIELD_KEYS = [
  'name',
  'category',
  'ip',
  'characters',
  'quantity',
  'collectStatus',
  'storageLocation',
  'note',
  'price',
  'actualPrice',
  'currency',
  'acquiredAt'
]

function stringValue(value) {
  return String(value ?? '').trim()
}

function listValue(value) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean).join('|') : stringValue(value)
}

function numberOrBlank(value) {
  if (value === '' || value == null) return ''
  const number = Number(value)
  return Number.isFinite(number) ? number : ''
}

function stringifyCell(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join('|')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
}

/**
 * 封面回退链：images 主图 → coverImage → image → images[0]。
 * 返回 uri + localPath，Excel 嵌图时本地文件优先。
 */
export function resolveFineExportCover(item) {
  const images = Array.isArray(item?.images) ? item.images : []
  const primary = getPrimaryGoodsImage(images, item?.coverImage || item?.image || '')
  if (!primary?.uri) {
    const fallbackUri = stringValue(item?.coverImage || item?.image)
    return {
      uri: rebaseExportImageUrl(fallbackUri),
      localPath: images.find((entry) => stringValue(entry?.uri) === fallbackUri)?.localPath || ''
    }
  }

  const matched = images.find((entry) => stringValue(entry?.uri) === primary.uri)
  return {
    uri: rebaseExportImageUrl(primary.uri),
    localPath: stringValue(primary.localPath || matched?.localPath)
  }
}

/** 导出全部图片 uri（主图优先、去重），CSV 用 | 连接，Excel 再筛成可点击链接。 */
export function collectFineExportImageUris(item) {
  const uris = []
  const cover = resolveFineExportCover(item)
  if (cover.uri) uris.push(cover.uri)

  const images = Array.isArray(item?.images) ? item.images : []
  for (const entry of images) {
    const uri = rebaseExportImageUrl(stringValue(typeof entry === 'string' ? entry : entry?.uri))
    if (uri) uris.push(uri)
  }

  if (images.length === 0) {
    for (const value of [item?.coverImage, item?.image]) {
      const uri = rebaseExportImageUrl(stringValue(value))
      if (uri) uris.push(uri)
    }
  }

  return [...new Set(uris)]
}

function getRecordTypeLabel(item) {
  const key = item?.isWishlist ? 'manage.fineExportWishlist' : 'manage.fineExportCollection'
  const translated = i18n.global.t(key)
  if (translated !== key) return translated
  return item?.isWishlist ? 'wishlist' : 'collection'
}

const BASE_FIELDS = [
  {
    key: 'name',
    group: 'profile',
    labelKey: 'manage.fineExportFieldName',
    label: '谷子名称',
    width: 28,
    getValue: (item) => stringValue(item?.name)
  },
  {
    key: 'recordType',
    group: 'profile',
    labelKey: 'manage.fineExportFieldRecordType',
    label: '记录类型',
    width: 10,
    // 内部字段：始终写入导出文件，用于回读时区分收藏 / 心愿，不参与字段勾选。
    locked: true,
    getValue: (item) => getRecordTypeLabel(item)
  },
  {
    key: 'category',
    group: 'profile',
    labelKey: 'manage.fineExportFieldCategory',
    label: '分类',
    width: 14,
    getValue: (item) => stringValue(item?.category)
  },
  {
    key: 'ip',
    group: 'profile',
    labelKey: 'manage.fineExportFieldIp',
    label: 'IP',
    width: 16,
    getValue: (item) => stringValue(item?.ip)
  },
  {
    key: 'characters',
    group: 'profile',
    labelKey: 'manage.fineExportFieldCharacters',
    label: '角色',
    width: 20,
    getValue: (item) => listValue(item?.characters)
  },
  {
    key: 'tags',
    group: 'profile',
    labelKey: 'manage.fineExportFieldTags',
    label: '标签',
    width: 18,
    getValue: (item) => listValue(item?.tags)
  },
  {
    key: 'variant',
    group: 'profile',
    labelKey: 'manage.fineExportFieldVariant',
    label: '款式',
    width: 15,
    getValue: (item) => stringValue(item?.variant)
  },
  {
    key: 'size',
    group: 'profile',
    labelKey: 'manage.fineExportFieldSize',
    label: '尺寸',
    width: 12,
    getValue: (item) => stringValue(item?.size)
  },
  {
    key: 'quantity',
    group: 'profile',
    labelKey: 'manage.fineExportFieldQuantity',
    label: '数量',
    width: 9,
    getValue: (item) => numberOrBlank(item?.quantity)
  },
  {
    key: 'collectStatus',
    group: 'profile',
    labelKey: 'manage.fineExportFieldCollectStatus',
    label: '状态',
    width: 12,
    getValue: (item) => stringValue(resolvePrimaryCollectStatus(item))
  },
  {
    key: 'storageLocation',
    group: 'profile',
    labelKey: 'manage.fineExportFieldStorageLocation',
    label: '收纳位置',
    width: 22,
    getValue: (item) => stringValue(item?.storageLocation)
  },
  {
    key: 'note',
    group: 'profile',
    labelKey: 'manage.fineExportFieldNote',
    label: '备注',
    width: 30,
    getValue: (item) => stringValue(item?.note)
  },
  {
    key: 'images',
    group: 'profile',
    labelKey: 'manage.fineExportFieldImages',
    label: '图片链接',
    headerAliases: ['manage.fineExportFieldCoverImage'],
    width: 40,
    // 内部字段：始终写入全部图片链接，方便回读时恢复多图，不参与字段勾选。
    locked: true,
    getValue: (item) => listValue(collectFineExportImageUris(item))
  },
  {
    key: 'goodsId',
    group: 'order',
    labelKey: 'manage.fineExportFieldGoodsId',
    label: '商品编号',
    width: 20,
    getValue: (item) => stringValue(item?.goodsId)
  },
  {
    key: 'acquiredAt',
    group: 'order',
    labelKey: 'manage.fineExportFieldAcquiredAt',
    label: '购买日期',
    width: 14,
    getValue: (item) => stringValue(item?.acquiredAt)
  },
  {
    key: 'price',
    group: 'order',
    labelKey: 'manage.fineExportFieldPrice',
    label: '标价',
    width: 11,
    getValue: (item) => numberOrBlank(item?.price)
  },
  {
    key: 'actualPrice',
    group: 'order',
    labelKey: 'manage.fineExportFieldActualPrice',
    label: '实付价',
    width: 11,
    getValue: (item) => numberOrBlank(item?.actualPrice)
  },
  {
    key: 'currency',
    group: 'order',
    labelKey: 'manage.fineExportFieldCurrency',
    label: '币种',
    width: 8,
    getValue: (item) => stringValue(item?.currency)
  },
  {
    key: 'shippingFee',
    group: 'order',
    labelKey: 'manage.fineExportFieldShippingFee',
    label: '运费',
    width: 10,
    getValue: (item) => numberOrBlank(item?.shippingFee)
  },
  {
    key: 'points',
    group: 'order',
    labelKey: 'manage.fineExportFieldPoints',
    label: '积分',
    width: 10,
    getValue: (item) => numberOrBlank(item?.points)
  },
  {
    key: 'sellPrice',
    group: 'order',
    labelKey: 'manage.fineExportFieldSellPrice',
    label: '出谷价',
    width: 11,
    getValue: (item) => numberOrBlank(item?.sellPrice)
  },
  {
    key: 'sellPlatform',
    group: 'order',
    labelKey: 'manage.fineExportFieldSellPlatform',
    label: '出谷平台',
    width: 16,
    getValue: (item) => stringValue(item?.sellPlatform)
  },
  {
    key: 'sellFee',
    group: 'order',
    labelKey: 'manage.fineExportFieldSellFee',
    label: '出谷手续费',
    width: 13,
    getValue: (item) => numberOrBlank(item?.sellFee)
  },
  {
    key: 'sellDate',
    group: 'order',
    labelKey: 'manage.fineExportFieldSellDate',
    label: '出谷日期',
    width: 14,
    getValue: (item) => stringValue(item?.sellDate)
  },
  {
    key: 'id',
    group: 'profile',
    labelKey: 'manage.fineExportFieldId',
    label: '记录 ID',
    width: 20,
    // 内部字段：始终导出，恢复时保留原始记录 id，不参与字段勾选。
    locked: true,
    getValue: (item) => stringValue(item?.id)
  }
]

export const FINE_EXPORT_BASE_FIELDS = BASE_FIELDS.map((field) => ({ ...field, scopes: [...DEFAULT_CUSTOM_FIELD_SCOPES] }))

export function getFineExportItemScope(item) {
  return item?.isWishlist ? 'wishlist' : 'collection'
}

/**
 * 展开自定义字段为导出字段。`scope` 用于配置页/测试按收藏或心愿过滤；
 * 不传则返回全部（混合列表导出时逐条判断 scopes，不适用就留空）。
 */
export function buildFineExportCustomFields(customDefs, { scope = '' } = {}) {
  return normalizeCustomFieldDefs(customDefs)
    .filter((def) => !scope || isCustomFieldInScope(def, scope))
    .map((def) => ({
      key: `custom:${def.id}`,
      group: 'custom',
      labelKey: '',
      label: def.name,
      defId: def.id,
      width: 18,
      scopes: [...def.scopes],
      getValue: (item) => stringValue(item?.customFields?.[def.id])
    }))
}

export function buildFineExportFields(customDefs, { scope = '' } = {}) {
  return [...FINE_EXPORT_BASE_FIELDS, ...buildFineExportCustomFields(customDefs, { scope })]
}

export function isFineExportFieldApplicable(field, item) {
  if (!field || field.group !== 'custom') return true
  return isCustomFieldInScope(
    { scopes: field.scopes || DEFAULT_CUSTOM_FIELD_SCOPES },
    getFineExportItemScope(item)
  )
}

/** Excel 需要保留数字 / 日期的原生类型，CSV 再统一转成字符串。 */
export function getFineExportFieldRawValue(item, field) {
  if (!field) return ''
  if (!isFineExportFieldApplicable(field, item)) return ''
  return typeof field.getValue === 'function' ? field.getValue(item) : item?.[field.key]
}

export function getFineExportFieldValue(item, field) {
  return stringifyCell(getFineExportFieldRawValue(item, field))
}

export function normalizeFineExportFilterValue(value) {
  return String(value ?? '').trim()
}

function normalizeStringSelection(input, allowed = null) {
  if (!Array.isArray(input)) return []
  const allowedSet = allowed ? new Set(allowed) : null
  const seen = new Set()
  const result = []
  for (const raw of input) {
    const value = String(raw ?? '').trim()
    if (!value || seen.has(value) || (allowedSet && !allowedSet.has(value))) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

export function createDefaultFineExportFilters() {
  return {
    keyword: '',
    categories: [],
    ips: [],
    characters: [],
    statuses: []
  }
}

export function createDefaultFineExportConfig() {
  return {
    fields: [...DEFAULT_FINE_EXPORT_FIELD_KEYS],
    filters: createDefaultFineExportFilters(),
    format: FINE_EXPORT_FORMAT_CSV,
    embedImages: true
  }
}

export function normalizeFineExportFilters(raw) {
  return {
    keyword: normalizeFineExportFilterValue(raw?.keyword),
    categories: normalizeStringSelection(raw?.categories),
    ips: normalizeStringSelection(raw?.ips),
    characters: normalizeStringSelection(raw?.characters),
    statuses: normalizeStringSelection(raw?.statuses, FINE_EXPORT_STATUS_VALUES)
  }
}

/**
 * 配置归一化：只保留当前仍存在的字段（自定义字段删除后 key 自动失效），
 * 但配置里明确清空过字段时不会偷偷回填默认字段。
 */
export function normalizeFineExportConfig(raw, { customDefs = [] } = {}) {
  const defaults = createDefaultFineExportConfig()
  const availableFields = buildFineExportFields(customDefs)
  const selectableFields = availableFields.filter((field) => !field.locked)
  const allowedKeys = new Set(selectableFields.map((field) => field.key))
  const rawFields = Array.isArray(raw?.fields) ? raw.fields : null
  const normalizedFields = (rawFields || defaults.fields)
    .map((key) => String(key ?? '').trim())
    .filter((key, index, list) => key && allowedKeys.has(key) && list.indexOf(key) === index)

  // null/缺失配置 → 默认字段；用户明确保存过空数组 → 保持为空（导出按钮会被禁用）
  const fields = rawFields
    ? normalizedFields
    : defaults.fields.filter((key) => allowedKeys.has(key))

  return {
    fields,
    filters: normalizeFineExportFilters(raw?.filters),
    format: raw?.format === FINE_EXPORT_FORMAT_XLSX ? FINE_EXPORT_FORMAT_XLSX : FINE_EXPORT_FORMAT_CSV,
    embedImages: raw?.embedImages !== false
  }
}

function includesSelected(selected, actual) {
  return selected.length === 0 || selected.includes(actual)
}

function includesAnySelected(selected, actualList) {
  if (selected.length === 0) return true
  if (!Array.isArray(actualList)) return false
  return selected.some((value) => actualList.includes(value))
}

/**
 * 主面板筛选：关键词（含拼音）、分类、IP、角色、状态，全部为 AND；维度内多选为 OR。
 */
export function matchesFineExportFilters(item, filters = {}, { searchText = '' } = {}) {
  if (!item) return false

  const keyword = normalizeFineExportFilterValue(filters.keyword).toLowerCase()
  if (keyword) {
    const haystack = searchText || item.searchText || buildSearchText(item)
    if (!haystack.toLowerCase().includes(keyword)) return false
  }

  const categories = Array.isArray(filters.categories) ? filters.categories : []
  if (!includesSelected(categories, item.category)) return false

  const ips = Array.isArray(filters.ips) ? filters.ips : []
  if (!includesSelected(ips, item.ip)) return false

  const characters = Array.isArray(filters.characters) ? filters.characters : []
  if (!includesAnySelected(characters, item.characters)) return false

  const statuses = Array.isArray(filters.statuses) ? filters.statuses : []
  if (statuses.length > 0 && !statuses.includes(resolvePrimaryCollectStatus(item))) return false

  return true
}

export function filterFineExportItems(items, filters, { getSearchText } = {}) {
  return (Array.isArray(items) ? items : []).filter((item) =>
    matchesFineExportFilters(item, filters, {
      searchText: typeof getSearchText === 'function' ? getSearchText(item) : ''
    })
  )
}

/** 「件」语义：记录条数 ≠ 数量，汇总和验收都以 quantity 求和。 */
export function countFineExportUnits(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const quantity = Number(item?.quantity)
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1)
  }, 0)
}

/**
 * 角色候选：预设角色（带所属 IP）与当前谷子里实际出现的角色取并集。
 * 选中 IP 后只保留该 IP 下的角色，供主面板和逐件挑选共用。
 */
export function collectFineExportCharacterOptions(items, presets = {}, selectedIps = []) {
  const ipFilter = new Set(
    (Array.isArray(selectedIps) ? selectedIps : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
  const names = []
  const seen = new Set()
  const push = (name) => {
    if (!name || seen.has(name)) return
    seen.add(name)
    names.push(name)
  }

  // 预设顺序优先；实际谷子里有、但预设里没有的角色按列表出现顺序补在后面。
  for (const character of presets.characters || []) {
    const name = typeof character === 'object'
      ? String(character?.name || '').trim()
      : String(character || '').trim()
    if (!name) continue
    const ip = typeof character === 'object' ? String(character?.ip || '').trim() : ''
    if (ipFilter.size === 0 || (ip && ipFilter.has(ip))) push(name)
  }

  for (const item of Array.isArray(items) ? items : []) {
    const ip = String(item?.ip || '').trim()
    if (ipFilter.size > 0 && !ipFilter.has(ip)) continue
    for (const character of item?.characters || []) {
      push(String(character || '').trim())
    }
  }

  return names
}

export function collectFineExportFilterOptions(items, presets = {}) {
  const categories = []
  const ips = []
  const categorySeen = new Set()
  const ipSeen = new Set()
  const pushCategory = (value) => {
    const text = String(value || '').trim()
    if (!text || categorySeen.has(text)) return
    categorySeen.add(text)
    categories.push(text)
  }
  const pushIp = (value) => {
    const text = String(value || '').trim()
    if (!text || ipSeen.has(text)) return
    ipSeen.add(text)
    ips.push(text)
  }

  // 分类 / IP 先按预设管理里的默认顺序，再接上预设中没有的实际值。
  for (const value of presets.categories || []) pushCategory(value)
  for (const value of presets.ips || []) pushIp(value)

  for (const item of Array.isArray(items) ? items : []) {
    pushCategory(item?.category)
    pushIp(item?.ip)
  }

  return {
    categories,
    ips,
    characters: collectFineExportCharacterOptions(items, presets)
  }
}
