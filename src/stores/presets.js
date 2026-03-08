/**
 * stores/presets.js
 * 管理分类列表和 IP / 作品列表（自定义预设）。
 * 使用 localStorage 持久化，独立于 SQLite 商品数据库。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY_CAT = 'goods_presets_categories'
const STORAGE_KEY_IP  = 'goods_presets_ips'
const STORAGE_KEY_CHR = 'goods_presets_characters'

const DEFAULT_CATEGORIES = ['手办', '挂件', '徽章', '卡片', 'CD/专辑', '周边服饰', '其他']
const DEFAULT_IPS = []
const DEFAULT_CHARACTERS = []

function loadList(key, defaults) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : [...defaults]
  } catch {
    return [...defaults]
  }
}

function saveList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch { /* ignore */ }
}

export const usePresetsStore = defineStore('presets', () => {
  // 若 key 不存在则写入默认值（保证 localStorage 始终有初始数据）
  if (localStorage.getItem(STORAGE_KEY_CAT) === null) {
    saveList(STORAGE_KEY_CAT, DEFAULT_CATEGORIES)
  }
  if (localStorage.getItem(STORAGE_KEY_IP) === null) {
    saveList(STORAGE_KEY_IP, DEFAULT_IPS)
  }
  if (localStorage.getItem(STORAGE_KEY_CHR) === null) {
    saveList(STORAGE_KEY_CHR, DEFAULT_CHARACTERS)
  }

  const categories  = ref(loadList(STORAGE_KEY_CAT, DEFAULT_CATEGORIES))
  const ips         = ref(loadList(STORAGE_KEY_IP,  DEFAULT_IPS))
  const characters  = ref(loadList(STORAGE_KEY_CHR, DEFAULT_CHARACTERS))

  // --- categories ---
  function addCategory(name) {
    const n = name.trim()
    if (!n || categories.value.includes(n)) return false
    categories.value.push(n)
    saveList(STORAGE_KEY_CAT, categories.value)
    return true
  }

  function removeCategory(name) {
    categories.value = categories.value.filter(c => c !== name)
    saveList(STORAGE_KEY_CAT, categories.value)
  }

  function reorderCategories(list) {
    categories.value = list
    saveList(STORAGE_KEY_CAT, categories.value)
  }

  // --- ips ---
  function addIp(name) {
    const n = name.trim()
    if (!n || ips.value.includes(n)) return false
    ips.value.push(n)
    saveList(STORAGE_KEY_IP, ips.value)
    return true
  }

  function removeIp(name) {
    ips.value = ips.value.filter(ip => ip !== name)
    saveList(STORAGE_KEY_IP, ips.value)
  }

  // --- characters ---
  // 迁移：将旧格式 string[] 转换为 {name, ip}[]
  function migrateCharacters(list) {
    return list.map(c => (typeof c === 'string' ? { name: c, ip: '' } : c))
  }
  if (characters.value.some(c => typeof c === 'string')) {
    characters.value = migrateCharacters(characters.value)
    saveList(STORAGE_KEY_CHR, characters.value)
  }

  function addCharacter(name, ip = '') {
    const n = name.trim()
    if (!n || characters.value.some(c => (typeof c === 'string' ? c : c.name) === n)) return false
    characters.value.push({ name: n, ip: ip.trim() })
    saveList(STORAGE_KEY_CHR, characters.value)
    return true
  }

  function removeCharacter(name) {
    characters.value = characters.value.filter(c => (typeof c === 'string' ? c : c.name) !== name)
    saveList(STORAGE_KEY_CHR, characters.value)
  }

  function updateCharacterIp(name, ip) {
    const idx = characters.value.findIndex(c => (typeof c === 'string' ? c : c.name) === name)
    if (idx !== -1) {
      characters.value.splice(idx, 1, { name, ip: ip.trim() })
      saveList(STORAGE_KEY_CHR, characters.value)
    }
  }

  /** 仅角色名列表，供选择器使用 */
  function characterNames() {
    return characters.value.map(c => c.name)
  }

  return {
    categories,
    ips,
    characters,
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
