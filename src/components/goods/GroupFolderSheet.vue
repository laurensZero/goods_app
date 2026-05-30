<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :position="popupPosition"
    round
    :class="['group-folder-popup', { 'group-folder-popup--tablet': isTablet, 'group-folder-popup--instant': skipOpenAnimation }]"
    @opened="onSheetOpened"
  >
    <div class="group-folder">
      <div v-if="!isTablet" class="group-folder__handle" />
      <div class="group-folder__header">
        <div class="group-folder__info">
          <span class="group-folder__name">{{ group?.name || t('goodsGroup.untitled') }}</span>
          <span class="group-folder__meta">{{ memberGoods.length }} {{ t('goodsGroup.items') }} · {{ displayTotalPrice }}</span>
        </div>
        <button class="group-folder__edit-btn" type="button" @click="showEditSheet = true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 20H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M16.5 3.5a2.12 2.12 0 013 3L8 18l-4 1 1-4 12.5-11.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
      </div>
      <div class="group-folder__grid" :style="gridStyle">
        <GoodsCard
          v-for="item in memberGoods"
          :key="item.id"
          :item="item"
          :density="density"
          :data-goods-hero-id="item.id"
          @open-detail="openDetail"
        />
      </div>
      <button class="group-folder__add" type="button" @click="showAddSheet = true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        <span>{{ t('goodsGroup.addMember') }}</span>
      </button>
    </div>

    <!-- Edit sheet -->
    <GroupEditSheet
      v-if="group"
      v-model:show="showEditSheet"
      :group="group"
      :member-goods="memberGoods"
      @update="handleGroupUpdate"
      @remove-member="handleRemoveMember"
      @delete-group="handleDeleteGroup"
    />

    <!-- Add member sheet -->
    <AddToGroupSheet
      v-model:show="showAddSheet"
      :group-type="group?.type || 'collection'"
      :goods-ids="[]"
      :target-group-id="groupId"
      @add="handleAddMembers"
    />
  </Popup>

  <!-- Delete confirm dialog — outside Popup to avoid z-index stacking context -->
  <Teleport to="body">
    <Transition name="confirm-modal">
      <div v-if="showDeleteConfirm" class="confirm-overlay" @click="showDeleteConfirm = false">
        <div class="confirm-card" role="alertdialog" aria-modal="true" @click.stop>
          <div class="confirm-icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6H21" />
              <path d="M8 6V4H16V6" />
              <path d="M19 6L18 20H6L5 6" />
              <path d="M10 11V17" />
              <path d="M14 11V17" />
            </svg>
          </div>
          <h2 class="confirm-title">{{ t('goodsGroup.dissolveGroup') }}</h2>
          <p class="confirm-desc">{{ t('goodsGroup.deleteGroupConfirm') }}</p>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--ghost" type="button" @click="showDeleteConfirm = false">{{ t('common.cancel') }}</button>
            <button class="confirm-btn confirm-btn--danger" type="button" @click="confirmDeleteGroup">{{ t('goodsGroup.dissolveGroup') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Popup, showSuccessToast } from 'vant'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { prepareGoodsHeroForward, playGoodsHeroBack, hasPendingGoodsHeroBack } from '@/utils/platform/nativeGoodsHeroTransition'
import GoodsCard from '@/components/goods/GoodsCard.vue'
import GroupEditSheet from '@/components/goods/GroupEditSheet.vue'
import AddToGroupSheet from '@/components/goods/AddToGroupSheet.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  groupId: { type: String, default: '' },
  density: { type: String, default: 'comfortable' }
})

const emit = defineEmits(['update:show', 'before-navigate'])
const router = useRouter()
const { t } = useI18n()
const goodsStore = useGoodsStore()
const goodsGroupStore = useGoodsGroupStore()
const { isTabletViewport: isTablet, updateViewport } = useTabletViewport()
onMounted(() => updateViewport())

const popupPosition = computed(() => isTablet.value ? 'center' : 'bottom')
const showProxy = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v)
})

const showEditSheet = ref(false)
const showAddSheet = ref(false)
const showDeleteConfirm = ref(false)
const skipOpenAnimation = ref(false)

// Skip Popup animation when returning from detail (hero back pending)
watch(() => props.show, (open) => {
  if (open) {
    const currentPath = router.currentRoute.value.fullPath
    skipOpenAnimation.value = hasPendingGoodsHeroBack(currentPath)
    if (skipOpenAnimation.value) {
      // Instant path: trigger hero back after DOM is ready
      nextTick(() => onSheetOpened())
    }
  } else {
    skipOpenAnimation.value = false
  }
})

const group = computed(() => goodsGroupStore.getGroupById(props.groupId))
const groupItems = computed(() => goodsGroupStore.groupItemsOf(props.groupId))
const memberGoods = computed(() => {
  const goodsMap = new Map(goodsStore.list.map(g => [g.id, g]))
  return groupItems.value.map(i => goodsMap.get(i.goodsId)).filter(Boolean)
})

const displayTotalPrice = computed(() => {
  if (!group.value) return '0'
  if (group.value.summaryMode === 'manual') return String(group.value.totalAmount || 0)
  const sum = memberGoods.value.reduce((acc, g) => {
    const price = parseFloat(g.actualPrice || g.price || '0')
    return acc + (isNaN(price) ? 0 : price)
  }, 0)
  return sum.toFixed(2)
})

