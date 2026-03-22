import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  buildStorageLocationPath,
  normalizeStorageLocationValue,
  splitStorageLocationPath
} from '@/utils/storageLocations'

const STORAGE_KEY_CAT = 'goods_presets_categories'
const STORAGE_KEY_IP = 'goods_presets_ips'
const STORAGE_KEY_CHR = 'goods_presets_characters'
const STORAGE_KEY_LOC = 'goods_presets_storage_locations'

const DEFAULT_CATEGORIES = ['手办', '挂件', '立牌', '徽章', '卡牌', '明信片', '色纸', 'CD/专辑', '服饰', '镭射票', '赠品', '其他']
const DEFAULT_IPS = []
const DEFAULT_CHARACTERS = []
const DEFAULT_STORAGE_LOCATIONS = []
const IS_NATIVE = Capacitor.isNativePlatform()

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

function readLocal(key, defaults) {
  try {
    return parseList(localStorage.getItem(key), defaults)
  } catch {
    return cloneList(defaults)
  }
}

function writeLocal(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // ignore
  }
}

async function readPersistedList(key, defaults) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return parseList(value, defaults)
    } catch {
      // fall through to localStorage
    }
  }

  return readLocal(key, defaults)
}

async function writePersistedList(key, list) {
  writeLocal(key, list)

  if (!IS_NATIVE) return

  try {
    await Preferences.set({
      key,
      value: JSON.stringify(list)
    })
  } catch {
    // ignore
  }
}

