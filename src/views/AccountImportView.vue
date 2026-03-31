<template>
  <div class="page account-import-page">
    <NavBar title="账号批量导入" show-back />

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
              <p class="info-title">如何获取 Cookie？</p>
              <ol class="info-steps">
                <li>在浏览器中打开 <strong>mihoyogift.com</strong> 并登录</li>
                <li>按 <kbd>F12</kbd> 打开开发者工具 → Network 标签</li>
                <li>随便点击一下页面，在请求列表中找到任意请求</li>
                <li>在 Request Headers 中找到 <strong>Cookie</strong> 字段</li>
                <li>复制整行 Cookie 值粘贴到下方</li>
              </ol>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label" for="cookie-input">粘贴 Cookie</label>
            <textarea
              id="cookie-input"
              v-model="cookieInput"
              class="cookie-textarea"
              placeholder="粘贴完整的 Cookie 字符串，包含 cookie_token_v2 / ltoken_v2 等字段..."
              spellcheck="false"
              autocomplete="off"
            />
            <p v-if="cookieInput && !cookieValid" class="field-error">
              Cookie 格式不正确，请确保包含认证字段（cookie_token_v2 或 ltoken_v2）
            </p>
          </div>

          <div class="cookie-actions">
            <label class="remember-row">
              <input v-model="rememberCookie" class="remember-checkbox" type="checkbox" />
              <span>保存 Cookie，下次自动尝试</span>
            </label>
            <button v-if="hasSavedCookie" class="cookie-clear-btn" type="button" @click="clearSavedCookie(false)">
              清除已保存
            </button>
          </div>
          <p v-if="cookieWarningMessage" class="cookie-tip cookie-tip--warn">{{ cookieWarningMessage }}</p>

          <button
            class="primary-btn"
            type="button"
            :disabled="!cookieValid"
            @click="startFetch"
          >
            开始获取订单
          </button>
        </section>

        <!-- ========== Step: loading ========== -->
        <section v-else-if="step === 'loading'" key="loading" class="step-section step-section--center">
          <div class="loading-anim" aria-label="加载中">
            <div class="loading-ring" />
          </div>
          <p class="loading-title">正在获取订单...</p>
          <p class="loading-sub">{{ loadedCount }} / {{ totalCount || '??' }} 条</p>
        </section>

        <!-- ========== Step: orders ========== -->
        <section v-else-if="step === 'orders'" key="orders" class="step-section step-section--list">
          <div class="list-header">
            <p class="list-count">{{ processedOrders.length }} 个订单 · {{ mergedAllGoods.length }} 种（{{ allGoods.length }} 件）</p>
            <div class="list-header-actions">
              <button
                :class="['text-btn', isAllSelectableSelected && 'text-btn--active']"
                type="button"
                @click="selectAll"
              >
                全选
              </button>
              <button
                :class="['text-btn', hasSelection && 'text-btn--active']"
                type="button"
                @click="deselectAll"
              >
                取消全选
              </button>
            </div>
          </div>

          <div v-if="cappedWarning" class="warn-banner">
            订单超过 200 条，仅显示最新 200 条
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
                  <p class="order-name">{{ po.goods[0]?.name || '未知商品' }}</p>
                  <div class="order-meta">
                    <span v-if="po.goods.length > 1" class="meta-count">共 {{ po.goods.length }} 件</span>
                    <span v-if="po.shopName" class="meta-shop">{{ po.shopName }}</span>
                    <span class="meta-date">{{ po.goods[0]?.acquiredAt }}</span>
                  </div>
                </div>

                <span v-if="isOrderImported(po)" class="status-badge status--imported">已导入</span>
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
                        <span class="meta-price">¥{{ item.price }}</span>
                        <span v-if="item.quantity > 1" class="meta-qty">×{{ item.quantity }}</span>
                        <span v-if="item.ip" class="meta-ip">{{ item.ip }}</span>
                        <span v-if="item.variant" class="meta-char">{{ item.variant }}</span>
                        <span v-else-if="item.characters?.length" class="meta-char">{{ item.characters[0] }}</span>
                        <span v-if="isItemRefundedOrCancelled(item)" :class="['status-badge', 'status--refund', 'meta-item-status']">{{ getItemStatusText(item) }}</span>
                        <span v-else-if="isItemImported(item)" class="status-badge status--imported meta-item-status">已导入</span>
                        <span v-else-if="isItemStatusWorthy(item)" class="status-badge status--neutral meta-item-status">{{ getItemStatusText(item) }}</span>
                      </div>
                    </div>
                  </li>
                </ul>
              </Transition>

            </li>
          </ul>

        </section>

        <!-- ========== Step: done ========== -->
        <section v-else-if="step === 'done'" key="done" class="step-section step-section--center">
          <div class="done-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="7 12 11 16 17 8" />
            </svg>
          </div>
          <p class="done-title">导入成功</p>
          <p class="done-sub">已添加 <strong>{{ importedCount }}</strong> 种谷子（共 <strong>{{ importedTotalQty }}</strong> 件）到收藏</p>
          <button class="primary-btn" type="button" @click="$router.push('/home')">
            返回首页
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
        导入 {{ selectedSet.size > 0 ? `${selectedSet.size} 件` : '' }}谷子
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useMihoyoCookieState } from '@/composables/import/useMihoyoCookieState'
import { fetchAllOrders, orderToGoodsList } from '@/utils/mihoyo'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import NavBar from '@/components/common/NavBar.vue'

