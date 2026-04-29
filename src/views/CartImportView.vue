<template>
  <div class="page cart-import-page">
    <NavBar :title="pageTitle" show-back />
    <Transition name="overlay-fade">
      <div v-if="showErrorDialog" class="overlay" @click.self="closeErrorDialog">
        <div class="dialog import-error-dialog" role="alertdialog" aria-modal="true">
          <p class="dialog-label">Import Notice</p>
          <h3 class="dialog-title">{{ errorDialogTitle }}</h3>
          <p class="dialog-desc">{{ errorDialogMessage }}</p>
          <div class="dialog-actions">
            <button class="dialog-btn dialog-btn--primary" type="button" @click="closeErrorDialog">
              知道了
            </button>
          </div>
        </div>
      </div>
    </Transition>

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
                <p class="info-title">App 内登录米游铺</p>
                <ol class="info-steps">
                  <li>点击下方按钮，打开米游铺登录页</li>
                  <li>在 App 内完成登录</li>
                  <li>登录完成后点击右上角“继续导入”</li>
                  <li>App 会自动读取购物车并进入下一步</li>
                </ol>
              </template>
              <template v-else>
                <p class="info-title">如何获取 Cookie</p>
                <ol class="info-steps">
                  <li>在浏览器中打开 `mihoyogift.com` 并登录</li>
                  <li>按 `F12` 打开开发者工具，切到 `Network`</li>
                  <li>刷新页面或进入购物车，点开任意请求</li>
                  <li>在 `Request Headers` 里复制完整 `Cookie`</li>
                  <li>粘贴到下方后读取购物车内容</li>
                </ol>
              </template>
            </div>
          </div>

          <div v-if="!canUseNativeImport" class="field-group">
            <label class="field-label" for="cookie-input">粘贴 Cookie</label>
            <textarea
              id="cookie-input"
              v-model="cookieInput"
              class="cookie-textarea"
              placeholder="粘贴完整 Cookie，包含 cookie_token_v2 / ltoken_v2 等字段..."
              spellcheck="false"
              autocomplete="off"
            />
            <p v-if="cookieInput && !cookieValid" class="field-error">
              Cookie 格式不正确，请确认包含认证字段。
            </p>
          </div>

          <div v-if="!canUseNativeImport" class="cookie-actions">
            <label class="remember-row">
              <input v-model="rememberCookie" class="remember-checkbox" type="checkbox" />
              <span>保存 Cookie，下次自动尝试</span>
            </label>
            <button v-if="hasSavedCookie" class="cookie-clear-btn" type="button" @click="clearSavedCookie(false)">
              清除已保存
            </button>
          </div>
          <p v-if="!canUseNativeImport && cookieWarningMessage" class="cookie-tip cookie-tip--warn">{{ cookieWarningMessage }}</p>

          <button class="primary-btn" type="button" :disabled="!canUseNativeImport && !cookieValid" @click="startFetch">
            {{ canUseNativeImport ? '登录并读取购物车' : '读取购物车' }}
          </button>
        </section>

        <section v-else-if="step === 'loading'" key="loading" class="step-section step-section--center">
          <div class="loading-anim" aria-label="加载中">
            <div class="loading-ring" />
          </div>
          <p class="loading-title">正在读取购物车...</p>
          <p class="loading-sub">请稍候</p>
        </section>

        <section v-else-if="step === 'list'" key="list" class="step-section step-section--list">
          <div class="list-header">
            <p class="list-count">{{ processedGroups.length }} 个店铺 · {{ selectableGoods.length }} 件可导入</p>
            <div class="list-header-actions">
              <button :class="['text-btn', isAllSelectableSelected && 'text-btn--active']" type="button" @click="selectAll">
                全选
              </button>
              <button :class="['text-btn', hasSelection && 'text-btn--active']" type="button" @click="deselectAll">
                取消全选
              </button>
            </div>
          </div>

          <div v-if="processedGroups.length === 0" class="empty-wrap">
            <EmptyState
              icon="✦"
              title="购物车是空的"
              description="当前没有可导入的米游铺购物车商品。"
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
                  <p class="shop-name">{{ group.shopName || '米游铺店铺' }}</p>
                  <p class="shop-meta">{{ group.goods.length }} 件商品</p>
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
                      <span v-if="isItemImported(item)" class="meta-tag meta-tag--imported">已存在</span>
                      <span v-else-if="!item._isEffective" class="meta-tag meta-tag--disabled">{{ item._reason || '当前不可导入' }}</span>
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
          <p class="done-title">导入成功</p>
          <p class="done-sub">已添加 <strong>{{ importedCount }}</strong> 种商品，共 <strong>{{ importedTotalQty }}</strong> 件。</p>
          <button class="primary-btn" type="button" @click="router.replace(doneTargetPath)">
            返回{{ isWishlistMode ? '心愿单' : '首页' }}
          </button>
        </section>
      </Transition>
    </main>

    <div v-if="step === 'list' && processedGroups.length > 0" class="bottom-bar">
      <button class="primary-btn" type="button" :disabled="selectedSet.size === 0" @click="doImport">
        确定导入
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useMihoyoCookieState } from '@/composables/import/useMihoyoCookieState'
import { canUseNativeMihoyoImport, importMihoyoCartWithSession } from '@/utils/mihoyoNativeImport'
import { fetchCartList, cartShopToGoodsList } from '@/utils/mihoyo'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import NavBar from '@/components/common/NavBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'