function migrateCharacters(list) {
  return list.map((character) => (
    typeof character === 'string'
      ? { name: character, ip: '' }
      : { name: character.name ?? '', ip: character.ip ?? '' }
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

    for (const rawPath of list) {
      const parts = splitStorageLocationPath(rawPath)
      let parentId = ''

      for (const part of parts) {
        const existing = nodes.find((node) => node.parentId === parentId && node.name === part)
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

export function normalizeCharacterName(name) {
  const text = String(name || '')
    .replace(/^\s*[\/／]+\s*/g, '')
    .replace(/\s*[\/／]+\s*$/g, '')
    .trim()
  if (!text) return ''

  if (/[\u4e00-\u9fff]/.test(text)) {
    return text.replace(/\s*[A-E]$/i, '').trim()
  }

  return text
}

function normalizeCharacters(list) {
  const merged = new Map()

  for (const character of migrateCharacters(list)) {
    const name = normalizeCharacterName(character.name)
    const ip = String(character.ip || '').trim()
    if (!name) continue

    if (!merged.has(name)) {
      merged.set(name, { name, ip })
      continue
    }

    const existing = merged.get(name)
    if (!existing.ip && ip) {
      merged.set(name, { name, ip })
    }
  }

  return [...merged.values()]
}

function normalizeCategoriesList(list) {
  const values = Array.isArray(list)
    ? list.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const unique = [...new Set(values)]
  const withoutOther = unique.filter((item) => item !== '其他')
  return unique.includes('其他')
    ? [...withoutOther, '其他']
    : withoutOther
}

function normalizeIpsList(list) {
  const values = Array.isArray(list)
    ? list.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  return [...new Set(values)]
}

export const usePresetsStore = defineStore('presets', () => {
  const categories = ref(cloneList(DEFAULT_CATEGORIES))
  const ips = ref(cloneList(DEFAULT_IPS))
  const characters = ref(cloneList(DEFAULT_CHARACTERS))
  const storageLocations = ref(cloneList(DEFAULT_STORAGE_LOCATIONS))
  const isReady = ref(false)

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

  async function init() {
    categories.value = await readPersistedList(STORAGE_KEY_CAT, DEFAULT_CATEGORIES)
    ips.value = await readPersistedList(STORAGE_KEY_IP, DEFAULT_IPS)
    characters.value = await readPersistedList(STORAGE_KEY_CHR, DEFAULT_CHARACTERS)
    storageLocations.value = await readPersistedList(STORAGE_KEY_LOC, DEFAULT_STORAGE_LOCATIONS)

    if (!Array.isArray(categories.value)) categories.value = cloneList(DEFAULT_CATEGORIES)
    if (!Array.isArray(ips.value)) ips.value = cloneList(DEFAULT_IPS)
    if (!Array.isArray(characters.value)) characters.value = cloneList(DEFAULT_CHARACTERS)
    if (!Array.isArray(storageLocations.value)) storageLocations.value = cloneList(DEFAULT_STORAGE_LOCATIONS)

    if (categories.value.includes('其他')) {
      categories.value = [
        ...categories.value.filter((category) => category !== '其他'),
        '其他'
      ]
    }

    characters.value = normalizeCharacters(characters.value)
    storageLocations.value = normalizeStorageLocationNodes(storageLocations.value)

    await Promise.all([
      writePersistedList(STORAGE_KEY_CAT, categories.value),
      writePersistedList(STORAGE_KEY_IP, ips.value),
      writePersistedList(STORAGE_KEY_CHR, characters.value),
      writePersistedList(STORAGE_KEY_LOC, storageLocations.value)
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
    let changed = false

    for (const rawPath of paths) {
      const parts = splitStorageLocationPath(rawPath)
      let parentId = ''

      for (const part of parts) {
        const existed = next.find((node) => node.parentId === parentId && node.name === part)
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
      ...characters.value,
      ...items.flatMap((item) => {
        const itemIp = String(item?.ip || '').trim()
        const itemCharacters = Array.isArray(item?.characters) ? item.characters : []
        return itemCharacters.map((name) => ({
          name,
          ip: itemIp
        }))
      })
    ])

    if (merged.length === characters.value.length) {
      const unchanged = merged.every((character, index) => (
        character.name === characters.value[index]?.name
        && character.ip === characters.value[index]?.ip
      ))
      if (unchanged) return false
    }

    characters.value = merged
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
    return true
  }

  async function ensureStorageLocationPath(value) {
    const normalized = normalizeStorageLocationValue(value)
    if (!normalized) return []

    await syncStorageLocationsFromPaths([normalized])
    return findStorageLocationPathIds(normalized)
  }

  async function addCategory(name) {
    const normalized = name.trim()
    if (!normalized || categories.value.includes(normalized)) return false

    const withoutOther = categories.value.filter((category) => category !== '其他')
    const hasOther = categories.value.includes('其他')
    categories.value = hasOther
      ? [...withoutOther, normalized, '其他']
      : [...withoutOther, normalized]
    await writePersistedList(STORAGE_KEY_CAT, categories.value)
    return true
  }

  async function removeCategory(name) {
    categories.value = categories.value.filter((category) => category !== name)
    await writePersistedList(STORAGE_KEY_CAT, categories.value)
  }

  async function updateCategoryName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next) return false

    const index = categories.value.findIndex((category) => category === previous)
    if (index === -1) return false
    if (previous === next) return true
    if (categories.value.includes(next)) return false

    const updated = [...categories.value]
    updated.splice(index, 1, next)
    categories.value = updated
    await writePersistedList(STORAGE_KEY_CAT, categories.value)
    return true
  }

  async function reorderCategories(list) {
    categories.value = [...list]
    await writePersistedList(STORAGE_KEY_CAT, categories.value)
  }

  async function addIp(name) {
    const normalized = name.trim()
    if (!normalized || ips.value.includes(normalized)) return false

    ips.value.push(normalized)
    await writePersistedList(STORAGE_KEY_IP, ips.value)
    return true
  }

  async function removeIp(name) {
    ips.value = ips.value.filter((ip) => ip !== name)
    await writePersistedList(STORAGE_KEY_IP, ips.value)
  }

  async function updateIpName(oldName, newName) {
    const previous = String(oldName || '').trim()
    const next = String(newName || '').trim()
    if (!previous || !next) return false

    const index = ips.value.findIndex((ip) => ip === previous)
    if (index === -1) return false
    if (previous === next) return true
    if (ips.value.includes(next)) return false

    const updated = [...ips.value]
    updated.splice(index, 1, next)
    ips.value = updated
    await writePersistedList(STORAGE_KEY_IP, ips.value)
    return true
  }

  async function addCharacter(name, ip = '') {
    const normalized = normalizeCharacterName(name)
    if (!normalized || characters.value.some((character) => character.name === normalized)) return false

    characters.value.push({ name: normalized, ip: ip.trim() })
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
    return true
  }

  async function removeCharacter(name) {
    const normalized = normalizeCharacterName(name)
    characters.value = characters.value.filter((character) => character.name !== normalized)
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
  }

  async function updateCharacterName(oldName, newName) {
    const previous = normalizeCharacterName(oldName)
    const next = normalizeCharacterName(newName)
    if (!previous || !next) return false

    const index = characters.value.findIndex((character) => character.name === previous)
    if (index === -1) return false
    if (previous === next) return true
    if (characters.value.some((character) => character.name === next)) return false

    const current = characters.value[index]
    const updated = [...characters.value]
    updated.splice(index, 1, {
      ...current,
      name: next
    })
    characters.value = updated
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
    return true
  }

  async function updateCharacterIp(name, ip) {
    const normalized = normalizeCharacterName(name)
    const index = characters.value.findIndex((character) => character.name === normalized)
    if (index === -1) return

    characters.value.splice(index, 1, {
      name: normalized,
      ip: ip.trim()
    })
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
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
    return [...removedIds]
  }

  async function replacePresetsSnapshot(snapshot = {}) {
    categories.value = normalizeCategoriesList(snapshot.categories)
    ips.value = normalizeIpsList(snapshot.ips)
    characters.value = normalizeCharacters(snapshot.characters)
    storageLocations.value = normalizeStorageLocationSnapshot(snapshot.storageLocations)

    await Promise.all([
      writePersistedList(STORAGE_KEY_CAT, categories.value),
      writePersistedList(STORAGE_KEY_IP, ips.value),
      writePersistedList(STORAGE_KEY_CHR, characters.value),
      writePersistedList(STORAGE_KEY_LOC, storageLocations.value)
    ])
  }

  function characterNames() {
    return characters.value.map((character) => character.name)
  }

  return {
    categories,
    ips,
    characters,
    storageLocations,
    storageLocationTree,
    storageLocationPaths,
    isReady,
    init,
    addCategory,
    removeCategory,
    updateCategoryName,
    reorderCategories,
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
    replacePresetsSnapshot,
    characterNames
  }
})
