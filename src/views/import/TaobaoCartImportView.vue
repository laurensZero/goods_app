<template>
  <div class="taobao-cart-page">
    <!-- 拉取前 / 失败 -->
    <section v-if="view === 'idle' || view === 'error'" class="step-section">
      <div class="online-fetch-card">
        <div class="online-fetch-head">
          <p class="info-title">{{ t('import.taobaoCartTitle') }}</p>
          <p class="online-fetch-desc">
            {{ cookieReady ? t('import.taobaoCartHint') : t('import.taobaoCartNeedCookie') }}
          </p>
        </div>
        <p v-if="fetchError" class="field-error">{{ fetchError }}</p>
        <button class="online-fetch-btn" type="button" :disabled="fetching" @click="loadCart">
          <span v-if="!fetching">{{ t('import.taobaoCartFetchBtn') }}</span>
          <span v-else class="hub-spinner" />
        </button>
        <p v-if="fetching" class="online-fetch-status">{{ t('import.taobaoCartFetching') }}</p>
      </div>
    </section>

    <!-- 列表 -->
    <section v-else-if="view === 'list'" class="step-section step-section--list">
      <div class="list-header">
        <p class="list-count">{{ countText }}</p>
        <div class="list-header-actions">
          <button :class="['text-btn', isAllSelected && 'text-btn--active']"
            type="button" @click="selectAll">{{ t('common.selectAll') }}</button>
          <button :class="['text-btn', hasSelection && 'text-btn--active']"
            type="button" @click="deselectAll">{{ t('common.deselectAll') }}</button>
        </div>
      </div>

      <ul class="order-list">
        <li v-for="group in groups" :key="group.shopId || group.shopName" class="order-group">
          <div :class="[
            'order-row',
            isGroupFullySelected(group) && 'order-row--selected',
            isGroupPartiallySelected(group) && 'order-row--partial',
          ]">
            <div class="order-check" @click.stop="toggleGroupSelect(group)">
              <div :class="[
                'check-dot',
                isGroupFullySelected(group) && 'check-dot--on',
                isGroupPartiallySelected(group) && 'check-dot--partial',
              ]">
                <svg v-if="isGroupFullySelected(group)" viewBox="0 0 24 24" fill="none">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <svg v-else-if="isGroupPartiallySelected(group)" viewBox="0 0 24 24" fill="none">
                  <line x1="6" y1="12" x2="18" y2="12"/>
                </svg>
              </div>
            </div>
            <div class="order-thumb" @click="toggleExpand(group.shopId || group.shopName)">
              <img v-if="group.goods[0]?.image" :src="group.goods[0].image" class="thumb-img" loading="lazy" />
              <span v-else class="thumb-initial">{{ (group.shopName || '?').charAt(0) }}</span>
            </div>
            <div class="order-info" @click="toggleExpand(group.shopId || group.shopName)">
              <p class="order-name">{{ group.shopName || t('import.unknownGoods') }}</p>
              <div class="order-meta">
                <span class="meta-count">{{ t('import.goodsCount', { count: group.goods.length }) }}</span>
              </div>
            </div>
            <button :class="['expand-btn', expandedSet.has(group.shopId || group.shopName) && 'expand-btn--open']"
              type="button" @click.stop="toggleExpand(group.shopId || group.shopName)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>

          <Transition name="goods-expand">
            <ul v-if="expandedSet.has(group.shopId || group.shopName)" class="goods-sub-list">
              <li
                v-for="item in group.goods"
                :key="item._itemKey"
                :class="['goods-item',
                  selectedSet.has(item._itemKey) && 'goods-item--selected',
                ]"
                @click="toggleItem(item)"
              >
                <div class="order-check">
                  <div :class="['check-dot', 'check-dot--sm', selectedSet.has(item._itemKey) && 'check-dot--on']">
                    <svg v-if="selectedSet.has(item._itemKey)" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                </div>
                <div class="order-thumb order-thumb--sm">
                  <img v-if="item.image" :src="item.image" class="thumb-img" loading="lazy" />
                  <span v-else class="thumb-initial">{{ (item.name || '?').charAt(0) }}</span>
                </div>
                <div class="order-info">
                  <p class="order-name">{{ item.name }}</p>
                  <div class="order-meta">
                    <span v-if="item.price" class="meta-price">¥{{ item.price }}</span>
                    <span v-if="item.quantity > 1" class="meta-qty">×{{ item.quantity }}</span>
                    <span v-if="item.ip" class="meta-ip">{{ item.ip }}</span>
                    <span v-else-if="item.variant" class="meta-char">{{ item.variant }}</span>
                    <span v-if="isItemImported(item)" class="status-badge status--imported meta-item-status">{{ t('import.alreadyImported') }}</span>
                    <span v-else-if="item._isInvalid" class="status-badge status--refund meta-item-status">{{ t('import.taobaoCartInvalid') }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </Transition>
        </li>
      </ul>

      <div v-if="hasMore && paging" class="load-more-bar">
        <button class="load-more-btn" type="button" :disabled="loadingMore" @click="loadMoreCart">
          <span v-if="!loadingMore">{{ t('import.loadMore') }}</span>
          <span v-else class="hub-spinner" />
        </button>
      </div>

      <div class="bottom-bar bottom-bar--single">
        <button class="primary-btn" type="button"
          :disabled="selectedSet.size === 0 || importing" @click="doImport">
          {{ t('import.importGoods', { count: selectedSet.size || '' }) }}
        </button>
      </div>
    </section>

    <!-- 完成 -->
    <section v-else-if="view === 'done'" class="step-section step-section--center">
      <div class="done-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="7 12 11 16 17 8"/>
        </svg>
      </div>
      <p class="done-title">{{ t('import.importComplete') }}</p>
      <p class="done-sub">{{ t('import.importDoneSub', { count: importedCount, qty: importedTotalQty }) }}</p>
      <button class="primary-btn" type="button" @click="$router.push(doneTargetPath)">
        {{ t('import.backTo', { target: isWishlistMode ? t('common.wishlist') : t('import.home') }) }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { showGlobalToast } from '@/utils/globalToast'
import { fetchTaobaoCart } from '@/utils/taobao/cart'
import { getTaobaoCookie, isTaobaoCookieReady } from '@/utils/taobao/cookie'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'

defineOptions({ name: 'TaobaoCartImportView' })

const props = defineProps({
  isWishlist: { type: Boolean, default: false },
})

const { t } = useI18n()
const store = useGoodsStore()
const presets = usePresetsStore()

/** idle | loading | list | done | error — 与订单导入 step 命名区分 */
const view = ref('idle')
const fetching = ref(false)
const fetchError = ref('')
const cookieReady = ref(false)
const groups = ref([])
const selectedSet = ref(new Set())
const expandedSet = ref(new Set())
const importedCount = ref(0)
const importedTotalQty = ref(0)
const importing = ref(false)
const paging = ref(null)
const hasMore = ref(false)
const allItemCnt = ref(0)
const loadingMore = ref(false)
const isWishlistMode = computed(() => props.isWishlist)
const doneTargetPath = computed(() => (isWishlistMode.value ? '/wishlist' : '/home'))
const targetList = computed(() => (isWishlistMode.value ? store.wishlistList : store.collectionList))

const totalItems = computed(() => groups.value.reduce((n, g) => n + g.goods.length, 0))
const allGoods = computed(() => groups.value.flatMap((g) => g.goods))
const countText = computed(() =>
  allItemCnt.value > 0
    ? t('import.taobaoCartCountTotal', { loaded: totalItems.value, total: allItemCnt.value })
    : t('import.taobaoCartCount', { items: totalItems.value }),
)

function isSelectable(item) {
  return !isItemImported(item)
}

const hasSelection = computed(() => selectedSet.value.size > 0)
const isAllSelected = computed(() => {
  const selectable = allGoods.value.filter(isSelectable)
  return selectable.length > 0 && selectable.every((g) => selectedSet.value.has(g._itemKey))
})

const importedItemKeys = computed(
  () => new Set((targetList.value || []).map((item) => buildGoodsIdentityKey(item))),
)

function isItemImported(item) {
  const key = buildGoodsIdentityKey(item)
  return key ? importedItemKeys.value.has(key) : false
}

async function refreshCookieReady() {
  try {
    const cookie = await getTaobaoCookie()
    cookieReady.value = isTaobaoCookieReady(cookie)
  } catch {
    cookieReady.value = false
  }
}

async function loadCart() {
  if (fetching.value) return
  fetching.value = true
  fetchError.value = ''
  await refreshCookieReady()
  try {
    const result = await fetchTaobaoCart()
    const filtered = result.groups
      .map((g) => ({ ...g, goods: g.goods.filter((item) => item.name) }))
      .filter((g) => g.goods.length > 0)
    if (filtered.length === 0) {
      view.value = 'error'
      fetchError.value = t('import.taobaoCartEmpty')
      return
    }
    groups.value = filtered
    // 默认不选中，由用户自行勾选
    selectedSet.value = new Set()
    paging.value = result.paging
    hasMore.value = Boolean(result.hasMore && result.paging)
    allItemCnt.value = result.allItemCnt
    // 默认展开第一家店铺，便于确认
    const first = filtered[0]
    expandedSet.value = new Set([first.shopId || first.shopName])
    view.value = 'list'
  } catch (err) {
    const code = err?.code || ''
    view.value = 'error'
    if (code === 'NO_COOKIE' || code === 'LOGIN_REQUIRED') {
      fetchError.value = t('import.taobaoCartNeedCookie')
      cookieReady.value = false
    } else if (code === 'BLOCKED') {
      fetchError.value = t('import.taobaoCartBlocked')
    } else {
      fetchError.value = err?.message
        ? t('import.taobaoCartFailed', { message: err.message })
        : t('import.taobaoCartFailed', { message: code || 'network' })
    }
  } finally {
    fetching.value = false
  }
}

async function loadMoreCart() {
  if (loadingMore.value || !paging.value) return
  loadingMore.value = true
  try {
    const result = await fetchTaobaoCart({ paging: paging.value })
    const filtered = result.groups
      .map((g) => ({ ...g, goods: g.goods.filter((item) => item.name) }))
      .filter((g) => g.goods.length > 0)
    // 去重合并：同一店铺 append，新店铺 append（分页响应只含新增行）
    const seen = new Set(allGoods.value.map((g) => g._itemKey))
    const byKey = new Map(groups.value.map((g) => [g.shopId || g.shopName, g]))
    const next = groups.value.map((g) => ({ ...g, goods: [...g.goods] }))
    let added = 0
    for (const group of filtered) {
      const key = group.shopId || group.shopName
      let target = byKey.get(key)
      if (!target) {
        target = { shopId: group.shopId, shopName: group.shopName, goods: [] }
        byKey.set(key, target)
        next.push(target)
      }
      for (const item of group.goods) {
        if (seen.has(item._itemKey)) continue
        seen.add(item._itemKey)
        target.goods.push(item)
        added += 1
      }
    }
    if (added > 0) {
      groups.value = next.filter((g) => g.goods.length > 0)
      // 翻页新增项同样默认不选中
    }
    paging.value = result.paging
    // 无新商品或无下一页分页态时停止，防止空转
    hasMore.value = Boolean(result.hasMore && result.paging && added > 0)
    if (result.allItemCnt) allItemCnt.value = result.allItemCnt
  } catch (err) {
    console.warn('[taobao-cart-import] load more failed', err)
    showGlobalToast(t('import.loadMoreFailed'))
  } finally {
    loadingMore.value = false
  }
}

function toggleExpand(key) {
  if (expandedSet.value.has(key)) expandedSet.value.delete(key)
  else expandedSet.value.add(key)
  expandedSet.value = new Set(expandedSet.value)
}

function toggleItem(item) {
  if (!isSelectable(item)) return
  const next = new Set(selectedSet.value)
  if (next.has(item._itemKey)) next.delete(item._itemKey)
  else next.add(item._itemKey)
  selectedSet.value = next
}

function isGroupFullySelected(group) {
  const sel = group.goods.filter(isSelectable)
  return sel.length > 0 && sel.every((g) => selectedSet.value.has(g._itemKey))
}

function isGroupPartiallySelected(group) {
  const sel = group.goods.filter(isSelectable)
  return sel.some((g) => selectedSet.value.has(g._itemKey)) && !isGroupFullySelected(group)
}

function toggleGroupSelect(group) {
  const selectable = group.goods.filter(isSelectable)
  if (!selectable.length) return
  const allSel = selectable.every((g) => selectedSet.value.has(g._itemKey))
  const next = new Set(selectedSet.value)
  if (allSel) selectable.forEach((g) => next.delete(g._itemKey))
  else selectable.forEach((g) => next.add(g._itemKey))
  selectedSet.value = next
}

function selectAll() {
  selectedSet.value = new Set(allGoods.value.filter(isSelectable).map((g) => g._itemKey))
}

function deselectAll() {
  selectedSet.value = new Set()
}

async function doImport() {
  if (importing.value) return
  const toImport = allGoods.value.filter(
    (g) => selectedSet.value.has(g._itemKey) && isSelectable(g),
  )
  if (!toImport.length) return
  importing.value = true
  try {
    await store.addMultipleGoods(toImport.map((g) => ({ ...g, isWishlist: isWishlistMode.value })))
    importedCount.value = toImport.length
    importedTotalQty.value = toImport.reduce((s, g) => s + (g.quantity || 1), 0)
    // 同步角色/IP 预设（与米游铺购物车导入一致）
    await Promise.all([
      ...new Set(toImport.map((g) => g.ip).filter(Boolean)).map((ip) => presets.addIp(ip)),
      ...new Set(toImport.flatMap((g) => g.characters || [])).map((c) => presets.addCharacter(c)),
    ])
    view.value = 'done'
  } catch (err) {
    console.warn('[taobao-cart-import] save failed', err)
    showGlobalToast(err?.message || t('import.importFailed'))
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await refreshCookieReady()
  // Cookie 已就绪时自动拉一次，减少一步点击
  if (cookieReady.value) await loadCart()
})
</script>

<style scoped src="@/assets/views/TaobaoImportView.css"></style>
<style scoped>
.bottom-bar--single {
  justify-content: stretch;
}

.bottom-bar--single .primary-btn {
  flex: 1;
}
</style>
