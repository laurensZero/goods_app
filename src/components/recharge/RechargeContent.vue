<template>
  <div ref="rechargeRootRef" class="recharge-page">
    <HomeSelectionHeader
    :show="selectionMode"
    :selected-count="selectedIds.size"
    :all-selected="allSelected"
    @back="exitSelectionMode"
    @toggle-all="toggleSelectAll"
  />

  <section class="summary-section">
    <SummaryCard
      :total-value="totalAmountText"
      label="Recharge Value"
      storage-key="goods-app:recharge-total-value-hidden"
    />
  </section>

  <section class="toolbar-section">
    <div class="toolbar-copy">
      <p class="section-label">充值记录</p>
      <div class="toolbar-head">
        <h2 class="section-title">
          {{ activeView === 'records' ? '全部记录' : '游戏排行' }}
          <span class="section-count"> {{ viewCountText }}</span>
        </h2>

        <div class="toolbar-actions">
          <button v-if="false" type="button" class="ghost-btn ghost-btn--link" @click="openMonthCardCalendar">
            月卡
          </button>

          <div class="view-switch" :style="viewSwitchStyle">
            <span class="view-switch__indicator" aria-hidden="true" />
            <button
              v-for="item in viewOptions"
              :key="item.value"
              type="button"
              class="view-switch__item"
              :class="{ 'view-switch__item--active': activeView === item.value }"
              @click="handleViewOptionClick(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <Transition name="search-drop">
      <div v-if="showSearchBar || keyword" class="search-row">
        <SearchBar v-model="keyword" placeholder="搜索项目、备注或游戏" />
        <button v-if="hasFilters" type="button" class="ghost-btn" @click="resetFilters">清空</button>
      </div>
    </Transition>

    <CategoryChips v-if="activeView === 'records' && games.length > 0" v-model="gameFilter" :categories="games" />

  </section>

  <section v-if="hasVisibleRecords && activeView === 'leaderboard'" class="stats-section">
    <article class="stat-card">
      <p class="stat-card__label">本月充值</p>
      <p class="stat-card__value">¥{{ formatAmount(currentMonthTotal) }}</p>
    </article>
    <article class="stat-card">
      <p class="stat-card__label">平均单笔</p>
      <p class="stat-card__value">¥{{ formatAmount(averageAmount) }}</p>
    </article>
    <article class="stat-card">
      <p class="stat-card__label">最高消费游戏</p>
      <p class="stat-card__value stat-card__value--text">{{ topGameName }}</p>
      <p class="stat-card__meta">¥{{ formatAmount(topGameAmount) }}</p>
    </article>
  </section>

  <section class="content-section">
    <template v-if="hasVisibleRecords">
      <div v-if="activeView === 'records'" class="timeline-list">
        <article
          v-for="(group, index) in monthGroups"
          :key="group.key"
          class="timeline-month"
          :class="{ 'timeline-month--last': index === monthGroups.length - 1 }"
        >
          <div class="timeline-month__rail" aria-hidden="true">
            <div class="timeline-month__dot" />
            <div class="timeline-month__line" />
          </div>

          <div class="timeline-month__content">
            <header class="timeline-month__head">
              <div>
                <p class="timeline-month__label">月份</p>
                <h3 class="timeline-month__title">{{ group.label }}</h3>
              </div>
              <p class="timeline-month__meta">¥{{ formatAmount(group.amount) }} · {{ group.items.length }} 笔</p>
            </header>

            <div class="record-list">
              <RecordCard
                v-for="record in group.items"
                :key="record.id"
                :record="record"
                :selection-mode="selectionMode"
                :selected="selectedIds.has(record.id)"
                @hold="handleRecordHold"
                @click="handleRecordClick"
              />
            </div>
          </div>
        </article>
      </div>

      <div v-else class="leaderboard-list">
        <article v-for="(item, index) in leaderboard" :key="item.game" class="leaderboard-item">
          <p class="leaderboard-item__rank">#{{ index + 1 }}</p>
          <div class="leaderboard-item__body">
            <div class="leaderboard-item__top">
              <p class="leaderboard-item__name">{{ item.game }}</p>
              <p class="leaderboard-item__amount">¥{{ formatAmount(item.amount) }}</p>
            </div>
            <p class="leaderboard-item__meta">{{ item.count }} 笔 · 平均 ¥{{ formatAmount(item.averageAmount) }}</p>
            <div class="leaderboard-item__track">
              <span class="leaderboard-item__fill" :style="{ width: item.sharePercent + '%' }" />
            </div>
          </div>
        </article>
      </div>
    </template>

    <div v-else class="empty-wrap">
      <EmptyState
        :icon="hasFilters ? '⌕' : '✦'"
        :title="hasFilters ? '没有匹配的充值记录' : '还没有充值记录'"
        :description="hasFilters ? '换个关键词或筛选条件试试。' : '添加第一笔充值后，这里会自动生成记录和排行。'"
        :action-text="hasFilters ? '清空筛选' : '添加记录'"
        @action="hasFilters ? resetFilters() : openAddMethodSheet()"
      />
    </div>
  </section>

  <AddRecordDialog
    v-model:show="showAddDialog"
    :record="editingRecord"
    :game-options="games"
    :mode="addMode"
    @save="saveRecord"
  />

  <RechargeAddMethodSheet
    v-model="showAddMethodSheet"
    @manual="openCreateManual"
    @preset="openCreatePreset"
  />

  <RechargeSelectionActionBar
    :show="selectionMode && !showAddDialog"
    :selected-count="selectedIds.size"
    @edit="editSelectedRecord"
    @delete="deleteSelectedRecords"
  />

  <DangerConfirmDialog
    :show="showDeleteConfirm"
    :title="deleteConfirmTitle"
    :description="deleteConfirmDescription"
    :confirm-text="deleteConfirmActionText"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from '@/components/common/SearchBar.vue'
