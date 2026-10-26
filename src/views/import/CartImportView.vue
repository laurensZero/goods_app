<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import '@/assets/common/loading.css'
import { useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useMihoyoImportSession } from '@/composables/import/useMihoyoImportSession'
import { importMihoyoCartWithSession } from '@/utils/mihoyo/nativeImport'
import { fetchCartList, cartShopToGoodsList } from '@/utils/mihoyo/index'
import {
  addMihoyoImportContextItem,
  buildMihoyoImportContext,
  resolveMihoyoImportDraft,
} from '@/utils/mihoyo/importResolver'
import { getSharedTaggingContext } from '@/utils/tagging/taggingContextCache'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { showGlobalToast } from '@/utils/globalToast'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MihoyoAccountSheet from '@/components/import/MihoyoAccountSheet.vue'
import MihoyoAccountNavBtn from '@/components/import/MihoyoAccountNavBtn.vue'
import MihoyoQrLoginSheet from '@/components/import/MihoyoQrLoginSheet.vue'

defineOptions({ name: 'CartImportView' })

// 内嵌在米游铺导入页 tab 里时隐藏 NavBar，布局随宿主流动
const props = defineProps({
  embedded: { type: Boolean, default: false },
  /** 当前是否为宿主激活的 tab（预挂载时不拉数据，激活后才 bootstrap） */
  embeddedActive: { type: Boolean, default: false },
})

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()

const isWishlistMode = computed(() => route.query.mode === 'wishlist')
const pageTitle = computed(() => isWishlistMode.value ? t('import.cartImportWishlistTitle') : t('import.cart'))
const doneTargetPath = computed(() => (isWishlistMode.value ? '/wishlist' : '/home'))
const targetList = computed(() => (isWishlistMode.value ? store.wishlistList : store.collectionList))

// ── 会话门状态 ──
const rawGroups = ref([])
const selectedSet = ref(new Set())
const importedCount = ref(0)
const importedTotalQty = ref(0)

// ── 会话门（Cookie/账号/启动/拉取流程，与订单导入共用 useMihoyoImportSession） ──
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
  listStepName: 'list',
  fetchFailedKey: 'import.fetchCartFailed',
  isEmbedded: () => props.embedded,
  isEmbeddedActive: () => props.embeddedActive,
  // 原生插件会话拉购物车；Web 端带 Cookie 拉接口
  fetchNative: async () => await importMihoyoCartWithSession(),
  fetchWeb: async (cookie) => await fetchCartList(cookie),
  onList: (list) => {
    rawGroups.value = list
    initSelectionAfterFetch()
  },
})

// 网页版：状态加载完且无任何会话/账号时自动弹扫码的逻辑在会话门内；
// 这里只处理内嵌 tab 的延迟初始化
let pendingSelectionInit = false

watch(
  () => props.embeddedActive,
  (active) => {
    if (active && pendingSelectionInit) {
      pendingSelectionInit = false
      // 仅列表就绪时补做初始化；其他状态（登出/失败回退）无需全选
      if (step.value === 'list') initSelectionFromFetch()
    }
  },
  { immediate: true },
)

// ── 导入上下文与列表规整 ──

const importedItemKeys = computed(() =>
  new Set(targetList.value.map((item) => buildGoodsIdentityKey(item)))
)

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

const processedGroups = computed(() =>
  {
    const context = createMihoyoImportContext()
    return rawGroups.value.map((group) => {
      const map = new Map()
      for (const item of cartShopToGoodsList(group)) {
        const normalizedItem = normalizeMihoyoImportItem(item, context)

        // 不再把售罄视为不可导入；售罄仅作为信息保留在 `._soldOut`
        // `_isEffective` 的判定已在 `cartItemToGoods` 中调整为忽略售罄字段
        const key = buildGoodsIdentityKey(normalizedItem)
        if (map.has(key)) {
          const existing = map.get(key)
          existing.quantity = (Number(existing.quantity) || 1) + (Number(normalizedItem.quantity) || 1)
        } else {
          map.set(key, normalizedItem)
        }
      }

      return {
        shopCode: String(group.shop_code || group.shopCode || ''),
        shopName: String(group.shop_name || group.shopName || ''),
        goods: Array.from(map.values())
      }
    })
    .filter((group) => group.goods.length > 0)
  }
)

const selectableGoods = computed(() =>
  processedGroups.value.flatMap((group) => group.goods.filter((item) => isItemSelectable(item)))
)

const hasSelection = computed(() => selectedSet.value.size > 0)
const isAllSelectableSelected = computed(() =>
  selectableGoods.value.length > 0 && selectableGoods.value.every((item) => selectedSet.value.has(item._itemKey))
)

