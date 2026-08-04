import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeCharacterName, displayVariantText } from '@/utils/variantText'
import {
  searchGoodsList,
  searchGoodsSpuList,
  fetchGoodsDetail,
  fetchGoodsCategoryList,
  getMihoyoShopCodeByIp,
  MIHOYO_ROLE_SHOP_CODES
} from '@/utils/mihoyo/index'

export function normalizeSearchHintText(value) {
  return String(value || '')
    .trim()
    .replace(/[「」『』【】《》〈〉]/g, '')
    .replace(/^["'""‘’]+|["'""‘’]+$/g, '')
    .trim()
}

export function useImportSearch({ goodsStore, wishlistCharacterOptions, setUrlInputValue, handleParse }) {
  const { t } = useI18n()

  const searchKeyword = ref('')
  const searchResults = ref([])
  const searchExpanded = ref(false)
  const searching = ref(false)
  const searchLoadingMore = ref(false)
  const searchError = ref('')
  const variantSearchHint = ref('')
  const selectedSearchCharacter = ref('')
  const selectedSearchGoodsId = ref('')
  const searchLoadMoreRef = ref(null)
  const SEARCH_RESULTS_COLLAPSED_COUNT = 6
  const SEARCH_RESULTS_EXPANDED_COUNT = 24
  const searchSession = reactive({
    requestId: 0,
    mode: '',
    keyword: '',
    page: 0,
    hasMore: false,
    roleTargets: []
  })
  const searchResultVariantCoverCache = new Map()
  let searchResultsObserver = null
  let searchScrollCleanup = null
  let ensureSearchFillPromise = null

  const visibleSearchResults = computed(() => (
    searchExpanded.value
      ? searchResults.value
      : searchResults.value.slice(0, SEARCH_RESULTS_COLLAPSED_COUNT)
  ))

  const showSearchToggle = computed(() => (
    searchResults.value.length > SEARCH_RESULTS_COLLAPSED_COUNT
  ))
  const searchHasMore = computed(() => searchSession.hasMore)
  const showSearchLoadMoreStatus = computed(() => (
    searchExpanded.value
    && visibleSearchResults.value.length > 0
    && (searchLoadingMore.value || searchHasMore.value)
  ))

  const mihoyoRoleCategoryCache = new Map()

  function normalizeRoleCategoryName(name) {
    return String(name || '')
      .trim()
      .replace(/\(/g, '（')
      .replace(/\)/g, '）')
      .replace(/\s+/g, '')
  }

  function extractRoleCategories(categories) {
    const roleGroup = (categories || []).find((item) => String(item?.name || '').trim() === '角色分类')
    return Array.isArray(roleGroup?.child) ? roleGroup.child : []
  }

  async function getRoleCategoriesForShop(shopCode) {
    const normalizedShopCode = String(shopCode || '').trim()
    if (!normalizedShopCode) return []
    if (!mihoyoRoleCategoryCache.has(normalizedShopCode)) {
      const categories = await fetchGoodsCategoryList(normalizedShopCode)
      mihoyoRoleCategoryCache.set(normalizedShopCode, extractRoleCategories(categories))
    }
    return mihoyoRoleCategoryCache.get(normalizedShopCode) || []
  }

  async function resolveRoleSearchTargets(keyword) {
    const normalizedKeyword = normalizeRoleCategoryName(keyword)
    if (!normalizedKeyword) return []

    const preferredCharacter = wishlistCharacterOptions.value.find(
      (item) => normalizeRoleCategoryName(item.name) === normalizedKeyword
    )
    const preferredShopCode = getMihoyoShopCodeByIp(preferredCharacter?.ip)
    const shopCodes = preferredShopCode
      ? [preferredShopCode]
      : MIHOYO_ROLE_SHOP_CODES

    const targets = []

    for (const shopCode of shopCodes) {
      const categories = await getRoleCategoriesForShop(shopCode)
      const matchedCategory = categories.find((item) => normalizeRoleCategoryName(item?.name) === normalizedKeyword)
      if (!matchedCategory?.id) continue
      targets.push({
        shopCode,
        categoryId: matchedCategory.id,
        categoryName: String(matchedCategory.name || '').trim()
      })
    }

    return targets
  }

  function getSearchResultKey(item) {
    return `${item?.shop_code || ''}:${item?.goods_id || ''}`
  }

  function getSearchResultCover(item) {
    return String(item?.search_cover_url || item?.cover_url || '').trim()
  }

  function mergeSearchResults(list, { append = false } = {}) {
    const deduped = new Map()

    if (append) {
      for (const item of searchResults.value) {
        deduped.set(getSearchResultKey(item), item)
      }
    }

    for (const item of list) {
      const key = getSearchResultKey(item)
      if (!deduped.has(key)) {
        deduped.set(key, item)
      }
    }

    return [...deduped.values()]
  }

  function resolvePreferredVariantCover(variants, keyword) {
    const hint = normalizeSearchHintText(keyword).toLowerCase()
    if (!hint || !Array.isArray(variants) || variants.length <= 1) return ''

    const exactCharMatches = variants.filter((variant) => (
      normalizeCharacterName(variant?.text).trim().toLowerCase() === hint
    ))
    if (exactCharMatches.length) {
      const target = exactCharMatches[exactCharMatches.length - 1]
      return String(target?.cover_url || target?.img_url || '').trim()
    }

    const fuzzyMatches = variants.filter((variant) => {
      const displayText = displayVariantText(variant?.text).trim().toLowerCase()
      const normalizedChar = normalizeCharacterName(variant?.text).trim().toLowerCase()
      const rawText = String(variant?.text || '').trim().toLowerCase()

      return displayText.includes(hint) || normalizedChar.includes(hint) || rawText.includes(hint)
    })
    if (fuzzyMatches.length) {
      const target = fuzzyMatches[fuzzyMatches.length - 1]
      return String(target?.cover_url || target?.img_url || '').trim()
    }

    return ''
  }

  async function enhanceSearchResultImages(list, keyword) {
    const hint = normalizeSearchHintText(keyword)
    if (!hint || !Array.isArray(list) || !list.length) return

    await Promise.allSettled(list.map(async (item) => {
      const goodsId = String(item?.goods_id || '').trim()
      if (!goodsId) return

      const cacheKey = `${goodsId}::${hint}`
      if (searchResultVariantCoverCache.has(cacheKey)) {
        const cachedCover = searchResultVariantCoverCache.get(cacheKey)
        if (cachedCover) {
          item.search_cover_url = cachedCover
        }
        return
      }

      const { skuCovers, skuVariants, coverUrl } = await fetchGoodsDetail(goodsId)
      if (!Array.isArray(skuVariants) || skuVariants.length <= 1) {
        searchResultVariantCoverCache.set(cacheKey, '')
        return
      }

      const variants = skuVariants.map((variant) => ({
        ...variant,
        cover_url: skuCovers?.[variant.key] || variant.cover_url || coverUrl || '',
      }))
      const preferredCover = resolvePreferredVariantCover(variants, hint)
      searchResultVariantCoverCache.set(cacheKey, preferredCover)

      if (preferredCover) {
        item.search_cover_url = preferredCover
      }
    }))
  }

  async function fetchRoleSearchPage(roleTargets, page) {
    if (!roleTargets.length) return { items: [], hasMore: false }

    const groupedResults = await Promise.all(
      roleTargets.map((target) =>
        searchGoodsSpuList({
          shopCode: target.shopCode,
          categoryId: target.categoryId,
          pageSize: SEARCH_RESULTS_EXPANDED_COUNT,
          page,
          random: false,
        })
      )
    )

    const merged = mergeSearchResults(groupedResults.flat())
    const hasMore = groupedResults.some((items) => items.length >= SEARCH_RESULTS_EXPANDED_COUNT)
    return { items: merged, hasMore }
  }

  async function runSearchPage({ keyword, append }) {
    const currentRequestId = append ? searchSession.requestId : searchSession.requestId + 1
    if (!append) {
      searchSession.requestId = currentRequestId
    }

    const page = append ? searchSession.page + 1 : 1
    let mode = append ? searchSession.mode : ''
    let roleTargets = append ? [...searchSession.roleTargets] : []
    let items = []
    let hasMore = false

    if (!append) {
      roleTargets = await resolveRoleSearchTargets(keyword)
      if (roleTargets.length) {
        mode = 'role'
        const roleResult = await fetchRoleSearchPage(roleTargets, page)
        items = roleResult.items
        hasMore = roleResult.hasMore
      }

      if (!items.length) {
        mode = 'keyword'
        roleTargets = []
        items = await searchGoodsList(keyword, SEARCH_RESULTS_EXPANDED_COUNT, page)
        hasMore = items.length >= SEARCH_RESULTS_EXPANDED_COUNT
      }
    } else if (mode === 'role') {
      const roleResult = await fetchRoleSearchPage(roleTargets, page)
      items = roleResult.items
      hasMore = roleResult.hasMore
    } else {
      mode = 'keyword'
      items = await searchGoodsList(keyword, SEARCH_RESULTS_EXPANDED_COUNT, page)
      hasMore = items.length >= SEARCH_RESULTS_EXPANDED_COUNT
    }

    if (currentRequestId !== searchSession.requestId) {
      return []
    }

    searchSession.mode = mode
    searchSession.keyword = keyword
    searchSession.page = page
    searchSession.hasMore = hasMore
    searchSession.roleTargets = roleTargets
    searchResults.value = mergeSearchResults(items, { append })
    void enhanceSearchResultImages(searchResults.value, keyword)
    return items
  }

  async function handleGoodsSearch() {
    const keyword = searchKeyword.value.trim()
    variantSearchHint.value = normalizeSearchHintText(keyword)
    searchError.value = ''
    searchExpanded.value = false
    searchLoadingMore.value = false

    if (!keyword) {
      searchResults.value = []
      selectedSearchGoodsId.value = ''
      resetSearchSession()
      return
    }

    searching.value = true
    try {
      const results = await runSearchPage({ keyword, append: false })
      if (!results.length) {
        searchError.value = t('import.searchNoResults')
      }
    } catch (error) {
      searchResults.value = []
      selectedSearchGoodsId.value = ''
      resetSearchSession()
      searchError.value = error?.message || t('import.searchFailed')
    } finally {
      searching.value = false
    }
  }

  function toggleSearchExpanded() {
    searchExpanded.value = !searchExpanded.value
    if (searchExpanded.value) {
      void ensureSearchResultsScrollable()
    }
  }

  function resetSearchSession() {
    searchSession.mode = ''
    searchSession.keyword = ''
    searchSession.page = 0
    searchSession.hasMore = false
    searchSession.roleTargets = []
  }

  async function loadMoreSearchResults() {
    if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || searching.value) return
    const keyword = searchSession.keyword || searchKeyword.value.trim()
    if (!keyword) return

    searchLoadingMore.value = true
    try {
      await runSearchPage({ keyword, append: true })
    } catch (error) {
      searchError.value = error?.message || t('import.loadMoreFailed')
    } finally {
      searchLoadingMore.value = false
      if (searchExpanded.value && searchHasMore.value) {
        void ensureSearchResultsScrollable()
      }
    }
  }

  async function ensureSearchResultsScrollable() {
    if (ensureSearchFillPromise) return ensureSearchFillPromise

    ensureSearchFillPromise = (async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || searching.value) break

        await nextTick()
        const scrollRoot = document.querySelector('.import-page .page-body')
        if (!(scrollRoot instanceof Element)) break

        const remaining = scrollRoot.scrollHeight - scrollRoot.clientHeight
        if (remaining > 180) break

        await loadMoreSearchResults()
      }
    })()

    try {
      await ensureSearchFillPromise
    } finally {
      ensureSearchFillPromise = null
    }
  }

  function disconnectSearchObserver() {
    if (!searchResultsObserver) return
    searchResultsObserver.disconnect()
    searchResultsObserver = null
  }

  function unbindSearchScrollListener() {
    searchScrollCleanup?.()
    searchScrollCleanup = null
  }

  function bindSearchScrollListener() {
    unbindSearchScrollListener()
    if (!searchExpanded.value || !searchHasMore.value) return

    const scrollRoot = document.querySelector('.import-page .page-body')
    const target = scrollRoot instanceof Element ? scrollRoot : window
    const handleScroll = () => {
      if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || searching.value) return

      const remaining = scrollRoot instanceof Element
        ? scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight
        : document.documentElement.scrollHeight - window.scrollY - window.innerHeight

      if (remaining <= 220) {
        void loadMoreSearchResults()
      }
    }

    target.addEventListener('scroll', handleScroll, { passive: true })
    searchScrollCleanup = () => {
      target.removeEventListener('scroll', handleScroll)
    }
  }

  async function reconnectSearchObserver() {
    disconnectSearchObserver()
    if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || !searchLoadMoreRef.value) return

    await nextTick()
    if (!searchExpanded.value || !searchHasMore.value || searchLoadingMore.value || !searchLoadMoreRef.value) return

    const scrollRoot = document.querySelector('.import-page .page-body')
    searchResultsObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreSearchResults()
        }
      },
      {
        root: scrollRoot instanceof Element ? scrollRoot : null,
        rootMargin: '0px 0px 280px 0px',
        threshold: 0.01
      }
    )
    searchResultsObserver.observe(searchLoadMoreRef.value)
  }

  async function selectSearchResult(item) {
    if (!item?.goods_id) return

    selectedSearchGoodsId.value = String(item.goods_id)
    variantSearchHint.value = normalizeSearchHintText(selectedSearchCharacter.value || searchKeyword.value.trim())
    setUrlInputValue(`https://www.mihoyogift.com/goods/${item.goods_id}`)
    await nextTick()
    await handleParse()
  }

  function shortenUrl(url) {
    try {
      const u = new URL(url)
      const path = u.pathname.split('/').filter(Boolean).join('/')
      return path.length > 38 ? path.slice(0, 38) + '…' : path
    } catch {
      return url.length > 38 ? url.slice(0, 38) + '…' : url
    }
  }

  watch(searchKeyword, (value) => {
    if (value.trim() !== selectedSearchCharacter.value) {
      selectedSearchCharacter.value = ''
    }

    if (value.trim() !== searchSession.keyword) {
      searchSession.hasMore = false
    }
  })

  watch(
    [searchExpanded, () => visibleSearchResults.value.length, searchHasMore, searchLoadingMore],
    () => {
      void reconnectSearchObserver()
      bindSearchScrollListener()
    }
  )

  onMounted(() => {
    bindSearchScrollListener()
    void reconnectSearchObserver()
  })

  onBeforeUnmount(() => {
    disconnectSearchObserver()
    unbindSearchScrollListener()
  })

  function resetSearchState() {
    searchKeyword.value = ''
    searchResults.value = []
    searchExpanded.value = false
    searchLoadingMore.value = false
    searchError.value = ''
    variantSearchHint.value = ''
    selectedSearchCharacter.value = ''
    selectedSearchGoodsId.value = ''
    resetSearchSession()
  }

  return {
    searchKeyword,
    searchResults,
    searchExpanded,
    searching,
    searchLoadingMore,
    searchError,
    variantSearchHint,
    selectedSearchCharacter,
    selectedSearchGoodsId,
    searchLoadMoreRef,
    visibleSearchResults,
    showSearchToggle,
    searchHasMore,
    showSearchLoadMoreStatus,
    getSearchResultCover,
    handleGoodsSearch,
    loadMoreSearchResults,
    toggleSearchExpanded,
    selectSearchResult,
    shortenUrl,
    resetSearchState
  }
}