defineOptions({ name: 'AccountImportView' })

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

// ── State ──────────────────────────────────────────────────────
const step = ref('cookie')        // 'cookie' | 'loading' | 'orders' | 'done'
const loadedCount = ref(0)
const totalCount = ref(0)
const rawOrders = ref([])         // 原始 API 订单列表
const expandedSet = ref(new Set()) // 已展开的订单 order_no
const selectedSet = ref(new Set()) // 已选择的商品 _itemKey
const cappedWarning = ref(false)
const importedCount = ref(0)
const importedTotalQty = ref(0)

// 已导入的商品键（名称 + 款式），直接按当前收藏实时计算
function _itemImportKey(item) {
  return buildGoodsIdentityKey(item)
}
const importedItemKeys = computed(() =>
  new Set(store.collectionList.map((item) => _itemImportKey(item)))
)

// 商品是否已导入
function isItemImported(item) {
  return importedItemKeys.value.has(_itemImportKey(item))
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
  const t = getItemStatusText(item).trim()
  return REFUND_STATUS_PATTERNS.some((pattern) => pattern.test(t))
}
function isOrderClosed(po) {
  const t = String(po?.statusText || '').trim()
  return CLOSED_ORDER_PATTERNS.some((pattern) => pattern.test(t))
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
  const t = getItemStatusText(item)
  return t.length > 0 && !SKIP_STATUS_SET.has(t)
}

// ── Computed ───────────────────────────────────────────────────
/** 按订单分组，每组含该订单所有商品（同名项合并数量） */
const processedOrders = computed(() =>
  rawOrders.value
    .map((order) => {
      const rawGoods = orderToGoodsList(order)
      // 同一订单内同名同款式（名称+角色）的商品合并数量
      const nameMap = new Map()
      for (const g of rawGoods) {
        const key = buildGoodsIdentityKey(g)
        if (nameMap.has(key)) {
          const ex = nameMap.get(key)
          ex.quantity = (Number(ex.quantity) || 1) + (Number(g.quantity) || 1)
        } else {
          nameMap.set(key, { ...g })
        }
      }
      return {
        raw: order,
        orderNo: order.order_no || order.orderNo || '',
        goods: Array.from(nameMap.values()),
        statusText: order.status_text || order.manage_status_text || '',
        shopName: order.shop?.shop_name || '',
      }
    })
    .filter((po) => po.goods.length > 0)
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

// ── Actions ────────────────────────────────────────────────────
onMounted(async () => {
  await initializeCookieState()

  if (!canAutoSubmitSavedCookie.value) return

  applySavedCookieToInput()
  await startFetch({ silentCookieExpired: true })
})

/*
async function legacyStartFetch(options = {}) {
  const { silentCookieExpired = false } = options
  step.value = 'loading'
  loadedCount.value = 0
  totalCount.value = 0
  try {
    const { list, capped } = await fetchAllOrders(
      cookieInput.value.trim(),
      (loaded, total_) => {
        loadedCount.value = loaded
        totalCount.value = total_
      }
    )
    cappedWarning.value = capped
    rawOrders.value = list
    await persistCookieAfterSuccess()
    // 默认不选中任何条目
    selectedSet.value = new Set()
    step.value = 'orders'
  } catch (err) {
    alert(`获取订单失败：${err.message}`)
    const cookieExpired = await handleCookieFailure(err)
    if (cookieExpired) {
      alert('已保存的 Cookie 可能已失效，请更新后重试。')
    }
    step.value = 'cookie'
  }
}
*/

const startFetch = async (options = {}) => {
  const { silentCookieExpired = false } = options
  step.value = 'loading'
  loadedCount.value = 0
  totalCount.value = 0

  try {
    const { list, capped } = await fetchAllOrders(
      cookieInput.value.trim(),
      (loaded, total_) => {
        loadedCount.value = loaded
        totalCount.value = total_
      }
    )
    cappedWarning.value = capped
    rawOrders.value = list
    await persistCookieAfterSuccess()
    selectedSet.value = new Set()
    step.value = 'orders'
  } catch (err) {
    const cookieExpired = await handleCookieFailure(err)
    if (cookieExpired) {
      step.value = 'cookie'
      if (!silentCookieExpired) {
        alert('已保存的 Cookie 可能已失效，请重新输入并更新。')
      }
      return
    }

    alert(`获取订单失败：${err.message}`)
    step.value = 'cookie'
  }
}

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

function toggleSelectAll() {
  if (isAllSelectableSelected.value) {
    deselectAll()
  } else {
    selectAll()
  }
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

  // 按名称+角色去重，同名同款式数量叠加
  const nameMap = new Map()
  for (const item of selected) {
    const key = buildGoodsIdentityKey(item)
    if (nameMap.has(key)) {
      const ex = nameMap.get(key)
      ex.quantity = (Number(ex.quantity) || 1) + (Number(item.quantity) || 1)
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

<style scoped src="../assets/views/AccountImportView.css"></style>
