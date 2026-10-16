<template>
  <div class="page taobao-import-page" :class="{ 'taobao-import-page--embedded': embedded }">
    <NavBar v-if="!embedded" :title="t('import.taobao')" show-back />

    <main class="page-body">
      <Transition name="step-fade" mode="out-in">

        <!-- ========== Step: pick（选文件） ========== -->
        <section v-if="step === 'pick'" key="pick" class="step-section">
          <div class="info-card">
            <div class="info-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 16V8M8 12l4-4 4 4"/>
                <rect x="3" y="3" width="18" height="18" rx="3"/>
              </svg>
            </div>
            <div class="info-body">
              <p class="info-title">{{ t('import.taobaoHowTo') }}</p>
              <ol class="info-steps">
                <li>{{ t('import.taobaoStep1') }}</li>
                <li>{{ t('import.taobaoStep2') }}</li>
                <li>{{ t('import.taobaoStep3') }}</li>
                <li>{{ t('import.taobaoStep4') }}</li>
                <li>{{ t('import.taobaoStep5') }}</li>
                <li>{{ t('import.taobaoStep6') }}</li>
                <li>{{ t('import.taobaoStep7') }}</li>
              </ol>
            </div>
          </div>

          <p v-if="parseError" class="field-error field-error--block">{{ parseError }}</p>

          <!-- 在线拉取（Cookie 就绪时优先推荐；未就绪也显示入口，点击后提示去粘贴 Cookie） -->
          <div class="online-fetch-card">
            <div class="online-fetch-head">
              <p class="info-title">{{ t('import.taobaoOnlineFetchTitle') }}</p>
              <p class="online-fetch-desc">
                {{ cookieReady ? t('import.taobaoOnlineFetchHint') : t('import.taobaoOnlineFetchNeedCookie') }}
              </p>
            </div>
            <p v-if="fetchError" class="field-error">{{ fetchError }}</p>
            <button class="online-fetch-btn" type="button" :disabled="fetching" @click="handleOnlineFetch">
              <span v-if="!fetching">{{ t('import.taobaoOnlineFetchBtn') }}</span>
              <span v-else class="hub-spinner" />
            </button>
            <p v-if="fetching" class="online-fetch-status">{{ t('import.taobaoOnlineFetching') }}</p>
          </div>

          <div class="file-pick-area" @click="triggerFilePick" @dragover.prevent @drop.prevent="onDrop">
            <svg class="file-pick-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="8" y="4" width="32" height="40" rx="3"/>
              <path d="M28 4v12h12"/>
              <path d="M17 28h14M17 34h8"/>
            </svg>
            <p class="file-pick-label">{{ t('import.taobaoPickFile') }}</p>
            <p class="file-pick-sub">{{ t('import.taobaoDragDrop') }}</p>
            <input ref="fileInputRef" type="file" accept=".xlsx" multiple class="file-input-hidden" @change="onFileChange" />
          </div>
        </section>

        <!-- ========== Step: list（预览 + 选择） ========== -->
        <section v-else-if="step === 'list'" key="list" class="step-section step-section--list">
          <div class="list-header">
            <p class="list-count">{{ t('import.taobaoOrderCount', { orders: processedOrders.length, items: allGoods.length }) }}</p>
            <div class="list-header-actions">
              <button :class="['text-btn', isAllSelectableSelected && 'text-btn--active']"
                type="button" @click="selectAll">{{ t('common.selectAll') }}</button>
              <button :class="['text-btn', hasSelection && 'text-btn--active']"
                type="button" @click="deselectAll">{{ t('common.deselectAll') }}</button>
            </div>
          </div>

          <ul class="order-list">
            <li v-for="po in processedOrders" :key="po.orderNo" class="order-group">

              <!-- 订单摘要行 -->
              <div :class="[
                'order-row',
                isOrderFullySelected(po) && 'order-row--selected',
                isOrderPartiallySelected(po) && 'order-row--partial',
                isOrderSelectionDisabled(po) && 'order-row--disabled',
              ]">
                <!-- 三态复选框 -->
                <div :class="['order-check', isOrderSelectionDisabled(po) && 'order-check--disabled']"
                  @click.stop="toggleOrderSelect(po)">
                  <div :class="[
                    'check-dot',
                    isOrderFullySelected(po) && 'check-dot--on',
                    isOrderPartiallySelected(po) && 'check-dot--partial',
                  ]">
                    <svg v-if="isOrderFullySelected(po)" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <svg v-else-if="isOrderPartiallySelected(po)" viewBox="0 0 24 24" fill="none">
                      <line x1="6" y1="12" x2="18" y2="12"/>
                    </svg>
                  </div>
                </div>

                <!-- 首件缩略图 -->
                <div class="order-thumb" @click="toggleExpand(po.orderNo)">
                  <img v-if="orderThumbSrc(po)" :src="orderThumbSrc(po)" class="thumb-img" loading="lazy" />
                  <span v-else class="thumb-initial">{{ (po.goods[0]?.name || '?').charAt(0) }}</span>
                </div>

                <!-- 订单信息 -->
                <div class="order-info" @click="toggleExpand(po.orderNo)">
                  <p class="order-name">{{ po.goods[0]?.name || t('import.unknownGoods') }}</p>
                  <div class="order-meta">
                    <span v-if="po.goods.length > 1" class="meta-count">{{ t('import.goodsCount', { count: po.goods.length }) }}</span>
                    <span v-if="po.shopName" class="meta-shop">{{ po.shopName }}</span>
                    <span class="meta-date">{{ po.goods[0]?.acquiredAt }}</span>
                  </div>
                </div>

                <span v-if="isOrderImported(po)" class="status-badge status--imported">{{ t('import.alreadyImported') }}</span>
                <span v-else-if="isOrderRefunded(po)" class="status-badge status--refund">{{ po.status }}</span>
                <span v-else-if="isOrderClosed(po)" class="status-badge status--refund">{{ t('import.orderClosed') }}</span>

                <!-- 展开箭头 -->
                <button :class="['expand-btn', expandedSet.has(po.orderNo) && 'expand-btn--open']"
                  type="button" @click.stop="toggleExpand(po.orderNo)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </div>

              <!-- 展开：商品子列表 -->
              <Transition name="goods-expand">
                <ul v-if="expandedSet.has(po.orderNo)" class="goods-sub-list">
                  <li
                    v-for="item in po.goods"
                    :key="item._itemKey"
                    :class="['goods-item',
                      selectedSet.has(item._itemKey) && 'goods-item--selected',
                      (!isItemSelectable(item)) && 'goods-item--unselectable',
                    ]"
                    @click="toggleItem(item._itemKey)"
                  >
                    <div class="order-check">
                      <div :class="['check-dot', 'check-dot--sm', selectedSet.has(item._itemKey) && 'check-dot--on']">
                        <svg v-if="selectedSet.has(item._itemKey)" viewBox="0 0 24 24" fill="none">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    </div>
                    <div class="order-thumb order-thumb--sm">
                      <img v-if="itemThumbSrc(item)" :src="itemThumbSrc(item)" class="thumb-img" loading="lazy" />
                      <span v-else class="thumb-initial">{{ (item.name || '?').charAt(0) }}</span>
                    </div>
                    <div class="order-info">
                      <p class="order-name">{{ item.name }}</p>
                      <div class="order-meta">
                        <span v-if="item.price" class="meta-price">¥{{ item.price }}</span>
                        <span v-if="item.quantity > 1" class="meta-qty">×{{ item.quantity }}</span>
                        <span v-if="item.ip" class="meta-ip">{{ item.ip }}</span>
                        <span v-if="item.characters?.length" class="meta-char">{{ item.characters[0] }}</span>
                        <span v-else-if="item.variant" class="meta-char">{{ item.variant }}</span>
                        <span v-if="isItemRefundedOrCancelled(item)" class="status-badge status--refund meta-item-status">{{ item._status }}</span>
                        <span v-else-if="CLOSED_ORDER_PATTERNS.some(p => p.test(item._status || ''))" class="status-badge status--refund meta-item-status">{{ t('import.orderClosed') }}</span>
                        <span v-else-if="isItemImported(item)" class="status-badge status--imported meta-item-status">{{ t('import.alreadyImported') }}</span>
                        <span v-else-if="item._displayVariant" class="meta-variant">{{ item._displayVariant }}</span>
                      </div>
                    </div>
                    <!-- 编辑按钮 -->
                    <button class="item-edit-btn" type="button" @click.stop="openEdit(item)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  </li>
                </ul>
              </Transition>

            </li>
          </ul>

          <div v-if="listSource === 'online'" class="load-more-bar">
            <button v-if="onlineHasMore" class="load-more-btn" type="button"
              :disabled="loadingMore" @click="handleLoadMore">
              <span v-if="!loadingMore">{{ t('import.loadMore') }}</span>
              <span v-else class="hub-spinner" />
            </button>
            <p v-if="onlineTotal" class="load-more-progress">
              {{ t('import.taobaoOnlineLoaded', { loaded: allGoods.length, total: onlineTotal, page: onlinePage }) }}
            </p>
          </div>

          <!-- 底部按钮（在线拉取来源时不需要「重新选择文件」） -->
          <div class="bottom-bar">
            <button v-if="listSource !== 'online'" class="secondary-btn" type="button" @click="backToPick">
              {{ t('import.taobaoRepick') }}
            </button>
            <button class="primary-btn" type="button"
              :disabled="selectedSet.size === 0 || importing" @click="doImport">
              {{ t('import.importGoods', { count: selectedSet.size || '' }) }}
            </button>
          </div>
        </section>

        <!-- ========== Step: done ========== -->
        <section v-else-if="step === 'done'" key="done" class="step-section step-section--center">
          <div class="done-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="7 12 11 16 17 8"/>
            </svg>
          </div>
          <p class="done-title">{{ t('import.importComplete') }}</p>
          <p class="done-sub">{{ t('import.importDoneSub', { count: importedCount, qty: importedTotalQty }) }}</p>
          <button class="primary-btn" type="button" @click="$router.push('/home')">{{ t('import.backToHome') }}</button>
        </section>

      </Transition>
    </main>

    <!-- ========== 编辑商品信息底部弹窗（键盘跟随小卡：bottom + 不锁滚动） ========== -->
    <AppSheet
      :model-value="showEditSheet"
      placement="bottom"
      :lock-scroll="false"
      sheet-class="taobao-edit-sheet"
      @update:model-value="(v) => { if (!v) closeEdit() }"
    >
      <p class="sheet-title">{{ t('import.editGoodsInfo') }}</p>

      <div class="edit-sheet-body">
        <div class="edit-field">
          <span class="edit-label">{{ t('common.name') }}</span>
          <input v-model="editForm.name" type="text" :placeholder="t('import.goodsName')" class="edit-input" />
        </div>
        <div class="edit-field">
          <span class="edit-label">IP</span>
          <AppSelect v-model="editForm.ip" :options="presets.ips" :placeholder="t('import.selectIp')" />
        </div>
        <div class="edit-field">
          <span class="edit-label">{{ t('common.category') }}</span>
          <AppSelect v-model="editForm.category" :options="presets.categories" :placeholder="t('import.selectCategory')" />
        </div>
        <div class="edit-field">
          <span class="edit-label">{{ t('common.character') }}</span>
          <input v-model="editForm.charactersText" type="text" :placeholder="t('import.characterPlaceholder')" class="edit-input" />
        </div>
        <div class="edit-field">
          <span class="edit-label">{{ t('common.variant') }}</span>
          <input v-model="editForm.variant" type="text" :placeholder="t('import.variantPlaceholder')" class="edit-input" />
        </div>
        <div class="edit-field">
          <span class="edit-label">{{ t('import.priceLabel') }}</span>
          <input v-model="editForm.price" type="number" min="0" step="1" placeholder="0.00" class="edit-input" />
          <p v-if="editPriceError" class="field-error field-error--block">{{ editPriceError }}</p>
        </div>
        <div class="edit-field">
          <span class="edit-label">{{ t('import.purchaseDate') }}</span>
          <input v-model="editForm.acquiredAt" type="date" class="edit-input" />
        </div>
        <div class="edit-field edit-field--image">
          <span class="edit-label">{{ t('import.imageUrl') }}</span>
          <MihoyoImagePicker
            ref="editMihoyoPickerRef"
            v-model="editForm.image"
            :hint="editForm.charactersText.split(',')[0]?.trim() || editForm.variant || ''"
          />
        </div>
        <div class="edit-field">
          <span class="edit-label">{{ t('common.note') }}</span>
          <input v-model="editForm.note" type="text" :placeholder="t('import.notePlaceholder')" class="edit-input" />
        </div>
      </div>

      <div class="edit-sheet-actions">
        <button class="edit-cancel-btn" type="button" @click="closeEdit">{{ t('common.cancel') }}</button>
        <button class="edit-save-btn" type="button" @click="saveEdit">{{ t('common.save') }}</button>
      </div>
    </AppSheet>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { showGlobalToast } from '@/utils/globalToast'
