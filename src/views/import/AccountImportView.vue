<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import '@/assets/common/loading.css'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { useMihoyoImportSession } from '@/composables/import/useMihoyoImportSession'
import { importMihoyoOrdersWithSession } from '@/utils/mihoyo/nativeImport'
import { fetchAllOrders, orderToGoodsList, resolveOrderDiscountCents } from '@/utils/mihoyo/index'
import {
  addMihoyoImportContextItem,
  buildMihoyoImportContext,
  resolveMihoyoImportDraft,
} from '@/utils/mihoyo/importResolver'
import { getSharedTaggingContext } from '@/utils/tagging/taggingContextCache'
import {
  buildGoodsIdentityKey,
  buildOrderImportIdentity,
  buildOrderImportImportedKeys,
  isOrderItemImported,
} from '@/utils/goods/identity'
import { runWithRouteTransition } from '@/utils/routeTransition'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import MihoyoAccountSheet from '@/components/import/MihoyoAccountSheet.vue'
import MihoyoAccountNavBtn from '@/components/import/MihoyoAccountNavBtn.vue'
import MihoyoQrLoginSheet from '@/components/import/MihoyoQrLoginSheet.vue'

defineOptions({ name: 'AccountImportView' })

// 内嵌在米游铺导入页 tab 里时隐藏 NavBar，布局随宿主流动
const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 当前是否为宿主激活的 tab（预挂载时不拉数据，激活后才 bootstrap） */
  embeddedActive: { type: Boolean, default: false },
})

const { t } = useI18n()
const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()

// ── State ──────────────────────────────────────────────────────
const loadedCount = ref(0)
const totalCount = ref(0)
const rawOrders = ref([])         // 原始 API 订单列表
const expandedSet = ref(new Set()) // 已展开的订单 order_no
const selectedSet = ref(new Set()) // 已选择的商品 _itemKey
const cappedWarning = ref(false)
const importedCount = ref(0)
const importedTotalQty = ref(0)

// ── 会话门（Cookie/账号/启动/拉取流程，与购物车导入共用 useMihoyoImportSession） ──
const {
  step,
  canUseNativeImport,
  startFetch,
  cookieInput,
  rememberCookie,
  cookieValid,
  cookieWarningMessage,
  accounts,
  activeAccountId,
  activeAccountLabel,
  activeAccountAvatar,
  refreshingAccountId,
  showAccountSheet,
  accountSheetRef,
  showQrLogin,
  cookiePrimaryDisabled,
  onQrLoginSuccess,
  showErrorDialog,
  errorDialogTitle,
  errorDialogMessage,
  closeErrorDialog,
  onRefreshAccount,
  onSwitchAccount,
  onRemoveAccount,
  onLoginNewNative,
  onLoginNewCookie,
  saveStokenForAccount,
  stokenErrorText,
  openAccountSheet,
} = useMihoyoImportSession({
  listStepName: 'orders',
  fetchFailedKey: 'import.fetchOrdersFailed',
  isEmbedded: () => props.embedded,
  isEmbeddedActive: () => props.embeddedActive,
  fetchNative: fetchOrdersNative,
  fetchWeb: fetchOrdersWeb,
  onList: (list) => {
    rawOrders.value = list
    selectedSet.value = new Set()
  },
})

/** 原生插件会话拉订单：注册进度事件，结束时移除 */
async function fetchOrdersNative() {
  loadedCount.value = 0
  totalCount.value = 0

  let progressHandle = null
  if (Capacitor.isNativePlatform()) {
    progressHandle = await Capacitor.addListener('MihoyoSessionImport', 'importProgress', (event) => {
      // 内嵌隐藏时跳过进度 UI 更新，避免高频小重渲染拖累当前可见 Tab
      if (props.embedded && !props.embeddedActive) return
      loadedCount.value = event.loaded ?? loadedCount.value
      totalCount.value = event.total ?? totalCount.value
    })
  }

  try {
    const { list = [], capped = false, total = 0 } = await importMihoyoOrdersWithSession()
    cappedWarning.value = Boolean(capped)
    loadedCount.value = Array.isArray(list) ? list.length : 0
    totalCount.value = Number(total) || loadedCount.value
    return { list, capped, total }
  } finally {
    progressHandle?.remove()
  }
}

