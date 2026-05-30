import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { getTaggingSuggestions } from '@/utils/tagging/suggestTags'
import staticDictionaries from '@/constants/tagging-dictionaries.json'
import { parseMihoyoUrl, isMihoyoGiftUrl, fetchGoodsDetail } from '@/utils/mihoyo/index'
import { validatePrice } from '@/utils/validate'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { extractCharsFromVariants, displayVariantText, normalizeCharacterName, isLikelyCharName } from '@/utils/variantText'
import { normalizeSearchHintText } from './useImportSearch'

function parseBatchUrlEntries(text) {
  const lines = String(text || '').split(/\r?\n/)
  const entries = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const urlMatches = [...line.matchAll(/https?:\/\/\S+/gi)]
    if (!urlMatches.length) continue

    if (urlMatches.length > 1) {
      for (const urlMatch of urlMatches) {
        const url = urlMatch[0].replace(/[),.，。；;]+$/, '')
        if (isMihoyoGiftUrl(url)) {
          entries.push({ url, count: 1 })
        }
      }
      continue
    }

    const urlMatch = urlMatches[0]
    const url = urlMatch[0].replace(/[),.，。；;]+$/, '')
    if (!isMihoyoGiftUrl(url)) continue

    const before = line.slice(0, urlMatch.index).trim()
    const after = line.slice(urlMatch.index + urlMatch[0].length).trim()
    const countSource = `${before} ${after}`.replace(/[×＊]/g, 'x')
    const countMatch = countSource.match(/(?:^|[^\d])(\d+)(?:\D*$)/)
    const count = countMatch ? Math.max(1, Number.parseInt(countMatch[1], 10) || 1) : 1

    entries.push({ url, count })
  }

  return entries
}

function cloneBatchItemData(data) {
  if (!data) return null
  return {
    ...data,
    characters: Array.isArray(data.characters) ? data.characters : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    images: Array.isArray(data.images) ? [...data.images] : [],
    baseParsedImages: Array.isArray(data.baseParsedImages) ? data.baseParsedImages : [],
    parsedImages: Array.isArray(data.parsedImages) ? data.parsedImages : [],
    variants: Array.isArray(data.variants) ? data.variants : [],
  }
}

