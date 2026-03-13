import { computed } from 'vue'

export function useHomeGoodsList(store, sortDirection) {
  const listData = computed(() => {
    const items = [...store.collectionViewList]
    let totalVal = 0
    let totalQty = 0

    items.sort((a, b) => {
      if (a.acquiredTime !== b.acquiredTime) {
        return sortDirection.value === 'asc'
          ? a.acquiredTime - b.acquiredTime
          : b.acquiredTime - a.acquiredTime
      }

      return sortDirection.value === 'asc'
        ? a.sortId.localeCompare(b.sortId)
        : b.sortId.localeCompare(a.sortId)
    })

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