import CategoryChips from '@/components/common/CategoryChips.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SummaryCard from '@/components/common/SummaryCard.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import RechargeAddMethodSheet from '@/components/recharge/RechargeAddMethodSheet.vue'
import RechargeSelectionActionBar from '@/components/recharge/RechargeSelectionActionBar.vue'
import RecordCard from '@/components/recharge/RecordCard.vue'
import AddRecordDialog from '@/components/recharge/AddRecordDialog.vue'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
import { addAndroidBackButtonListener } from '@/utils/androidBackButton'
import { setWindowScrollTop } from '@/utils/scrollPosition'

const emit = defineEmits(['selection-change'])
const router = useRouter()
const rechargeStore = useRechargeStore()
const SCROLL_TOP_BUTTON_THRESHOLD = 900
const activeView = ref('records')
const keyword = ref('')
const gameFilter = ref('')
const showSearchBar = ref(false)
const showAddDialog = ref(false)
const showAddMethodSheet = ref(false)
const editingRecord = ref(null)
const addMode = ref('manual')
const showDeleteConfirm = ref(false)
const showScrollTopButton = ref(false)
const rechargeRootRef = ref(null)
const pageBodyEl = ref(null)
let removeAndroidBackListener = null
let scrollListenerCleanup = null
const GAME_ORDER = ['原神', '星穹铁道', '绝区零']

const activeRecords = computed(() => rechargeStore.sortedRecords.value)
const totalAmountText = computed(() => rechargeStore.totalAmount.value.toFixed(2))
const latestRecord = computed(() => activeRecords.value[0] || null)
const hasFilters = computed(() => Boolean(keyword.value.trim() || gameFilter.value))

const hasMonthCardData = computed(() => activeRecords.value.some((record) => {
  const name = String(record?.itemName || '').trim()
  return name === '空月祝福' || name === '列车补给凭证' || name === '绳网会员'
}))

const viewOptions = computed(() => {
  const options = [
    { value: 'records', label: '记录' },
    { value: 'leaderboard', label: '排行' }
  ]

  if (hasMonthCardData.value) {
    options.push({ value: 'month-card', label: '月卡' })
  }

  return options
})

const games = computed(() => {
  const set = new Set(activeRecords.value.map((item) => String(item.game || '').trim()).filter(Boolean))
  return Array.from(set).sort(compareGameOrder)
})

const filteredRecords = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return activeRecords.value.filter((record) => {
    if (gameFilter.value && record.game !== gameFilter.value) return false
    if (!text) return true
    return [record.game, record.itemName, record.note]
      .join(' ')
      .toLowerCase()
      .includes(text)
  })
})

const hasVisibleRecords = computed(() => filteredRecords.value.length > 0)
const selectedRecords = computed(() => (
  filteredRecords.value.filter((record) => selectedIds.value.has(record.id))
))
const filteredTotalAmount = computed(() => (
  filteredRecords.value.reduce((sum, item) => sum + Number(item.amount || 0), 0)
))