import { parseTaobaoXlsx } from '@/utils/import/taobao'
import { fetchTaobaoOrders } from '@/utils/taobao/orders'
import { getTaobaoCookie, isTaobaoCookieReady } from '@/utils/taobao/cookie'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import MihoyoImagePicker from '@/components/image/MihoyoImagePicker.vue'
import { validatePrice } from '@/utils/validate'

defineOptions({ name: 'TaobaoImportView' })

// 内嵌在淘宝导入聚合页里时隐藏自身 NavBar，布局随宿主流动
const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 宿主 Tab 是否可见（内嵌聚合页用）；独立页面默认 true，挂载即视为进入 */
  active: { type: Boolean, default: true },
})

const { t } = useI18n()
const store = useGoodsStore()
const presets = usePresetsStore()

// ── State ──────────────────────────────────────────────────────
const step         = ref('pick')   // 'pick' | 'list' | 'done'
const fileInputRef = ref(null)
const parseError   = ref('')
const rawGoods     = ref([])         // 从 XLSX 解析出的完整列表
const expandedSet  = ref(new Set())
const selectedSet  = ref(new Set())
const importedCount    = ref(0)
const importedTotalQty = ref(0)
/** list 步骤来源：file=订单文件，在线拉取时不显示「重新选择文件」 */
const listSource   = ref('file')