function isItemImported(item) {
  return importedItemKeys.value.has(buildGoodsIdentityKey(item))
}

function isItemSelectable(item) {
  if (isItemImported(item)) return false
  return isWishlistMode.value || item._isEffective
}

function isShopSelectionDisabled(group) {
  return group.goods.every((item) => !isItemSelectable(item))
}

function isShopFullySelected(group) {
  const selectable = group.goods.filter((item) => isItemSelectable(item))
  return selectable.length > 0 && selectable.every((item) => selectedSet.value.has(item._itemKey))
}

function isShopPartiallySelected(group) {
  const selectable = group.goods.filter((item) => isItemSelectable(item))
  return selectable.length > 0 && !isShopFullySelected(group) && selectable.some((item) => selectedSet.value.has(item._itemKey))
}

/** 数据到达后初始化全选状态（会触发 processedGroups 重算，可能较贵） */
function initSelectionFromFetch() {
  selectedSet.value = new Set(selectableGoods.value.map((item) => item._itemKey))
}

/** 内嵌隐藏时推迟初始化，切回该 Tab 再执行，避免后台重算拖累当前可见 Tab */
function initSelectionAfterFetch() {
  if (props.embedded && !props.embeddedActive) {
    pendingSelectionInit = true
    return
  }
  initSelectionFromFetch()
}

// ── 选择与导入 ──

function selectAll() {
  selectedSet.value = new Set(selectableGoods.value.map((item) => item._itemKey))
}

function deselectAll() {
  selectedSet.value = new Set()
}

function toggleShopSelect(group) {
  if (isShopSelectionDisabled(group)) return
  const selectable = group.goods.filter((item) => isItemSelectable(item))
  const next = new Set(selectedSet.value)

  if (isShopFullySelected(group)) {
    selectable.forEach((item) => next.delete(item._itemKey))
  } else {
    selectable.forEach((item) => next.add(item._itemKey))
  }

  selectedSet.value = next
}

function toggleItem(itemKey) {
  const item = processedGroups.value.flatMap((group) => group.goods).find((entry) => entry._itemKey === itemKey)
  if (!item || !isItemSelectable(item)) return

  const next = new Set(selectedSet.value)
  if (next.has(itemKey)) next.delete(itemKey)
  else next.add(itemKey)
  selectedSet.value = next
}

const importing = ref(false)

