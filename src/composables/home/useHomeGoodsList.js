import { computed } from 'vue'
import { sortHomeGoodsList } from '@/utils/goods/homeSort'

const EXCLUDED_VALUE_STATUSES = new Set(['已赠出', '已出', '丢失'])

/**
 * @param {object} store - goods store
 * @param {import('vue').Ref} sortMode
 * @param {import('vue').Ref} sortDirection
 * @param {object} [groupStore] - goodsGroup store (optional)
 * @param {object} [exchangeRate] - exchangeRate store (optional)
 */
export function useHomeGoodsList(store, sortMode, sortDirection, groupStore, exchangeRate, externalList, isFiltering) {
  const listData = computed(() => {
    const sourceItems = externalList?.value ?? store.collectionViewList
    const items = sortHomeGoodsList(sourceItems, sortMode.value, sortDirection.value)
    let totalVal = 0
    let totalQty = 0
    const byId = new Map()

    // Groups are broken apart during filtering/search, so manual group
    // aggregation should only apply when not filtering
    const filtering = isFiltering?.value ?? false

    // Build set of manual groups members (skipped when filtering)
    const manualGroupMemberIds = new Set()
    const manualGroups = new Map() // groupId -> group
    if (groupStore && !filtering) {
      for (const group of groupStore.collectionGroups) {
        if (group.summaryMode === 'manual') {
          manualGroups.set(group.id, group)
          for (const item of groupStore.groupItemsOf(group.id)) {
            manualGroupMemberIds.add(item.goodsId)
          }
        }
      }
    }

    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        byId.set(item.id, item)
        if (!EXCLUDED_VALUE_STATUSES.has(item.collectStatus)) {
          // Skip items that belong to manual-price groups (their group total will be added below)
          if (!manualGroupMemberIds.has(item.id)) {
            totalVal += item.totalValueNumber
          }
          totalQty += item.quantityNumber
        }
    }

    // Add manual group totals (converted to CNY) only when not filtering
    if (!filtering && items.length > 0) {
      for (const [, group] of manualGroups) {
        const amount = Number(group.totalAmount) || 0
        if (exchangeRate) {
          totalVal += exchangeRate.convertToCNY(amount, group.currency || 'CNY')
        } else {
          totalVal += amount
        }
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