// ── 在线拉取 ───────────────────────────────────────────────────
const cookieReady = ref(false)
const fetching    = ref(false)
const fetchError  = ref('')
const onlinePage  = ref(1)
const onlineHasMore = ref(false)
const onlineTotal = ref(0)
const loadingMore = ref(false)

async function refreshCookieReady() {
  try {
    const cookie = await getTaobaoCookie()
    cookieReady.value = isTaobaoCookieReady(cookie)
  } catch {
    cookieReady.value = false
  }
}

/**
 * 进入即自动拉取一次订单（有可用 Cookie 时）：
 *   - 独立页面 /taobao-import/order：挂载即触发
 *   - 内嵌聚合页：等宿主把「订单」Tab 激活后触发
 * 每个视图实例只自动跑一次，避免来回切 Tab 反复打接口；手动「在线拉取」按钮仍可重拉。
 */
let didAutoFetch = false

async function maybeAutoFetchOrders() {
  if (didAutoFetch) return
  if (props.embedded && !props.active) return
  if (step.value !== 'pick') return
  await refreshCookieReady()
  if (!cookieReady.value) return
  didAutoFetch = true
  await handleOnlineFetch()
}

watch(
  () => props.active,
  (active) => {
    if (active) void maybeAutoFetchOrders()
  },
  { immediate: true },
)

