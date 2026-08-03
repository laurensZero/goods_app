/**
 * 商品选择 composable
 * 支持单品和多件模式：通过 URL 粘贴或搜索添加商品
 */
import { ref, computed, reactive } from 'vue'
import { isMihoyoGiftUrl, searchGoodsList } from '@/utils/mihoyo/index'
import { fetchGoodsDetailForCheckout } from '@/utils/mihoyo/checkout'

/**
 * 单个下单商品项
 */
// 用 reactive 包裹：fetchItemDetail 等持有的是原始引用，若不加 reactive，
// 对原始对象的赋值不会触发 Vue 响应式，导致 loading/价格/SKU 状态不刷新
function createItem(goodsId) {
  return reactive({
    id: `${goodsId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    goodsId,
    name: '',
    shopCode: '',
    price: 0,
    skus: [],
    selectedSkuId: null,
    selectedSkuText: '',
    selectedSkuStock: -1,
    quantity: 1,
    fromCart: false,
    cover: '',
    loading: false,
    error: '',
    skuLocked: false,
    giftActivities: [],
    coupons: [],
    saleTime: 0,
    status: 0,
    remainingTime: 0,
  })
}

function getStockText(sku) {
  if (!sku) return ''
  if (sku.soldOut) return '商品已售罄'
  return ''
}

function validateItemStock(item) {
  const selectedSku = item.skus.find((s) => s.id === item.selectedSkuId) || null
  const selectedStock = Number.isFinite(Number(item.selectedSkuStock)) ? Number(item.selectedSkuStock) : Number(selectedSku?.stock ?? -1)
  if (selectedStock === 0 || selectedSku?.soldOut) {
    item.error = '商品已售罄'
    return false
  }
  if (selectedStock > 0 && Number(item.quantity || 0) > selectedStock) {
    item.error = `当前规格库存不足（库存 ${selectedStock}，需要 ${item.quantity}）`
    return false
  }
  if (selectedSku && item.error && /库存不足|已售罄/.test(item.error)) {
    item.error = ''
  }
  return true
}

export function useCheckoutGoods() {
  const items = ref([])
  const searchKeyword = ref('')
  const searchResults = ref([])
  const searching = ref(false)
  const searchError = ref('')
  const urlInput = ref('')
  const parsingUrl = ref(false)

  const totalAmount = computed(() =>
    items.value.reduce((sum, item) => {
      const skuPrice = item.skus.length > 0
        ? (item.skus.find((s) => s.id === item.selectedSkuId)?.price ?? item.price)
        : item.price
      return sum + (skuPrice || item.price) * item.quantity
    }, 0)
  )

  const allCoupons = computed(() => {
    const map = new Map()
    for (const item of items.value) {
      for (const c of item.coupons) {
        const key = c.coupon_id || c.id || c.couponId || JSON.stringify(c)
        if (!map.has(key)) map.set(key, c)
      }
    }
    return [...map.values()]
  })

  const allGiftActivities = computed(() => {
    const map = new Map()
    for (const item of items.value) {
      for (const act of item.giftActivities) {
        if (!map.has(act.activity_id)) map.set(act.activity_id, act)
      }
    }
    return [...map.values()]
  })

  const isMultiItem = computed(() => items.value.length > 1)

  async function fetchItemDetail(item, cookie, presetSkuId) {
    item.loading = true
    item.error = ''
    try {
      const detail = await fetchGoodsDetailForCheckout(item.goodsId, cookie)
      item.name = detail.name
      item.shopCode = detail.shopCode
      item.price = detail.price
      item.cover = detail.cover || item.cover
      item.skus = detail.skus
      item.giftActivities = detail.giftActivities
      item.coupons = detail.coupons
      item.saleTime = detail.saleTime
      item.status = detail.status
      item.remainingTime = detail.remainingTime
      if (detail.skus.length > 0) {
        const preset = detail.skus.find((s) => s.id === presetSkuId)
        const availableSku = detail.skus.find((s) => !s.soldOut) || detail.skus[0]
        if (preset) {
          item.selectedSkuId = preset.id
          item.selectedSkuText = preset.text
          item.selectedSkuStock = preset.stock
          if (preset.soldOut) {
            item.error = '当前选中的规格已售罄，请重新选择'
          }
        } else {
          item.selectedSkuId = availableSku.id
          item.selectedSkuText = availableSku.text
          item.selectedSkuStock = availableSku.stock
          // 购物车指定的 SKU 已不存在（下架/改版），解除锁定允许重新选择
          if (presetSkuId != null) item.skuLocked = false
          if (availableSku.soldOut) {
            item.error = getStockText(availableSku)
          }
        }
        validateItemStock(item)
      } else if (detail.status === 0) {
        item.error = '商品已售罄'
      }
      return validateItemStock(item)
    } catch (e) {
      item.error = e.message || '获取详情失败'
    } finally {
      item.loading = false
    }
    return false
  }

  /**
   * 从购物车加入商品（已知 goods_id / sku_id / shop_code / 名称）
   */
  async function addItemFromCart(cartItem, cookie) {
    const goodsId = String(cartItem.goodsId || cartItem.goods_id || '')
    if (!goodsId) return false
    const skuId = cartItem.skuId != null ? Number(cartItem.skuId) : null
    // 同商品同 SKU 才算重复；同一商品不同 SKU 允许并存
    const duplicate = items.value.some(
      (i) => i.goodsId === goodsId && (skuId == null || i.selectedSkuId === skuId)
    )
    if (duplicate) return false
    const item = createItem(goodsId)
    item.name = cartItem.name || ''
    item.cover = cartItem.cover || ''
    item.shopCode = cartItem.shopCode || ''
    item.selectedSkuId = skuId
    item.selectedSkuText = cartItem.skuText || ''
    item.fromCart = true
    // 购物车已确定 SKU，不再让用户重选
    item.skuLocked = true
    items.value.push(item)
    const ok = await fetchItemDetail(item, cookie, item.selectedSkuId)
    if (!ok) {
      removeItem(item.id)
      return false
    }
    return true
  }

  async function addItemFromUrl(url, cookie) {
    if (!isMihoyoGiftUrl(url)) {
      searchError.value = '请输入有效的米游铺商品链接'
      return false
    }
    const match = url.match(/goods\/(\d+)/)
    if (!match) {
      searchError.value = '无法解析商品 ID'
      return false
    }
    const goodsId = match[1]
    if (items.value.some((i) => i.goodsId === goodsId)) {
      searchError.value = '该商品已在列表中'
      return false
    }
    const item = createItem(goodsId)
    items.value.push(item)
    const ok = await fetchItemDetail(item, cookie)
    if (!ok) {
      removeItem(item.id)
      return false
    }
    searchError.value = ''
    urlInput.value = ''
    return true
  }

  async function addItemFromSearch(result, cookie) {
    if (items.value.some((i) => i.goodsId === result.goods_id)) {
      searchError.value = '该商品已在列表中'
      return false
    }
    const item = createItem(result.goods_id)
    item.name = result.name
    item.cover = result.cover_url || ''
    items.value.push(item)
    const ok = await fetchItemDetail(item, cookie)
    if (!ok) {
      removeItem(item.id)
      return false
    }
    searchError.value = ''
    searchKeyword.value = ''
    searchResults.value = []
    return true
  }

  function removeItem(id) {
    items.value = items.value.filter((i) => i.id !== id)
  }

  function updateItemSku(itemId, skuId, skuText) {
    const item = items.value.find((i) => i.id === itemId)
    if (item) {
      item.selectedSkuId = skuId
      item.selectedSkuText = skuText
      item.selectedSkuStock = item.skus.find((sku) => sku.id === skuId)?.stock ?? -1
      validateItemStock(item)
    }
  }

  function updateItemQuantity(itemId, qty) {
    const item = items.value.find((i) => i.id === itemId)
    if (item) {
      item.quantity = Math.max(1, Math.min(99, qty))
      validateItemStock(item)
    }
  }

  async function handleSearch(cookie) {
    const keyword = searchKeyword.value.trim()
    if (!keyword) return
    searching.value = true
    searchError.value = ''
    try {
      if (isMihoyoGiftUrl(keyword)) {
        await addItemFromUrl(keyword, cookie)
        return
      }
      const results = await searchGoodsList(keyword, 10)
      searchResults.value = results
      if (!results.length) {
        searchError.value = '未找到相关商品'
      }
    } catch (e) {
      searchError.value = e.message || '搜索失败'
    } finally {
      searching.value = false
    }
  }

  return {
    items,
    searchKeyword,
    searchResults,
    searching,
    searchError,
    urlInput,
    parsingUrl,
    totalAmount,
    allCoupons,
    allGiftActivities,
    isMultiItem,
    addItemFromUrl,
    addItemFromSearch,
    addItemFromCart,
    removeItem,
    updateItemSku,
    updateItemQuantity,
    handleSearch,
    fetchItemDetail,
  }
}
