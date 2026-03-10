<template>
  <div class="page taobao-import-page">
    <NavBar title="淘宝订单导入" show-back />

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
              <p class="info-title">如何导出淘宝订单？</p>
              <ol class="info-steps">
                <li>打开 <strong>电脑版淘宝</strong>（taobao.com）并登录</li>
                <li>进入「我的淘宝」→「已买到的宝贝」</li>
                <li>通过筛选条件选好要导出的订单范围</li>
                <li>点击「<strong>导出订单</strong>」按钮</li>
                <li>在弹出的「选择导出项」中确认选择，等待生成</li>
                <li>下载 .xlsx 文件（每页需单独导出）</li>
                <li>在下方选择所有文件即可一次性导入</li>
              </ol>
            </div>
          </div>

          <p v-if="parseError" class="field-error field-error--block">{{ parseError }}</p>

          <div class="file-pick-area" @click="triggerFilePick" @dragover.prevent @drop.prevent="onDrop">
            <svg class="file-pick-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="8" y="4" width="32" height="40" rx="3"/>
              <path d="M28 4v12h12"/>
              <path d="M17 28h14M17 34h8"/>
            </svg>
            <p class="file-pick-label">点击选择 .xlsx 文件（可多选）</p>
            <p class="file-pick-sub">也可将多个文件拖拽到此处</p>
            <input ref="fileInputRef" type="file" accept=".xlsx" multiple class="file-input-hidden" @change="onFileChange" />
          </div>
        </section>

        <!-- ========== Step: list（预览 + 选择） ========== -->
        <section v-else-if="step === 'list'" key="list" class="step-section step-section--list">
          <div class="list-header">
            <p class="list-count">{{ processedOrders.length }} 个订单 · {{ allGoods.length }} 件</p>
            <div class="list-header-actions">
              <button :class="['text-btn', isAllSelectableSelected && 'text-btn--active']"
                type="button" @click="selectAll">全选</button>
              <button :class="['text-btn', hasSelection && 'text-btn--active']"
                type="button" @click="deselectAll">取消全选</button>
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
                  <img v-if="po.goods[0]?._coverUrl" :src="po.goods[0]._coverUrl" class="thumb-img" loading="lazy" />
                  <span v-else class="thumb-initial">{{ (po.goods[0]?.name || '?').charAt(0) }}</span>
                </div>

                <!-- 订单信息 -->
                <div class="order-info" @click="toggleExpand(po.orderNo)">
                  <p class="order-name">{{ po.goods[0]?.name || '未知商品' }}</p>
                  <div class="order-meta">
                    <span v-if="po.goods.length > 1" class="meta-count">共 {{ po.goods.length }} 件</span>
                    <span v-if="po.shopName" class="meta-shop">{{ po.shopName }}</span>
                    <span class="meta-date">{{ po.goods[0]?.acquiredAt }}</span>
                  </div>
                </div>

                <span v-if="isOrderImported(po)" class="status-badge status--imported">已导入</span>
                <span v-else-if="isOrderRefunded(po)" class="status-badge status--refund">{{ po.status }}</span>
                <span v-else-if="isOrderClosed(po)" class="status-badge status--refund">已关闭</span>

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
                      <img v-if="item.image" :src="item.image" class="thumb-img" loading="lazy" />
                      <img v-else-if="item._coverUrl" :src="item._coverUrl" class="thumb-img" loading="lazy" />
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
                        <span v-else-if="CLOSED_ORDER_PATTERNS.some(p => p.test(item._status || ''))" class="status-badge status--refund meta-item-status">已关闭</span>
                        <span v-else-if="isItemImported(item)" class="status-badge status--imported meta-item-status">已导入</span>
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

          <!-- 底部按钮 -->
          <div class="bottom-bar">
            <button class="secondary-btn" type="button" @click="step = 'pick'">
              重新选文件
            </button>
            <button class="primary-btn" type="button"
              :disabled="selectedSet.size === 0" @click="doImport">
              导入 {{ selectedSet.size > 0 ? `${selectedSet.size} 件` : '' }}谷子
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
          <p class="done-title">导入成功</p>
          <p class="done-sub">已添加 <strong>{{ importedCount }}</strong> 种谷子（共 <strong>{{ importedTotalQty }}</strong> 件）到收藏</p>
          <button class="primary-btn" type="button" @click="$router.push('/home')">返回首页</button>
        </section>

      </Transition>
    </main>
  </div>

  <!-- ========== 编辑商品信息底部弹窗 ========== -->
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="showEditSheet" class="sheet-backdrop" @click="closeEdit" />
    </Transition>
    <Transition name="sheet-slide">
      <div v-if="showEditSheet" class="edit-sheet" role="dialog" aria-modal="true" aria-label="编辑商品信息">
        <div class="sheet-handle" aria-hidden="true" />
        <p class="sheet-title">编辑商品信息</p>

        <div class="edit-sheet-body">
          <div class="edit-field">
            <span class="edit-label">名称</span>
            <input v-model="editForm.name" type="text" placeholder="商品名称" class="edit-input" />
          </div>
          <div class="edit-field">
            <span class="edit-label">IP</span>
            <AppSelect v-model="editForm.ip" :options="presets.ips" placeholder="请选择 IP" />
          </div>
          <div class="edit-field">
            <span class="edit-label">分类</span>
            <AppSelect v-model="editForm.category" :options="presets.categories" placeholder="请选择分类" />
          </div>
          <div class="edit-field">
            <span class="edit-label">角色</span>
            <input v-model="editForm.charactersText" type="text" placeholder="角色名（多个用逗号分隔）" class="edit-input" />
          </div>
          <div class="edit-field">
            <span class="edit-label">款式</span>
            <input v-model="editForm.variant" type="text" placeholder="款式描述" class="edit-input" />
          </div>
          <div class="edit-field">
            <span class="edit-label">价格（¥）</span>
            <input v-model="editForm.price" type="number" min="0" step="0.01" placeholder="0.00" class="edit-input" />
          </div>
          <div class="edit-field">
            <span class="edit-label">购入日期</span>
            <input v-model="editForm.acquiredAt" type="date" class="edit-input" />
          </div>
          <div class="edit-field edit-field--image">
            <span class="edit-label">图片 URL</span>
            <MihoyoImagePicker
              ref="editMihoyoPickerRef"
              v-model="editForm.image"
              :hint="editForm.charactersText.split(',')[0]?.trim() || editForm.variant || ''"
            />
          </div>
          <div class="edit-field">
            <span class="edit-label">备注</span>
            <input v-model="editForm.note" type="text" placeholder="备注（可选）" class="edit-input" />
          </div>
        </div>

        <div class="edit-sheet-actions">
          <button class="edit-cancel-btn" type="button" @click="closeEdit">取消</button>
          <button class="edit-save-btn" type="button" @click="saveEdit">保存</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { parseTaobaoXlsx } from '@/utils/taobao'