/** Web 端带 Cookie 拉订单：fetchAllOrders 自带进度回调 */
async function fetchOrdersWeb(cookie) {
  loadedCount.value = 0
  totalCount.value = 0
  const { list, capped } = await fetchAllOrders(cookie, (loaded, total_) => {
    // 内嵌隐藏时跳过进度 UI 更新，避免高频小重渲染拖累当前可见 Tab
    if (props.embedded && !props.embeddedActive) return
    loadedCount.value = loaded
    totalCount.value = total_
  })
  cappedWarning.value = Boolean(capped)
  return { list, capped }
}

// 内嵌 tab 的 bootstrap（独立页面挂载即拉）由会话门内部处理；这里只保留展开/选择逻辑

// 已导入索引：goodsId 优先（订单号/支付日 + 款式软匹配），无 goodsId 回退名称
const importedItemKeys = computed(() =>
  buildOrderImportImportedKeys(store.collectionList)
)

function isItemImported(item) {
  return isOrderItemImported(item, importedItemKeys.value)
}

/** 订单内合并键：优先 goodsId 身份，缺字段回退名称+款式 */
function getOrderLineMergeKey(item) {
  return buildOrderImportIdentity(item) || buildGoodsIdentityKey(item)
}
// 订单是否已全部导入（所有非退款商品均已导入）
function isOrderImported(po) {
  const nonRefunded = po.goods.filter((g) => !isItemRefundedOrCancelled(g))
  return nonRefunded.length > 0 && nonRefunded.every((g) => isItemImported(g))
}
function getItemStatusText(item) {
  return item._wrapperStatus || item._statusText || ''
}
const CLOSED_ORDER_PATTERNS = [
  /交易关闭/,
  /订单关闭/,
  /关闭订单/,
]
const REFUND_STATUS_PATTERNS = [
  /退款/,
  /退货/,
  /售后/,
  /已取消/,
  /取消订单/,
]
// 商品是否已退款/取消
function isItemRefundedOrCancelled(item) {
  const statusText = getItemStatusText(item).trim()
  return REFUND_STATUS_PATTERNS.some((pattern) => pattern.test(statusText))
}
function isOrderClosed(po) {
  const statusText = String(po?.statusText || '').trim()
  return CLOSED_ORDER_PATTERNS.some((pattern) => pattern.test(statusText))
}

// 商品是否有展示价值的非常规状态（山不是「已完成」类气泰状态）
const SKIP_STATUS_SET = new Set(['交易完成', '交易成功', '已完成', '已成功', '收货成功', '已收货', '已结束'])
function getSelectableGoods(po) {
  if (isOrderClosed(po)) return []
  return po.goods.filter((g) => !isItemImported(g) && !isItemRefundedOrCancelled(g))
}

function isOrderSelectionDisabled(po) {
  return isOrderClosed(po) || isOrderImported(po) || getSelectableGoods(po).length === 0
}

function isItemSelectable(item, po) {
  return !isOrderSelectionDisabled(po) && !isItemImported(item) && !isItemRefundedOrCancelled(item)
}

function isItemStatusWorthy(item) {
  const statusText = getItemStatusText(item)
  return statusText.length > 0 && !SKIP_STATUS_SET.has(statusText)
}

function createMihoyoImportContext() {
  return buildMihoyoImportContext({
    goodsList: store.list || [],
    presetCharacters: presets.characters || [],
    categories: presets.categories || [],
    ips: presets.ips || [],
    // n-gram 关键词学习走共享缓存，避免每次重算都做全量扫描
    learnedCategories: getSharedTaggingContext(presets, store).getLearnedKeywords(),
  })
}