/** 把解析结果送入与文件导入相同的 list 步骤 */
function applyParsedGoods(deduped, source = 'file') {
  rawGoods.value = deduped
  listSource.value = source
  // 默认不选中，由用户自行勾选
  selectedSet.value = new Set()
  expandedSet.value = new Set()
  if (source !== 'online') resetOnlinePaging()
  step.value = 'list'
}

function resetOnlinePaging() {
  onlinePage.value = 1
  onlineHasMore.value = false
  onlineTotal.value = 0
}

function backToPick() {
  listSource.value = 'file'
  resetOnlinePaging()
  step.value = 'pick'
}

function orderThumbSrc(po) {
  return po.goods.find(g => g.image || g._coverUrl)?.image
    || po.goods.find(g => g._coverUrl)?._coverUrl
    || ''
}

function itemThumbSrc(item) {
  return item.image || item._coverUrl || ''
}

async function handleOnlineFetch() {
  if (fetching.value) return
  fetching.value = true
  fetchError.value = ''
  await refreshCookieReady()
  try {
    const result = await fetchTaobaoOrders({ page: 1 })
    const seenKeys = new Set()
    const deduped = (result.goods || []).filter(item => {
      if (seenKeys.has(item._itemKey)) return false
      seenKeys.add(item._itemKey)
      return true
    })
    if (deduped.length === 0) {
      fetchError.value = t('import.taobaoOnlineFetchEmpty')
      return
    }
    onlinePage.value = result.page || 1
    onlineHasMore.value = Boolean(result.hasMore)
    onlineTotal.value = result.totalNum || 0
    applyParsedGoods(deduped, 'online')
  } catch (err) {
    const code = err?.code || ''
    if (code === 'NO_COOKIE' || code === 'LOGIN_REQUIRED') {
      fetchError.value = t('import.taobaoOnlineFetchNeedCookie')
      cookieReady.value = false
    } else if (code === 'BLOCKED') {
      fetchError.value = t('import.taobaoOnlineFetchBlocked')
    } else {
      fetchError.value = err?.message
        ? t('import.taobaoOnlineFetchFailed', { message: err.message })
        : t('import.taobaoOnlineFetchFailed', { message: code || 'network' })
    }
  } finally {
    fetching.value = false
  }
}