export function useBatchImport({ urlInput, urlInputRef, syncUrlInput, isWishlistMode, ensureHistoricalTagContext, updateHistoricalTagContextFromItem, detectCategory }) {
  const { t } = useI18n()
  const router = useRouter()
  const goodsStore = useGoodsStore()
  const presets = usePresetsStore()

  const batchStep = ref('input')
  const batchItems = ref([])
  const batchParsing = ref(false)
  const editingBatchIdx = ref(-1)
  const batchEditForm = reactive({
    name: '', category: '', ip: '', image: '', images: [], price: '',
    notes: '', tags: [], characters: [], purchaseDate: '', variant: '',
  })
  const batchEditPriceError = ref('')
  const batchEditImages = ref([])
  const batchEditBaseImages = ref([])
  const batchEditVariants = ref([])
  const batchEditSelectedVariantKey = ref('')
  const batchEditSelectedCharacterName = ref('')
  const batchEditSaveAsCharacter = ref(false)
  const savingAll = ref(false)

  const urlEntries = computed(() => parseBatchUrlEntries(urlInput.value || ''))
  const batchMode = computed(() => urlEntries.value.length > 1 || urlEntries.value.some(entry => entry.count > 1))
  const batchTotalCount = computed(() => urlEntries.value.reduce((sum, entry) => sum + entry.count, 0))
  const batchParseButtonText = computed(() => {
    const entryCount = urlEntries.value.length
    if (!entryCount) return t('import.batchParse')
    return t('import.batchParseButtonText', { entries: entryCount, total: batchTotalCount.value })
  })
  const batchReadyCount = computed(() => batchItems.value.filter(item => item.status === 'ready' || item.status === 'saved').length)
  const batchErrorCount = computed(() => batchItems.value.filter(item => item.status === 'error').length)

  watch(urlInput, () => {
    if (batchStep.value !== 'input') {
      batchStep.value = 'input'
      batchItems.value = []
    }
  })

  async function handleBatchImport() {
    syncUrlInput()
    const entries = urlEntries.value
    if (!entries.length) return
    batchStep.value = 'parsing'
    batchParsing.value = true
    const historicalContext = ensureHistoricalTagContext()
    const parsedGroups = []
    batchItems.value = entries.map(({ url, count }) => ({
      url,
      count,
      status: 'pending',
      data: null,
      error: ''
    }))

    // Parse URLs with bounded concurrency (3 at a time)
    const CONCURRENCY = 3
    let nextIndex = 0

    async function parseNext() {
      while (nextIndex < entries.length) {
        const entryIndex = nextIndex++
        const entry = entries[entryIndex]
        const item = batchItems.value[entryIndex]
        if (!item) continue
        item.status = 'parsing'
        const group = { url: entry.url, count: entry.count, data: null, error: '' }
        try {
          const result = await parseMihoyoUrl(entry.url)
          const extractedCharacters = extractCharsFromVariants(result.variants)
          const taggingResult = getTaggingSuggestions(
            {
              name: result.name,
              note: '',
              chars: extractedCharacters,
            },
            staticDictionaries,
            {
              categories: presets.categories || [],
              ips: presets.ips || [],
              characters: historicalContext.characters,
              tags: historicalContext.tags,
            }
          )
          const resolvedIp = result.ip || (taggingResult.ipSuggestion && taggingResult.ipSuggestion.score >= 0.6 ? taggingResult.ipSuggestion.value : '') || ''
          const resolvedCategory = detectCategory(result.name, historicalContext) || (taggingResult.categorySuggestion && taggingResult.categorySuggestion.score >= 0.6 ? taggingResult.categorySuggestion.value : '') || ''
          const resolvedCharacters = extractedCharacters.length > 0
            ? [extractedCharacters[0]]
            : (taggingResult.characterSuggestions?.[0]?.score >= 0.4
              ? [taggingResult.characterSuggestions[0].value]
              : [])

          if (resolvedIp && !presets.ips.includes(resolvedIp)) presets.addIp(resolvedIp)
          if (resolvedCategory && !presets.categories.includes(resolvedCategory)) presets.addCategory(resolvedCategory)
          const hasVariants = Array.isArray(result.variants) && result.variants.length > 0
          const allImgs = [result.image, ...(hasVariants ? [] : (result.banners || []))]
            .map(u => (u || '').split('?')[0])
            .filter(Boolean)
            .filter((u, i, arr) => arr.indexOf(u) === i)
          group.data = {
            name: result.name?.trim() || '',
            category: resolvedCategory || '',
            ip: resolvedIp || '',
            goodsId: result.goodsId || '',
            image: allImgs[0] || '',
            images: hasVariants ? [allImgs[0]].filter(Boolean) : [...allImgs],
            price: result.price != null ? String(result.price) : '',
            notes: '',
            characters: resolvedCharacters,
            purchaseDate: '',
            variant: '',
            selectedVariantKey: '',
            baseParsedImages: allImgs,
            parsedImages: allImgs,
            variants: result.variants || [],
          }
          updateHistoricalTagContextFromItem({
            ip: group.data.ip,
            characters: group.data.characters,
            tags: group.data.tags,
          })
          parsedGroups.push(group)
          if (result.goodsId) {
            fetchGoodsDetail(result.goodsId).then(({ skuCovers, skuPrices, skuVariants, coverUrl, mainImages }) => {
              const sourceVariants = skuVariants.length
                ? skuVariants
                : group.data.variants
              const mergedVariants = sourceVariants.map(v => ({
                ...v,
                cover_url: skuCovers[v.key] || v.cover_url || coverUrl || '',
                price: v.price ?? skuPrices[v.key] ?? null,
              }))
              group.data.variants.splice(0, group.data.variants.length, ...mergedVariants)
              if (!group.data.variants.length) {
                const extras = mainImages
                  .map(u => (u || '').split('?')[0])
                  .filter(u => u && !group.data.baseParsedImages.includes(u))
                if (extras.length) {
                  group.data.baseParsedImages.splice(0, group.data.baseParsedImages.length, ...group.data.baseParsedImages, ...extras)
                  group.data.parsedImages.splice(0, group.data.parsedImages.length, ...group.data.baseParsedImages)
                }
              }
            }).catch(() => {})
          }
          item.status = 'ready'
          item.data = cloneBatchItemData(group.data)
          item.error = ''
        } catch (e) {
          const message = e.message || '解析失败'
          item.status = 'error'
          item.error = message
          parsedGroups.push({ url: entry.url, count: 1, data: null, error: message, status: 'error' })
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => parseNext())
    await Promise.all(workers)

    batchItems.value = parsedGroups.flatMap((group) => {
      if (group.status === 'error') return [group]
      return Array.from({ length: group.count }, () => ({
        url: group.url,
        status: 'ready',
        data: cloneBatchItemData(group.data),
        error: ''
      }))
    })
    batchParsing.value = false
    batchStep.value = 'list'
  }

  function openBatchEdit(idx) {
    const item = batchItems.value[idx]
    if (!item?.data) return
    batchEditPriceError.value = ''
    editingBatchIdx.value = idx
    const initialCharacterName = Array.isArray(item.data.characters) && item.data.characters.length === 1
      ? String(item.data.characters[0] || '').trim()
      : ''
    Object.assign(batchEditForm, {
      name: item.data.name,
      category: item.data.category,
      ip: item.data.ip,
      image: item.data.image,
      images: Array.isArray(item.data.images) ? [...item.data.images] : [item.data.image].filter(Boolean),
      price: item.data.price,
      notes: item.data.notes,
      tags: Array.isArray(item.data.tags) ? [...item.data.tags] : [],
      characters: initialCharacterName ? [initialCharacterName] : [],
      purchaseDate: item.data.purchaseDate,
      variant: item.data.variant || '',
    })
    batchEditBaseImages.value = [...(item.data.baseParsedImages || item.data.parsedImages || [])]
    batchEditImages.value = [...batchEditBaseImages.value]
    batchEditVariants.value = item.data.variants || []
    batchEditSelectedVariantKey.value = item.data.selectedVariantKey || ''
    batchEditSelectedCharacterName.value = initialCharacterName
    batchEditSaveAsCharacter.value = Boolean(initialCharacterName)
    if (batchEditSelectedVariantKey.value) {
      const selected = batchEditVariants.value.find((variant) => variant.key === batchEditSelectedVariantKey.value)
      if (selected) {
        applyBatchVariantMedia(selected)
      }
    }
  }

  function saveBatchEdit() {
    const idx = editingBatchIdx.value
    if (idx < 0) return
    batchEditPriceError.value = ''

    const priceValidation = validatePrice(batchEditForm.price)
    if (!priceValidation.valid) {
      batchEditPriceError.value = priceValidation.message
      return
    }

    Object.assign(batchItems.value[idx].data, {
      name: batchEditForm.name,
      category: batchEditForm.category,
      ip: batchEditForm.ip,
      image: batchEditForm.image,
      images: [...batchEditForm.images],
      price: batchEditForm.price === '' ? '' : Number(batchEditForm.price),
      notes: batchEditForm.notes,
      tags: [...batchEditForm.tags],
      characters: batchEditSaveAsCharacter.value && batchEditSelectedCharacterName.value
        ? [batchEditSelectedCharacterName.value]
        : [],
      purchaseDate: batchEditForm.purchaseDate,
      variant: batchEditForm.variant,
      selectedVariantKey: batchEditSelectedVariantKey.value,
      baseParsedImages: [...batchEditBaseImages.value],
      parsedImages: [...batchEditImages.value],
    })
    editingBatchIdx.value = -1
  }

  function applyBatchVariantMedia(variant) {
    const raw = (variant?.cover_url || variant?.img_url || '').split('?')[0]
    const nextImages = [...batchEditBaseImages.value]

    if (raw) {
      batchEditImages.value = [raw, ...nextImages.filter((url) => url !== raw)]
      batchEditForm.images = [raw]
      batchEditForm.image = raw
    } else {
      batchEditImages.value = nextImages
      batchEditForm.images = [nextImages[0] || ''].filter(Boolean)
      batchEditForm.image = batchEditForm.images[0] || nextImages[0] || batchEditForm.image
    }

    if (variant?.price != null) {
      batchEditForm.price = variant.price
    }
  }

  function handleBatchVariantSelect(v) {
    if (batchEditSelectedVariantKey.value === v.key) {
      batchEditSelectedVariantKey.value = ''
      batchEditForm.variant = ''
      batchEditSelectedCharacterName.value = ''
      batchEditSaveAsCharacter.value = false
      batchEditImages.value = [...batchEditBaseImages.value]
      batchEditForm.images = [...batchEditBaseImages.value]
      batchEditForm.image = batchEditBaseImages.value[0] || ''
    } else {
      batchEditSelectedVariantKey.value = v.key
      batchEditForm.variant = displayVariantText(v.text)
      const candidateCharacterName = normalizeCharacterName(v.text)
      batchEditSelectedCharacterName.value = isLikelyCharName(candidateCharacterName) ? candidateCharacterName : ''
      batchEditSaveAsCharacter.value = Boolean(batchEditSelectedCharacterName.value)
      applyBatchVariantMedia(v)
    }
  }

  function toggleBatchSaveAsCharacter() {
    batchEditSaveAsCharacter.value = !batchEditSaveAsCharacter.value
  }

  function toggleBatchEditImage(imgUrl) {
    const images = batchEditForm.images || []
    const idx = images.indexOf(imgUrl)
    if (idx >= 0) {
      batchEditForm.images = images.filter(u => u !== imgUrl)
    } else {
      batchEditForm.images = [...images, imgUrl]
    }
    batchEditForm.image = batchEditForm.images[0] || ''
  }

  async function saveAllBatch() {
    savingAll.value = true

    // Collect all ready items
    const readyItems = batchItems.value.filter((item) => item.status === 'ready')

    // Sync presets first (characters, IPs, categories)
    for (const item of readyItems) {
      for (const charName of item.data.characters) {
        if (!presets.characters.some(c => (typeof c === 'string' ? c : c.name) === charName)) {
          presets.addCharacter(charName, item.data.ip || '')
        }
      }
    }

    // Batch add all items in one DB transaction + single triggerRef
    try {
      const itemsData = readyItems.map((item) => ({
        name: item.data.name?.trim() || '',
        category: item.data.category,
        ip: item.data.ip,
        goodsId: item.data.goodsId || '',
        image: item.data.image,
        images: Array.isArray(item.data.images) ? item.data.images : [],
        price: item.data.price === '' ? null : Number(item.data.price),
        source: '米游铺',
        purchaseDate: item.data.purchaseDate,
        notes: item.data.notes,
        tags: Array.isArray(item.data.tags) ? item.data.tags : [],
        characters: item.data.characters,
        variant: item.data.variant || undefined,
        isWishlist: isWishlistMode.value,
      }))

      await goodsStore.addGoodsBatch(itemsData)

      for (const item of readyItems) {
        updateHistoricalTagContextFromItem({
          ip: item.data.ip,
          characters: item.data.characters,
          tags: item.data.tags,
        })
        item.status = 'saved'
      }
    } catch (e) {
      for (const item of readyItems) {
        item.status = 'error'
        item.error = e.message || '保存失败'
      }
    }

    savingAll.value = false
    runWithRouteTransition(() => router.replace(isWishlistMode.value ? '/wishlist' : '/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })
  }

  function resetBatchState() {
    batchStep.value = 'input'
    batchItems.value = []
  }

  return {
    batchStep,
    batchItems,
    batchParsing,
    savingAll,
    editingBatchIdx,
    batchEditForm,
    batchEditPriceError,
    batchEditImages,
    batchEditBaseImages,
    batchEditVariants,
    batchEditSelectedVariantKey,
    batchEditSelectedCharacterName,
    batchEditSaveAsCharacter,
    urlEntries,
    batchMode,
    batchTotalCount,
    batchParseButtonText,
    batchReadyCount,
    batchErrorCount,
    handleBatchImport,
    openBatchEdit,
    saveBatchEdit,
    handleBatchVariantSelect,
    toggleBatchSaveAsCharacter,
    toggleBatchEditImage,
    saveAllBatch,
    resetBatchState
  }
}
