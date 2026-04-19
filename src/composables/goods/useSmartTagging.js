import { ref, watch } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { getTaggingSuggestions } from '@/utils/tagging/suggestTags'
import staticDictionaries from '@/constants/tagging-dictionaries.json'

export function useSmartTagging(form) {
  const presetsStore = usePresetsStore()
  const goodsStore = useGoodsStore()
  
  const tagSuggestions = ref({
    categorySuggestion: null,
    ipSuggestion: null,
    characterSuggestions: [],
    tagSuggestions: []
  })

  // 记录已被用户主动忽略的字段，防止再提示
  const ignoredFields = ref({
    category: false,
    ip: false,
    characters: false,
    tags: false
  })

  // 延时计算，防抖
  let timeoutId = null

  watch(
    () => [form.name, form.note, form.characters],
    ([newName, newNote, newChars]) => {
      // 当发生改变时计算推荐
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        calculateSuggestions(newName, newNote, newChars)
      }, 300)
    },
    { immediate: true, deep: true }
  )

  function calculateSuggestions(name, note, chars = []) {
    if (!name && !note && (!chars || chars.length === 0)) {
      tagSuggestions.value = {
        categorySuggestion: null,
        ipSuggestion: null,
        characterSuggestions: [],
        tagSuggestions: []
      }
      return
    }

    // 拼装 dynamicPresets
    // 假设 characters 在 store 结构是 [{name, ip}, ...] ，需要转为 suggestTags 接受的 {'ip1': ['char1', 'char2']} 结构
    const charMap = {}
    if (presetsStore.characters?.length) {
      presetsStore.characters.forEach(c => {
        if (!c.name) return
        const ip = c.ip || 'unknown'
        if (!charMap[ip]) charMap[ip] = []
        charMap[ip].push(c.name)
      })
    }

    // 提取已被标记为标签和角色的数据
    const extractedTags = new Set()
    if (goodsStore?.list?.length) {
      goodsStore.list.forEach(item => {
        if (item.tags && item.tags.length) {
          item.tags.forEach(t => extractedTags.add(t))
        }
        if (item.characters && item.characters.length) {
          const ip = item.ip || 'unknown'
          if (!charMap[ip]) charMap[ip] = []
          item.characters.forEach(c => {
            if (!charMap[ip].includes(c)) charMap[ip].push(c)
          })
        }
      })
    }

    const dynamicPresets = {
      categories: presetsStore.categories || [],
      ips: presetsStore.ips || [],
      characters: charMap,
      tags: Array.from(extractedTags)
    }

    const result = getTaggingSuggestions({ name, note, chars }, staticDictionaries, dynamicPresets)

    // 应用那些没有被忽略且原表单字段为空的项
    if (ignoredFields.value.category || form.category) result.categorySuggestion = null
    if (ignoredFields.value.ip || form.ip) result.ipSuggestion = null
    if (ignoredFields.value.characters || (form.characters && form.characters.length)) result.characterSuggestions = []
    if (ignoredFields.value.tags || (form.tags && form.tags.length)) result.tagSuggestions = []

    tagSuggestions.value = result
  }

  function applySuggestion({ field, value }) {
    if (field === 'category') form.category = value
    else if (field === 'ip') form.ip = value
    else if (field === 'characters') {
      if (!form.characters) form.characters = []
      const newChars = Array.isArray(value) ? value : [value]
      newChars.forEach(c => {
        if (!form.characters.includes(c)) form.characters.push(c)
      })
    }
    else if (field === 'tags') {
      if (!form.tags) form.tags = []
      const newTags = Array.isArray(value) ? value : [value]
      newTags.forEach(t => {
        if (!form.tags.includes(t)) form.tags.push(t)
      })
    }

    // 应用完后从面板中移除
    if (field === 'category') tagSuggestions.value.categorySuggestion = null
    if (field === 'ip') tagSuggestions.value.ipSuggestion = null
    if (field === 'characters') tagSuggestions.value.characterSuggestions = []
    if (field === 'tags') tagSuggestions.value.tagSuggestions = []
  }

  function ignoreSuggestion({ field }) {
    ignoredFields.value[field] = true
    if (field === 'category') tagSuggestions.value.categorySuggestion = null
    if (field === 'ip') tagSuggestions.value.ipSuggestion = null
    if (field === 'characters') tagSuggestions.value.characterSuggestions = []
    if (field === 'tags') tagSuggestions.value.tagSuggestions = []
  }

  function applyAllSuggestions() {
    if (tagSuggestions.value.categorySuggestion) applySuggestion({ field: 'category', value: tagSuggestions.value.categorySuggestion.value })
    if (tagSuggestions.value.ipSuggestion) applySuggestion({ field: 'ip', value: tagSuggestions.value.ipSuggestion.value })
    if (tagSuggestions.value.characterSuggestions && tagSuggestions.value.characterSuggestions.length) {
      applySuggestion({ field: 'characters', value: tagSuggestions.value.characterSuggestions.map(c => c.value) })
    }
    if (tagSuggestions.value.tagSuggestions && tagSuggestions.value.tagSuggestions.length) {
      applySuggestion({ field: 'tags', value: tagSuggestions.value.tagSuggestions.map(t => t.value) })
    }
  }

  return {
    tagSuggestions,
    applySuggestion,
    ignoreSuggestion,
    applyAllSuggestions
  }
}