/** 在线拉取下一页（按 _itemKey 去重后追加） */
async function handleLoadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  fetchError.value = ''
  try {
    const nextPage = onlinePage.value + 1
    const result = await fetchTaobaoOrders({ page: nextPage })
    const seen = new Set(rawGoods.value.map(g => g._itemKey))
    const fresh = (result.goods || []).filter(item => {
      if (seen.has(item._itemKey)) return false
      seen.add(item._itemKey)
      return true
    })
    if (fresh.length > 0) {
      // 翻页新增项默认不选中
      rawGoods.value = [...rawGoods.value, ...fresh]
    }
    onlinePage.value = result.page || nextPage
    onlineHasMore.value = Boolean(result.hasMore) && fresh.length > 0
    if (result.totalNum) onlineTotal.value = result.totalNum
  } catch (err) {
    console.warn('[taobao-import] load more failed', err)
    showGlobalToast(t('import.loadMoreFailed'))
  } finally {
    loadingMore.value = false
  }
}

// ── 编辑状态 ─────────────────────────────────────────────────
const showEditSheet = ref(false)
const editingItem   = ref(null)
const editMihoyoPickerRef = ref(null)
const editPriceError = ref('')
const editForm = reactive({
  name: '',
  ip: '',
  category: '',
  charactersText: '',    // characters 数组的逗号拼接编辑代理
  variant: '',
  price: '',
  acquiredAt: '',
  image: '',
  note: '',
})

// ── Computed ───────────────────────────────────────────────────

/** 已导入谷子的身份键集合 */
const importedItemKeys = computed(
  () => new Set(store.collectionList.map(item => buildGoodsIdentityKey(item)))
)

function isItemImported(item)  { return importedItemKeys.value.has(buildGoodsIdentityKey(item)) }

// ── 选择规则常量（与米游铺导入视图保持一致）──────────────────
const CLOSED_ORDER_PATTERNS  = [/交易关闭/, /订单关闭/, /关闭订单/]
const REFUND_STATUS_PATTERNS = [/退款/, /退货/, /售后/, /已取消/, /取消订单/]

/** 判断某个商品是否处于退款/取消状态（通过订单状态字段判断） */
function isItemRefundedOrCancelled(item) {
  return REFUND_STATUS_PATTERNS.some(p => p.test(item._status || ''))
}

/** 判断订单是否已关闭 */
function isOrderClosed(po) {
  return CLOSED_ORDER_PATTERNS.some(p => p.test(po.status || ''))
}

/** 判断订单是否处于退款/退货状态（用于订单头部徽章显示） */
function isOrderRefunded(po) {
  return REFUND_STATUS_PATTERNS.some(p => p.test(po.status || ''))
}

