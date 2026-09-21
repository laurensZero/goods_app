<template>
  <div class="page cart-import-page">
    <NavBar :title="pageTitle" show-back>
      <template #right>
        <MihoyoAccountNavBtn
          :label="activeAccountLabel"
          :avatar="activeAccountAvatar"
          :accounts-count="accounts.length"
          @click="openAccountSheet"
        />
      </template>
    </NavBar>
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
      @switch="onSwitchAccount"
      @remove="onRemoveAccount"
      @logout="handleLogout"
      @login-native="onLoginNewNative"
      @login-cookie="onLoginNewCookie"
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
                <p class="info-title">{{ t('import.howToGetCookie') }}</p>
                <ol class="info-steps">
                  <li>{{ t('import.cartCookieStep1') }}</li>
                  <li>{{ t('import.cartCookieStep2') }}</li>
                  <li>{{ t('import.cartCookieStep3') }}</li>
                  <li>{{ t('import.cartCookieStep4') }}</li>
                  <li>{{ t('import.cartCookieStep5') }}</li>
                </ol>
              </template>
            </div>
          </div>

          <div v-if="!canUseNativeImport" class="field-group">
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
            <template v-if="!canUseNativeImport">
              <label class="remember-row">
                <input v-model="rememberCookie" class="remember-checkbox" type="checkbox" />
                <span>{{ t('import.rememberCookie') }}</span>
              </label>
            </template>
            <span v-else class="cookie-actions__spacer" />
          </div>
          <p v-if="!canUseNativeImport && cookieWarningMessage" class="cookie-tip cookie-tip--warn">{{ cookieWarningMessage }}</p>

          <button class="primary-btn" type="button" :disabled="!canUseNativeImport && !cookieValid" @click="startFetch">
            {{ canUseNativeImport ? t('import.loginAndFetchCart') : t('import.fetchCart') }}
          </button>
        </section>

        <section v-else-if="step === 'loading'" key="loading" class="step-section step-section--center">
          <div class="loading-anim" :aria-label="t('common.loading')">
            <div class="loading-ring" />
          </div>
          <p class="loading-title">{{ t('import.fetchingCart') }}</p>
          <p class="loading-sub">{{ t('import.pleaseWait') }}</p>
        </section>

        <section v-else-if="step === 'list'" key="list" class="step-section step-section--list">
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

    <div v-if="step === 'list' && processedGroups.length > 0" class="bottom-bar">
      <button class="primary-btn" type="button" :disabled="selectedSet.size === 0" @click="doImport">
        {{ t('import.confirmImport') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import '@/assets/common/loading.css'
import { useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useMihoyoCookieState } from '@/composables/import/useMihoyoCookieState'
import { canUseNativeMihoyoImport, importMihoyoCartWithSession } from '@/utils/mihoyo/nativeImport'
import { fetchCartList, cartShopToGoodsList } from '@/utils/mihoyo/index'
import {
  addMihoyoImportContextItem,
  buildMihoyoImportContext,
  resolveMihoyoImportDraft,
} from '@/utils/mihoyo/importResolver'
import { buildGoodsIdentityKey } from '@/utils/goods/identity'
import { runWithRouteTransition } from '@/utils/routeTransition'
import NavBar from '@/components/common/NavBar.vue'
import AppSheet from '@/components/common/AppSheet.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import MihoyoAccountSheet from '@/components/import/MihoyoAccountSheet.vue'
import MihoyoAccountNavBtn from '@/components/import/MihoyoAccountNavBtn.vue'

defineOptions({ name: 'CartImportView' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()
const {
  cookieInput,
  rememberCookie,
  cookieValid,
  cookieWarningMessage,
  canAutoSubmitSavedCookie,
  accounts,
  activeAccountId,
  activeAccountLabel,
  activeAccountAvatar,
  initializeCookieState,
  applySavedCookieToInput,
  persistCookieAfterSuccess,
  persistNativeCookieAfterSuccess,
  handleCookieFailure,
  clearSavedCookie,
  switchAccount,
  removeAccount,
  refreshAccountProfiles,
  loginNewAccountNative,
  submitNewAccountCookie,
} = useMihoyoCookieState()

const showAccountSheet = ref(false)
const accountSheetRef = ref(null)
const cartFetchRunning = ref(false)

function openAccountSheet() {
  showAccountSheet.value = true
  void refreshAccountProfiles()
}

const isWishlistMode = computed(() => route.query.mode === 'wishlist')
const pageTitle = computed(() => isWishlistMode.value ? t('import.cartImportWishlistTitle') : t('import.cart'))
const doneTargetPath = computed(() => (isWishlistMode.value ? '/wishlist' : '/home'))
const targetList = computed(() => (isWishlistMode.value ? store.wishlistList : store.collectionList))

const step = ref('cookie')
const rawGroups = ref([])
const selectedSet = ref(new Set())
const importedCount = ref(0)
const importedTotalQty = ref(0)
const canUseNativeImport = canUseNativeMihoyoImport()
const showErrorDialog = ref(false)
const errorDialogTitle = ref('')
const errorDialogMessage = ref('')

function openErrorDialog(title, message) {
  errorDialogTitle.value = title
  errorDialogMessage.value = String(message || '').trim() || t('import.unknownError')
  showErrorDialog.value = true
}

function closeErrorDialog() {
  showErrorDialog.value = false
}

const importedItemKeys = computed(() =>
  new Set(targetList.value.map((item) => buildGoodsIdentityKey(item)))
)

function createMihoyoImportContext() {
  return buildMihoyoImportContext({
    goodsList: store.list || [],
    presetCharacters: presets.characters || [],
    categories: presets.categories || [],
    ips: presets.ips || [],
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

onMounted(async () => {
  if (canUseNativeImport) {
    await startFetch({ silentCookieExpired: true })
    return
  }

  await initializeCookieState()

  if (!canAutoSubmitSavedCookie.value) return

  applySavedCookieToInput()
  await startFetch({ silentCookieExpired: true })
})

async function handleLogout() {
  await clearSavedCookie(true)
  selectedSet.value = new Set()
  step.value = 'cookie'
}

async function onSwitchAccount(account) {
  const result = await switchAccount(account?.id)
  if (!result.ok) {
    openErrorDialog(t('import.switchAccount'), t('import.switchAccountFailed'))
    return
  }

  // 原生端 Cookie 未写入插件时：不要自动 startFetch（会用空/旧会话失败并误标失效）
  if (canUseNativeImport && !result.nativeApplied) {
    openErrorDialog(t('import.switchAccount'), t('import.switchAccountNativeHint'))
    return
  }

  cookieInput.value = result.cookie
  // 直接进 loading 拉新账号数据，避免 cookie 空页/清列表造成的白屏闪烁
  await startFetch({ silentCookieExpired: true })
}

async function onRemoveAccount(account) {
  await removeAccount(account?.id)
}

/** 登录/重登成功后：刷新购物车（不只在切换账号时） */
async function refreshAfterMihoyoLogin(nextCookie) {
  cookieInput.value = String(nextCookie || '').trim()
  if (!cookieInput.value) {
    step.value = 'cookie'
    return
  }
  await startFetch({ silentCookieExpired: true })
}

async function onLoginNewNative() {
  const result = await loginNewAccountNative()
  accountSheetRef.value?.closeAll?.()
  if (!result.ok) {
    if (result.cancelled) return
    openErrorDialog(t('import.loginNewAccount'), result.unsupported
      ? t('import.loginNewAccountUnsupported')
      : (result.message || t('import.loginNewAccountFailed')))
    return
  }
  await refreshAfterMihoyoLogin(result.cookie)
}

async function onLoginNewCookie({ cookie, remember } = {}) {
  const result = await submitNewAccountCookie(cookie, remember)
  if (!result.ok) {
    openErrorDialog(t('import.loginNewAccount'), t('import.loginNewAccountFailed'))
    return
  }
  accountSheetRef.value?.closeAll?.()
  await refreshAfterMihoyoLogin(result.cookie)
}

// 安卓原生端导入成功后，同步 Cookie 到多账号存储
async function syncNativeCookieToWeb() {
  await persistNativeCookieAfterSuccess()
}

const startFetch = async (options = {}) => {
  if (cartFetchRunning.value) return
  cartFetchRunning.value = true
  if (canUseNativeImport) {
    step.value = 'loading'

    try {
      const { list = [] } = await importMihoyoCartWithSession()
      rawGroups.value = Array.isArray(list) ? list : []
      selectedSet.value = new Set(selectableGoods.value.map((item) => item._itemKey))
      step.value = 'list'
      // 同步 Cookie 到 Web 端存储
      await syncNativeCookieToWeb()
    } catch (error) {
      openErrorDialog(t('import.fetchCartFailed'), error?.message || t('import.confirmLoginRetry'))
      step.value = 'cookie'
    } finally {
      cartFetchRunning.value = false
    }
    return
  }

  const { silentCookieExpired = false } = options
  step.value = 'loading'

  try {
    const nextGroups = await fetchCartList(cookieInput.value.trim())
    rawGroups.value = Array.isArray(nextGroups) ? nextGroups : []
    await persistCookieAfterSuccess()
    selectedSet.value = new Set(selectableGoods.value.map((item) => item._itemKey))
    step.value = 'list'
  } catch (error) {
    const cookieExpired = await handleCookieFailure(error)
    if (cookieExpired) {
      step.value = 'cookie'
      if (!silentCookieExpired) {
        openErrorDialog(t('import.cookieExpired'), t('import.cookieExpiredDesc'))
      }
      return
    }

    openErrorDialog(t('import.fetchCartFailed'), error?.message || t('import.retryLater'))
    step.value = 'cookie'
  } finally {
    cartFetchRunning.value = false
  }
}

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

async function doImport() {
  const selectedItems = processedGroups.value
    .flatMap((group) => group.goods)
    .filter((item) => selectedSet.value.has(item._itemKey) && isItemSelectable(item))
    .map((item) => ({ ...item, isWishlist: isWishlistMode.value }))

  if (!selectedItems.length) return

  await store.addMultipleGoods(selectedItems)

  for (const item of selectedItems) {
    if (item.ip) await presets.addIp(item.ip)
    for (const character of (item.characters || [])) {
      if (character) await presets.addCharacter(character, item.ip || '')
    }
  }

  importedCount.value = selectedItems.length
  importedTotalQty.value = selectedItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
  step.value = 'done'
}
</script>

<style scoped>
.cart-import-page {
  min-height: 100dvh;
}

/* 外壳由 AppSheet 提供；此处只保留内容样式 */
.dialog-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 6px 0 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.dialog-desc {
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  min-width: 120px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.page-body {
  padding: var(--section-gap) var(--page-padding) calc(80px + max(env(safe-area-inset-bottom), 12px));
}

.step-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.step-section--center {
  align-items: center;
  justify-content: center;
  min-height: 50dvh;
  gap: 12px;
}

.step-section--list {
  gap: 0;
  padding-bottom: calc(88px + max(env(safe-area-inset-bottom), 16px));
}

.info-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 149, 0, 0.08);
}

.info-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff9500;
}

.info-icon svg,
.done-icon svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.info-body {
  flex: 1;
  min-width: 0;
}

.info-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 8px;
}

.info-steps {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-steps li {
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.5;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.cookie-textarea {
  width: 100%;
  min-height: 120px;
  padding: 14px;
  border-radius: 14px;
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  background: var(--app-surface);
  font-size: 12.5px;
  color: var(--app-text);
  line-height: 1.5;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.field-error {
  font-size: 13px;
  color: #c74444;
  margin: 0;
}

.cookie-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cookie-actions__spacer {
  flex: 1;
  min-width: 0;
}

.remember-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.remember-checkbox {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #141416;
}

.cookie-clear-btn {
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cookie-tip {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.cookie-tip--account {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-secondary);
}

.account-chip-avatar,
.account-chip-fallback {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.account-chip-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(90, 120, 250, 0.12);
  color: #4c7dff;
  font-size: 12px;
  font-weight: 600;
}

.cookie-tip--warn {
  color: #c74444;
}

.primary-btn {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: 16px;
  background: #141416;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.primary-btn:disabled {
  opacity: 0.32;
  pointer-events: none;
}

.loading-title,
.done-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.loading-sub,
.done-sub {
  font-size: 14px;
  color: var(--app-text-secondary);
  margin: 0;
}

.list-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.list-count {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--app-text-secondary);
  margin: 0;
}

.list-header-actions {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.06);
  flex-shrink: 0;
}

.text-btn {
  border: none;
  min-width: 72px;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.text-btn--active {
  background: #141416;
  color: #ffffff;
}

.shop-list,
.goods-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shop-group {
  border-radius: 18px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.05);
}

.shop-row,
.goods-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--app-surface);
}

.shop-row--disabled,
.goods-item--disabled {
  opacity: 0.5;
}

.goods-item {
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  cursor: pointer;
}

.goods-item--selected {
  background: rgba(20, 20, 22, 0.04);
}

.shop-copy,
.goods-info {
  flex: 1;
  min-width: 0;
}

.shop-name,
.goods-name {
  margin: 0;
  color: var(--app-text);
}

.shop-name {
  font-size: 15px;
  font-weight: 600;
}

.shop-meta,
.goods-meta {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.shop-meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.goods-name {
  font-size: 14px;
  font-weight: 500;
}

.goods-leading,
.check-btn {
  flex-shrink: 0;
}

.check-btn {
  border: none;
  background: transparent;
  padding: 0;
}

.check-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.2);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.check-dot--sm {
  width: 17px;
  height: 17px;
}

.check-dot--on {
  background: #141416;
  border-color: #141416;
}

.check-dot--partial {
  background: rgba(20, 20, 22, 0.2);
  border-color: rgba(20, 20, 22, 0.4);
}

.check-dot svg {
  width: 12px;
  height: 12px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.goods-thumb {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.goods-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.goods-initial {
  font-size: 18px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.3);
}

.meta-price,
.meta-qty,
.meta-tag {
  font-size: 12px;
}

.meta-price {
  color: var(--app-text-secondary);
  font-weight: 500;
}

.meta-qty,
.meta-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--app-text-secondary);
}

.meta-tag--ip {
  background: rgba(28, 53, 88, 0.08);
  color: #1c3558;
}

.meta-tag--imported {
  background: rgba(40, 200, 128, 0.1);
  color: #1a8f4c;
}

.meta-tag--disabled {
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.bottom-bar {
  position: fixed;
  bottom: max(env(safe-area-inset-bottom), 12px);
  left: 50%;
  width: min(calc(100% - 32px), calc(430px - 32px));
  transform: translateX(-50%);
  padding: 0;
  z-index: 50;
}

.empty-wrap {
  padding-top: 32px;
}

.done-icon {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: rgba(40, 200, 128, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1a8f4c;
  margin-bottom: 8px;
}

.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.step-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

:global(html.theme-dark) .primary-btn,
  :global(html.theme-dark) .text-btn--active {
    background: #f5f5f7;
    color: #141416;
  }

:global(html.theme-dark) .list-header {
    background: var(--app-glass-strong);
    border: 1px solid var(--app-glass-border);
  }

:global(html.theme-dark) .list-header-actions {
    background: rgba(255, 255, 255, 0.08);
  }

/* 手机端：左侧统计最多两行，右侧按钮压缩 */
@media (max-width: 520px) {
  .list-header {
    gap: 8px;
    padding: 8px 10px;
  }

  .list-count {
    flex: 1 1 52%;
    min-width: 48%;
    max-width: 58%;
    font-size: 13px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .list-header-actions {
    gap: 2px;
    padding: 3px;
  }

  .text-btn {
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    font-size: 12px;
  }
}

:global(html.theme-dark) .shop-group {
    background: rgba(255, 255, 255, 0.04);
  }

:global(html.theme-dark) .shop-row,
  :global(html.theme-dark) .goods-item {
    background: rgba(24, 24, 28, 0.82);
  }

:global(html.theme-dark) .goods-item--selected {
    background: rgba(255, 255, 255, 0.08);
  }

:global(html.theme-dark) .meta-tag,
  :global(html.theme-dark) .meta-qty {
    background: rgba(255, 255, 255, 0.08);
  }

:global(html.theme-dark) .meta-tag--ip {
    background: rgba(138, 180, 248, 0.12);
    color: #8ab4f8;
  }

:global(html.theme-dark) .goods-thumb {
    background: rgba(255, 255, 255, 0.06);
  }

:global(html.theme-dark) .check-dot--on {
    background: #f5f5f7;
    border-color: #f5f5f7;
  }

:global(html.theme-dark) .check-dot--on svg {
    stroke: #141416;
  }

:global(html.theme-dark) .bottom-bar {
    background: none;
  }
</style>