function normalizeMihoyoImportItem(item, context) {
  const normalized = resolveMihoyoImportDraft(item, { context })
  addMihoyoImportContextItem(context, normalized)
  return normalized
}

function hasActualPrice(item) {
  return item?.actualPrice !== '' && item?.actualPrice != null && Number.isFinite(Number(item.actualPrice))
}

/** 入手价与原价一致时不展示「入手」，避免重复价格噪音 */
function shouldShowActualPrice(item) {
  if (!hasActualPrice(item)) return false
  const actual = Number(item.actualPrice)
  const listed = Number(item.price)
  if (!Number.isFinite(listed)) return true
  return Math.abs(actual - listed) >= 0.005
}

function formatImportMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 100) / 100)
}

function centsToDisplay(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n) || n < 0) return ''
  return formatImportMoney(n / 100)
}

/** 同名合并时累加入手价与逐份价 */
function mergeImportGoodsLine(target, incoming) {
  target.quantity = (Number(target.quantity) || 1) + (Number(incoming.quantity) || 1)
  const tHas = hasActualPrice(target)
  const iHas = hasActualPrice(incoming)
  if (tHas && iHas) {
    target.actualPrice = formatImportMoney(Number(target.actualPrice) + Number(incoming.actualPrice))
  } else if (iHas) {
    target.actualPrice = incoming.actualPrice
  }
  const tUnits = Array.isArray(target.unitActualPriceList) ? target.unitActualPriceList : []
  const iUnits = Array.isArray(incoming.unitActualPriceList) ? incoming.unitActualPriceList : []
  if (tUnits.length || iUnits.length) {
    target.unitActualPriceList = [...tUnits, ...iUnits]
  }
}

// ── Computed ───────────────────────────────────────────────────
/** 按订单分组，每组含该订单所有商品（同名项合并数量） */
const processedOrders = computed(() =>
  {
    const context = createMihoyoImportContext()
    return rawOrders.value.map((order) => {
      const rawGoods = orderToGoodsList(order).map((item) => normalizeMihoyoImportItem(item, context))
      // 同一订单内：精确身份相同或（缺字段时）名称+款式相同的商品合并数量
      const nameMap = new Map()
      for (const g of rawGoods) {
        const key = getOrderLineMergeKey(g)
        if (nameMap.has(key)) {
          mergeImportGoodsLine(nameMap.get(key), g)
        } else {
          nameMap.set(key, { ...g })
        }
      }
      const paidCents = Number(order.payment_info?.pay_amount ?? order.order_amount)
      // 与入手价分摊共用同一套优惠解析（含 discounts 缺失时按金额兜底）
      const discountCents = resolveOrderDiscountCents(order)
      const hasDiscount = discountCents > 0
      return {
        raw: order,
        orderNo: order.order_no || order.orderNo || '',
        goods: Array.from(nameMap.values()),
        statusText: order.status_text || order.manage_status_text || '',
        shopName: order.shop?.shop_name || '',
        hasDiscount: hasDiscount || (
          Number.isFinite(paidCents)
          && Number.isFinite(Number(order.goods_amount))
          && paidCents < Number(order.goods_amount)
        ),
        paidText: centsToDisplay(paidCents),
        discountText: hasDiscount ? centsToDisplay(discountCents) : ''
      }
    })
    .filter((po) => po.goods.length > 0)
  }
)

/** 所有商品展平后的列表（用于全选/计数/导入） */
const allGoods = computed(() => processedOrders.value.flatMap((po) => po.goods))
const selectableGoods = computed(() =>
  processedOrders.value.flatMap((po) => getSelectableGoods(po))
)
const hasSelection = computed(() => selectedSet.value.size > 0)
const isAllSelectableSelected = computed(() =>
  selectableGoods.value.length > 0 && selectedSet.value.size === selectableGoods.value.length
)