const currentMonthSummary = computed(() => {
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return activeRecords.value.reduce((summary, item) => {
    if (String(item.chargedAt || '').slice(0, 7) !== monthKey) return summary
    summary.total += Number(item.amount || 0)
    summary.count += 1
    return summary
  }, { total: 0, count: 0 })
})

const currentMonthTotal = computed(() => currentMonthSummary.value.total)
const currentMonthCount = computed(() => currentMonthSummary.value.count)

const averageAmount = computed(() => {
  if (activeRecords.value.length === 0) return 0
  return rechargeStore.totalAmount.value / activeRecords.value.length
})

const leaderboard = computed(() => {
  const groups = new Map()
  const total = filteredTotalAmount.value || 1

  for (const record of filteredRecords.value) {
    const key = record.game || '未分类游戏'
    if (!groups.has(key)) {
      groups.set(key, {
        game: key,
        amount: 0,
        count: 0
      })
    }

    const current = groups.get(key)
    current.amount += Number(record.amount || 0)
    current.count += 1
  }

  return Array.from(groups.values())
    .sort((a, b) => b.amount - a.amount)
    .map((item) => ({
      ...item,
      averageAmount: item.count > 0 ? item.amount / item.count : 0,
      sharePercent: Math.max(8, Math.round((item.amount / total) * 100))
    }))
})

const topGameName = computed(() => leaderboard.value[0]?.game || '暂无数据')
const topGameAmount = computed(() => leaderboard.value[0]?.amount || 0)

const monthGroups = computed(() => {
  const groups = new Map()

  for (const item of filteredRecords.value) {
    const key = String(item.chargedAt || '').slice(0, 7) || '未填写日期'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key,
        items: [],
        amount: 0
      })
    }

    const current = groups.get(key)
    current.items.push(item)
    current.amount += Number(item.amount || 0)
  }

  return Array.from(groups.values()).sort((a, b) => String(b.key).localeCompare(String(a.key)))
})

const viewCountText = computed(() => (
  activeView.value === 'leaderboard'
    ? `${leaderboard.value.length} 个游戏`
    : `${filteredRecords.value.length} 条记录`
))

const viewSwitchStyle = computed(() => ({
  '--view-switch-count': String(viewOptions.value.length),
  '--view-switch-index': String(Math.max(viewOptions.value.findIndex((item) => item.value === activeView.value), 0))
}))
const isAddOverlayOpen = computed(() => showAddDialog.value || showAddMethodSheet.value)
const deleteConfirmTitle = '确认删除？'
const deleteConfirmActionText = '删除'
const deleteConfirmDescription = computed(() => (
  selectedIds.value.size > 1
    ? `选中的 ${selectedIds.value.size} 条充值记录会被直接删除，删除后无法恢复。`
    : '删除后无法恢复，是否继续？'
))

function closeSelectionOverlays() {
  showDeleteConfirm.value = false
}

const {
  selectionMode,
  selectedIds,
  allSelected,
  enterSelectionMode,
  toggleSelect,
  toggleSelectAll,
  exitSelectionModeQuiet,
  exitSelectionMode,
  handleSelectionPopState
} = useGoodsSelection(filteredRecords, {
  historyKey: 'rechargeSelectionMode',
  onExit: closeSelectionOverlays
})

function formatAmount(value) {
  return Number(value || 0).toFixed(2)
}

function resetFilters() {
  keyword.value = ''
  gameFilter.value = ''
}

function toggleSearch() {
  if (showSearchBar.value && !keyword.value.trim()) {
    showSearchBar.value = false
    return
  }

  showSearchBar.value = true
}

function openCreate() {
  editingRecord.value = null
  addMode.value = 'manual'
  showAddDialog.value = true
}

function openAddMethodSheet() {
  editingRecord.value = null
  showAddMethodSheet.value = true
}

function openMonthCardCalendar() {
  router.push('/recharge/month-cards')
}

function compareGameOrder(left, right) {
  const leftIndex = GAME_ORDER.indexOf(left)
  const rightIndex = GAME_ORDER.indexOf(right)

  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
  if (leftIndex >= 0) return -1
  if (rightIndex >= 0) return 1
  return left.localeCompare(right, 'zh-Hans-CN')
}

function handleViewOptionClick(value) {
  if (value === 'month-card') {
    openMonthCardCalendar()
    return
  }

  activeView.value = value
}

function openCreateManual() {
  editingRecord.value = null
  addMode.value = 'manual'
  showAddDialog.value = true
}

function openCreatePreset() {
  editingRecord.value = null
  addMode.value = 'preset'
  showAddDialog.value = true
}