async function doImport() {
  if (importing.value) return
  const selectedItems = processedGroups.value
    .flatMap((group) => group.goods)
    .filter((item) => selectedSet.value.has(item._itemKey) && isItemSelectable(item))
    .map((item) => ({ ...item, isWishlist: isWishlistMode.value }))

  if (!selectedItems.length) return

  importing.value = true
  try {
    await store.addMultipleGoods(selectedItems)

    // 预设去重后并行写入：逐条 await 串行持久化会把 done 页无谓拖慢（大批量时明显）
    const ipSet = new Set()
    const characterPairs = new Map()
    for (const item of selectedItems) {
      if (item.ip) ipSet.add(item.ip)
      for (const character of (item.characters || [])) {
        if (!character) continue
        characterPairs.set(JSON.stringify([item.ip || '', character]), { ip: item.ip || '', character })
      }
    }
    await Promise.all([
      ...[...ipSet].map((ip) => presets.addIp(ip)),
      ...[...characterPairs.values()].map(({ ip, character }) => presets.addCharacter(character, ip)),
    ])

    importedCount.value = selectedItems.length
    importedTotalQty.value = selectedItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
    step.value = 'done'
  } catch (err) {
    console.warn('[cart-import] save failed', err)
    showGlobalToast(err?.message || t('import.importFailed'))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="page cart-import-page" :class="{ 'cart-import-page--embedded': embedded }">
    <NavBar v-if="!embedded" :title="pageTitle" show-back>
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
                  <li>{{ t('import.nativeStep4Cart') }}</li>
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
            {{ canUseNativeImport ? t('import.loginAndFetchCart') : t('import.fetchCart') }}
          </button>

          <MihoyoQrLoginSheet
            v-if="!canUseNativeImport"
            v-model="showQrLogin"
            @success="onQrLoginSuccess"
          />
        </section>

        <section v-else-if="step === 'loading'" key="loading" class="step-section step-section--center">
          <div class="loading-anim" :aria-label="t('common.loading')">
            <div class="loading-ring" />
          </div>
          <p class="loading-title">{{ t('import.fetchingCart') }}</p>
          <p class="loading-sub">{{ t('import.pleaseWait') }}</p>
        </section>

        <section v-else-if="step === 'list'" key="list" class="step-section step-section--list">
          <!-- 内嵌隐藏时跳过整棵列表渲染/重算：拉取结果在后台到达也不拖累其它 Tab -->
          <template v-if="!embedded || embeddedActive">
          <div class="list-header">
            <p class="list-count">{{ t('import.cartCount', { shops: processedGroups.length, items: selectableGoods.length }) }}</p>
            <div class="list-header-actions">
              <button :class="['text-btn', isAllSelectableSelected && 'text-btn--active']" type="button" @click="selectAll">
                {{ t('common.selectAll') }}
              </button>
              <button :class="['text-btn', hasSelection && 'text-btn--active']" type="button" @click="deselectAll">
                {{ t('common.deselectAll') }}
              </button>
            </div>
          </div>

          <div v-if="processedGroups.length === 0" class="empty-wrap">
            <EmptyState
              icon="✦"
              :title="t('import.cartEmptyTitle')"
              :description="t('import.cartEmptyDesc')"
            />
          </div>

          <ul v-else class="shop-list">
            <li v-for="group in processedGroups" :key="group.shopCode || group.shopName" class="shop-group">
              <div :class="['shop-row', isShopSelectionDisabled(group) && 'shop-row--disabled']">
                <button class="check-btn" type="button" :disabled="isShopSelectionDisabled(group)" @click="toggleShopSelect(group)">
                  <span :class="['check-dot', isShopFullySelected(group) && 'check-dot--on', isShopPartiallySelected(group) && 'check-dot--partial']">
                    <svg v-if="isShopFullySelected(group)" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <svg v-else-if="isShopPartiallySelected(group)" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <line x1="6" y1="12" x2="18" y2="12" />
                    </svg>
                  </span>
                </button>

                <div class="shop-copy">
                  <p class="shop-name">{{ group.shopName || t('import.mihoyoShop') }}</p>
                  <p class="shop-meta">{{ t('import.shopGoodsCount', { count: group.goods.length }) }}</p>
                </div>
              </div>

              <ul class="goods-list">
                <li
                  v-for="item in group.goods"
                  :key="item._itemKey"
                  :class="[
                    'goods-item',
                    selectedSet.has(item._itemKey) && 'goods-item--selected',
                    !isItemSelectable(item) && 'goods-item--disabled'
                  ]"
                  @click="toggleItem(item._itemKey)"
                >
                  <div class="goods-leading">
                    <span :class="['check-dot', 'check-dot--sm', selectedSet.has(item._itemKey) && 'check-dot--on']">
                      <svg v-if="selectedSet.has(item._itemKey)" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  </div>

                  <div class="goods-thumb">
                    <img v-if="item.image" :src="item.image" :alt="item.name" class="goods-img" loading="lazy" />
                    <span v-else class="goods-initial">{{ (item.name || '?').charAt(0) }}</span>
                  </div>

                  <div class="goods-info">
                    <p class="goods-name">{{ item.name }}</p>
                    <div class="goods-meta">
                      <span class="meta-price">¥{{ item.price }}</span>
                      <span v-if="item.quantity > 1" class="meta-qty">×{{ item.quantity }}</span>
                      <span v-if="item.variant" class="meta-tag">{{ item.variant }}</span>
                      <span v-else-if="item.characters?.length" class="meta-tag">{{ item.characters[0] }}</span>
                      <span v-if="item.ip" class="meta-tag meta-tag--ip">{{ item.ip }}</span>
                      <span v-if="isItemImported(item)" class="meta-tag meta-tag--imported">{{ t('import.alreadyExists') }}</span>
                      <span v-else-if="!item._isEffective" class="meta-tag meta-tag--disabled">{{ item._reason || t('import.notImportable') }}</span>
                    </div>
                  </div>
                </li>
              </ul>
            </li>
          </ul>
          </template>

        </section>

        <section v-else key="done" class="step-section step-section--center">
          <div class="done-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="7 12 11 16 17 8" />
            </svg>
          </div>
          <p class="done-title">{{ t('import.importComplete') }}</p>
          <p class="done-sub">{{ t('import.cartDoneSub', { count: importedCount, qty: importedTotalQty }) }}</p>
          <button class="primary-btn" type="button" @click="runWithRouteTransition(() => router.replace(doneTargetPath), { direction: 'back', fallbackTransitionKind: 'detail-fade' })">
            {{ t('import.backTo', { target: isWishlistMode ? t('common.wishlist') : t('import.home') }) }}
          </button>
        </section>
      </Transition>
    </main>

    <div v-if="step === 'list' && (!embedded || embeddedActive) && processedGroups.length > 0" class="bottom-bar">
      <button class="primary-btn" type="button" :disabled="selectedSet.size === 0 || importing" @click="doImport">
        {{ t('import.confirmImport') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="@/assets/views/CartImportView.css"></style>