import { buildGoodsIdentityKey } from '@/utils/goodsIdentity'
import NavBar from '@/components/NavBar.vue'
import AppSelect from '@/components/AppSelect.vue'
import MihoyoImagePicker from '@/components/MihoyoImagePicker.vue'

defineOptions({ name: 'TaobaoImportView' })

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

// ── 编辑状态 ─────────────────────────────────────────────────
const showEditSheet = ref(false)
const editingItem   = ref(null)
const editMihoyoPickerRef = ref(null)
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
  () => new Set(store.list.map(item => buildGoodsIdentityKey(item)))
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
      parseError.value = '未解析到任何商品数据，请确认文件是淘宝导出的订单列表'
      return
    }
    rawGoods.value = deduped
    // 默认全选可导入商品
    selectedSet.value = new Set(
      deduped.filter(g => isItemSelectable(g)).map(g => g._itemKey)
    )
    expandedSet.value = new Set()
    step.value = 'list'
  } catch (err) {
    parseError.value = err.message || '文件解析失败'
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

async function doImport() {
  const toImport = allGoods.value.filter(g => selectedSet.value.has(g._itemKey))
  if (!toImport.length) return
  await store.addMultipleGoods(toImport)
  importedCount.value = toImport.length
  importedTotalQty.value = toImport.reduce((s, g) => s + (g.quantity || 1), 0)
  step.value = 'done'
}

// ── 编辑商品 ──────────────────────────────────────────────────

function openEdit(item) {
  editingItem.value = item
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
    price:      editForm.price !== '' ? parseFloat(editForm.price) : rawGoods.value[idx].price,
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
}
</script>

<style scoped>
.taobao-import-page {
  min-height: 100dvh;
}

.taobao-import-page .page-body {
  padding: var(--section-gap) var(--page-padding) calc(88px + max(env(safe-area-inset-bottom), 12px));
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  text-align: center;
  gap: 12px;
}
/* done 步骤中的单独按钮不应撑满纵轴 */
.step-section--center .primary-btn {
  flex: unset;
  width: min(240px, 100%);
}

.step-section--list {
  gap: 0;
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

.file-pick-area {
  border: 1.5px dashed rgba(20, 20, 22, 0.12);
  border-radius: 18px;
  padding: 40px 24px;
  background: rgba(255, 255, 255, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.file-pick-area:active {
  background: rgba(20, 20, 22, 0.04);
  border-color: rgba(20, 20, 22, 0.24);
  transform: scale(0.995);
}

.file-pick-icon {
  width: 48px;
  height: 48px;
  color: var(--app-text-tertiary);
  margin-bottom: 4px;
}

.file-pick-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.file-pick-sub {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 0;
}

.file-input-hidden {
  display: none;
}

.field-error {
  font-size: 13px;
  color: #c74444;
  margin: 0;
}

.field-error--block {
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(199, 68, 68, 0.08);
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
  line-height: 1.45;
  color: var(--app-text-secondary);
  margin: 0;
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

.text-btn--active {
  background: #141416;
  color: #ffffff;
  box-shadow: 0 8px 18px rgba(20, 20, 22, 0.14);
}

.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.order-group {
  border-radius: 18px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

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

.order-row--partial {
  background: rgba(20, 20, 22, 0.065);
}

.order-row--disabled {
  opacity: 0.5;
}

.order-check {
  flex-shrink: 0;
  cursor: pointer;
}

.order-check--disabled {
  cursor: default;
  pointer-events: none;
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

.order-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.goods-item .order-info {
  cursor: default;
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

.meta-price {
  font-size: 12px;
  color: var(--app-text-secondary);
  font-weight: 500;
}

.meta-qty {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text);
  background: rgba(20, 20, 22, 0.08);
  border-radius: 5px;
  padding: 1px 5px;
  white-space: nowrap;
}

.meta-ip {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(28, 53, 88, 0.08);
  color: #1c3558;
  white-space: nowrap;
}

.meta-char,
.meta-variant {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.meta-date,
.meta-shop {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.meta-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.meta-item-status {
  font-size: 10px;
  padding: 1px 5px;
}

.status-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--app-text-secondary);
}

.status--imported {
  background: rgba(40, 200, 128, 0.1);
  color: #1a8f4c;
  font-weight: 600;
}

.status--refund {
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.status--neutral {
  background: rgba(100, 100, 110, 0.09);
  color: var(--app-text-secondary);
}

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
  transition: transform 0.2s ease, color 0.15s ease;
}

.expand-btn--open {
  transform: rotate(90deg);
  color: rgba(0, 0, 0, 0.6);
}

.expand-btn svg {
  width: 16px;
  height: 16px;
}

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

.goods-item--unselectable {
  opacity: 0.45;
  cursor: default;
}

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

.goods-expand-enter-from,
.goods-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 0.2s ease;
}

.step-fade-enter-from,
.step-fade-leave-to {
  opacity: 0;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  width: min(100%, 430px);
  transform: translateX(-50%);
  padding: 12px 16px max(env(safe-area-inset-bottom), 16px);
  background: linear-gradient(to top, rgba(245, 245, 247, 0.96) 60%, rgba(245, 245, 247, 0));
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  gap: 10px;
  z-index: 50;
}

.primary-btn,
.secondary-btn {
  height: 52px;
  border: none;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.14s ease, opacity 0.14s ease, background 0.14s ease;
}

.primary-btn {
  flex: 1;
  background: #141416;
  color: #fff;
  letter-spacing: -0.02em;
}

.primary-btn:active,
.secondary-btn:active {
  transform: scale(0.98);
}

.primary-btn:disabled {
  opacity: 0.32;
  pointer-events: none;
}

.secondary-btn {
  flex-shrink: 0;
  padding: 0 18px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text-secondary);
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

.item-edit-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.item-edit-btn:active {
  background: rgba(20, 20, 22, 0.06);
  color: rgba(0, 0, 0, 0.65);
}

.item-edit-btn svg {
  width: 15px;
  height: 15px;
}

/* ── 编辑底部弹窗 ────────────────────────────────────────────── */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.edit-sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 90;
  background: var(--bg-page, #fff);
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 90vh;
  overflow: hidden;
}
.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 14px;
  flex-shrink: 0;
}
.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 12px;
  flex-shrink: 0;
}
.edit-sheet-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.edit-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: #f4f4f6;
}
.edit-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.edit-input {
  width: 100%;
  height: 40px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: #ffffff;
  color: var(--text-primary);
  font-size: 15px;
  padding: 0 12px;
  outline: none;
  transition: border-color .16s;
  box-sizing: border-box;
}
.edit-input[type="date"] { font-family: inherit; }
.edit-sheet-actions {
  display: flex;
  gap: 10px;
  padding-top: 12px;
  flex-shrink: 0;
}
.edit-cancel-btn,
.edit-save-btn {
  flex: 1;
  height: 48px;
  border-radius: 14px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s;
}
.edit-cancel-btn {
  background: var(--bg-card, #f0f0f0);
  color: var(--text-secondary);
}
.edit-save-btn {
  background: var(--color-primary, #4a7aec);
  color: #fff;
}

/* ── 弹窗过渡动画 ────────────────────────────────────────────── */
.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active { transition: opacity .25s; }
.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to     { opacity: 0; }

.sheet-slide-enter-active,
.sheet-slide-leave-active { transition: transform .3s cubic-bezier(.4, 0, .2, 1); }
.sheet-slide-enter-from,
.sheet-slide-leave-to     { transform: translateX(-50%) translateY(100%); }
</style>
