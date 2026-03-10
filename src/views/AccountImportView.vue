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

          <!-- 底部导入按钮 -->
          <div class="bottom-bar">
            <button
              class="primary-btn"
              type="button"
              :disabled="selectedSet.size === 0"
              @click="doImport"
            >
              导入 {{ selectedSet.size > 0 ? `${selectedSet.size} 件` : '' }}谷子
            </button>
          </div>
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { validateMihoyoCookie, fetchAllOrders, orderToGoodsList } from '@/utils/mihoyo'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import NavBar from '@/components/NavBar.vue'

defineOptions({ name: 'AccountImportView' })

const store = useGoodsStore()
const presets = usePresetsStore()

// ── State ──────────────────────────────────────────────────────
const step = ref('cookie')        // 'cookie' | 'loading' | 'orders' | 'done'
const cookieInput = ref('')
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
  new Set(store.list.map((item) => _itemImportKey(item)))
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
const cookieValid = computed(() => {
  const v = cookieInput.value.trim()
  return v.length > 20 && validateMihoyoCookie(v)
})

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
async function startFetch() {
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
    // 默认不选中任何条目
    selectedSet.value = new Set()
    step.value = 'orders'
  } catch (err) {
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

<style scoped>
.account-import-page {
  min-height: 100dvh;
}

.page-body {
  padding: var(--section-gap) var(--page-padding) calc(80px + max(env(safe-area-inset-bottom), 12px));
}

/* ── Step containers ───────────────────────────────────────── */
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
}


/* ── Info card ─────────────────────────────────────────────── */
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

.info-icon svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
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

.info-steps strong {
  color: var(--app-text);
  font-weight: 600;
}

kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.07);
  font-size: 12px;
  font-family: inherit;
}

/* ── Field ─────────────────────────────────────────────────── */
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
  background: #fff;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--app-text);
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.16s ease;
  box-sizing: border-box;
}

.cookie-textarea:focus {
  border-color: rgba(0, 0, 0, 0.22);
}

.field-error {
  font-size: 13px;
  color: #c74444;
  margin: 0;
}

/* ── Primary button ────────────────────────────────────────── */
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
  cursor: pointer;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.primary-btn:active {
  transform: scale(0.98);
}

.primary-btn:disabled {
  opacity: 0.32;
  pointer-events: none;
}

/* ── Loading ───────────────────────────────────────────────── */
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

.loading-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.loading-sub {
  font-size: 14px;
  color: var(--app-text-tertiary);
  margin: 4px 0 0;
}

/* ── Orders list ───────────────────────────────────────────── */
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
  line-height: 1.45;
  color: var(--app-text-secondary);
  margin: 0;
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
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.text-btn:active {
  transform: scale(0.96);
}

.list-header-actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.06);
}

.text-btn--active {
  background: #141416;
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(20, 20, 22, 0.14);
}

.warn-banner {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 10px;
}

.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 订单分组 */
.order-group {
  border-radius: 18px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* 订单摘要行 */
.order-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 12px 12px;
  background: #fff;
  transition: background 0.12s ease;
  cursor: default;
  user-select: none;
  -webkit-touch-callout: none;
}

.order-row--selected {
  background: rgba(20, 20, 22, 0.035);
}

.order-row--imported {
  opacity: 0.5;
}

.order-row--disabled {
  opacity: 0.5;
}

/* 商品子行 */
.goods-sub-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.goods-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 12px;
  background: rgba(248, 248, 250, 1);
  cursor: pointer;
  transition: background 0.12s ease;
  user-select: none;
  -webkit-touch-callout: none;
  border-left: 3px solid rgba(0, 0, 0, 0.06);
}

.goods-item:active {
  background: #ededf2;
}

.goods-item--selected {
  background: rgba(20, 20, 22, 0.04);
  border-left-color: rgba(20, 20, 22, 0.15);
}

.goods-item--imported {
  opacity: 0.45;
  cursor: default;
}

/* 展开按钮 */
.expand-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  color: rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease, color 0.15s;
}

.expand-btn--open {
  transform: rotate(90deg);
  color: rgba(0, 0, 0, 0.6);
}

.expand-btn svg {
  width: 16px;
  height: 16px;
}

/* goods-expand transition */
.goods-expand-enter-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 600px;
  overflow: hidden;
}

.goods-expand-leave-active {
  transition: max-height 0.2s ease, opacity 0.18s ease;
  max-height: 600px;
  overflow: hidden;
}

.goods-expand-enter-from, .goods-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Check dot */
.order-check {
  flex-shrink: 0;
  cursor: pointer;
}

.order-check--disabled {
  cursor: default;
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
  transition: background 0.16s ease, border-color 0.16s ease;
}

.check-dot--on {
  background: #141416;
  border-color: #141416;
}

.check-dot--partial {
  background: rgba(20, 20, 22, 0.2);
  border-color: rgba(20, 20, 22, 0.4);
}

.check-dot--sm {
  width: 17px;
  height: 17px;
}

.check-dot svg {
  width: 12px;
  height: 12px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.check-dot--sm svg {
  width: 10px;
  height: 10px;
}

/* Thumbnail */
.order-thumb {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.order-thumb--sm {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: default;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-initial {
  font-size: 18px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.3);
}

/* Order info */
.order-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.order-group .goods-item .order-info {
  cursor: default;
}

.order-item:active {
  background: #f5f5f7;
}

.order-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text);
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.meta-ip {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(28, 53, 88, 0.08);
  color: #1c3558;
  white-space: nowrap;
}

.meta-price {
  font-size: 12px;
  color: var(--app-text-secondary);
  font-weight: 500;
}

.meta-qty {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-primary);
  background: rgba(20, 20, 22, 0.08);
  border-radius: 5px;
  padding: 1px 5px;
  white-space: nowrap;
}

.meta-date {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.meta-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.meta-shop {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.meta-char {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

/* Status badge */
.status-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--app-text-secondary);
}

.status--done {
  background: rgba(40, 200, 128, 0.12);
  color: #1a8f4c;
}

.status--shipping {
  background: rgba(50, 120, 250, 0.1);
  color: #2650b8;
}

.status--refund {
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.status--imported {
  background: rgba(40, 200, 128, 0.1);
  color: #1a8f4c;
  font-weight: 600;
}

.status--neutral {
  background: rgba(100, 100, 110, 0.09);
  color: var(--app-text-secondary, #636366);
}

.meta-item-status {
  font-size: 10px;
  padding: 1px 5px;
}

/* Bottom sticky bar */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  width: min(100%, 430px);
  transform: translateX(-50%);
  padding: 12px 16px max(env(safe-area-inset-bottom), 16px);
  background: linear-gradient(to top, rgba(245,245,247,0.96) 60%, rgba(245,245,247,0));
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 50;
}

/* ── Done ──────────────────────────────────────────────────── */
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

.done-icon svg {
  width: 34px;
  height: 34px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.done-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: -0.03em;
  margin: 0;
}

.done-sub {
  font-size: 15px;
  color: var(--app-text-secondary);
  margin: 0 0 16px;
}

.done-sub strong {
  color: var(--app-text);
  font-weight: 600;
}

/* ── Transitions ───────────────────────────────────────────── */
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
</style>
