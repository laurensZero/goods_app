import { ref, computed } from 'vue'
import { getPublicGist } from '@/utils/githubGist'
import { validateSharePayload, extractSharePayloadFromGist } from '@/utils/shareGoods'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { formatDate } from '@/utils/format'

/**
 * 统一的分享导入逻辑，供 ClipboardDialog 和 ShareImportView 共用。
 *
 * @param {object} options
 * @param {function} [options.onImportError]  单条导入失败回调 (itemName, error)
 * @param {function} [options.onAllImported]  全部导入完成回调
 */
export function useShareImport(options = {}) {
  const {
    onImportError = null,
    onAllImported = null
  } = options

  const goodsStore = useGoodsStore()
  const presets = usePresetsStore()
  const syncStore = useSyncStore()

  const fetching = ref(false)
  const fetchError = ref('')
  const payload = ref(null)
  const importing = ref(false)
  const importedIndexes = ref(new Set())
  const importTarget = ref('collection')

  const remainingCount = computed(() => {
    if (!payload.value) return 0
    return payload.value.goods.filter((_, i) => !importedIndexes.value.has(i)).length
  })

  function getItemCover(item) {
    const images = item.images || []
    const primary = images.find((img) => img.isPrimary)
    return primary?.uri || images[0]?.uri || ''
  }

  function formatSharedAt(dateStr) {
    if (!dateStr) return ''
    try {
      return formatDate(new Date(dateStr), 'YYYY-MM-DD HH:mm')
    } catch {
      return dateStr
    }
  }

  function resetState() {
    fetchError.value = ''
    payload.value = null
    importing.value = false
    importedIndexes.value = new Set()
  }

  async function doFetch(gistIdValue, shareIdValue = '') {
    if (!gistIdValue) {
      fetchError.value = '无效的分享数据'
      return
    }

    fetching.value = true
    fetchError.value = ''
    payload.value = null

    try {
      const gist = await getPublicGist(gistIdValue, syncStore.token || '')
      if (!gist) {
        fetchError.value = '未找到该分享，请检查分享是否已取消'
        return
      }

      const data = extractSharePayloadFromGist(gist, shareIdValue)
      if (!data) {
        fetchError.value = '分享数据无效或已过期'
        return
      }

      const validation = validateSharePayload(data)
      if (!validation.valid) {
        fetchError.value = validation.reason
        return
      }

      payload.value = data
    } catch (e) {
      fetchError.value = e.message || '获取分享数据失败，请检查网络'
    } finally {
      fetching.value = false
    }
  }

  async function handleImport() {
    if (!payload.value) return

    importing.value = true

    for (let i = 0; i < payload.value.goods.length; i++) {
      if (importedIndexes.value.has(i)) continue

      try {
        const item = payload.value.goods[i]

        if (item.ip && !presets.ips.includes(item.ip)) {
          presets.addIp(item.ip)
        }
        if (item.category && !presets.categories.includes(item.category)) {
          presets.addCategory(item.category)
        }
        if (item.characters?.length) {
          for (const ch of item.characters) {
            const exists = presets.characters.some(c =>
              (typeof c === 'string' ? c : c.name) === ch
            )
            if (!exists) {
              presets.addCharacter(ch, item.ip || '')
            }
          }
        }

        await goodsStore.addGoods({
          name: item.name,
          category: item.category || '',
          ip: item.ip || '',
          characters: item.characters || [],
          variant: item.variant || '',
          price: item.price,
          actualPrice: item.actualPrice,
          currency: item.currency || 'CNY',
          actualPriceCurrency: item.actualPriceCurrency || 'CNY',
          quantity: item.quantity || 1,
          source: item.source || '',
          images: item.images || [],
          note: item.note || '',
          acquiredAt: item.acquiredAt || new Date().toISOString().slice(0, 10),
          tracks: item.tracks || [],
          isWishlist: importTarget.value === 'wishlist'
        })

        importedIndexes.value.add(i)
      } catch (err) {
        console.error('导入商品失败', err)
        if (onImportError) {
          onImportError(payload.value.goods[i].name, err)
          break
        }
      }
    }

    importing.value = false

    if (importedIndexes.value.size === payload.value.goods.length && onAllImported) {
      onAllImported()
    }
  }

  return {
    fetching,
    fetchError,
    payload,
    importing,
    importedIndexes,
    importTarget,
    remainingCount,
    doFetch,
    handleImport,
    getItemCover,
    formatSharedAt,
    resetState
  }
}
