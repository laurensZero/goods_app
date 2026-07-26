<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :position="popupPosition"
    round
    transition="sheet-pop"
    :class="['group-sheet-popup', { 'group-sheet-popup--tablet': isTablet }]"
  >
    <div class="group-sheet">
      <div v-if="!isTablet" class="group-sheet__handle" />
      <p class="group-sheet__title">{{ isAddMode ? t('goodsGroup.addMember') : t('goodsGroup.selectGroup') }}</p>

      <div class="group-sheet__body">
        <!-- Add mode: show ungrouped goods to select -->
        <template v-if="isAddMode">
          <!-- Search + Filter -->
          <div class="filter-bar">
            <div class="search-input-wrap">
              <svg class="search-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input
                v-model="searchQuery"
                class="search-input"
                type="text"
                :placeholder="t('goodsGroup.searchGoods')"
              />
            </div>
            <button
              v-if="filterCategory"
              class="filter-clear"
              type="button"
              @click="filterCategory = ''"
            >
              {{ filterCategory }} ×
            </button>
          </div>

          <!-- Category chips -->
          <div v-if="availableCategories.length > 1" class="filter-chips">
            <button
              v-for="cat in availableCategories"
              :key="cat"
              :class="['filter-chip', { 'filter-chip--active': filterCategory === cat }]"
              type="button"
              @click="filterCategory = filterCategory === cat ? '' : cat"
            >
              {{ cat }}
            </button>
          </div>

          <div v-if="filteredGoods.length > 0" class="ungrouped-list">
            <button
              v-for="item in filteredGoods"
              :key="item.id"
              :class="['ungrouped-item', { 'ungrouped-item--selected': selectedIds.has(item.id) }]"
              type="button"
              @click="toggleItem(item.id)"
            >
              <LazyCachedImage
                v-if="getThumb(item)"
                :src="getThumb(item)"
                class="ungrouped-item__thumb"
                loading="lazy"
                resume-decode-validation
              />
              <div v-else class="ungrouped-item__thumb ungrouped-item__thumb--empty" />
              <span class="ungrouped-item__name">{{ item.name }}</span>
              <div :class="['ungrouped-item__check', { 'ungrouped-item__check--on': selectedIds.has(item.id) }]">
                <svg v-if="selectedIds.has(item.id)" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
            </button>
          </div>
          <div v-else class="empty-hint">
            {{ searchQuery || filterCategory ? t('goodsGroup.noResults') : t('goodsGroup.noUngrouped') }}
          </div>
          <button
            v-if="selectedIds.size > 0"
            class="group-sheet__submit"
            type="button"
            @click="handleAddToGroup"
          >
            {{ t('goodsGroup.addMember') }} ({{ selectedIds.size }})
          </button>
        </template>

        <!-- Select group mode: show groups to add goods to -->
        <template v-else>
          <div v-if="filteredGroups.length > 0" class="group-list">
            <div class="group-list-card">
              <button
                v-for="group in filteredGroups"
                :key="group.id"
                class="group-list-item"
                type="button"
                @click="handleSelectGroup(group.id)"
              >
                <div class="group-list-item__copy">
                  <span class="group-list-item__name">{{ group.name || t('goodsGroup.untitled') }}</span>
                  <span class="group-list-item__count">{{ getGroupMemberCount(group.id) }} {{ t('goodsGroup.items') }}</span>
                </div>
                <svg class="group-list-item__arrow" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
          </div>
          <div v-else class="empty-hint">{{ t('goodsGroup.noGroups') }}</div>
          <button class="create-new-btn" type="button" @click="showCreateSheet = true">
            <svg class="create-new-btn__icon" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            <span>{{ t('goodsGroup.createNew') }}</span>
          </button>
        </template>
      </div>
    </div>

    <CreateGroupSheet
      v-model:show="showCreateSheet"
      :group-type="groupType"
      :initial-goods-ids="goodsIds"
      @created="handleCreated"
    />
  </Popup>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { useGoodsStore } from '@/stores/goods'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { getPrimaryGoodsImageUrl } from '@/utils/goods/images'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import CreateGroupSheet from './CreateGroupSheet.vue'
