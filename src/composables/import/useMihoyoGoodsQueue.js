import { computed, getCurrentInstance, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeCharacterName, displayVariantText } from '@/utils/variantText'
import { pinyinIncludes } from '@/utils/pinyin'
import { fetchGoodsDetail } from '@/utils/mihoyo/index'
import { normalizeSearchHintText } from '@/composables/import/useMihoyoGoodsSearch'

// 变体请求超时看门狗：接口偶发挂起/限流时卡片不能一直卡在「加载中」
const VARIANT_LOAD_TIMEOUT_MS = 12000

/**
 * 米游铺商品「待确认队列」共享逻辑。
 *
 * 有货监控（MihoyoStockMonitorView）与米游铺批量导入（ImportView）共用：
 * - 队列状态：queue / activeUid / activeEntry
 * - 入队：enqueueGoods（可选预置已解析的款式变体）
 * - 款式加载：loadEntryVariants（带超时看门狗）/ retryLoadVariants
 * - 自动选款：autoSelectSku —— 单选直接选中；搜索角色/关键词后唯一命中自动选中
 * - 多选款式：selectSku / selectWholeGoods / expand / collapse
 * - 切换：手机端左右滑动（onDeckScroll）/ 平板端队列条（activateQueueEntry）
 * - 出队：removeFromQueue / clearQueue
 *
 * @param {Object} options
 * @param {() => string} [options.hint] 当前搜索提示词 getter（自动选款用）
 * @param {() => HTMLElement | null} [options.getDeckEl] 手机端滑动卡片容器 getter
 * @param {(entry, sku) => void} [options.onSkuSelected] 款式被选中时的回调（导入侧用于回填分类/角色）
 */
