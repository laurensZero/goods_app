<template>
  <div ref="pageRootRef" class="group-detail-view" :class="{ 'group-detail-view--restoring': !displayReady }">
    <!-- Header -->
    <header class="group-detail-header">
      <button class="header-back-btn" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="header-title">
        <span class="header-title-text">{{ groupData?.name || t('goodsGroup.untitled') }}</span>
        <span class="header-title-count">{{ memberGoods.length }} {{ t('goodsGroup.items') }}</span>
      </div>
      <button class="header-edit-btn" @click="showEditSheet = true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M16.5 3.5a2.12 2.12 0 013 3L8 18l-4 1 1-4 12.5-11.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </header>

    <!-- Group summary -->
    <div class="group-summary">
      <div class="group-summary-item">
        <span class="summary-label">{{ t('goodsGroup.totalPrice') }}</span>
        <span class="summary-value">{{ displayTotalPrice }}</span>
        <span v-if="totalPriceCNYHint" class="summary-cny-hint">{{ totalPriceCNYHint }}</span>
      </div>
      <div class="group-summary-item">
        <span class="summary-label">{{ t('goodsGroup.memberCount') }}</span>
        <span class="summary-value">{{ memberGoods.length }}</span>
      </div>
    </div>

    <!-- Member goods grid -->
    <div ref="pageBodyRef" class="group-detail-body">
      <GoodsCardGridSection
        v-if="memberGoods.length > 0"
        ref="gridSectionRef"
        :items="memberGoods"
        :density="displayDensity"
        :selected-ids="selectedIds"
        :selection-mode="selectionMode"
        @long-press="enterSelectionMode"
        @toggle-select="toggleSelect"
        @open-detail="openDetail"
      />
      <EmptyState
        v-else
        :text="t('goodsGroup.emptyGroup')"
      />

      <!-- Add member button -->
      <button class="add-member-area" type="button" @click="showAddMemberSheet = true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        <span>{{ t('goodsGroup.addMember') }}</span>
      </button>
    </div>

    <!-- Selection header -->
    <HomeSelectionHeader
      v-if="selectionMode"
      :selected-count="selectedIds.size"
      :all-selected="allSelected"
      :total-count="memberGoods.length"
      @back="exitSelectionMode"
      @toggle-select-all="toggleSelectAll"
    />

    <!-- Edit sheet -->
    <GroupEditSheet
      v-if="groupData"
      v-model:show="showEditSheet"
      :group="groupData"
      :member-goods="memberGoods"
      @update="handleGroupUpdate"
      @remove-member="handleRemoveMember"
      @reorder="handleReorder"
      @delete-group="handleDeleteGroup"
    />

    <!-- Add member sheet -->
    <AddToGroupSheet
      v-model:show="showAddMemberSheet"
      :group-type="groupData?.type || 'collection'"
      :goods-ids="[]"
      @add="handleAddMembers"
    />
    <DangerConfirmDialog
      v-model:show="showDeleteConfirm"
      :title="t('goodsGroup.deleteGroup')"
      :description="t('goodsGroup.deleteGroupConfirm')"
      :confirm-text="t('goodsGroup.deleteGroup')"
      @confirm="confirmDeleteGroup"
    />
    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onActivated, onMounted, onBeforeUnmount, onDeactivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import AppToast from '@/components/common/AppToast.vue'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { useExchangeRateStore } from '@/stores/exchangeRate'
import { CURRENCY_MAP } from '@/constants/currencies'
import { useGoodsSelection } from '@/composables/goods/useGoodsSelection'
import { useGoodsBackHero } from '@/composables/goods/useGoodsBackHero'
import { hasPendingGoodsHeroBack, prepareGoodsHeroForward } from '@/utils/platform/nativeGoodsHeroTransition'
import { createPageScrollRestore } from '@/composables/scroll'
import { addAndroidBackButtonListener } from '@/utils/platform/androidBackButton'
import { setPendingDetailReturnPath, clearPendingDetailTransitionKind } from '@/utils/routeTransition'
import GoodsCardGridSection from '@/components/goods/GoodsCardGridSection.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HomeSelectionHeader from '@/components/home/HomeSelectionHeader.vue'
import GroupEditSheet from '@/components/goods/GroupEditSheet.vue'
import AddToGroupSheet from '@/components/goods/AddToGroupSheet.vue'

