/**
 * 赠品选择 composable
 * 根据订单总金额匹配赠品阶梯，支持手动选择
 */
import { ref } from 'vue'
import { fetchGiftActivityDetail } from '@/utils/mihoyo/checkout'

export function useCheckoutGifts() {
  const activities = ref([])
  const loading = ref(false)
  const error = ref('')
  /** @type {Map<string, Set<string>>} activityId -> selected gift goods_ids */
  const selectedGifts = ref(new Map())

  /**
   * 加载赠品活动详情（合并多个商品的赠品活动）
   * @param {Array<{activity_id}>} activityRefs - from goods detail
   * @param {string} cookie
   * @param {number} totalFee - 订单总金额（分），用于按阶梯自动选中赠品
   */
  async function loadActivities(activityRefs, cookie, totalFee = 0) {
    loading.value = true
    error.value = ''
    try {
      const results = await Promise.all(
        activityRefs.map((ref) => fetchGiftActivityDetail(ref.activity_id, cookie))
      )
      activities.value = results
      autoSelectGifts(totalFee)
    } catch (e) {
      error.value = e.message || '获取赠品活动失败'
    } finally {
      loading.value = false
    }
  }

  /**
   * 根据金额自动选择赠品（每个阶梯选前 N 个有库存的）
   */
  function autoSelectGifts(totalFeeYuan) {
    const newMap = new Map()
    for (const act of activities.value) {
      const matchedStage = [...act.stages]
        .reverse()
        .find((s) => totalFeeYuan >= (s.threshold || 0))
      if (!matchedStage) continue
      const available = (matchedStage.gifts || []).filter((g) => g.stock > 0)
      const numToSelect = matchedStage.num || 1
      const selected = new Set(available.slice(0, numToSelect).map((g) => String(g.goods_id)))
      newMap.set(act.activityId, selected)
    }
    selectedGifts.value = newMap
  }

  function toggleGift(activityId, goodsId, maxSelect = 1) {
    const key = String(goodsId)
    const current = selectedGifts.value.get(activityId) || new Set()
    const next = new Set(current)
    if (next.has(key)) {
      next.delete(key)
    } else {
      if (next.size >= maxSelect) return
      next.add(key)
    }
    const updated = new Map(selectedGifts.value)
    updated.set(activityId, next)
    selectedGifts.value = updated
  }

  function isGiftSelected(activityId, goodsId) {
    return selectedGifts.value.get(activityId)?.has(String(goodsId)) || false
  }

  /**
   * 获取匹配当前金额的阶梯信息
   */
  function getMatchedStage(activity, totalFeeYuan) {
    const stages = activity.stages || []
    return [...stages].reverse().find((s) => totalFeeYuan >= (s.threshold || 0)) || null
  }

  /**
   * 构建 pre_create_order 所需的 gift_activities 数组
   */
  function buildGiftPayload(shopCode = '') {
    const result = []
    for (const act of activities.value) {
      const selected = selectedGifts.value.get(act.activityId)
      if (!selected || !selected.size) continue
      const stage = act.stages.find((s) => {
        const matched = [...act.stages].reverse().find((st) => st.gifts?.some((g) => selected.has(String(g.goods_id))))
        return matched === s
      })
      const gifts = []
      for (const gift of (stage?.gifts || [])) {
        if (selected.has(String(gift.goods_id))) {
          gifts.push({
            goods_id: gift.goods_id,
            sku_id: gift.sku_id || 0,
            nums: 1,
            shop_code: shopCode,
          })
        }
      }
      if (gifts.length) {
        result.push({ activity_id: act.activityId, gifts })
      }
    }
    return result
  }

  return {
    activities,
    loading,
    error,
    selectedGifts,
    loadActivities,
    autoSelectGifts,
    toggleGift,
    isGiftSelected,
    getMatchedStage,
    buildGiftPayload,
  }
}