export function useMihoyoGoodsQueue(options = {}) {
  const { t } = useI18n()
  const getHint = typeof options.hint === 'function' ? options.hint : () => ''
  const getDeckEl = typeof options.getDeckEl === 'function' ? options.getDeckEl : () => null
  const onSkuSelected = typeof options.onSkuSelected === 'function' ? options.onSkuSelected : null

  const queue = ref([])
  const activeUid = ref('') // 当前正在选款式的队列项
  let queueUid = 0
  let deckScrollTimer = null

  const activeEntry = computed(() => queue.value.find((e) => e.uid === activeUid.value) || null)

  // 已在待选队列中的商品 ID 集合（搜索列表标记 + 防重复加入）
  const queuedGoodsIds = computed(() => (
    new Set(queue.value.map((e) => String(e.goodsId || '').trim()).filter(Boolean))
  ))

  function isQueued(item) {
    return queuedGoodsIds.value.has(String(item?.goods_id || item?.goodsId || '').trim())
  }

  function getQueuedEntry(item) {
    const key = String(item?.goods_id || item?.goodsId || '').trim()
    return queue.value.find((e) => String(e.goodsId || '').trim() === key) || null
  }

  function createQueueEntry({ goodsId, name = '', priceCents = 0, coverUrl = '', ...extra }) {
    queueUid += 1
    // 必须用 reactive() 创建：plain object 被 push 进响应式 queue 后由 Vue 代理，
    // 而 loadEntryVariants 等直接对 entry 字段赋值走的是原始对象，视图不会更新。
    // 最后一个入队项再没有后续 push 触发重渲染，卡片会一直卡在「加载中」。
    return reactive({
      uid: `queue-${queueUid}`,
      goodsId: String(goodsId || '').trim(),
      name: String(name || '').trim() || t('mihoyoStock.unnamed'),
      priceCents: Number(priceCents) || 0,
      coverUrl: String(coverUrl || '').trim(),
      variants: [],
      selectedSkus: [],
      loading: false,
      variantsLoaded: false,
      variantLoadFailed: false,
      error: '',
      expanded: false,
      ...extra,
    })
  }

  // 将商品加入队列；activate 时置为当前处理项。
  // variants 传入时视为已解析（跳过拉取），否则按需懒加载 SKU 变体。
  function enqueueGoods(payload, { activate = true, load = true, variants = null } = {}) {
    const entry = createQueueEntry(payload)
    queue.value.push(entry)
    if (activate) activeUid.value = entry.uid
    if (activate) scrollDeckToActive()
    if (Array.isArray(variants) && variants.length) {
      entry.variants = variants
        .filter((v) => v && v.key)
        .map((v) => ({
          text: String(v.text || v.key),
          key: String(v.key),
          cover_url: String(v.cover_url || v.img_url || ''),
          price: v.price != null ? Number(v.price) : null,
        }))
      entry.variantsLoaded = true
      entry.loading = false
      autoSelectSku(entry)
      // 自动选中了具体款式则收起选择器；未命中时展开让用户自己选
      entry.expanded = !entry.selectedSkus.length
    } else if (load) {
      loadEntryVariants(entry)
    }
    return entry
  }

  // 拉取 SKU 变体并自动选中，进入「选择款式 → 确认」流程（懒加载：切换队列项时才拉取）
  async function loadEntryVariants(entry) {
    if (!entry || entry.loading || entry.variantsLoaded || entry.parseFailed) return
    entry.loading = true
    entry.error = ''
    entry.variantLoadFailed = false
    try {
      const result = await Promise.race([
        fetchGoodsDetail(entry.goodsId),
        new Promise((resolve) => {
          setTimeout(() => resolve({ skuVariants: [], ok: false, timedOut: true }), VARIANT_LOAD_TIMEOUT_MS)
        }),
      ])
      if (!result.ok) {
        entry.variantLoadFailed = true
        entry.expanded = true
        entry.error = t('mihoyoStock.variantLoadError')
        return
      }
      const skuCovers = result.skuCovers || {}
      const productCover = String(result.coverUrl || '')
      entry.variants = (result.skuVariants || [])
        .filter((v) => v && v.key)
        .map((v) => ({
          text: String(v.text || v.key),
          key: String(v.key),
          cover_url: String(skuCovers[v.key] || v.cover_url || v.img_url || productCover),
          price: v.price != null ? Number(v.price) : null,
        }))
      autoSelectSku(entry)
      // 自动选中了具体款式则收起选择器；未命中时展开让用户自己选
      entry.expanded = !entry.selectedSkus.length
    } catch (e) {
      entry.variantLoadFailed = true
      entry.expanded = true
      entry.error = e.message || t('common.failed')
    } finally {
      entry.loading = false
      entry.variantsLoaded = true
    }
  }

  // 变体加载超时/失败后手动重试
  function retryLoadVariants(entry) {
    if (!entry) return
    entry.variantsLoaded = false
    entry.loading = false
    entry.error = ''
    entry.variantLoadFailed = false
    loadEntryVariants(entry)
  }

  // 自动选中 SKU：单选直接选中；搜索角色/关键词后，若唯一命中该角色款则自动选中
  // 多选场景：自动选中只作为默认选择，用户可继续在卡片里勾选/取消其它 SKU
  function autoSelectSku(entry) {
    const list = entry.variants
    if (!list.length) return

    if (list.length === 1) {
      entry.selectedSkus = [{ key: list[0].key, text: list[0].text, cover_url: list[0].cover_url || '' }]
      onSkuSelected?.(entry, entry.selectedSkus[0])
      return
    }

    const hint = normalizeSearchHintText(getHint()).toLowerCase()
    if (!hint) return

    const matched = list.filter((v) => {
      const text = String(v.text || '').trim().toLowerCase()
      const display = displayVariantText(v.text).trim().toLowerCase()
      const normalizedChar = normalizeCharacterName(v.text).trim().toLowerCase()
      if (text.includes(hint) || display.includes(hint) || normalizedChar.includes(hint)) return true
      return pinyinIncludes(v.text, hint) || pinyinIncludes(displayVariantText(v.text), hint)
    })

    if (matched.length === 1) {
      entry.selectedSkus = [{ key: matched[0].key, text: matched[0].text, cover_url: matched[0].cover_url || '', price: matched[0].price != null ? Number(matched[0].price) : null }]
      onSkuSelected?.(entry, entry.selectedSkus[0])
    }
  }

  // 多选款式：点击 chip 切换选中/取消；手动操作后保持选择器展开便于继续调整
  function selectSku(entry, variant) {
    if (!entry || !variant) return
    const idx = entry.selectedSkus.findIndex((s) => s.key === variant.key)
    if (idx >= 0) {
      entry.selectedSkus.splice(idx, 1)
    } else {
      entry.selectedSkus.push({ key: variant.key, text: variant.text, cover_url: variant.cover_url || '', price: variant.price != null ? Number(variant.price) : null })
      onSkuSelected?.(entry, variant)
    }
  }

  function selectWholeGoods(entry) {
    if (!entry) return
    entry.selectedSkus = []
  }

  function expandSkuPicker(entry) {
    if (entry) entry.expanded = true
  }

  function collapseSkuPicker(entry) {
    if (entry) entry.expanded = false
  }

  function activateQueueEntry(uid, { scrollDeck = false } = {}) {
    const entry = queue.value.find((e) => e.uid === uid)
    if (!entry) return
    activeUid.value = uid
    if (scrollDeck) scrollDeckToActive()
    if (!entry.variants.length && !entry.loading && !entry.parseFailed) loadEntryVariants(entry)
  }

  // 手机端滑动卡片：根据滑动位置同步当前激活的商品（并懒加载其 SKU）。
  // 滑动停止后再更新，避免程序化平滑滚动过程中 activeUid 反复横跳。
  function onDeckScroll() {
    const el = getDeckEl()
    if (!el) return
    clearTimeout(deckScrollTimer)
    deckScrollTimer = setTimeout(() => {
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      const entry = queue.value[idx]
      if (entry && entry.uid !== activeUid.value) activateQueueEntry(entry.uid)
    }, 80)
  }

  // 让滑动卡片定位到当前激活项（等待 DOM 更新后再滚动，确保队列已重排）
  function scrollDeckToActive() {
    const el = getDeckEl()
    if (!el || queue.value.length < 2) return
    const idx = queue.value.findIndex((e) => e.uid === activeUid.value)
    if (idx < 0) return
    nextTick(() => {
      el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
    })
  }

  function removeFromQueue(uid) {
    const idx = queue.value.findIndex((e) => e.uid === uid)
    if (idx < 0) return
    queue.value.splice(idx, 1)
    if (activeUid.value === uid) {
      const next = queue.value[Math.min(idx, queue.value.length - 1)]
      if (next) {
        activateQueueEntry(next.uid, { scrollDeck: true })
      } else {
        activeUid.value = ''
      }
    } else {
      // 移除的是激活项之前的卡片，激活项下标已变化，滑动区需重新对齐
      scrollDeckToActive()
    }
  }

  function clearQueue() {
    queue.value = []
    activeUid.value = ''
  }

  // 组件卸载时清理滑动防抖定时器（非组件环境（如单测）下跳过生命周期注册）
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (deckScrollTimer) clearTimeout(deckScrollTimer)
      deckScrollTimer = null
    })
  }

  return {
    queue,
    activeUid,
    activeEntry,
    queuedGoodsIds,
    isQueued,
    getQueuedEntry,
    createQueueEntry,
    enqueueGoods,
    loadEntryVariants,
    retryLoadVariants,
    autoSelectSku,
    selectSku,
    selectWholeGoods,
    expandSkuPicker,
    collapseSkuPicker,
    activateQueueEntry,
    onDeckScroll,
    scrollDeckToActive,
    removeFromQueue,
    clearQueue,
  }
}
