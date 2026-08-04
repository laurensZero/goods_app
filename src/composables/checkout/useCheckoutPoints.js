import { computed, ref } from 'vue'
import { fetchPointGoodsList, fetchUserPoints } from '@/utils/mihoyo/checkout'

// 积分商品接口按米游铺店铺筛选，店铺码同时作为 IP 分类标识。
export const POINT_SHOP_OPTIONS = [
  { code: 'ys', labelKey: 'notifySettings.mihoyoShopYs', fallback: '原神' },
  { code: 'xqtd', labelKey: 'notifySettings.mihoyoShopXqtd', fallback: '崩坏：星穹铁道' },
  { code: 'bh3', labelKey: 'notifySettings.mihoyoShopBh3', fallback: '崩坏3' },
  { code: 'zzz', labelKey: 'notifySettings.mihoyoShopZzz', fallback: '绝区零' },
]

function normalizePointGoods(item, shopCode) {
  return {
    ...item,
    goods_id: String(item.goods_id || ''),
    shop_code: String(item.shop_code || shopCode || ''),
    point: Number(item.point) || 0,
    is_sold_out: Boolean(item.is_sold_out),
  }
}

export function useCheckoutPoints() {
  const point = ref(0)
  const goods = ref([])
  const activeShopCode = ref('all')
  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)

  const visibleGoods = computed(() => {
    if (activeShopCode.value === 'all') return goods.value
    return goods.value.filter((item) => item.shop_code === activeShopCode.value)
  })

  async function load(cookie) {
    if (loading.value) return
    loading.value = true
    error.value = ''

    try {
      const [pointResult, shopResults] = await Promise.all([
        fetchUserPoints(cookie),
        Promise.allSettled(POINT_SHOP_OPTIONS.map(async ({ code }) => {
          const result = await fetchPointGoodsList(cookie, { shopCode: code })
          return { code, ...result }
        })),
      ])

      point.value = pointResult
      const unique = new Map()
      for (const settled of shopResults) {
        if (settled.status !== 'fulfilled') continue
        const result = settled.value
        for (const item of result.list) {
          const normalized = normalizePointGoods(item, result.code)
          const key = `${normalized.shop_code}:${normalized.goods_id}`
          if (!unique.has(key)) unique.set(key, normalized)
        }
      }
      goods.value = [...unique.values()]
      if (!goods.value.length && shopResults.every((result) => result.status !== 'fulfilled')) {
        throw shopResults[0]?.reason || new Error('获取积分商品失败')
      }
      loaded.value = true
    } catch (e) {
      error.value = e?.message || '加载积分商品失败'
    } finally {
      loading.value = false
    }
  }

  function reset() {
    point.value = 0
    goods.value = []
    activeShopCode.value = 'all'
    error.value = ''
    loaded.value = false
  }

  return {
    point,
    goods,
    visibleGoods,
    activeShopCode,
    loading,
    error,
    loaded,
    load,
    reset,
  }
}