defineOptions({ name: 'CartImportView' })

const route = useRoute()
const router = useRouter()
const store = useGoodsStore()
const presets = usePresetsStore()
const {
  cookieInput,
  rememberCookie,
  hasSavedCookie,
  cookieValid,
  cookieWarningMessage,
  canAutoSubmitSavedCookie,
  initializeCookieState,
  applySavedCookieToInput,
  persistCookieAfterSuccess,
  handleCookieFailure,
  clearSavedCookie
} = useMihoyoCookieState()

const isWishlistMode = computed(() => route.query.mode === 'wishlist')
const pageTitle = computed(() => isWishlistMode.value ? '购物车导入心愿' : '购物车导入')
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
  errorDialogMessage.value = String(message || '').trim() || '发生未知错误'
  showErrorDialog.value = true
}

function closeErrorDialog() {
  showErrorDialog.value = false
}

const importedItemKeys = computed(() =>
  new Set(targetList.value.map((item) => buildGoodsIdentityKey(item)))
)

const processedGroups = computed(() =>
  rawGroups.value
    .map((group) => {
      const map = new Map()
      for (const item of cartShopToGoodsList(group)) {
        const normalizedItem = { ...item }

        if (isWishlistMode.value && !normalizedItem._soldOut) {
          normalizedItem._isEffective = true
          normalizedItem._reason = ''
        } else if (isWishlistMode.value && normalizedItem._soldOut && !String(normalizedItem._reason || '').trim()) {
          normalizedItem._reason = '商品已售罄'
        }

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

const startFetch = async (options = {}) => {
  if (canUseNativeImport) {
    step.value = 'loading'

    try {
      const { list = [] } = await importMihoyoCartWithSession()
      rawGroups.value = Array.isArray(list) ? list : []
      selectedSet.value = new Set(selectableGoods.value.map((item) => item._itemKey))
      step.value = 'list'
    } catch (error) {
      openErrorDialog('读取购物车失败', error?.message || '请确认已在米游铺完成登录后重试。')
      step.value = 'cookie'
    }
    return
  }

  const { silentCookieExpired = false } = options
  step.value = 'loading'

  try {
    rawGroups.value = await fetchCartList(cookieInput.value.trim())
    await persistCookieAfterSuccess()
    selectedSet.value = new Set(selectableGoods.value.map((item) => item._itemKey))
    step.value = 'list'
  } catch (error) {
    const cookieExpired = await handleCookieFailure(error)
    if (cookieExpired) {
      step.value = 'cookie'
      if (!silentCookieExpired) {
        openErrorDialog('Cookie 已失效', '已保存的 Cookie 可能已失效，请重新输入并更新。')
      }
      return
    }

    openErrorDialog('读取购物车失败', error?.message || '请稍后重试。')
    step.value = 'cookie'
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

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(14, 18, 28, 0.38);
  backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur)) saturate(var(--app-overlay-saturate));
}

.import-error-dialog {
  width: min(100%, 420px);
  padding: 24px;
  border-radius: var(--radius-large);
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 90%, transparent);
  box-shadow: var(--app-shadow);
}

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

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .dialog,
.overlay-fade-leave-to .dialog {
  transform: scale(0.95) translateY(8px);
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

.loading-anim {
  width: 52px;
  height: 52px;
  margin-bottom: 8px;
}

.loading-ring {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid rgba(0, 0, 0, 0.08);
  border-top-color: #141416;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
  color: var(--app-text-secondary);
  margin: 0;
}

.list-header-actions {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.06);
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