import { pinyinIncludes } from '@/utils/pinyin'

const props = defineProps({
  show: { type: Boolean, default: false },
  groupType: { type: String, default: 'collection' },
  goodsIds: { type: Array, default: () => [] },
  targetGroupId: { type: String, default: '' }
})

const emit = defineEmits(['update:show', 'add'])
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

const showCreateSheet = ref(false)
const selectedIds = ref(new Set())
const searchQuery = ref('')
const filterCategory = ref('')

// When targetGroupId is set, we're in "add goods to this group" mode
const isAddMode = computed(() => !!props.targetGroupId)

// Ungrouped goods for add mode
const ungroupedGoods = computed(() => {
  const groupedIds = new Set(goodsGroupStore.groupItemList.map(i => i.goodsId))
  const list = props.groupType === 'collection'
    ? goodsStore.collectionList
    : goodsStore.wishlistList
  return list.filter(g => !groupedIds.has(g.id))
})

const availableCategories = computed(() => {
  const cats = new Set()
  for (const g of ungroupedGoods.value) {
    if (g.category) cats.add(g.category)
  }
  return [...cats].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})

const filteredGoods = computed(() => {
  let list = ungroupedGoods.value
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(g =>
      pinyinIncludes(g.name, q) ||
      (g.ip && pinyinIncludes(g.ip, q)) ||
      (g.characters && g.characters.some(c => pinyinIncludes(c, q)))
    )
  }
  if (filterCategory.value) {
    list = list.filter(g => g.category === filterCategory.value)
  }
  return list
})

const filteredGroups = computed(() => {
  return props.groupType === 'collection'
    ? goodsGroupStore.collectionGroups
    : goodsGroupStore.wishlistGroups
})

function getGroupMemberCount(groupId) {
  return goodsGroupStore.groupItemsOf(groupId).length
}

function getThumb(item) {
  return getPrimaryGoodsImageUrl(item.images, item.coverImage || item.image) || null
}