function openEdit(record) {
  editingRecord.value = record
  addMode.value = 'manual'
  showAddDialog.value = true
}

function handleRecordHold(record) {
  if (!record?.id || activeView.value !== 'records') return
  enterSelectionMode(record.id)
}

function handleRecordClick(record) {
  if (!selectionMode.value || !record?.id) return
  toggleSelect(record.id)
}

function editSelectedRecord() {
  if (selectedRecords.value.length !== 1) return
  const [record] = selectedRecords.value
  exitSelectionModeQuiet()
  openEdit(record)
}

function saveRecord(payload) {
  if (editingRecord.value?.id) {
    rechargeStore.updateRecord(editingRecord.value.id, payload)
  } else {
    rechargeStore.addRecord(payload)
  }

  showAddDialog.value = false
  editingRecord.value = null
}

function deleteSelectedRecords() {
  if (selectedIds.value.size === 0) return
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (selectedIds.value.size === 0) {
    showDeleteConfirm.value = false
    return
  }

  for (const id of selectedIds.value) {
    rechargeStore.permanentDelete(id)
  }

  showDeleteConfirm.value = false
  exitSelectionModeQuiet()
}

function syncAddScrollLock(active) {
  void active
}

function resolvePageBodyEl() {
  const rechargeRoot = rechargeRootRef.value
  pageBodyEl.value = rechargeRoot?.closest?.('.page-body') || document.querySelector('.page-body')
}

function readScrollTop() {
  const pageBody = pageBodyEl.value
  if (pageBody) return pageBody.scrollTop || 0
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
}

function updateScrollTopButtonVisibility() {
  showScrollTopButton.value = readScrollTop() >= SCROLL_TOP_BUTTON_THRESHOLD
}

function bindScrollListeners() {
  if (scrollListenerCleanup) return

  resolvePageBodyEl()
  const handleScroll = () => updateScrollTopButtonVisibility()
  const pageBody = pageBodyEl.value
  pageBody?.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('scroll', handleScroll, { passive: true })
  scrollListenerCleanup = () => {
    pageBody?.removeEventListener('scroll', handleScroll)
    window.removeEventListener('scroll', handleScroll)
    scrollListenerCleanup = null
  }
}

function unbindScrollListeners() {
  scrollListenerCleanup?.()
}

function scrollToTop() {
  const pageBody = pageBodyEl.value
  if (pageBody) {
    pageBody.scrollTop = 0
  }
  setWindowScrollTop(0)
  updateScrollTopButtonVisibility()
}

function handleAndroidBackButton(event) {
  if (showAddDialog.value) {
    showAddDialog.value = false
    event.preventDefault()
    return
  }

  if (showAddMethodSheet.value) {
    showAddMethodSheet.value = false
    event.preventDefault()
    return
  }

  if (showDeleteConfirm.value) {
    showDeleteConfirm.value = false
    event.preventDefault()
    return
  }

  if (selectionMode.value) {
    exitSelectionMode()
    event.preventDefault()
  }
}

function bindAndroidBackButton() {
  if (removeAndroidBackListener) return
  removeAndroidBackListener = addAndroidBackButtonListener(handleAndroidBackButton)
}

function unbindAndroidBackButton() {
  if (!removeAndroidBackListener) return
  removeAndroidBackListener()
  removeAndroidBackListener = null
}

onMounted(() => {
  rechargeStore.init()
  rechargeStore.clearInvalidRecords()
  resolvePageBodyEl()
  bindScrollListeners()
  updateScrollTopButtonVisibility()
  window.addEventListener('popstate', handleSelectionPopState)
  bindAndroidBackButton()
})

onBeforeUnmount(() => {
  syncAddScrollLock(false)
  unbindScrollListeners()
  window.removeEventListener('popstate', handleSelectionPopState)
  unbindAndroidBackButton()
  emit('selection-change', false)
})

watch(isAddOverlayOpen, (active) => {
  syncAddScrollLock(active)
}, { immediate: true })

watch(showAddDialog, (active) => {
  if (!active) {
    editingRecord.value = null
  }
})

watch(selectionMode, (active) => {
  emit('selection-change', active)
})

watch(activeView, (value) => {
  if (value !== 'records' && selectionMode.value) {
    exitSelectionModeQuiet()
  }
})

defineExpose({
  toggleSearch,
  openAddMethodSheet
})
</script>

<style scoped>
.summary-section,
.toolbar-section,
.stats-section,
.content-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
}


.toolbar-section {
  display: grid;
  gap: 12px;
}