/** 商品可选=未导入 且 未退款/取消 且 订单未关闭 */
function isItemSelectable(item) {
  return !isItemImported(item)
    && !isItemRefundedOrCancelled(item)
    && !CLOSED_ORDER_PATTERNS.some(p => p.test(item._status || ''))
}

function isOrderSelectionDisabled(po) {
  return isOrderImported(po) || isOrderRefunded(po) || isOrderClosed(po)
}

function getDateTimestamp(value) {
  const text = String(value || '').trim()
  if (!text) return 0

  const normalized = text.replace(/[./]/g, '-')
  const fullMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (fullMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = fullMatch
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).getTime()
  }

  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? 0 : parsed
}

function getOrderTimestamp(order) {
  return order.goods.reduce((latest, item) => Math.max(latest, getDateTimestamp(item.acquiredAt)), 0)
}

/** 将 rawGoods 按订单号分组为订单列表 */
const processedOrders = computed(() => {
  const orderMap = new Map()
  for (const item of rawGoods.value) {
    if (!orderMap.has(item._orderNo)) {
      orderMap.set(item._orderNo, {
        orderNo:  item._orderNo,
        status:   item._status,
        shopName: item._shopName,
        goods: [],
      })
    }
    orderMap.get(item._orderNo).goods.push(item)
  }
  return [...orderMap.values()]
    .map((order) => ({
      ...order,
      goods: [...order.goods].sort((a, b) => getDateTimestamp(b.acquiredAt) - getDateTimestamp(a.acquiredAt)),
    }))
    .sort((a, b) => {
      const timeDiff = getOrderTimestamp(b) - getOrderTimestamp(a)
      if (timeDiff !== 0) return timeDiff
      return String(b.orderNo || '').localeCompare(String(a.orderNo || ''))
    })
})

const allGoods = computed(() => rawGoods.value)

function isOrderImported(po) {
  // 排除退款商品后，剩余商品全部已导入时视为"已导入"
  const nonRefunded = po.goods.filter(g => !isItemRefundedOrCancelled(g))
  return nonRefunded.length > 0 && nonRefunded.every(g => isItemImported(g))
}
function isOrderFullySelected(po) {
  const sel = po.goods.filter(g => isItemSelectable(g))
  return sel.length > 0 && sel.every(g => selectedSet.value.has(g._itemKey))
}
function isOrderPartiallySelected(po) {
  const sel = po.goods.filter(g => isItemSelectable(g))
  return sel.some(g => selectedSet.value.has(g._itemKey)) && !isOrderFullySelected(po)
}

const hasSelection = computed(() => selectedSet.value.size > 0)
const isAllSelectableSelected = computed(() => {
  const selectable = allGoods.value.filter(g => isItemSelectable(g))
  return selectable.length > 0 && selectable.every(g => selectedSet.value.has(g._itemKey))
})

// ── Actions ────────────────────────────────────────────────────

function triggerFilePick() { fileInputRef.value?.click() }

async function onDrop(e) {
  const files = [...(e.dataTransfer?.files || [])]
  if (files.length) await parseFiles(files)
}

async function onFileChange(e) {
  const files = [...(e.target.files || [])]
  if (files.length) await parseFiles(files)
  e.target.value = ''
}

async function parseFiles(files) {
  parseError.value = ''
  try {
    const allParsed = []
    for (const file of files) {
      const buf = await file.arrayBuffer()
      const parsed = parseTaobaoXlsx(buf)
      allParsed.push(...parsed)
    }
    // 按 _itemKey 去重（保留第一次出现的，跨文件重复订单只保留一份）
    const seenKeys = new Set()
    const deduped = allParsed.filter(item => {
      if (seenKeys.has(item._itemKey)) return false
      seenKeys.add(item._itemKey)
      return true
    })
    if (deduped.length === 0) {
      parseError.value = t('import.taobaoNoData')
      return
    }
    applyParsedGoods(deduped, 'file')
  } catch (err) {
    parseError.value = err.message || t('import.fileParseFailed')
  }
}

