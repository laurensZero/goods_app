import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { createAutoPush } from '@/stores/storeCore'
import {
  buildStorageLocationPath,
  normalizeStorageLocationValue,
  splitStorageLocationPath
} from '@/utils/storage/storageLocations'
import { isBuiltinEventType } from '@/constants/eventTypes'
import {
  CUSTOM_FIELD_NAME_MAX,
  createCustomFieldDefId,
  isCustomFieldType,
  normalizeCustomFieldDefs
} from '@/utils/goods/customFields'
import {
  normalizeCharacterName,
  buildCharacterRowId,
  parseCharacterRowId
} from '@/utils/presets/characterId'

export { normalizeCharacterName, buildCharacterRowId, parseCharacterRowId }

const STORAGE_KEY_CAT = 'goods_presets_categories'
const STORAGE_KEY_IP = 'goods_presets_ips'
const STORAGE_KEY_CHR = 'goods_presets_characters'
const STORAGE_KEY_LOC = 'goods_presets_storage_locations'
const STORAGE_KEY_SYNC_DIGEST = 'goods_presets_sync_digest'
const STORAGE_KEY_EVENT_TYPES = 'goods_presets_event_types'
const STORAGE_KEY_CUSTOM_FIELD_DEFS = 'goods_presets_custom_field_defs'
// 已应用/已确认的远端预设块时间戳（服务器时间域，毫秒字符串）
const STORAGE_KEY_PRESETS_REMOTE_AT = 'goods_presets_remote_updated_at'
const STORAGE_KEY_ROW_TOMBSTONES = 'goods_presets_row_tombstones_v1'

const DEFAULT_CATEGORIES = ['手办', '挂件', '立牌', '徽章', '卡牌', '明信片', '色纸', 'CD/专辑', '服饰', '镭射票', '画集', '赠品', '其他']
const DEFAULT_IPS = []
const DEFAULT_CHARACTERS = []
const DEFAULT_STORAGE_LOCATIONS = []
const DEFAULT_EVENT_TYPES = []
const DEFAULT_CUSTOM_FIELD_DEFS = []

function cloneList(list) {
  return JSON.parse(JSON.stringify(list))
}

function parseList(raw, defaults) {
  if (!raw) return cloneList(defaults)
  try {
    return JSON.parse(raw)
  } catch {
    return cloneList(defaults)
  }
}

async function readPersistedList(key, defaults) {
  const value = await readPersisted(key)
  return parseList(value, defaults)
}

async function writePersistedList(key, list) {
  await writePersisted(key, JSON.stringify(list))
}