// 按名称+角色去重：同名同款式的商品合并，数量累加
const mergedAllGoods = computed(() => {
  const map = new Map()
  for (const g of allGoods.value) {
    const key = buildGoodsIdentityKey(g)
    if (map.has(key)) {
      const ex = map.get(key)
      ex.quantity = (Number(ex.quantity) || 1) + (Number(g.quantity) || 1)
    } else {
      map.set(key, { ...g })
    }
  }
  return Array.from(map.values())
})

// ── 选择与导入 ─────────────────────────────────────────────────
function isOrderFullySelected(po) {
  const selectable = getSelectableGoods(po)
  return selectable.length > 0 && selectable.every((g) => selectedSet.value.has(g._itemKey))
}
function isOrderPartiallySelected(po) {
  const selectable = getSelectableGoods(po)
  return selectable.length > 0 && !isOrderFullySelected(po) && selectable.some((g) => selectedSet.value.has(g._itemKey))
}
function toggleOrderSelect(po) {
  if (isOrderSelectionDisabled(po)) return
  const selectable = getSelectableGoods(po)
  if (selectable.length === 0) return
  const next = new Set(selectedSet.value)
  if (isOrderFullySelected(po)) {
    selectable.forEach((g) => next.delete(g._itemKey))
  } else {
    selectable.forEach((g) => next.add(g._itemKey))
  }
  selectedSet.value = next
}
function toggleExpand(orderNo) {
  const next = new Set(expandedSet.value)
  if (next.has(orderNo)) next.delete(orderNo)
  else next.add(orderNo)
  expandedSet.value = next
}

function selectAll() {
  selectedSet.value = new Set(
    selectableGoods.value.map((g) => g._itemKey)
  )
}

function deselectAll() {
  selectedSet.value = new Set()
}

function toggleItem(itemKey, po) {
  const item = allGoods.value.find((g) => g._itemKey === itemKey)
  if (!item || !isItemSelectable(item, po)) return
  const next = new Set(selectedSet.value)
  if (next.has(itemKey)) next.delete(itemKey)
  else next.add(itemKey)
  selectedSet.value = next
}

async function doImport() {
  const selected = allGoods.value.filter((g) =>
    selectedSet.value.has(g._itemKey) &&
    !isItemImported(g) &&
    !isItemRefundedOrCancelled(g)
  )
  if (selected.length === 0) return

  // 按精确身份（缺字段回退名称+款式）去重，数量叠加
  const nameMap = new Map()
  for (const item of selected) {
    const key = getOrderLineMergeKey(item)
    if (nameMap.has(key)) {
      mergeImportGoodsLine(nameMap.get(key), item)
    } else {
      nameMap.set(key, { ...item })
    }
  }
  const toImport = Array.from(nameMap.values())

  await store.addMultipleGoods(toImport)
  // 同步 IP 和角色到 presets（与手动导入行为一致）
  for (const g of toImport) {
    if (g.ip) await presets.addIp(g.ip)
    for (const charName of (g.characters || [])) {
      if (charName) await presets.addCharacter(charName, g.ip || '')
    }
  }
  importedCount.value = toImport.length
  importedTotalQty.value = toImport.reduce((s, g) => s + (Number(g.quantity) || 1), 0)

  step.value = 'done'
}

function getStatusClass(text) {
  if (!text) return ''
  if (text.includes('成功') || text.includes('已收货')) return 'status--done'
  if (text.includes('待收货') || text.includes('待签收')) return 'status--shipping'
  if (REFUND_STATUS_PATTERNS.some((pattern) => pattern.test(text))) return 'status--refund'
  return ''
}

</script>