function toggleExpand(orderNo) {
  if (expandedSet.value.has(orderNo)) expandedSet.value.delete(orderNo)
  else expandedSet.value.add(orderNo)
  expandedSet.value = new Set(expandedSet.value)
}

function toggleItem(itemKey) {
  const item = allGoods.value.find(g => g._itemKey === itemKey)
  if (!item || !isItemSelectable(item)) return
  if (selectedSet.value.has(itemKey)) selectedSet.value.delete(itemKey)
  else selectedSet.value.add(itemKey)
  selectedSet.value = new Set(selectedSet.value)
}

function toggleOrderSelect(po) {
  if (isOrderImported(po) || isOrderRefunded(po) || isOrderClosed(po)) return
  const selectable = po.goods.filter(g => isItemSelectable(g))
  const allSel = selectable.every(g => selectedSet.value.has(g._itemKey))
  const next = new Set(selectedSet.value)
  if (allSel) selectable.forEach(g => next.delete(g._itemKey))
  else selectable.forEach(g => next.add(g._itemKey))
  selectedSet.value = next
}

function selectAll() {
  selectedSet.value = new Set(
    allGoods.value.filter(g => isItemSelectable(g)).map(g => g._itemKey)
  )
}
function deselectAll() { selectedSet.value = new Set() }

const importing = ref(false)

async function doImport() {
  if (importing.value) return
  const toImport = allGoods.value.filter(g => selectedSet.value.has(g._itemKey))
  if (!toImport.length) return
  importing.value = true
  try {
    await store.addMultipleGoods(toImport)
    importedCount.value = toImport.length
    importedTotalQty.value = toImport.reduce((s, g) => s + (g.quantity || 1), 0)
    step.value = 'done'
  } catch (err) {
    // 与米游铺导入入口对齐：失败必须给反馈，不能静默吞掉
    console.warn('[taobao-import] save failed', err)
    showGlobalToast(err?.message || t('import.importFailed'))
  } finally {
    importing.value = false
  }
}

// ── 编辑商品 ──────────────────────────────────────────────────

function openEdit(item) {
  editingItem.value = item
  editPriceError.value = ''
  editForm.name          = item.name || ''
  editForm.ip            = item.ip || ''
  editForm.category      = item.category || ''
  editForm.charactersText = (item.characters || []).join(', ')
  editForm.variant       = item.variant || ''
  editForm.price         = item.price != null ? String(item.price) : ''
  editForm.acquiredAt    = item.acquiredAt || ''
  editForm.image         = item.image || ''
  editForm.note          = item.note || ''
  showEditSheet.value = true
}

function saveEdit() {
  if (!editingItem.value) return
  editPriceError.value = ''
  const priceValidation = validatePrice(editForm.price)

  if (!priceValidation.valid) {
    editPriceError.value = priceValidation.message
    return
  }

  const idx = rawGoods.value.findIndex(g => g._itemKey === editingItem.value._itemKey)
  if (idx === -1) { closeEdit(); return }
  // 如果用户填了米游铺链接并选中了某款式，使用该款式的封面图 URL
  const pickedImage = editMihoyoPickerRef.value?.resolvedUrl
  const updated = {
    ...rawGoods.value[idx],
    name:       editForm.name.trim() || rawGoods.value[idx].name,
    ip:         editForm.ip,
    category:   editForm.category,
    characters: editForm.charactersText
      ? editForm.charactersText.split(',').map(s => s.trim()).filter(Boolean)
      : [],
    variant:    editForm.variant,
    price:      editForm.price !== '' ? Number(editForm.price) : rawGoods.value[idx].price,
    acquiredAt: editForm.acquiredAt,
    image:      pickedImage || editForm.image,
    note:       editForm.note,
  }
  rawGoods.value = [
    ...rawGoods.value.slice(0, idx),
    updated,
    ...rawGoods.value.slice(idx + 1),
  ]
  closeEdit()
}

function closeEdit() {
  showEditSheet.value = false
  editingItem.value = null
  editPriceError.value = ''
}

watch(() => editForm.price, () => {
  if (editPriceError.value) {
    editPriceError.value = ''
  }
})
</script>

<style scoped src="@/assets/views/TaobaoImportView.css"></style>