// 快速摘要：用于检查是否需要重新同步（避免 700+ 商品的重复处理）
function computeListDigest(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '0'
  const json = JSON.stringify(arr)
  let hash = 0
  for (let i = 0; i < Math.min(json.length, 1000); i++) {
    hash = ((hash << 5) - hash) + json.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  return `${arr.length}_${Math.abs(hash)}`
}

async function getSyncDigest() {
  return (await readPersisted(STORAGE_KEY_SYNC_DIGEST)) || ''
}

async function setSyncDigest(digest) {
  await writePersisted(STORAGE_KEY_SYNC_DIGEST, digest)
}

function createCurrentDigest(items, storageLocationPaths) {
  const itemsDigest = computeListDigest(items)
  const pathsDigest = computeListDigest(storageLocationPaths)
  return `${itemsDigest}|${pathsDigest}`
}

function migrateCharacters(list) {
  return list.map((character) => (
    typeof character === 'string'
      ? { name: character, ip: '', fav: false }
      : { name: character.name ?? '', ip: character.ip ?? '', fav: Boolean(character.fav) }
  ))
}

function createStorageLocationId() {
  return `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeStorageLocationNodes(list) {
  if (!Array.isArray(list)) return cloneList(DEFAULT_STORAGE_LOCATIONS)

  const rawNodes = list
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.name || '').trim(),
      parentId: String(item?.parentId || '').trim()
    }))
    .filter((item) => item.name)

  const knownIds = new Set(rawNodes.map((item) => item.id).filter(Boolean))
  const usedIds = new Set()
  const siblingKeys = new Set()
  const normalized = []

  for (const raw of rawNodes) {
    const id = raw.id && !usedIds.has(raw.id) ? raw.id : createStorageLocationId()
    const parentId = raw.parentId && raw.parentId !== id && knownIds.has(raw.parentId) ? raw.parentId : ''
    const siblingKey = `${parentId}::${raw.name}`
    if (siblingKeys.has(siblingKey)) continue

    siblingKeys.add(siblingKey)
    usedIds.add(id)
    normalized.push({
      id,
      name: raw.name,
      parentId
    })
  }

  return normalized
}

function normalizeStorageLocationSnapshot(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return cloneList(DEFAULT_STORAGE_LOCATIONS)
  }

  // Backward compatibility for older sync payloads that stored only path strings.
  if (list.every((item) => typeof item === 'string')) {
    const nodes = []
    const nodeIndex = new Map()

    for (const rawPath of list) {
      const parts = splitStorageLocationPath(rawPath)
      let parentId = ''

      for (const part of parts) {
        const key = `${parentId}::${part}`
        const existing = nodeIndex.get(key)
        if (existing) {
          parentId = existing.id
          continue
        }

        const node = {
          id: createStorageLocationId(),
          name: part,
          parentId
        }
        nodes.push(node)
        nodeIndex.set(key, node)
        parentId = node.id
      }
    }

    return normalizeStorageLocationNodes(nodes)
  }

  return normalizeStorageLocationNodes(list)
}

function sortByLocale(list, pick = (item) => item) {
  return [...list].sort((a, b) => pick(a).localeCompare(pick(b), 'zh-Hans-CN'))
}

function normalizeCharacters(list) {
  const merged = new Map()

  for (const character of migrateCharacters(Array.isArray(list) ? list : [])) {
    const name = normalizeCharacterName(character.name)
    const ip = String(character.ip || '').trim()
    if (!name) continue

    const key = `${ip}\u0000${name}`
    const existing = merged.get(key)
    if (!existing) merged.set(key, { name, ip, fav: Boolean(character.fav) })
    else if (character.fav) existing.fav = true
  }

  // 旧模型按名字唯一：无 IP 的占位条目在同名带 IP 条目存在时丢弃，
  // 否则升级到 (ip,name) 后会凭空多出一条无 IP 的重复角色。
  const hasIpByName = new Set()
  for (const character of merged.values()) {
    if (character.ip) hasIpByName.add(character.name)
  }

  return [...merged.values()].filter((character) => character.ip || !hasIpByName.has(character.name))
}

function normalizePresetItems(list, { forceOtherLast = false } = {}) {
  const values = Array.isArray(list) ? list : []
  const seen = new Set()
  const result = []

  for (const item of values) {
    const name = String(item && typeof item === 'object' ? item.name : item || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    result.push({ name, fav: Boolean(item && typeof item === 'object' && item.fav) })
  }

  if (forceOtherLast) {
    const other = result.filter((item) => item.name === '其他')
    if (other.length > 0) {
      return [...result.filter((item) => item.name !== '其他'), ...other]
    }
  }
  return result
}

function normalizeCategoryItems(list) {
  return normalizePresetItems(list, { forceOtherLast: true })
}

function normalizeIpItems(list) {
  return normalizePresetItems(list)
}

function normalizeEventTypesList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const result = []
  for (const item of list) {
    const name = String((item && typeof item === 'object' ? item.name : item) || '').trim()
    if (!name || isBuiltinEventType(name) || seen.has(name)) continue
    seen.add(name)
    result.push({
      name,
      showTracks: Boolean(item && typeof item === 'object' && item.showTracks)
    })
  }
  return result
}

export const usePresetsStore = defineStore('presets', () => {
  // 预设条目的唯一数据源：fav 是条目自身的字段，不再单独维护收藏数组。
  // categories / ips / characters 仍以名字/对象数组的形式对外暴露（兼容现有页面），
  // 但都是这里派生出来的只读视图。
  const categoryItems = ref(normalizeCategoryItems(DEFAULT_CATEGORIES))
  const ipItems = ref(normalizeIpItems(DEFAULT_IPS))
  const characterItems = ref(normalizeCharacters(DEFAULT_CHARACTERS))
  const storageLocations = ref(cloneList(DEFAULT_STORAGE_LOCATIONS))
  const eventTypes = ref(cloneList(DEFAULT_EVENT_TYPES))
  const customFieldDefs = ref(cloneList(DEFAULT_CUSTOM_FIELD_DEFS))
  const isReady = ref(false)
  const rowTombstones = ref([])

  const categories = computed(() => categoryItems.value.map((item) => item.name))
  const ips = computed(() => ipItems.value.map((item) => item.name))
  const characters = computed(() => characterItems.value.map(({ name, ip }) => ({ name, ip })))

  const favoriteCategories = computed(() => categoryItems.value.filter((item) => item.fav).map((item) => item.name))
  const favoriteIps = computed(() => ipItems.value.filter((item) => item.fav).map((item) => item.name))
  const favoriteCharacters = computed(() => characterItems.value
    .filter((item) => item.fav)
    .map((item) => buildCharacterRowId(item.ip, item.name))
    .filter(Boolean))

  const favoriteCategorySet = computed(() => new Set(favoriteCategories.value))
  const favoriteIpSet = computed(() => new Set(favoriteIps.value))
  const favoriteCharacterSet = computed(() => new Set(favoriteCharacters.value))

  async function markRowTombstone(domain, id) {
    const key = `${domain}:${String(id || '').trim()}`
    if (!key.endsWith(':')) {
      rowTombstones.value = [...rowTombstones.value.filter((item) => item.key !== key), { key, domain, id: String(id).trim(), updatedAt: Date.now() }]
      await writePersisted(STORAGE_KEY_ROW_TOMBSTONES, JSON.stringify(rowTombstones.value))
    }
  }

  const storageLocationChildrenMap = computed(() => {
    const grouped = new Map()

    for (const node of storageLocations.value) {
      const key = node.parentId || ''
      const children = grouped.get(key) || []
      children.push(node)
      grouped.set(key, children)
    }

    for (const [key, nodes] of grouped.entries()) {
      grouped.set(key, sortByLocale(nodes, (item) => item.name))
    }

    return grouped
  })

  const storageLocationIdMap = computed(() =>
    new Map(storageLocations.value.map((node) => [node.id, node]))
  )

  const storageLocationTree = computed(() => {
    const attachChildren = (parentId = '', pathNames = []) =>
      getStorageLocationChildren(parentId).map((node) => {
        const currentNames = [...pathNames, node.name]
        return {
          ...node,
          path: buildStorageLocationPath(currentNames),
          depth: currentNames.length,
          children: attachChildren(node.id, currentNames)
        }
      })

    return attachChildren()
  })

  const storageLocationPaths = computed(() => {
    const paths = []

    const walk = (nodes) => {
      for (const node of nodes) {
        paths.push(node.path)
        if (node.children.length > 0) {
          walk(node.children)
        }
      }
    }

    walk(storageLocationTree.value)
    return paths
  })

  async function persistStorageLocations() {
    await writePersistedList(STORAGE_KEY_LOC, storageLocations.value)
  }

  const autoPushPresets = createAutoPush('presets')

  async function init() {
    const [cat, ip, chr, loc, evtTypes, fieldDefs, tombstones] = await Promise.all([
      readPersistedList(STORAGE_KEY_CAT, DEFAULT_CATEGORIES),
      readPersistedList(STORAGE_KEY_IP, DEFAULT_IPS),
      readPersistedList(STORAGE_KEY_CHR, DEFAULT_CHARACTERS),
      readPersistedList(STORAGE_KEY_LOC, DEFAULT_STORAGE_LOCATIONS),
      readPersistedList(STORAGE_KEY_EVENT_TYPES, DEFAULT_EVENT_TYPES),
      readPersistedList(STORAGE_KEY_CUSTOM_FIELD_DEFS, DEFAULT_CUSTOM_FIELD_DEFS),
      readPersisted(STORAGE_KEY_ROW_TOMBSTONES)
    ])
    categoryItems.value = normalizeCategoryItems(cat)
    ipItems.value = normalizeIpItems(ip)
    characterItems.value = normalizeCharacters(chr)
    storageLocations.value = loc
    eventTypes.value = normalizeEventTypesList(evtTypes)
    customFieldDefs.value = normalizeCustomFieldDefs(fieldDefs)
    try { rowTombstones.value = tombstones ? JSON.parse(tombstones) : [] } catch { rowTombstones.value = [] }

    if (!Array.isArray(storageLocations.value)) storageLocations.value = cloneList(DEFAULT_STORAGE_LOCATIONS)
    storageLocations.value = normalizeStorageLocationNodes(storageLocations.value)

    await Promise.all([
      writePersistedList(STORAGE_KEY_CAT, categoryItems.value),
      writePersistedList(STORAGE_KEY_IP, ipItems.value),
      writePersistedList(STORAGE_KEY_CHR, characterItems.value),
      writePersistedList(STORAGE_KEY_LOC, storageLocations.value),
      writePersistedList(STORAGE_KEY_EVENT_TYPES, eventTypes.value),
      writePersistedList(STORAGE_KEY_CUSTOM_FIELD_DEFS, customFieldDefs.value)
    ])

    isReady.value = true
  }

  function getStorageLocationChildren(parentId = '') {
    return storageLocationChildrenMap.value.get(parentId) || []
  }

  function buildStorageLocationPathById(id) {
    const names = []
    const visited = new Set()
    let currentId = String(id || '').trim()

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const node = storageLocationIdMap.value.get(currentId)
      if (!node) break
      names.unshift(node.name)
      currentId = node.parentId
    }

    return buildStorageLocationPath(names)
  }

  function findStorageLocationPathIds(value) {
    const parts = Array.isArray(value)
      ? value.map((part) => String(part || '').trim()).filter(Boolean)
      : splitStorageLocationPath(value)

    const ids = []
    let parentId = ''

    for (const part of parts) {
      const matched = getStorageLocationChildren(parentId).find((node) => node.name === part)
      if (!matched) return []
      ids.push(matched.id)
      parentId = matched.id
    }

    return ids
  }

  async function syncStorageLocationsFromPaths(paths) {
    if (!Array.isArray(paths) || paths.length === 0) return false

    const next = [...storageLocations.value]
    // Build index for O(1) lookup by parentId::name
    const nodeIndex = new Map(next.map((node) => [`${node.parentId}::${node.name}`, node]))
    let changed = false

    for (const rawPath of paths) {
      const parts = splitStorageLocationPath(rawPath)
      let parentId = ''

      for (const part of parts) {
        const key = `${parentId}::${part}`
        const existed = nodeIndex.get(key)
        if (existed) {
          parentId = existed.id
          continue
        }

        const node = {
          id: createStorageLocationId(),
          name: part,
          parentId
        }
        next.push(node)
        nodeIndex.set(key, node)
        parentId = node.id
        changed = true
      }
    }

    if (!changed) return false

    storageLocations.value = normalizeStorageLocationNodes(next)
    await persistStorageLocations()
    return true
  }

  async function syncCharactersFromGoods(items) {
    if (!Array.isArray(items) || items.length === 0) return false

    const merged = normalizeCharacters([
      ...characterItems.value,
      ...items.flatMap((item) => {
        const itemIp = String(item?.ip || '').trim()
        const itemCharacters = Array.isArray(item?.characters) ? item.characters : []
        return itemCharacters.map((name) => ({
          name,
          ip: itemIp,
          fav: false
        }))
      })
    ])

    if (merged.length === characterItems.value.length) {
      const unchanged = merged.every((character, index) => (
        character.name === characterItems.value[index]?.name
        && character.ip === characterItems.value[index]?.ip
        && Boolean(character.fav) === Boolean(characterItems.value[index]?.fav)
      ))
      if (unchanged) return false
    }

    characterItems.value = merged
    await writePersistedList(STORAGE_KEY_CHR, characterItems.value)
    return true
  }

  async function ensureStorageLocationPath(value) {
    const normalized = normalizeStorageLocationValue(value)
    if (!normalized) return []

    await syncStorageLocationsFromPaths([normalized])
    return findStorageLocationPathIds(normalized)
  }

  // 检查是否需要同步 — 避免 700+ 商品的重复处理
  async function syncPresetsIfNeeded(items, storageLocs) {
    if (!Array.isArray(items)) items = []
    if (!Array.isArray(storageLocs)) storageLocs = []

    const currentDigest = createCurrentDigest(items, storageLocs)
    const cachedDigest = await getSyncDigest()

    // 如果数据没变化，跳过同步
    if (currentDigest === cachedDigest) {
      return { synced: false, reason: 'digest-match' }
    }

    try {
      // 执行实际同步
      await Promise.all([
        syncCharactersFromGoods(items),
        syncStorageLocationsFromPaths(storageLocs)
      ])
      // 更新缓存摘要
      await setSyncDigest(currentDigest)
      return { synced: true, reason: 'completed' }
    } catch (e) {
      console.warn('[presets] syncPresetsIfNeeded failed:', e)
      return { synced: false, reason: 'error', error: e }
    }
  }

  async function addCategory(name) {
    const normalized = String(name || '').trim()
    if (!normalized || categoryItems.value.some((item) => item.name === normalized)) return false

    const other = categoryItems.value.find((item) => item.name === '其他')
    const withoutOther = categoryItems.value.filter((item) => item.name !== '其他')
    categoryItems.value = other
      ? [...withoutOther, { name: normalized, fav: false }, other]
      : [...withoutOther, { name: normalized, fav: false }]
    await writePersistedList(STORAGE_KEY_CAT, categoryItems.value)
    autoPushPresets()
    return true
  }

  async function removeCategory(name) {
    categoryItems.value = categoryItems.value.filter((item) => item.name !== name)
    await writePersistedList(STORAGE_KEY_CAT, categoryItems.value)
    await markRowTombstone('category', name)
    autoPushPresets()
  }

  async function updateCategoryName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next) return false

    const index = categoryItems.value.findIndex((item) => item.name === previous)
    if (index === -1) return false
    if (previous === next) return true
    if (categoryItems.value.some((item) => item.name === next)) return false

    const updated = [...categoryItems.value]
    updated.splice(index, 1, { ...updated[index], name: next })
    categoryItems.value = normalizeCategoryItems(updated)

    await writePersistedList(STORAGE_KEY_CAT, categoryItems.value)
    await markRowTombstone('category', previous)
    autoPushPresets()
    return true
  }

  async function reorderCategories(list) {
    const ordered = Array.isArray(list) ? list : []
    const byName = new Map(categoryItems.value.map((item) => [item.name, item]))
    const next = []
    for (const entry of ordered) {
      const name = String(entry && typeof entry === 'object' ? entry.name : entry || '').trim()
      const item = byName.get(name)
      if (!item) continue
      next.push(item)
      byName.delete(name)
    }
    for (const item of categoryItems.value) {
      if (byName.has(item.name)) next.push(item)
    }
    categoryItems.value = normalizeCategoryItems(next)
    await writePersistedList(STORAGE_KEY_CAT, categoryItems.value)
    autoPushPresets()
  }

  async function addEventType(name, showTracks = false) {
    const normalized = String(name || '').trim()
    if (!normalized || isBuiltinEventType(normalized)) return false
    if (eventTypes.value.some((item) => item.name === normalized)) return false

    eventTypes.value = [...eventTypes.value, { name: normalized, showTracks: Boolean(showTracks) }]
    await writePersistedList(STORAGE_KEY_EVENT_TYPES, eventTypes.value)
    autoPushPresets()
    return true
  }

  async function removeEventType(name) {
    const normalized = String(name || '').trim()
    if (!normalized || isBuiltinEventType(normalized)) return
    eventTypes.value = eventTypes.value.filter((item) => item.name !== normalized)
    await writePersistedList(STORAGE_KEY_EVENT_TYPES, eventTypes.value)
    await markRowTombstone('event_type', normalized)
    autoPushPresets()
  }

  async function updateEventTypeName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next || isBuiltinEventType(previous) || isBuiltinEventType(next)) return false

    const index = eventTypes.value.findIndex((item) => item.name === previous)
    if (index === -1) return false
    if (previous === next) return true
    if (eventTypes.value.some((item) => item.name === next)) return false

    const updated = [...eventTypes.value]
    updated.splice(index, 1, { ...updated[index], name: next })
    eventTypes.value = updated
    await writePersistedList(STORAGE_KEY_EVENT_TYPES, eventTypes.value)
    await markRowTombstone('event_type', previous)
    autoPushPresets()
    return true
  }

  async function updateEventTypeShowTracks(name, showTracks) {
    const normalized = String(name || '').trim()
    if (!normalized || isBuiltinEventType(normalized)) return false
    const index = eventTypes.value.findIndex((item) => item.name === normalized)
    if (index === -1) return false

    const next = Boolean(showTracks)
    if (eventTypes.value[index].showTracks === next) return true

    const updated = [...eventTypes.value]
    updated.splice(index, 1, { ...updated[index], showTracks: next })
    eventTypes.value = updated
    await writePersistedList(STORAGE_KEY_EVENT_TYPES, eventTypes.value)
    autoPushPresets()
    return true
  }

  // ── 自定义字段定义（随 presets 同步；值随 goods 行同步）──
  // 字段**改名不影响已填值**（值以 def.id 为键，这是 id 设计的意义）。
  // 但 select 的**选项改名/删除会留下旧值**，需要顺带改写 goods 的值：
  // 见 docs/goods-custom-fields-plan.md P1-7（goodsBatchRename.replaceCustomFieldOptionValue）。
  async function persistCustomFieldDefs() {
    await writePersistedList(STORAGE_KEY_CUSTOM_FIELD_DEFS, customFieldDefs.value)
  }

  function findCustomFieldDefIndex(id) {
    const target = String(id || '').trim()
    if (!target) return -1
    return customFieldDefs.value.findIndex((item) => item.id === target)
  }

  /** 新建定义；名称重复或已达上限返回 null */
  async function addCustomFieldDef({ name, type = 'text', options = [], scopes } = {}) {
    const created = normalizeCustomFieldDefs([
      { id: createCustomFieldDefId(), name, type, options, scopes }
    ])[0]
    if (!created) return null
    if (customFieldDefs.value.some((item) => item.name === created.name)) return null

    const next = normalizeCustomFieldDefs([...customFieldDefs.value, created])
    if (next.length <= customFieldDefs.value.length) return null

    customFieldDefs.value = next
    await persistCustomFieldDefs()
    autoPushPresets()
    return next[next.length - 1]
  }

  async function updateCustomFieldDefName(id, name) {
    const index = findCustomFieldDefIndex(id)
    if (index === -1) return false

    const current = customFieldDefs.value[index]
    const next = String(name || '').trim().slice(0, CUSTOM_FIELD_NAME_MAX)
    if (!next) return false
    if (current.name === next) return true
    if (customFieldDefs.value.some((item, i) => i !== index && item.name === next)) return false

    const updated = [...customFieldDefs.value]
    updated.splice(index, 1, { ...current, name: next })
    customFieldDefs.value = updated
    await persistCustomFieldDefs()
    autoPushPresets()
    return true
  }

  /** 切换类型；select → 其它类型会清空 options（由归一化保证） */
  async function updateCustomFieldDefType(id, type) {
    const index = findCustomFieldDefIndex(id)
    if (index === -1 || !isCustomFieldType(type)) return false

    const current = customFieldDefs.value[index]
    const nextType = String(type)
    if (current.type === nextType) return true

    const normalized = normalizeCustomFieldDefs([{ ...current, type: nextType }])[0]
    if (!normalized) return false

    const updated = [...customFieldDefs.value]
    updated.splice(index, 1, normalized)
    customFieldDefs.value = updated
    await persistCustomFieldDefs()
    autoPushPresets()
    return true
  }

  /** 覆盖 select 字段的选项列表（去重/去空/超上限由归一化处理） */
  async function updateCustomFieldDefOptions(id, options) {
    const index = findCustomFieldDefIndex(id)
    if (index === -1) return false

    const current = customFieldDefs.value[index]
    const normalized = normalizeCustomFieldDefs([{ ...current, type: 'select', options }])[0]
    if (!normalized) return false

    const updated = [...customFieldDefs.value]
    updated.splice(index, 1, normalized)
    customFieldDefs.value = updated
    await persistCustomFieldDefs()
    autoPushPresets()
    return true
  }

  /** 覆盖生效范围（收藏 / 心愿，可多选；空/非法回落两边都生效） */
  async function updateCustomFieldDefScopes(id, scopes) {
    const index = findCustomFieldDefIndex(id)
    if (index === -1) return false

    const normalized = normalizeCustomFieldDefs([{ ...customFieldDefs.value[index], scopes }])[0]
    if (!normalized) return false

    const updated = [...customFieldDefs.value]
    updated.splice(index, 1, normalized)
    customFieldDefs.value = updated
    await persistCustomFieldDefs()
    autoPushPresets()
    return true
  }

  /** 删除定义；返回被删除的定义（调用方据此提示影响范围 / 清理孤儿值） */
  async function removeCustomFieldDef(id) {
    const index = findCustomFieldDefIndex(id)
    if (index === -1) return null

    const removed = customFieldDefs.value[index]
    customFieldDefs.value = customFieldDefs.value.filter((item) => item.id !== removed.id)
    await persistCustomFieldDefs()
    await markRowTombstone('custom_field', removed.id)
    autoPushPresets()
    return removed
  }

  /** 按 id 顺序重排；未列出的定义保留原相对顺序追加（不静默丢定义） */
  async function reorderCustomFieldDefs(orderedIds) {
    if (!Array.isArray(orderedIds)) return false

    const remaining = new Map(customFieldDefs.value.map((item) => [item.id, item]))
    const next = []
    for (const rawId of orderedIds) {
      const def = remaining.get(String(rawId || '').trim())
      if (!def) continue
      remaining.delete(def.id)
      next.push(def)
    }
    for (const def of customFieldDefs.value) {
      if (remaining.has(def.id)) next.push(def)
    }

    customFieldDefs.value = normalizeCustomFieldDefs(next)
    await persistCustomFieldDefs()
    autoPushPresets()
    return true
  }

  async function addIp(name) {
    const normalized = String(name || '').trim()
    if (!normalized || ipItems.value.some((item) => item.name === normalized)) return false

    ipItems.value = [...ipItems.value, { name: normalized, fav: false }]
    await writePersistedList(STORAGE_KEY_IP, ipItems.value)
    autoPushPresets()
    return true
  }

  async function removeIp(name) {
    ipItems.value = ipItems.value.filter((item) => item.name !== name)
    await writePersistedList(STORAGE_KEY_IP, ipItems.value)
    await markRowTombstone('ip', name)
    autoPushPresets()
  }

  async function updateIpName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next) return false

    const index = ipItems.value.findIndex((item) => item.name === previous)
    if (index === -1) return false
    if (previous === next) return true
    if (ipItems.value.some((item) => item.name === next)) return false

    const updated = [...ipItems.value]
    updated.splice(index, 1, { ...updated[index], name: next })
    ipItems.value = normalizeIpItems(updated)

    await writePersistedList(STORAGE_KEY_IP, ipItems.value)
    await markRowTombstone('ip', previous)
    autoPushPresets()
    return true
  }

  /**
   * 把「行 id / 旧版名字」解析成实际角色，(ip,name) 复合身份。
   * 兼容旧调用只传名字：该名字在此 IP 下唯一时直接命中。
   */
  function resolveCharacterTarget(id) {
    const { ip, name } = parseCharacterRowId(id)
    if (!name) return null
    const exact = characterItems.value.find((character) => character.name === name && character.ip === ip)
    if (exact) return exact

    const matches = characterItems.value.filter((character) => character.name === name)
    if (matches.length === 0) return null
    if (matches.length === 1) return matches[0]
    return matches.find((character) => !character.ip) || null
  }

  async function addCharacter(name, ip = '') {
    const normalized = normalizeCharacterName(name)
    const normalizedIp = String(ip || '').trim()
    if (!normalized) return false
    if (characterItems.value.some((character) => character.name === normalized && character.ip === normalizedIp)) return false

    // 同名但无 IP 的占位条目：带 IP 新增时直接升级，避免留下重复的无 IP 角色
    const placeholderIndex = normalizedIp
      ? characterItems.value.findIndex((character) => character.name === normalized && !character.ip)
      : -1
    if (placeholderIndex >= 0) {
      const updated = [...characterItems.value]
      updated.splice(placeholderIndex, 1, { ...updated[placeholderIndex], ip: normalizedIp })
      characterItems.value = updated
    } else {
      characterItems.value = [...characterItems.value, { name: normalized, ip: normalizedIp, fav: false }]
    }

    await writePersistedList(STORAGE_KEY_CHR, characterItems.value)
    autoPushPresets()
    return true
  }

  async function removeCharacter(id) {
    const target = resolveCharacterTarget(id)
    if (!target) return

    const rowId = buildCharacterRowId(target.ip, target.name)
    characterItems.value = characterItems.value.filter((character) => !(character.name === target.name && character.ip === target.ip))
    await writePersistedList(STORAGE_KEY_CHR, characterItems.value)
    await markRowTombstone('character', rowId)
    autoPushPresets()
  }

  async function updateCharacterName(id, newName) {
    const target = resolveCharacterTarget(id)
    if (!target) return false

    const next = normalizeCharacterName(newName)
    if (!next) return false
    if (next === target.name) return true
    if (characterItems.value.some((character) => character.name === next && character.ip === target.ip)) return false

    const oldId = buildCharacterRowId(target.ip, target.name)
    const updated = [...characterItems.value]
    const index = updated.findIndex((character) => character.name === target.name && character.ip === target.ip)
    updated.splice(index, 1, { ...updated[index], name: next })
    characterItems.value = updated

    await writePersistedList(STORAGE_KEY_CHR, characterItems.value)
    await markRowTombstone('character', oldId)
    autoPushPresets()
    return true
  }

  async function updateCharacterIp(id, ip) {
    const target = resolveCharacterTarget(id)
    if (!target) return

    const nextIp = String(ip || '').trim()
    const oldId = buildCharacterRowId(target.ip, target.name)
    const newId = buildCharacterRowId(nextIp, target.name)
    if (oldId === newId) return

    const index = characterItems.value.findIndex((character) => character.name === target.name && character.ip === target.ip)
    if (index === -1) return

    // 目标 (nextIp, name) 已存在时视为合并，避免出现重复行；收藏状态取并集
    const duplicate = characterItems.value.some((character, i) => i !== index && character.name === target.name && character.ip === nextIp)
    const updated = [...characterItems.value]
    if (duplicate) {
      const kept = updated.find((character, i) => i !== index && character.name === target.name && character.ip === nextIp)
      updated.splice(index, 1)
      if (target.fav && kept) kept.fav = true
    } else {
      updated.splice(index, 1, { ...updated[index], ip: nextIp })
    }
    characterItems.value = updated

    await writePersistedList(STORAGE_KEY_CHR, characterItems.value)
    await markRowTombstone('character', oldId)
    autoPushPresets()
  }

  async function addStorageLocation(name, parentId = '') {
    const normalized = String(name || '').trim()
    const normalizedParentId = String(parentId || '').trim()
    if (!normalized) return null

    const existing = storageLocations.value.find((node) => (
      node.parentId === normalizedParentId && node.name === normalized
    ))
    if (existing) return existing

    const node = {
      id: createStorageLocationId(),
      name: normalized,
      parentId: normalizedParentId
    }
    storageLocations.value = normalizeStorageLocationNodes([...storageLocations.value, node])
    await persistStorageLocations()
    autoPushPresets()
    return storageLocations.value.find((item) => item.id === node.id) || node
  }

  async function renameStorageLocation(id, name) {
    const normalizedId = String(id || '').trim()
    const normalizedName = String(name || '').trim()
    if (!normalizedId || !normalizedName) return false

    const index = storageLocations.value.findIndex((node) => node.id === normalizedId)
    if (index === -1) return false

    const current = storageLocations.value[index]
    if (current.name === normalizedName) return true

    const duplicated = storageLocations.value.some((node) => (
      node.id !== normalizedId
      && node.parentId === current.parentId
      && node.name === normalizedName
    ))
    if (duplicated) return false

    const next = [...storageLocations.value]
    next.splice(index, 1, {
      ...current,
      name: normalizedName
    })
    storageLocations.value = normalizeStorageLocationNodes(next)
    await persistStorageLocations()
    autoPushPresets()
    return true
  }

  async function removeStorageLocation(id) {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) return []

    const removedIds = new Set()
    const stack = [normalizedId]

    while (stack.length > 0) {
      const currentId = stack.pop()
      if (!currentId || removedIds.has(currentId)) continue
      removedIds.add(currentId)

      for (const child of storageLocations.value) {
        if (child.parentId === currentId) {
          stack.push(child.id)
        }
      }
    }

    if (removedIds.size === 0) return []

    storageLocations.value = storageLocations.value.filter((node) => !removedIds.has(node.id))
    await persistStorageLocations()
    await Promise.all([...removedIds].map((id) => markRowTombstone('storage_location', id)))
    autoPushPresets()
    return [...removedIds]
  }

  async function replacePresetsSnapshot(snapshot = {}, { updatedAt = 0 } = {}) {
    const remoteUpdatedAt = Number(updatedAt) || 0
    const lastAppliedRemoteAt = Number(await readPersisted(STORAGE_KEY_PRESETS_REMOTE_AT)) || 0

    // 过期响应保护：pull 是在本地推送之前发出的（或早于已经应用过的块）时，
    // 它带回的是更旧的预设块。直接应用会让本地预设回退 —— 这是「刚加的字段又没了」
    // 的另一条路径。时间戳由服务器 now() 生成，同一时钟域，可直接比较。
    // 返回值：true = 已应用，false = 因过期响应跳过（调用方据此决定是否联动应用收藏馆背景）。
    if (remoteUpdatedAt > 0 && lastAppliedRemoteAt > 0 && remoteUpdatedAt < lastAppliedRemoteAt) {
      console.warn('[presets] skip stale remote snapshot', { remoteUpdatedAt, lastAppliedRemoteAt })
      return false
    }

    // 预设条目（含 fav）是唯一数据源；兼容旧的纯字符串列表和 {n, f} 过渡格式。
    const unpackItems = (raw) => {
      if (!raw) return []
      if (!Array.isArray(raw) && typeof raw === 'object' && Array.isArray(raw.n)) {
        const favorites = new Set(Array.isArray(raw.f) ? raw.f.map((name) => String(name || '').trim()) : [])
        return raw.n.map((entry) => {
          const name = String(entry && typeof entry === 'object' ? entry.name : entry || '').trim()
          return { name, fav: favorites.has(name) || Boolean(entry && typeof entry === 'object' && entry.fav) }
        })
      }
      return raw
    }

    categoryItems.value = normalizeCategoryItems(unpackItems(snapshot.categoryItems ?? snapshot.categories))
    ipItems.value = normalizeIpItems(unpackItems(snapshot.ipItems ?? snapshot.ips))
    characterItems.value = normalizeCharacters(unpackItems(snapshot.characterItems ?? snapshot.characters))

    storageLocations.value = normalizeStorageLocationSnapshot(snapshot.storageLocations)

    // eventTypes：兼容 string[] 与 [{name, showTracks}]
    const evtRaw = snapshot.eventTypes
    if (Array.isArray(evtRaw)) {
      eventTypes.value = normalizeEventTypesList(evtRaw)
    }

    // customFieldDefs：只有远端确实带了该键才覆盖。
    // 云端未迁移（列不存在）时 reader 会省略该键，此时保留本地定义而不是清空。
    if (snapshot.customFieldDefs !== undefined) {
      customFieldDefs.value = normalizeCustomFieldDefs(snapshot.customFieldDefs)
    }

    await Promise.all([
      writePersistedList(STORAGE_KEY_CAT, categoryItems.value),
      writePersistedList(STORAGE_KEY_IP, ipItems.value),
      writePersistedList(STORAGE_KEY_CHR, characterItems.value),
      writePersistedList(STORAGE_KEY_LOC, storageLocations.value),
      writePersistedList(STORAGE_KEY_EVENT_TYPES, eventTypes.value),
      writePersistedList(STORAGE_KEY_CUSTOM_FIELD_DEFS, customFieldDefs.value),
      ...(remoteUpdatedAt > 0
        ? [writePersisted(STORAGE_KEY_PRESETS_REMOTE_AT, String(remoteUpdatedAt))]
        : [])
    ])
    return true
  }

  // --- 收藏/置顶（fav 是预设条目自身的字段）---

  async function toggleFavoriteCategory(name) {
    const normalized = String(name || '').trim()
    if (!normalized) return
    categoryItems.value = categoryItems.value.map((item) => (
      item.name === normalized ? { ...item, fav: !item.fav } : item
    ))
    await writePersistedList(STORAGE_KEY_CAT, categoryItems.value)
    autoPushPresets()
  }

  async function toggleFavoriteIp(name) {
    const normalized = String(name || '').trim()
    if (!normalized) return
    ipItems.value = ipItems.value.map((item) => (
      item.name === normalized ? { ...item, fav: !item.fav } : item
    ))
    await writePersistedList(STORAGE_KEY_IP, ipItems.value)
    autoPushPresets()
  }

  /**
   * 传入行 id（`ip::name`）或旧版角色名；收藏状态直接写在对应角色条目上。
   */
  async function toggleFavoriteCharacter(id) {
    const target = resolveCharacterTarget(id)
    if (!target) return
    characterItems.value = characterItems.value.map((item) => (
      item.name === target.name && item.ip === target.ip
        ? { ...item, fav: !item.fav }
        : item
    ))
    await writePersistedList(STORAGE_KEY_CHR, characterItems.value)
    autoPushPresets()
  }

  function characterNames() {
    return [...new Set(characters.value.map((character) => character.name))]
  }

  /**
   * 行级墓碑在推送成功（或拉取确认远端已是墓碑）后清掉，避免每次同步重复推。
   * @param {Array<{domain?: string, id?: string}>|null} consumed
   */
  async function clearRowTombstones(consumed = null) {
    if (!Array.isArray(rowTombstones.value) || rowTombstones.value.length === 0) return
    if (!Array.isArray(consumed)) {
      rowTombstones.value = []
    } else {
      const keys = new Set(consumed.map((row) => `${row.domain}:${row.id}`))
      rowTombstones.value = rowTombstones.value.filter((row) => !keys.has(row.key))
    }
    await writePersisted(STORAGE_KEY_ROW_TOMBSTONES, JSON.stringify(rowTombstones.value))
  }

  return {
    categories,
    categoryItems,
    ips,
    ipItems,
    characters,
    characterItems,
    rowTombstones,
    clearRowTombstones,
    storageLocations,
    eventTypes,
    customFieldDefs,
    storageLocationTree,
    storageLocationPaths,
    isReady,
    init,
    addCategory,
    removeCategory,
    updateCategoryName,
    reorderCategories,
    addEventType,
    removeEventType,
    updateEventTypeName,
    updateEventTypeShowTracks,
    addCustomFieldDef,
    removeCustomFieldDef,
    updateCustomFieldDefName,
    updateCustomFieldDefType,
    updateCustomFieldDefScopes,
    updateCustomFieldDefOptions,
    reorderCustomFieldDefs,
    addIp,
    removeIp,
    updateIpName,
    addCharacter,
    removeCharacter,
    updateCharacterName,
    updateCharacterIp,
    addStorageLocation,
    renameStorageLocation,
    removeStorageLocation,
    getStorageLocationChildren,
    buildStorageLocationPathById,
    findStorageLocationPathIds,
    ensureStorageLocationPath,
    syncStorageLocationsFromPaths,
    syncCharactersFromGoods,
    syncPresetsIfNeeded,
    replacePresetsSnapshot,
    characterNames,
    // 收藏
    favoriteCategories,
    favoriteIps,
    favoriteCharacters,
    favoriteCategorySet,
    favoriteIpSet,
    favoriteCharacterSet,
    toggleFavoriteCategory,
    toggleFavoriteIp,
    toggleFavoriteCharacter
  }
})