defineOptions({ name: 'GroupDetailView' })

const props = defineProps({
  id: { type: String, required: true }
})

const groupId = computed(() => props.id)
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const goodsStore = useGoodsStore()
const goodsGroupStore = useGoodsGroupStore()
const exchangeRate = useExchangeRateStore()
const { toastMsg, showToast } = useToast()

// Refs
const pageRootRef = ref(null)
const pageBodyRef = ref(null)
const gridSectionRef = ref(null)
const showEditSheet = ref(false)
const showAddMemberSheet = ref(false)
const showDeleteConfirm = ref(false)
const displayDensity = ref('comfortable')
const displayReady = ref(true)

// Scroll management
const {
  getScrollEl,
  saveScrollPosition,
  getStoredScrollState,
  restoreActivatedScrollPosition,
  clearStoredScrollState
} = createPageScrollRestore('group-detail')(pageBodyRef)

// Group data
const groupData = computed(() => goodsGroupStore.getGroupById(groupId.value))
const groupItems = computed(() => goodsGroupStore.groupItemsOf(groupId.value))
const memberGoods = computed(() => {
  const goodsMap = new Map(goodsStore.list.map(g => [g.id, g]))
  return groupItems.value
    .map(i => goodsMap.get(i.goodsId))
    .filter(Boolean)
})

const groupCurrency = computed(() => groupData.value?.currency || 'CNY')
const currencySymbol = computed(() => CURRENCY_MAP[groupCurrency.value]?.symbol || '¥')

const displayTotalPrice = computed(() => {
  if (!groupData.value) return `${currencySymbol.value}0`
  if (groupData.value.summaryMode === 'manual') {
    const amount = Number(groupData.value.totalAmount) || 0
    return `${currencySymbol.value}${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`
  }
  const sum = memberGoods.value.reduce((acc, g) => {
    const price = parseFloat(g.actualPrice || g.price || '0')
    return acc + (isNaN(price) ? 0 : price)
  }, 0)
  return `${currencySymbol.value}${sum.toFixed(2)}`
})

const totalPriceCNYHint = computed(() => {
  if (!groupData.value || groupCurrency.value === 'CNY') return ''
  if (groupData.value.summaryMode === 'manual') {
    const amount = Number(groupData.value.totalAmount) || 0
    const cny = exchangeRate.convertToCNY(amount, groupCurrency.value)
    return `≈¥${cny.toFixed(2)}`
  }
  return ''
})

// Selection — pass memberGoods so the watch source is valid
const {
  selectionMode,
  selectedIds,
  allSelected,
  enterSelectionMode,
  toggleSelect,
  toggleSelectAll,
  exitSelectionMode,
  exitSelectionModeQuiet
} = useGoodsSelection(memberGoods)

// Hero back animation
const {
  scheduleGoodsBackHeroRetry,
  tryPlayNativeGoodsBackHero,
  clearDeferredRestoreTimer,
  cancelGoodsBackHeroRetry
} = useGoodsBackHero({ getScrollEl, rootRef: pageBodyRef })

let lastDetailNavigationTime = 0

function handleBack() {
  router.back()
}

function openDetail(payload) {
  const now = Date.now()
  if (now - lastDetailNavigationTime < 320) return
  lastDetailNavigationTime = now

  const goodsId = typeof payload === 'object' ? payload.id : payload
  const sourceEl = typeof payload === 'object' ? payload.sourceEl : null

  saveScrollPosition(true, `group:openDetail:${goodsId}`)

  clearPendingDetailTransitionKind()
  setPendingDetailReturnPath(router.currentRoute.value.fullPath)
  prepareGoodsHeroForward({ goodsId, sourceEl: sourceEl || null })
  router.push(`/detail/${goodsId}`)
}

async function handleGroupUpdate(id, data) {
  await goodsGroupStore.updateGroup(id, data)
}

async function handleRemoveMember(goodsIds) {
  await goodsGroupStore.removeItemsFromGroup(goodsIds)
}

async function handleReorder(orderedGoodsIds) {
  await goodsGroupStore.reorderGroupItems(groupId.value, orderedGoodsIds)
}

function handleDeleteGroup() {
  showDeleteConfirm.value = true
}

async function confirmDeleteGroup() {
  showDeleteConfirm.value = false
  await goodsGroupStore.removeGroup(groupId.value)
  showToast(t('goodsGroup.groupDeleted'))
  router.replace('/home')
}

