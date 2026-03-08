import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const STORAGE_KEY_CAT = 'goods_presets_categories'
const STORAGE_KEY_IP = 'goods_presets_ips'
const STORAGE_KEY_CHR = 'goods_presets_characters'

const DEFAULT_CATEGORIES = ['手办', '挂件', '立牌', '徽章', '卡片', '明信片', '色纸', 'CD/专辑', '服饰', '其他']
const DEFAULT_IPS = []
const DEFAULT_CHARACTERS = []
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

export const usePresetsStore = defineStore('presets', () => {
  const categories = ref(cloneList(DEFAULT_CATEGORIES))
  const ips = ref(cloneList(DEFAULT_IPS))
  const characters = ref(cloneList(DEFAULT_CHARACTERS))
  const isReady = ref(false)

  async function init() {
    categories.value = await readPersistedList(STORAGE_KEY_CAT, DEFAULT_CATEGORIES)
    ips.value = await readPersistedList(STORAGE_KEY_IP, DEFAULT_IPS)
    characters.value = await readPersistedList(STORAGE_KEY_CHR, DEFAULT_CHARACTERS)

    if (!Array.isArray(categories.value)) categories.value = cloneList(DEFAULT_CATEGORIES)
    if (!Array.isArray(ips.value)) ips.value = cloneList(DEFAULT_IPS)
    if (!Array.isArray(characters.value)) characters.value = cloneList(DEFAULT_CHARACTERS)

    // 确保"其他"始终排在分类最末
    if (categories.value.includes('其他')) {
      categories.value = [
        ...categories.value.filter(c => c !== '其他'),
        '其他'
      ]
    }

    if (characters.value.some((character) => typeof character === 'string')) {
      characters.value = migrateCharacters(characters.value)
    }

    await Promise.all([
      writePersistedList(STORAGE_KEY_CAT, categories.value),
      writePersistedList(STORAGE_KEY_IP, ips.value),
      writePersistedList(STORAGE_KEY_CHR, characters.value)
    ])

    isReady.value = true
  }

  async function addCategory(name) {
    const normalized = name.trim()
    if (!normalized || categories.value.includes(normalized)) return false

    // 始终保持"其他"在最末尾
    const withoutOther = categories.value.filter(c => c !== '其他')
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

  async function addCharacter(name, ip = '') {
    const normalized = name.trim()
    if (!normalized || characters.value.some((character) => character.name === normalized)) return false

    characters.value.push({ name: normalized, ip: ip.trim() })
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
    return true
  }

  async function removeCharacter(name) {
    characters.value = characters.value.filter((character) => character.name !== name)
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
  }

  async function updateCharacterIp(name, ip) {
    const index = characters.value.findIndex((character) => character.name === name)
    if (index === -1) return

    characters.value.splice(index, 1, {
      name,
      ip: ip.trim()
    })
    await writePersistedList(STORAGE_KEY_CHR, characters.value)
  }

  function characterNames() {
    return characters.value.map((character) => character.name)
  }

  return {
    categories,
    ips,
    characters,
    isReady,
    init,
    addCategory,
    removeCategory,
    reorderCategories,
    addIp,
    removeIp,
    addCharacter,
    removeCharacter,
    updateCharacterIp,
    characterNames
  }
})