.toolbar-copy {
  min-width: 0;
}

.toolbar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-top: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.leaderboard-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-label,
.stat-card__label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.section-count {
  margin-left: 4px;
  color: var(--app-text-tertiary);
  font-size: 16px;
  font-weight: 400;
}

.ghost-btn:active,
.view-switch__item:active {
  transform: scale(var(--press-scale-button));
}

.view-switch {
  --view-switch-gap: 6px;
  --view-switch-pad: 6px;
  --view-switch-height: 36px;
  position: relative;
  display: inline-grid;
  flex-shrink: 0;
  grid-template-columns: repeat(var(--view-switch-count, 2), minmax(0, 1fr));
  gap: var(--view-switch-gap);
  padding: var(--view-switch-pad);
  border-radius: 18px;
  background: var(--app-glass);
  box-shadow: var(--app-shadow);
}

.view-switch__indicator {
  position: absolute;
  top: var(--view-switch-pad);
  left: var(--view-switch-pad);
  width: calc((100% - (var(--view-switch-pad) * 2) - (var(--view-switch-gap) * (var(--view-switch-count, 2) - 1))) / var(--view-switch-count, 2));
  height: var(--view-switch-height);
  border-radius: 14px;
  background: #141416;
  box-shadow: 0 6px 14px rgba(20, 20, 22, 0.12);
  transform: translateX(calc((100% + var(--view-switch-gap)) * var(--view-switch-index, 0)));
  transition: transform var(--motion-medium) var(--motion-emphasis);
}

.view-switch__item {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: var(--view-switch-height);
  padding: 0 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  transition: color var(--motion-fast) var(--motion-emphasis), transform var(--motion-fast) var(--motion-emphasis);
}

.view-switch__item--active {
  color: #ffffff;
}

.search-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.search-drop-enter-active,
.search-drop-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.search-drop-enter-from,
.search-drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.ghost-btn {
  min-width: 72px;
  min-height: var(--input-height);
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text-secondary);
  box-shadow: var(--app-shadow);
  font-size: 14px;
  font-weight: 600;
  transition: transform var(--motion-fast) var(--motion-emphasis);
}

.ghost-btn--link {
  min-width: auto;
  padding: 0 14px;
  white-space: nowrap;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.stat-card,
.leaderboard-item {
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
}

.stat-card {
  padding: 14px 16px;
}

.stat-card__value {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.stat-card__value--text {
  font-size: 18px;
}

.stat-card__meta,
.group-card__meta,
.leaderboard-item__meta {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.timeline-list,
.record-list,
.leaderboard-list {
  display: grid;
  gap: 14px;
}

.record-list {
  margin-top: 14px;
  grid-template-columns: 1fr;
}

.timeline-month {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  column-gap: 16px;
}

.timeline-month--last .timeline-month__line {
  display: none;
}

.timeline-month__rail {
  position: relative;
  display: flex;
  justify-content: center;
}

.timeline-month__dot {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  margin-top: 8px;
  border-radius: 50%;
  background: #141416;
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--app-surface) 72%, transparent);
}

.timeline-month__line {
  position: absolute;
  top: 20px;
  bottom: -24px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--app-text-tertiary) 28%, transparent), transparent);
}

.timeline-month__content {
  min-width: 0;
}

.timeline-month__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.timeline-month__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.timeline-month__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.timeline-month__meta {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.leaderboard-item {
  display: flex;
  gap: 14px;
  padding: 16px;
}

.leaderboard-item__rank {
  width: 36px;
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
  text-align: center;
}

.leaderboard-item__body {
  flex: 1;
  min-width: 0;
}

.leaderboard-item__name {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.leaderboard-item__amount {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.leaderboard-item__track {
  margin-top: 10px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 10%, transparent);
}

.leaderboard-item__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #141416 0%, #4b5563 100%);
}

.empty-wrap {
  padding-top: 12px;
}

:global(html.theme-dark) .view-switch__indicator,
:global(html.theme-dark) .leaderboard-item__fill {
  background: linear-gradient(90deg, #f5f5f7 0%, #9ca3af 100%);
}

:global(html.theme-dark) .timeline-month__line {
  background: color-mix(in srgb, var(--app-text-secondary) 18%, transparent);
}

:global(html.theme-dark) .view-switch__item--active {
  color: #141416;
}

@media (max-width: 700px) {
  .stats-section {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 560px) {
  .record-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .record-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .record-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .search-row {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 700px) {
  .record-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1100px) {
  .record-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
