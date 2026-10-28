import { ref, watch, onBeforeUnmount } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { getTaggingSuggestions } from '@/utils/tagging/suggestTags'
import { getSharedTaggingContext } from '@/utils/tagging/taggingContextCache'
import { buildNeighborCategorySuggestion } from '@/utils/tagging/categoryNeighbors'
import staticDictionaries from '@/constants/taggingDictionaries'

export function useSmartTagging(form) {
  const presetsStore = usePresetsStore()
  const goodsStore = useGoodsStore()
  
  const tagSuggestions = ref({
    categorySuggestion: null,
    ipSuggestion: null,
    characterSuggestions: []
  })

  // 记录已被用户主动忽略的字段，防止再提示
  const ignoredFields = ref({
    category: false,
    ip: false,
    characters: false
  })

  // 共享缓存：全应用只扫一次商品列表（角色/标签 + n-gram 关键词学习）。
  // 频繁变更节流后静默重建；脏期间读旧值不阻塞。见 taggingContextCache
  const sharedTagContext = getSharedTaggingContext(presetsStore, goodsStore)

  // 延时计算，防抖
  let timeoutId = null

  onBeforeUnmount(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  })

  watch(
    () => [form.name, form.note, form.characters],
    ([newName, newNote, newChars]) => {
      // 当发生改变时计算推荐
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        calculateSuggestions(newName, newNote, newChars)
      }, 300)
    },
    { immediate: true }
  )

  function calculateSuggestions(name, note, chars = []) {
    if (!name && !note && (!chars || chars.length === 0)) {
      tagSuggestions.value = {
        categorySuggestion: null,
        ipSuggestion: null,
        characterSuggestions: []
      }
      return
    }

    // 拼装 dynamicPresets — use shared goods-derived cache（脏时读旧值，不阻塞）
    const { charMap, extractedTags } = sharedTagContext.getGoodsDerived() || { charMap: {}, extractedTags: new Set() }

    const dynamicPresets = {
      categories: [
        ...(presetsStore.categories || []),
        ...(sharedTagContext.getLearnedKeywords() || [])
      ],
      ips: presetsStore.ips || [],
      characters: charMap,
      tags: Array.from(extractedTags)
    }

    const result = getTaggingSuggestions({ name, note, chars }, staticDictionaries, dynamicPresets)

    // 规则/学习词都没给出分类时，用相似商品兜底（新品类词、系列名标题）
    if (!result.categorySuggestion && name) {
      const neighborSuggestion = buildNeighborCategorySuggestion(
        sharedTagContext.getCategoryNeighborIndex?.(),
        name
      )
      if (neighborSuggestion) result.categorySuggestion = neighborSuggestion
    }

    // 应用那些没有被忽略且原表单字段为空的项
    if (ignoredFields.value.category || form.category) result.categorySuggestion = null
    if (ignoredFields.value.ip || form.ip) result.ipSuggestion = null
    if (ignoredFields.value.characters) {
      result.characterSuggestions = []
    } else if (form.characters && form.characters.length) {
      // 过滤掉已在 form.characters 中的重复角色
      const existing = new Set(form.characters.map(c => c.toLowerCase()))
      result.characterSuggestions = (result.characterSuggestions || [])
        .filter(s => !existing.has(s.value.toLowerCase()))
    }
    // 自定义标签不再由智能填写推荐
    result.tagSuggestions = []

    tagSuggestions.value = {
      categorySuggestion: result.categorySuggestion || null,
      ipSuggestion: result.ipSuggestion || null,
      characterSuggestions: result.characterSuggestions || []
    }
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

    // 应用完后从面板中移除
    if (field === 'category') tagSuggestions.value.categorySuggestion = null
    if (field === 'ip') tagSuggestions.value.ipSuggestion = null
    if (field === 'characters') tagSuggestions.value.characterSuggestions = []
  }

  function ignoreSuggestion({ field }) {
    ignoredFields.value[field] = true
    if (field === 'category') tagSuggestions.value.categorySuggestion = null
    if (field === 'ip') tagSuggestions.value.ipSuggestion = null
    if (field === 'characters') tagSuggestions.value.characterSuggestions = []
  }

  function applyAllSuggestions() {
    if (tagSuggestions.value.categorySuggestion) applySuggestion({ field: 'category', value: tagSuggestions.value.categorySuggestion.value })
    if (tagSuggestions.value.ipSuggestion) applySuggestion({ field: 'ip', value: tagSuggestions.value.ipSuggestion.value })
    if (tagSuggestions.value.characterSuggestions && tagSuggestions.value.characterSuggestions.length) {
      applySuggestion({ field: 'characters', value: tagSuggestions.value.characterSuggestions.map(c => c.value) })
    }
  }

  return {
    tagSuggestions,
    applySuggestion,
    ignoreSuggestion,
    applyAllSuggestions
  }
}
