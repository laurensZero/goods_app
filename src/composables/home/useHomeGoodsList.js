import { computed } from 'vue'
import { sortHomeGoodsList } from '@/utils/goods/homeSort'

const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])

export function useHomeGoodsList(store, sortMode, sortDirection) {
  const listData = computed(() => {
    const items = sortHomeGoodsList(store.collectionViewList, sortMode.value, sortDirection.value)
    let totalVal = 0
    let totalQty = 0
    const byId = new Map()

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        byId.set(item.id, item)
        if (!EXCLUDED_VALUE_STATUSES.has(item.collectStatus)) {
          totalVal += item.totalValueNumber
          totalQty += item.quantityNumber
        }
    }

    return {
      goodsList: items,
      totalValue: totalVal.toFixed(2),
      totalQuantity: totalQty,
      goodsById: byId
    }
  })

  return {
    goodsList: computed(() => listData.value.goodsList),
    totalValue: computed(() => listData.value.totalValue),
    totalQuantity: computed(() => listData.value.totalQuantity),
    goodsById: computed(() => listData.value.goodsById)
  }
}
