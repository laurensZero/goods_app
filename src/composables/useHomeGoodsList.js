import { computed } from 'vue'
import { sortHomeGoodsList } from '@/utils/homeSort'

export function useHomeGoodsList(store, sortMode, sortDirection) {
  const listData = computed(() => {
    const items = sortHomeGoodsList(store.collectionViewList, sortMode.value, sortDirection.value)
    let totalVal = 0
    let totalQty = 0

    for (let i = 0; i < items.length; i++) {
        totalVal += items[i].totalValueNumber
        totalQty += items[i].quantityNumber
    }

    const byId = new Map()
    for (let i = 0; i < items.length; i++) {
        byId.set(items[i].id, items[i])
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