async function handleAddMembers(groupId) {
  // AddToGroupSheet already handles adding via store
  showToast(t('goodsGroup.membersAdded'))
}

// Android back button
function handleAndroidBackButton(event) {
  if (showEditSheet.value) {
    showEditSheet.value = false
    event.preventDefault()
    return
  }
  if (showAddMemberSheet.value) {
    showAddMemberSheet.value = false
    event.preventDefault()
    return
  }
  if (selectionMode.value) {
    exitSelectionMode()
    event.preventDefault()
    return
  }
  event.preventDefault()
  handleBack()
}

let cleanupBackButton = null

function bindBackButton() {
  if (cleanupBackButton) return
  cleanupBackButton = addAndroidBackButtonListener(handleAndroidBackButton)
}

function unbindBackButton() {
  if (cleanupBackButton) {
    cleanupBackButton()
    cleanupBackButton = null
  }
}

// Lifecycle
onMounted(() => {
  bindBackButton()
})

onActivated(async () => {
  bindBackButton()
  cancelGoodsBackHeroRetry()
  clearDeferredRestoreTimer()

  const hasPending = hasPendingGoodsHeroBack(route.fullPath)
  if (hasPending) {
    displayReady.value = false
  }

  const revealMask = () => { displayReady.value = true }

  await restoreActivatedScrollPosition(() => {}, () => {})
  await nextTick()

  const played = tryPlayNativeGoodsBackHero(revealMask)
  if (played) {
    // Don't reveal yet — onReady callback will fire when overlay is ready
    // Fallback in case onReady never fires
    window.setTimeout(revealMask, 600)
  } else if (hasPendingGoodsHeroBack(route.fullPath)) {
    scheduleGoodsBackHeroRetry(0, {
      onReady: revealMask,
      onPlayed: () => {},
      onGiveUp: revealMask
    })
  } else {
    revealMask()
  }
})

onDeactivated(() => {
  unbindBackButton()
  cancelGoodsBackHeroRetry()
  clearDeferredRestoreTimer()
  displayReady.value = true
})

onBeforeUnmount(() => {
  unbindBackButton()
  cancelGoodsBackHeroRetry()
  clearDeferredRestoreTimer()
})
</script>

<style scoped>
.group-detail-view {
  min-height: 100dvh;
  background: var(--app-bg-gradient);
  padding-bottom: 80px;
}

.group-detail-view--restoring {
  visibility: hidden;
}

.group-detail-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px var(--page-padding, 16px);
  background: var(--app-glass, rgba(255, 255, 255, 0.86));
  backdrop-filter: blur(var(--app-frost-blur, 22px)) saturate(var(--app-frost-saturate, 140%));
  -webkit-backdrop-filter: blur(var(--app-frost-blur, 22px)) saturate(var(--app-frost-saturate, 140%));
  border-bottom: 1px solid var(--app-border, rgba(17, 20, 22, 0.06));
}

.header-back-btn,
.header-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size, 36px);
  height: var(--icon-button-size, 36px);
  border: none;
  background: transparent;
  border-radius: 50%;
  color: var(--app-text);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform var(--motion-fast, 200ms) ease, background var(--motion-fast, 200ms) ease;
}

.header-back-btn svg,
.header-edit-btn svg {
  width: 22px;
  height: 22px;
}

.header-back-btn:active,
.header-edit-btn:active {
  transform: scale(var(--press-scale-button, 0.96));
  background: var(--app-selection-bg);
}

.header-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header-title-text {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-title-count {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.group-summary {
  display: flex;
  gap: 24px;
  padding: 12px var(--page-padding, 16px);
}

.group-summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.summary-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
}

.summary-cny-hint {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin-top: 1px;
}

.group-detail-body {
  padding: 0 var(--page-padding, 16px);
}

.add-member-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 16px 0;
  padding: 14px;
  border-radius: var(--radius-card, 18px);
  border: 2px dashed color-mix(in srgb, var(--app-border) 78%, transparent);
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  background: transparent;
  transition: background var(--motion-fast, 200ms) ease;
}

.add-member-area svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
}

.add-member-area:active {
  background: var(--app-selection-bg);
}

:global(html.theme-dark) .group-detail-header {
  background: var(--app-glass-strong);
  border-bottom-color: var(--app-glass-border);
}
</style>