<template>
  <div class="page account-import-page" :class="{ 'account-import-page--embedded': embedded }">
    <NavBar v-if="!embedded" :title="t('import.account')" show-back>
      <template #right>
        <MihoyoAccountNavBtn
          :label="activeAccountLabel"
          :avatar="activeAccountAvatar"
          :accounts-count="accounts.length"
          @click="openAccountSheet"
        />
      </template>
    </NavBar>
    <!-- 内嵌 tab：切号胶囊挂到宿主导入页 NavBar 右上角 -->
    <Teleport v-if="embedded && embeddedActive" to="#import-nav-account-slot">
      <MihoyoAccountNavBtn
        :label="activeAccountLabel"
        :avatar="activeAccountAvatar"
        :accounts-count="accounts.length"
        @click="openAccountSheet"
      />
    </Teleport>
    <!-- 普通提示对话框 -->
    <AppSheet :model-value="showErrorDialog" placement="center" @update:model-value="(v) => { if (!v) closeErrorDialog() }">
      <p class="dialog-label">Import Notice</p>
      <h3 class="dialog-title">{{ errorDialogTitle }}</h3>
      <p class="dialog-desc">{{ errorDialogMessage }}</p>
      <div class="dialog-actions">
        <button class="dialog-btn dialog-btn--primary" type="button" @click="closeErrorDialog">
          {{ t('common.ok') }}
        </button>
      </div>
    </AppSheet>

    <MihoyoAccountSheet
      ref="accountSheetRef"
      v-model="showAccountSheet"
      :accounts="accounts"
      :active-account-id="activeAccountId"
      :active-account-label="activeAccountLabel"
      :refreshing-account-id="refreshingAccountId"
      @switch="onSwitchAccount"
      @remove="onRemoveAccount"
      @login-native="onLoginNewNative"
      @login-cookie="onLoginNewCookie"
      @refresh-account="onRefreshAccount"
      :save-stoken="saveStokenForAccount"
      :stoken-error-message="stokenErrorText"
    />

    <main class="page-body">
      <!-- ========== Step: cookie ========== -->
      <Transition name="step-fade" mode="out-in">
        <section v-if="step === 'cookie'" key="cookie" class="step-section">
          <div class="info-card">
            <div class="info-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            </div>
            <div class="info-body">
              <template v-if="canUseNativeImport">
                <p class="info-title">{{ t('import.nativeLoginTitle') }}</p>
                <ol class="info-steps">
                  <li>{{ t('import.nativeStep1') }}</li>
                  <li>{{ t('import.nativeStep2') }}</li>
                  <li>{{ t('import.nativeStep3') }}</li>
                  <li>{{ t('import.nativeStep4Orders') }}</li>
                </ol>
              </template>
              <template v-else>
                <p class="info-title">{{ t('import.qrLoginHint') }}</p>
                <p class="info-qr-lead">{{ t('import.qrLoginUseCookie') }}</p>
              </template>
            </div>
          </div>

          <div v-if="!canUseNativeImport" class="qr-cta">
            <button class="qr-cta__btn" type="button" @click="showQrLogin = true">
              {{ t('import.qrLoginTitle') }}
            </button>
          </div>

          <!-- 安卓端同样支持粘贴 Cookie：留空则仍走原生网页登录 -->
          <p v-if="canUseNativeImport" class="info-qr-lead">{{ t('import.cookieNativeHint') }}</p>

          <div class="field-group">
            <label class="field-label" for="cookie-input">{{ t('import.pasteCookie') }}</label>
            <textarea
              id="cookie-input"
              v-model="cookieInput"
              class="cookie-textarea"
              :placeholder="t('import.cookiePlaceholder')"
              spellcheck="false"
              autocomplete="off"
            />
            <p v-if="cookieInput && !cookieValid" class="field-error">
              {{ t('import.cookieInvalid') }}
            </p>
          </div>

          <div class="cookie-actions">
            <label class="remember-row">
              <input v-model="rememberCookie" class="remember-checkbox" type="checkbox" />
              <span>{{ t('import.rememberCookie') }}</span>
            </label>
          </div>
          <p v-if="cookieWarningMessage" class="cookie-tip cookie-tip--warn">{{ cookieWarningMessage }}</p>

          <button class="primary-btn" type="button" :disabled="cookiePrimaryDisabled" @click="startFetch">
            {{ canUseNativeImport ? t('import.loginAndGetOrders') : t('import.startFetchOrders') }}
          </button>

          <MihoyoQrLoginSheet
            v-if="!canUseNativeImport"
            v-model="showQrLogin"
            @success="onQrLoginSuccess"
          />
        </section>

        <!-- ========== Step: loading ========== -->
        <section v-else-if="step === 'loading'" key="loading" class="step-section step-section--center">
          <div class="loading-anim" :aria-label="t('common.loading')">
            <div class="loading-ring" />
          </div>
          <p class="loading-title">{{ t('import.fetchingOrders') }}</p>
          <p class="loading-sub">{{ loadedCount }} / {{ totalCount || '??' }} {{ t('common.records') }}</p>
        </section>

        <!-- ========== Step: orders ========== -->
        <section v-else-if="step === 'orders'" key="orders" class="step-section step-section--list">
          <!-- 内嵌隐藏时跳过整棵列表渲染/重算：拉取结果在后台到达也不拖累其它 Tab -->
          <template v-if="!embedded || embeddedActive">
          <div class="list-header">
            <p class="list-count">{{ t('import.orderCount', { orders: processedOrders.length, types: mergedAllGoods.length, total: allGoods.length }) }}</p>
            <div class="list-header-actions">
              <button
                :class="['text-btn', isAllSelectableSelected && 'text-btn--active']"
                type="button"
                @click="selectAll"
              >
                {{ t('common.selectAll') }}
              </button>
              <button
                :class="['text-btn', hasSelection && 'text-btn--active']"
                type="button"
                @click="deselectAll"
              >
                {{ t('common.deselectAll') }}
              </button>
            </div>
          </div>

          <div v-if="cappedWarning" class="warn-banner">
            {{ t('import.cappedWarning') }}
          </div>

          <ul class="order-list">
            <li v-for="po in processedOrders" :key="po.orderNo" class="order-group">

              <!-- 订单摘要行 -->
              <div :class="[
                'order-row',
                isOrderFullySelected(po) && 'order-row--selected',
                isOrderPartiallySelected(po) && 'order-row--partial',
                isOrderSelectionDisabled(po) && 'order-row--disabled'
              ]">
                <!-- 三态复选框 -->
                <div :class="['order-check', isOrderSelectionDisabled(po) && 'order-check--disabled']" @click.stop="toggleOrderSelect(po)">
                  <div :class="[
                    'check-dot',
                    isOrderFullySelected(po) && 'check-dot--on',
                    isOrderPartiallySelected(po) && 'check-dot--partial'
                  ]">
                    <svg v-if="isOrderFullySelected(po)" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <svg v-else-if="isOrderPartiallySelected(po)" viewBox="0 0 24 24" fill="none">
                      <line x1="6" y1="12" x2="18" y2="12" />
                    </svg>
                  </div>
                </div>

                <!-- 首件缩略图（点击展开） -->
                <div class="order-thumb" @click="toggleExpand(po.orderNo)">
                  <img
                    v-if="po.goods[0]?._coverUrl"
                    :src="po.goods[0]._coverUrl"
                    class="thumb-img"
                    loading="lazy"
                  />
                  <span v-else class="thumb-initial">{{ (po.goods[0]?.name || '?').charAt(0) }}</span>
                </div>

                <!-- 订单信息（点击展开） -->
                <div class="order-info" @click="toggleExpand(po.orderNo)">
                  <p class="order-name">{{ po.goods[0]?.name || t('import.unknownGoods') }}</p>
                  <div class="order-meta">
                    <span v-if="po.goods.length > 1" class="meta-count">{{ t('import.goodsCount', { count: po.goods.length }) }}</span>
                    <span v-if="po.shopName" class="meta-shop">{{ po.shopName }}</span>
                    <span class="meta-date">{{ po.goods[0]?.acquiredAt }}</span>
                    <span v-if="po.hasDiscount" class="meta-payed">
                      {{ t('import.orderPaid') }} ¥{{ po.paidText }}
                      <span v-if="po.discountText" class="meta-discount">-¥{{ po.discountText }}</span>
                    </span>
                  </div>
                </div>

                <span v-if="isOrderImported(po)" class="status-badge status--imported">{{ t('import.alreadyImported') }}</span>
                <span v-else-if="po.statusText" :class="['status-badge', getStatusClass(po.statusText)]">
                  {{ po.statusText }}
                </span>

                <!-- 展开箭头 -->
                <button
                  :class="['expand-btn', expandedSet.has(po.orderNo) && 'expand-btn--open']"
                  type="button"
                  @click.stop="toggleExpand(po.orderNo)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>

              <!-- 展开后的商品列表 -->
              <Transition name="goods-expand">
                <ul v-if="expandedSet.has(po.orderNo)" class="goods-sub-list">
                  <li
                    v-for="item in po.goods"
                    :key="item._itemKey"
                    :class="['goods-item',
                      selectedSet.has(item._itemKey) && 'goods-item--selected',
                      (!isItemSelectable(item, po)) && 'goods-item--imported'
                    ]"
                    @click="toggleItem(item._itemKey, po)"
                  >
                    <div class="order-check">
                      <div :class="['check-dot', 'check-dot--sm', selectedSet.has(item._itemKey) && 'check-dot--on']">
                        <svg v-if="selectedSet.has(item._itemKey)" viewBox="0 0 24 24" fill="none">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    </div>
                    <div class="order-thumb order-thumb--sm">
                      <img v-if="item._coverUrl" :src="item._coverUrl" class="thumb-img" loading="lazy" />
                      <span v-else class="thumb-initial">{{ (item.name || '?').charAt(0) }}</span>
                    </div>
                    <div class="order-info">
                      <p class="order-name">{{ item.name }}</p>
                      <div class="order-meta">
                        <span
                          class="meta-price"
                          :class="{ 'meta-price--struck': shouldShowActualPrice(item) }"
                        >¥{{ item.price }}</span>
                        <span v-if="shouldShowActualPrice(item)" class="meta-actual">
                          {{ t('import.actualPrice') }} ¥{{ formatImportMoney(item.actualPrice) }}
                        </span>
                        <span v-if="item.quantity > 1" class="meta-qty">×{{ item.quantity }}</span>
                        <span v-if="item.ip" class="meta-ip">{{ item.ip }}</span>
                        <span v-if="item.variant" class="meta-char">{{ item.variant }}</span>
                        <span v-else-if="item.characters?.length" class="meta-char">{{ item.characters[0] }}</span>
                        <span v-if="isItemRefundedOrCancelled(item)" :class="['status-badge', 'status--refund', 'meta-item-status']">{{ getItemStatusText(item) }}</span>
                        <span v-else-if="isItemImported(item)" class="status-badge status--imported meta-item-status">{{ t('import.alreadyImported') }}</span>
                        <span v-else-if="isItemStatusWorthy(item)" class="status-badge status--neutral meta-item-status">{{ getItemStatusText(item) }}</span>
                      </div>
                    </div>
                  </li>
                </ul>
              </Transition>

            </li>
          </ul>
          </template>

        </section>

        <!-- ========== Step: done ========== -->
        <section v-else-if="step === 'done'" key="done" class="step-section step-section--center">
          <div class="done-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="7 12 11 16 17 8" />
            </svg>
          </div>
          <p class="done-title">{{ t('import.importComplete') }}</p>
          <p class="done-sub">{{ t('import.importDoneSub', { count: importedCount, qty: importedTotalQty }) }}</p>
          <button class="primary-btn" type="button" @click="runWithRouteTransition(() => router.push('/home'), { direction: 'back', fallbackTransitionKind: 'detail-fade' })">
            {{ t('import.backToHome') }}
          </button>
        </section>
      </Transition>

    </main>

    <div v-if="step === 'orders'" class="bottom-bar">
      <button
        class="primary-btn"
        type="button"
        :disabled="selectedSet.size === 0"
        @click="doImport"
      >
        {{ t('import.importGoods', { count: selectedSet.size || '' }) }}
      </button>
    </div>
  </div>
</template>

<style scoped src="@/assets/views/AccountImportView.css"></style>
