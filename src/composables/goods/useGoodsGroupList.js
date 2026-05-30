// @ts-check
import { computed } from 'vue'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'

/**
 * 将谷子组和单品合并为一个统一列表，用于主列表混合渲染。
 *
 * @param {import('vue').ComputedRef} groups - 组列表 (collectionGroups 或 wishlistGroups)
 * @param {import('vue').ComputedRef} goodsList - 单品列表 (已排序)
 * @param {import('vue').Ref} groupItemList - 组成员关系列表
 * @param {import('vue').Ref} allGoodsList - 全量 goods 列表 (用于查找组成员)
 * @returns {{ mixedList: import('vue').ComputedRef }}
 */
export function useGoodsGroupList(groups, goodsList, groupItemList, allGoodsList) {
  /** 为每个组构建 view 对象（类似 GoodsItem 的 shape，兼容 GoodsCardGridSection） */
  const groupViewItems = computed(() => {
    const goodsMap = new Map(allGoodsList.value.map(g => [g.id, g]))

    return groups.value.map(group => {
      const members = groupItemList.value
        .filter(i => i.groupId === group.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(i => goodsMap.get(i.goodsId))
        .filter(Boolean)

      // 计算总价
      let totalPrice = 0
      if (group.summaryMode === 'manual') {
        totalPrice = group.totalAmount || 0
      } else {
        totalPrice = members.reduce((sum, g) => {
          const price = parseFloat(g.actualPrice || g.price || '0')
          return sum + (isNaN(price) ? 0 : price)
        }, 0)
      }

      // 获取封面图
      let coverImage = ''
      if (group.coverMode === 'manual' && group.coverItemId) {
        const coverItem = members.find(m => m.id === group.coverItemId)
        if (coverItem) {
          coverImage = getPrimaryGoodsImageUrl(coverItem.images, coverItem.coverImage || coverItem.image) || ''
        }
      }
      if (!coverImage && members.length > 0) {
        coverImage = getPrimaryGoodsImageUrl(members[0].images, members[0].coverImage || members[0].image) || ''
      }

      // 构建兼容 GoodsCard 的 item shape
      return {
        id: group.id,
        _type: 'group',
        _group: group,
        _members: members,
        // GoodsCard 兼容字段
        name: group.name || '',
        coverImage,
        category: '',
        ip: '',
        characters: [],
        tags: [],
        note: `${members.length} items`,
        quantity: members.length,
        price: String(totalPrice),
        actualPrice: String(totalPrice),
        collectStatus: '',
        isWishlist: group.type === 'wishlist',
        updatedAt: group.updatedAt,
        // view 增强字段
        priceCNYNumber: totalPrice,
        totalValueNumber: totalPrice,
        quantityNumber: members.length
      }
    })
  })

  /**
   * 混合列表：组卡插在列表前面（或按 updatedAt 排序混入）
   * 策略：组卡始终置顶，单品跟在后面
   */
  const mixedList = computed(() => {
    const groupItems = groupViewItems.value
    const goods = goodsList.value
    return [...groupItems, ...goods]
  })

  return {
    mixedList,
    groupViewItems
  }
}