const gridCols = computed(() => {
  const w = window.innerWidth
  if (w >= 1200) return props.density === 'compact' ? 6 : 5
  if (w >= 900) return props.density === 'compact' ? 5 : 4
  if (w >= 600) return props.density === 'compact' ? 4 : 3
  return props.density === 'compact' ? 3 : 2
})
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridCols.value}, minmax(0, 1fr))`
}))

function openDetail(payload) {
  const goodsId = typeof payload === 'object' ? payload.id : payload
  const sourceEl = typeof payload === 'object' ? payload.sourceEl : null
  emit('before-navigate')
  prepareGoodsHeroForward({ goodsId, sourceEl: sourceEl || null })
  emit('update:show', false)
  router.push(`/detail/${goodsId}`)
}

function resolveGoodsCardCover(goodsId) {
  const el = document.querySelector(`[data-goods-hero-id="${CSS.escape(goodsId)}"]`)
  return el
}

function onSheetOpened() {
  // Try to play back hero animation after sheet opens (returning from detail)
  const currentPath = router.currentRoute.value.fullPath
  if (!hasPendingGoodsHeroBack(currentPath)) return
  let retry = 0
  const tryPlay = () => {
    const played = playGoodsHeroBack({
      currentPath,
      resolveTargetEl: resolveGoodsCardCover
    })
    if (played || retry++ >= 12) return
    requestAnimationFrame(tryPlay)
  }
  nextTick(() => tryPlay())
}

async function handleGroupUpdate(id, data) {
  await goodsGroupStore.updateGroup(id, data)
}

async function handleRemoveMember(goodsIds) {
  await goodsGroupStore.removeItemsFromGroup(goodsIds)
}

function handleDeleteGroup() {
  showDeleteConfirm.value = true
}

async function confirmDeleteGroup() {
  showDeleteConfirm.value = false
  await goodsGroupStore.removeGroup(props.groupId)
  showSuccessToast(t('goodsGroup.groupDeleted'))
  emit('update:show', false)
}

async function handleAddMembers() {
  showSuccessToast(t('goodsGroup.membersAdded'))
}
</script>

<style scoped>
.group-folder-popup {
  overflow: hidden;
}

:global(.group-folder-popup.van-popup--bottom) {
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
}

:global(.group-folder-popup.van-popup--center) {
  width: min(720px, calc(100vw - 48px)) !important;
  max-width: calc(100vw - 48px) !important;
  border-radius: 28px !important;
}

.group-folder {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 90dvh;
  padding: 12px 12px max(24px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--app-text) 5%, transparent), transparent 42%),
    var(--app-bg);
  color: var(--app-text);
  overflow-y: scroll;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.group-folder::-webkit-scrollbar {
  width: 0;
  height: 0;
  background: transparent;
}

.group-folder__handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 12px;
  flex-shrink: 0;
}

.group-folder__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 12px;
}

.group-folder__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.group-folder__name {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-folder__meta {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

.group-folder__edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size, 36px);
  height: var(--icon-button-size, 36px);
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform var(--motion-fast, 200ms) ease, background var(--motion-fast, 200ms) ease;
}

.group-folder__edit-btn svg {
  width: 20px;
  height: 20px;
}

.group-folder__edit-btn:active {
  transform: scale(var(--press-scale-button, 0.96));
  background: var(--app-selection-bg);
}

.group-folder__grid {
  display: grid;
  gap: var(--card-gap, 12px);
  align-items: start;
  padding: 0 4px;
}

.group-folder__add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px 4px 0;
  padding: 14px;
  border-radius: var(--radius-card, 18px);
  border: 2px dashed color-mix(in srgb, var(--app-border) 78%, transparent);
  color: var(--app-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  width: calc(100% - 8px);
  background: transparent;
  transition: background var(--motion-fast, 200ms) ease;
}

.group-folder__add svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
}

.group-folder__add:active {
  background: var(--app-selection-bg);
}

:global(html.theme-dark) .group-folder-popup.van-popup {
  --van-popup-background: var(--app-surface);
  background: var(--app-surface) !important;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.42);
  border: none;
}

/* Instant mode: disable ALL Popup transitions/animations for hero back */
.group-folder-popup--instant,
.group-folder-popup--instant :deep(.van-overlay),
.group-folder-popup--instant :deep(.van-popup),
.group-folder-popup--instant :deep(.van-fade-enter-active),
.group-folder-popup--instant :deep(.van-fade-leave-active),
.group-folder-popup--instant :deep(.van-popup-slide-enter-active),
.group-folder-popup--instant :deep(.van-popup-slide-leave-active) {
  transition-duration: 0s !important;
  animation-duration: 0s !important;
  transition-delay: 0s !important;
}

/* Confirm dialog — matches GoodsDeleteConfirm style */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-overlay, rgba(20, 20, 22, 0.22));
  backdrop-filter: blur(var(--app-overlay-blur, 8px)) saturate(var(--app-overlay-saturate, 120%));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur, 8px)) saturate(var(--app-overlay-saturate, 120%));
  padding: 24px;
}

.confirm-card {
  width: min(100%, 320px);
  padding: 28px 24px 24px;
  border-radius: 24px;
  background: var(--app-surface);
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.18);
  text-align: center;
}

.confirm-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.confirm-icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.confirm-title {
  margin-top: 16px;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.confirm-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  height: 48px;
  border: none;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.confirm-btn:active {
  transform: scale(0.96);
}

.confirm-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.confirm-btn--danger {
  background: #141416;
  color: #ffffff;
}

.confirm-modal-enter-active,
.confirm-modal-leave-active {
  transition: opacity 180ms ease;
}

.confirm-modal-enter-from,
.confirm-modal-leave-to {
  opacity: 0;
}

:global(html.theme-dark) .confirm-card {
  background: rgba(24, 24, 28, 0.78);
  box-shadow: 0 22px 56px rgba(0, 0, 0, 0.42);
}

:global(html.theme-dark) .confirm-btn--ghost {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .confirm-btn--danger {
  background: #f5f5f7;
  color: #d32f2f;
}
</style>