function toggleItem(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

async function handleAddToGroup() {
  if (selectedIds.value.size === 0) return
  await goodsGroupStore.addItemsToGroup(props.targetGroupId, [...selectedIds.value])
  selectedIds.value = new Set()
  emit('update:show', false)
  emit('add', props.targetGroupId)
}

async function handleSelectGroup(groupId) {
  await goodsGroupStore.addItemsToGroup(groupId, props.goodsIds)
  emit('update:show', false)
  emit('add', groupId)
}

function handleCreated(group) {
  emit('update:show', false)
  emit('add', group.id)
}
</script>

<style scoped>
.group-sheet-popup { overflow: hidden; }
:global(.group-sheet-popup.van-popup--bottom) { left: 0; right: 0; bottom: 0; width: 100%; }
:global(.group-sheet-popup.van-popup--center) { width: min(480px, calc(100vw - 48px)) !important; max-width: calc(100vw - 48px) !important; border-radius: var(--radius-large) !important; }

.group-sheet {
  display: flex; flex-direction: column; width: 100%; max-height: 90dvh;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  background: radial-gradient(circle at top, color-mix(in srgb, var(--app-text) 5%, transparent), transparent 42%), var(--app-bg);
  color: var(--app-text);
}
.group-sheet__handle { width: 36px; height: 4px; border-radius: 4px; background: rgba(142, 142, 147, 0.28); margin: 0 auto 16px; flex-shrink: 0; }
.group-sheet__title { font-size: 13px; font-weight: 500; color: var(--app-text-tertiary); text-align: center; margin: 0 0 16px; }
.group-sheet__body { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 50vh; }

.group-list-card { background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface)); border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); border-radius: var(--radius-card, 18px); overflow: hidden; }
.group-list-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 14px 16px; border: none; background: transparent; cursor: pointer; text-align: left; transition: background 0.14s ease; }
.group-list-item:not(:last-child) { border-bottom: 1px solid rgba(142, 142, 147, 0.12); }
.group-list-item:active { background: var(--app-selection-bg); }
.group-list-item__copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.group-list-item__name { font-size: 15px; font-weight: 500; color: var(--app-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-list-item__count { font-size: 13px; color: var(--app-text-tertiary); }
.group-list-item__arrow { width: 18px; height: 18px; stroke: var(--app-text-tertiary); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.empty-hint { padding: 32px 16px; text-align: center; font-size: 14px; color: var(--app-text-tertiary); }

.create-new-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px; border: 2px dashed color-mix(in srgb, var(--app-border) 78%, transparent); border-radius: var(--radius-card, 18px); background: transparent; color: var(--app-text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease; }
.create-new-btn:active { background: var(--app-selection-bg); }
.create-new-btn__icon { width: 20px; height: 20px; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

/* Ungrouped goods list */
.ungrouped-list { display: flex; flex-direction: column; }
.ungrouped-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; border: none; background: transparent; cursor: pointer; text-align: left; transition: background 0.14s ease; }
.ungrouped-item:not(:last-child) { border-bottom: 1px solid rgba(142, 142, 147, 0.12); }
.ungrouped-item:active { background: var(--app-selection-bg); }
.ungrouped-item--selected { background: rgba(14, 116, 233, 0.06); }
.ungrouped-item__thumb { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.ungrouped-item__thumb--empty { background: var(--app-surface-muted); }
.ungrouped-item__name { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; color: var(--app-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ungrouped-item__check { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(142, 142, 147, 0.3); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.14s ease, border-color 0.14s ease; }
.ungrouped-item__check--on { background: var(--app-pending, #0e74e9); border-color: var(--app-pending, #0e74e9); }
.ungrouped-item__check svg { width: 14px; height: 14px; color: #fff; }

.group-sheet__submit { height: var(--button-height, 52px); border: none; border-radius: var(--radius-small, 14px); background: var(--app-text); color: var(--app-surface); font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 8px; transition: transform 0.14s ease, opacity 0.14s ease; }
.group-sheet__submit:active { transform: scale(var(--press-scale-button, 0.96)); }

/* Search bar */
.filter-bar { display: flex; align-items: center; gap: 8px; }
.search-input-wrap { flex: 1; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-radius: var(--radius-small, 14px); background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface)); border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); }
.search-icon { width: 16px; height: 16px; flex-shrink: 0; stroke: var(--app-text-tertiary); stroke-width: 2; stroke-linecap: round; fill: none; }
.search-input { flex: 1; border: none; background: transparent; font-size: 14px; color: var(--app-text); outline: none; }
.search-input::placeholder { color: var(--app-placeholder); }
.filter-clear { display: flex; align-items: center; gap: 4px; height: 32px; padding: 0 10px; border: none; border-radius: 999px; background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12)); color: var(--app-chip-accent-text, #2070c0); font-size: 12px; font-weight: 500; cursor: pointer; flex-shrink: 0; }

/* Category filter chips */
.filter-chips { display: flex; gap: 6px; flex-wrap: wrap; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.filter-chips::-webkit-scrollbar { display: none; }
.filter-chip { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent); border-radius: 999px; background: transparent; color: var(--app-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease; }
.filter-chip--active { background: var(--app-chip-accent-bg, rgba(32, 112, 192, 0.12)); color: var(--app-chip-accent-text, #2070c0); border-color: var(--app-chip-accent-border, rgba(32, 112, 192, 0.24)); }

:global(html.theme-dark) .group-sheet-popup.van-popup { --van-popup-background: var(--app-surface); background: var(--app-surface) !important; box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.42); border: none; }
</style>
