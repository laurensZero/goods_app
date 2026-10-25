<template>
  <AppSheet
    v-model="showProxy"
    placement="auto"
    :sheet-class="['search-filter-popup-popup', { 'search-filter-popup-popup--tablet': isTablet }]"
  >
    <div class="filter-popup">
      <!-- Header -->
      <header class="filter-popup__header">
        <button class="icon-btn" type="button" :aria-label="t('common.back')" @click="$emit('update:visible', false)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18L9 12L15 6" />
          </svg>
        </button>

        <SearchBar
          :model-value="filters.keyword"
          :placeholder="t('search.placeholder')"
          autofocus
          class="filter-popup__search"
          @update:model-value="$emit('update-keyword', $event)"
        />

        <span v-if="activeFilterCount > 0" class="filter-popup__badge">{{ activeFilterCount }}</span>
      </header>

      <!-- 关键词直接命中 IP / 角色（含拼音）：直达收藏馆，不必先勾选 chips。
           心愿页没有「收藏馆」入口语义，由宿主传 show-profile-entry=false 关掉 -->
      <section v-if="showProfileEntry && keywordProfileEntries.length" class="content-section content-section--compact">
        <div class="profile-entry-row">
          <button
            v-for="entry in keywordProfileEntries"
            :key="entry.key"
            class="profile-entry"
            type="button"
            @click="$emit('open-profile', { kind: entry.kind, name: entry.name, ip: entry.ip })"
          >
            {{ t('profile.entry.openNamed', { name: entry.displayName }) }}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <!-- Keyword matching options: compact square toggles -->
      <section class="content-section content-section--compact">
        <div class="match-tile-grid">
          <button
            type="button"
            class="match-tile"
            :class="{ 'match-tile--active': filters.matchPinyin !== false }"
            :aria-pressed="filters.matchPinyin !== false"
            @click="toggleMatchOption('matchPinyin')"
          >
            <span class="match-tile__label">{{ t('search.matchPinyin') }}</span>
            <span class="match-tile__switch" :class="{ 'match-tile__switch--on': filters.matchPinyin !== false }">
              <span class="match-tile__slider" />
            </span>
          </button>
          <button
            type="button"
            class="match-tile"
            :class="{ 'match-tile--active': filters.matchCase === true }"
            :aria-pressed="filters.matchCase === true"
            @click="toggleMatchOption('matchCase')"
          >
            <span class="match-tile__label">{{ t('search.matchCase') }}</span>
            <span class="match-tile__switch" :class="{ 'match-tile__switch--on': filters.matchCase === true }">
              <span class="match-tile__slider" />
            </span>
          </button>
          <button
            type="button"
            class="match-tile"
            :class="{ 'match-tile--active': filters.includeNote !== false }"
            :aria-pressed="filters.includeNote !== false"
            @click="toggleMatchOption('includeNote')"
          >
            <span class="match-tile__label">{{ t('search.includeNote') }}</span>
            <span class="match-tile__switch" :class="{ 'match-tile__switch--on': filters.includeNote !== false }">
              <span class="match-tile__slider" />
            </span>
          </button>
        </div>
        <p v-if="matchOptionHint" class="match-mode-hint">{{ matchOptionHint }}</p>
      </section>

      <!-- Body -->
      <div class="filter-popup__body">
        <!-- Advanced Filters toggle -->
        <section class="content-section">
          <button
            class="advanced-toggle"
            type="button"
            :aria-expanded="advancedExpanded"
            @click="advancedExpanded = !advancedExpanded"
          >
            <div class="advanced-toggle__inner">
              <div class="advanced-toggle__hero">
                <p class="section-label">{{ t('search.advancedFilters') }}</p>
                <h2 class="section-title section-title--sub section-title--tight">{{ t('search.advancedFilters') }}</h2>
                <div class="advanced-summary">
                  <span>{{ scope === 'wishlist' ? t('search.wishlistScope') : t('search.collectionScope') }}</span>
                  <span v-if="activeFilterCount > 0" class="advanced-toggle__count">{{ t('common.enabled') }} {{ activeFilterCount }}</span>
                </div>
              </div>
              <span class="advanced-toggle__icon" aria-hidden="true">
                <svg :class="{ 'advanced-toggle__arrow--open': advancedExpanded }" viewBox="0 0 24 24" fill="none">
                  <path d="M7 10L12 15L17 10" />
                </svg>
              </span>
            </div>
          </button>
        </section>

        <!-- Expanded: Presets + Filter Conditions -->
        <Transition name="advanced-panel">
          <div v-if="advancedExpanded" class="advanced-panel-wrap">
            <!-- Presets -->
            <section class="content-section">
              <div class="section-head">
                <div>
                  <p class="section-label">{{ t('search.filterPresets') }}</p>
                  <h2 class="section-title section-title--sub">{{ t('search.saveCombo') }}</h2>
                </div>
                <div class="head-actions">
                  <button class="ghost-btn" type="button" @click="presetEditorVisible = !presetEditorVisible">
                    {{ presetEditorVisible ? t('search.collapse') : t('search.saveCurrent') }}
                  </button>
                  <button v-if="activeFilterCount > 0" class="ghost-btn" type="button" @click="$emit('reset')">
                    {{ t('common.reset') }}
                  </button>
                </div>
              </div>

              <div v-if="searchPresets.length" class="preset-list">
                <article
                  v-for="preset in searchPresets"
                  :key="preset.id"
                  :class="['preset-card', { 'preset-card--active': activePresetId === preset.id }]"
                >
                  <button class="preset-main" type="button" @click="$emit('select-preset', preset)">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-meta">{{ formatPresetSummary(preset.conditions) }}</span>
                  </button>
                  <button
                    class="preset-delete"
                    type="button"
                    :aria-label="t('search.deletePreset')"
                    @click.stop="$emit('remove-preset', preset.id)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18" />
                      <path d="M6 6L18 18" />
                    </svg>
                  </button>
                </article>
              </div>
              <div v-else class="surface-card muted-copy">{{ t('search.presetHint') }}</div>

              <!-- Preset editor -->
              <div v-if="presetEditorVisible" class="surface-card preset-editor">
                <label class="field-label" for="sfp-preset-name">{{ t('search.presetNameLabel') }}</label>
                <input
                  id="sfp-preset-name"
                  v-model.trim="presetDraftName"
                  class="field-input"
                  type="text"
                  maxlength="24"
                  :placeholder="t('search.presetNamePlaceholder')"
                >
                <div class="head-actions">
                  <button
                    class="primary-btn"
                    type="button"
                    :disabled="!presetDraftName"
                    @click="$emit('save-preset', presetDraftName)"
                  >
                    {{ t('search.saveNewPreset') }}
                  </button>
                  <button
                    v-if="activePresetId"
                    class="secondary-btn"
                    type="button"
                    :disabled="!presetDraftName"
                    @click="$emit('update-preset')"
                  >
                    {{ t('search.updateCurrent') }}
                  </button>
                </div>
              </div>
            </section>

            <!-- Filter Conditions -->
            <section class="content-section">
              <div class="section-head">
                <div>
                  <p class="section-label">{{ t('search.filterConditions') }}</p>
                  <h2 class="section-title section-title--sub">{{ t('search.comboConditions') }}</h2>
                </div>
              </div>

              <div class="surface-card filter-card">
                <!-- Price Range -->
                <div class="field-grid">
                  <div class="field-block">
                    <label class="field-label">{{ t('search.priceRange') }}</label>
                    <div class="range-row">
                      <input
                        :value="filters.priceMin"
                        class="field-input"
                        type="number"
                        min="0"
                        inputmode="decimal"
                        :placeholder="t('search.minPrice')"
                        @input="$emit('update-field', { key: 'priceMin', value: $event.target.value })"
                      >
                      <span class="range-gap">-</span>
                      <input
                        :value="filters.priceMax"
                        class="field-input"
                        type="number"
                        min="0"
                        inputmode="decimal"
                        :placeholder="t('search.maxPrice')"
                        @input="$emit('update-field', { key: 'priceMax', value: $event.target.value })"
                      >
                    </div>
                  </div>

                  <div class="field-block">
                    <label class="field-label">{{ t('common.note') }}</label>
                    <div class="chip-wrap">
                      <button
                        v-for="option in GOODS_FILTER_BOOLEAN_OPTIONS"
                        :key="option.value"
                        type="button"
                        :class="['chip', { 'chip--active': filters.hasNote === option.value }]"
                        @click="$emit('update-field', { key: 'hasNote', value: option.value })"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <div class="field-block">
                    <label class="field-label">{{ t('search.starred') }}</label>
                    <div class="chip-wrap">
                      <button
                        v-for="option in GOODS_FILTER_BOOLEAN_OPTIONS"
                        :key="option.value"
                        type="button"
                        :class="['chip', { 'chip--active': filters.starred === option.value }]"
                        @click="$emit('update-field', { key: 'starred', value: option.value })"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Collect Status (collection scope only) -->
                <div v-if="scope === 'collection'" class="field-block">
                  <label class="field-label">{{ t('search.collectStatus') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in GOODS_FILTER_COLLECT_STATUS_OPTIONS"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.collectStatuses.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'collectStatuses', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- Acquire Time -->
                <div class="field-block">
                  <label class="field-label">{{ t('search.acquireTime') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in GOODS_FILTER_DATE_PRESET_OPTIONS"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.acquiredPreset === option.value }]"
                      @click="$emit('update-field', { key: 'acquiredPreset', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <div v-if="filters.acquiredPreset === 'custom'" class="range-row range-row--date">
                    <button class="date-field" type="button" @click="openDatePicker('from')">
                      <span :class="{ 'date-field__value--placeholder': !filters.acquiredFrom }">
                        {{ filters.acquiredFrom || t('search.startDate') }}
                      </span>
                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                    <span class="range-gap">-</span>
                    <button class="date-field" type="button" @click="openDatePicker('to')">
                      <span :class="{ 'date-field__value--placeholder': !filters.acquiredTo }">
                        {{ filters.acquiredTo || t('search.endDate') }}
                      </span>
                      <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="16" rx="3" />
                        <path d="M8 3V7" />
                        <path d="M16 3V7" />
                        <path d="M3 10H21" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Category -->
                <div v-if="categoryOptions.length" class="field-block">
                  <label class="field-label">{{ t('common.category') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in categoryOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.categories.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'categories', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- IP -->
                <div v-if="ipOptions.length" class="field-block">
                  <label class="field-label">{{ t('common.ip') }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in ipOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.ips.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'ips', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <button
                    v-if="showProfileEntry && filters.ips.length === 1"
                    class="profile-entry"
                    type="button"
                    @click="$emit('open-profile', { kind: 'ip', name: filters.ips[0] })"
                  >
                    {{ t('profile.entry.openNamed', { name: filters.ips[0] }) }}
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>

                <!-- Character -->
                <div v-if="characterOptions.length" class="field-block">
                  <div class="field-head">
                    <label class="field-label">{{ t('common.character') }}</label>
                    <button
                      v-if="hasCollapsedCharacterOptions"
                      class="field-toggle"
                      type="button"
                      @click="$emit('toggle-character-expand')"
                    >
                      {{ showAllCharacterOptions ? t('search.collapseCharacters') : t('search.expandCharacters') }}
                    </button>
                  </div>
                  <div class="chip-wrap">
                    <button
                      v-for="option in visibleCharacterOptions"
                      :key="option.value"
                      type="button"
                      :class="['chip', { 'chip--active': filters.characters.includes(option.value) }]"
                      @click="$emit('toggle-filter', { key: 'characters', value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <div v-if="selectedCharacterProfileTargets.length" class="profile-entry-row">
                    <button
                      v-for="target in selectedCharacterProfileTargets"
                      :key="`${target.ip}\u0000${target.name}`"
                      class="profile-entry"
                      type="button"
                      @click="$emit('open-profile', { kind: 'character', name: target.name, ip: target.ip })"
                    >
                      {{ t('profile.entry.openNamed', { name: target.displayName }) }}
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Custom fields (select type only in v1) -->
                <div v-for="group in customFieldFilterGroups" :key="group.defId" class="field-block">
                  <label class="field-label">{{ group.name }}</label>
                  <div class="chip-wrap">
                    <button
                      v-for="option in group.options"
                      :key="`${group.defId}-${option.value}`"
                      type="button"
                      :class="['chip', { 'chip--active': (filters.customFields?.[group.defId] || []).includes(option.value) }]"
                      @click="$emit('toggle-custom-field', { defId: group.defId, value: option.value })"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>

                <!-- Storage Location (collection scope only) -->
                <div v-if="scope === 'collection' && (storageLocationTree.length || hasUnassignedStorageLocation)" class="field-block">
                  <label class="field-label">{{ t('search.storageLocation') }}</label>
                  <div class="location-tree">
                    <button
                      v-if="hasUnassignedStorageLocation"
                      type="button"
                      :class="['chip', { 'chip--active': filters.storageLocations.includes(GOODS_FILTER_SPECIAL_VALUES.noStorageLocation) }]"
                      @click="$emit('toggle-filter', { key: 'storageLocations', value: GOODS_FILTER_SPECIAL_VALUES.noStorageLocation })"
                    >
                      {{ t('search.noLocation') }}
                    </button>

                    <StorageLocationFilterTree
                      v-for="node in storageLocationTree"
                      :key="node.path"
                      :node="node"
                      :selected-values="filters.storageLocations"
                      @toggle="$emit('toggle-filter', { key: 'storageLocations', value: $event })"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </Transition>

        <!-- Empty state when no filters active -->
        <section v-if="!isFiltering" class="content-section">
          <EmptyState
            icon="✨"
            :title="t('search.startSearch')"
            :description="t('search.startSearchDesc')"
          />
        </section>
      </div>

      <!-- Footer -->
      <footer class="filter-popup__footer">
        <button class="secondary-btn" type="button" @click="$emit('reset')">
          {{ t('common.reset') }}
        </button>
        <button class="primary-btn" type="button" @click="$emit('update:visible', false)">
          {{ t('common.close') }}
        </button>
      </footer>

      <AppDatePicker
        v-model:show="showDatePicker"
        v-model="datePickerValue"
        :z-index="3000"
        :is-tablet="isTablet"
        :title="datePickerTarget === 'from' ? t('search.selectAcquiredFrom') : t('search.selectAcquiredTo')"
        :min-date="minDate"
        :max-date="maxDate"
        @confirm="onDateConfirm"
      />
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppSheet from '@/components/common/AppSheet.vue'
import { useI18n } from 'vue-i18n'
import { useTabletViewport } from '@/composables/viewport/useTabletViewport'
import SearchBar from '@/components/common/SearchBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import { formatDate } from '@/utils/format'
import { toPinyinSearchText, warmPinyinCache } from '@/utils/pinyin'
import StorageLocationFilterTree from '@/components/storage/StorageLocationFilterTree.vue'
import {
  GOODS_FILTER_SPECIAL_VALUES,
  GOODS_FILTER_DATE_PRESET_OPTIONS,
  GOODS_FILTER_BOOLEAN_OPTIONS,
  GOODS_FILTER_COLLECT_STATUS_OPTIONS
} from '@/utils/goods/filters'

const { t } = useI18n()
const { isTabletViewport, updateViewport } = useTabletViewport()

const emit = defineEmits([
  'update:visible',
  'update-keyword',
  'update-field',
  'toggle-filter',
  'reset',
  'select-preset',
  'save-preset',
  'update-preset',
  'remove-preset',
  'toggle-character-expand',
  'toggle-custom-field',
  'open-profile'
])

const props = defineProps({
  visible: { type: Boolean, default: false },
  filters: { type: Object, required: true },
  categoryOptions: { type: Array, default: () => [] },
  ipOptions: { type: Array, default: () => [] },
  characterOptions: { type: Array, default: () => [] },
  /**
   * 收藏馆入口的角色候选（含 IP）：`[{ name, ip }]`。
   * 同名角色在不同 IP 下会各占一项，这样关键词命中时能给出两个不同的收藏馆入口。
   * 不传时退回 characterOptions（仅名字）。
   */
  characterProfileTargets: { type: Array, default: () => [] },
  visibleCharacterOptions: { type: Array, default: () => [] },
  hasCollapsedCharacterOptions: { type: Boolean, default: false },
  showAllCharacterOptions: { type: Boolean, default: false },
  customFieldFilterGroups: { type: Array, default: () => [] },
  storageLocationTree: { type: Array, default: () => [] },
  hasUnassignedStorageLocation: { type: Boolean, default: false },
  activeFilterCount: { type: Number, default: 0 },
  scope: { type: String, default: 'collection' },
  /** 是否显示「直达收藏馆」入口（关键词命中 IP/角色、单 IP/角色筛选）。心愿页传 false。 */
  showProfileEntry: { type: Boolean, default: true },
  searchPresets: { type: Array, default: () => [] },
  activePresetId: { type: String, default: '' },
  activePresetName: { type: String, default: '' },
  formatPresetSummary: { type: Function, default: () => '' }
})

const showProxy = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 打开期间锁定布局：软键盘弹起会压缩 innerHeight，避免平板被误判成底部弹层
const lockedIsTablet = ref(null)
const isTablet = computed(() => {
  if (props.visible && lockedIsTablet.value !== null) return lockedIsTablet.value
  return isTabletViewport.value
})

watch(showProxy, async (visible) => {
  if (visible) {
    await updateViewport()
    lockedIsTablet.value = isTabletViewport.value
  } else {
    lockedIsTablet.value = null
  }
})

const presetEditorVisible = ref(false)
const presetDraftName = ref('')
const advancedExpanded = ref(false)

const isFiltering = computed(() => props.activeFilterCount > 0 || (props.filters.keyword && props.filters.keyword.trim()))

/* ── 关键词命中 IP / 角色（含拼音）→ 直达收藏馆 ── */

const PROFILE_ENTRY_LIMIT = 3

/** 展示名：只有多 IP 重名时才带 IP，普通角色只显示名字 */
function profileDisplayName(name, ip, ambiguous = false) {
  return ambiguous && ip ? `${name} · ${ip}` : name
}

/** 同名角色是否落在多个 IP 下（多 IP 重名才需要在入口上标 IP） */
function buildAmbiguousNameMatcher(targets) {
  const ipsByName = new Map()
  for (const target of targets) {
    if (!target.ip) continue
    if (!ipsByName.has(target.name)) ipsByName.set(target.name, new Set())
    ipsByName.get(target.name).add(target.ip)
  }
  return (name) => (ipsByName.get(name)?.size || 0) > 1
}

/** 角色收藏馆候选：宿主给了 (ip, name) 目标就用它，否则退回只有名字的 characterOptions */
function resolveCharacterProfileTargets() {
  const targets = Array.isArray(props.characterProfileTargets) ? props.characterProfileTargets : []
  const list = []
  const seen = new Set()
  for (const target of targets) {
    const name = String(target?.name || '').trim()
    const ip = String(target?.ip || '').trim()
    if (!name) continue
    const key = `${ip}\u0000${name}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ name, ip })
  }
  if (list.length > 0) return list

  for (const option of props.characterOptions) {
    const name = String(option?.value || '').trim()
    if (!name || name === GOODS_FILTER_SPECIAL_VALUES.noCharacter) continue
    list.push({ name, ip: '' })
  }
  return list
}

/** 可进收藏馆的候选（排除「未归类 IP / 未标角色」这两个特殊值） */
function buildProfileCandidates() {
  const candidates = []
  for (const option of props.ipOptions) {
    const name = String(option?.value || '').trim()
    if (!name || name === GOODS_FILTER_SPECIAL_VALUES.noIp) continue
    candidates.push({ kind: 'ip', name, ip: '', ambiguous: false })
  }
  const targets = resolveCharacterProfileTargets()
  const isAmbiguousName = buildAmbiguousNameMatcher(targets)
  for (const target of targets) {
    candidates.push({
      kind: 'character',
      name: target.name,
      ip: target.ip,
      ambiguous: isAmbiguousName(target.name)
    })
  }
  return candidates
}

// 拼音缓存是模块级非响应式数据：预热完成必须手动触发一次重算（也借此只在拼音就绪后启用拼音匹配）
const pinyinVersion = ref(0)

/**
 * 命中强度：4 = 原文完全相等，3 = 首选读音的全拼/首字母完全相等，
 * 2 = 其它读音组合完全相等（多音字），1 = 子串（原文或拼音），0 = 不命中
 */
function rankProfileCandidate(name, keyword, pinyinReady) {
  const lowerName = name.toLowerCase()
  if (lowerName === keyword) return 4
  if (!pinyinReady) return lowerName.includes(keyword) ? 1 : 0

  const pinyinText = toPinyinSearchText(name)
  if (pinyinText) {
    // toPinyinSearchText 每个读音组合先全拼后首字母，第一个组合即各字首选读音，
    // 所以 lines[0] / lines[1] 是「首选全拼 / 首选首字母」；
    // 多音字的其它组合排在后面（如「伊甸」的 yisheng/ys 不是首选，不该压过「原神」）
    const lines = pinyinText.split('\n')
    if (lines[0] === keyword || lines[1] === keyword) return 3
    if (lines.includes(keyword)) return 2
    if (lines.some((line) => line.includes(keyword))) return 1
  }

  return lowerName.includes(keyword) ? 1 : 0
}

const keywordProfileEntries = computed(() => {
  if (!props.showProfileEntry) return []
  const keyword = String(props.filters?.keyword || '').trim().toLowerCase()
  if (!keyword) return []

  const pinyinReady = pinyinVersion.value > 0
  let bestRank = 0
  const matched = []
  for (const candidate of buildProfileCandidates()) {
    const rank = rankProfileCandidate(candidate.name, keyword, pinyinReady)
    if (!rank) continue
    if (rank > bestRank) bestRank = rank
    matched.push({
      ...candidate,
      rank,
      key: `${candidate.kind}:${candidate.ip || ''}\u0000${candidate.name}`,
      displayName: profileDisplayName(candidate.name, candidate.ip, candidate.ambiguous)
    })
  }

  // 只留命中最强的一档：搜「ys」时给「原神」一个精确入口，
  // 而不是把拼音里恰好含 ys 的角色一起堆上来。
  // IP 也参与排序，保证同分同名的入口顺序稳定。
  return matched
    .filter((entry) => entry.rank === bestRank)
    .sort((a, b) => a.kind.localeCompare(b.kind)
      || a.name.localeCompare(b.name, 'zh-Hans-CN')
      || a.ip.localeCompare(b.ip, 'zh-Hans-CN'))
    .slice(0, PROFILE_ENTRY_LIMIT)
})

/** 单选一个角色 chip 时的收藏馆入口：只有同名跨多个 IP 才拆成多个入口 */
const selectedCharacterProfileTargets = computed(() => {
  if (!props.showProfileEntry) return []
  if (props.filters.characters?.length !== 1) return []
  const selected = String(props.filters.characters[0] || '').trim()
  if (!selected || selected === GOODS_FILTER_SPECIAL_VALUES.noCharacter) return []
  const targets = resolveCharacterProfileTargets()
  const isAmbiguousName = buildAmbiguousNameMatcher(targets)
  return targets
    .filter((target) => target.name === selected)
    .map((target) => {
      const ambiguous = isAmbiguousName(target.name)
      return {
        ...target,
        ambiguous,
        displayName: profileDisplayName(target.name, target.ip, ambiguous)
      }
    })
})

watch(showProxy, async (visible) => {
  if (!visible) return
  if (!props.showProfileEntry) return
  const names = [...new Set(buildProfileCandidates().map((candidate) => candidate.name))]
  if (!names.length) return
  await warmPinyinCache(names)
  pinyinVersion.value += 1
})

// Match option chips: tap toggles + shows short desc
const matchOptionHint = ref('')

function isMatchOptionOn(key) {
  if (key === 'matchPinyin' || key === 'includeNote') return props.filters[key] !== false
  return props.filters[key] === true
}

function toggleMatchOption(key) {
  const next = !isMatchOptionOn(key)
  emit('update-field', { key, value: next })
  matchOptionHint.value = t(`search.${key}Desc`)
}

watch(showProxy, (visible) => {
  if (!visible) matchOptionHint.value = ''
})

// Date picker
const showDatePicker = ref(false)
const datePickerTarget = ref('from')
const datePickerValue = ref([])
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

function normalizeDateParts(dateString) {
  const [fallbackYear, fallbackMonth, fallbackDay] = formatDate(new Date(), 'YYYY-MM-DD').split('-')
  if (!dateString) return [fallbackYear, fallbackMonth, fallbackDay]
  const [year = fallbackYear, month = fallbackMonth, day = fallbackDay] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

function openDatePicker(target) {
  datePickerTarget.value = target
  const dateString = target === 'from' ? props.filters.acquiredFrom : (props.filters.acquiredTo || props.filters.acquiredFrom)
  datePickerValue.value = normalizeDateParts(dateString)
  showDatePicker.value = true
}

function onDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  const dateString = `${year}-${month}-${day}`

  if (datePickerTarget.value === 'from') {
    emit('update-field', { key: 'acquiredFrom', value: dateString })
    if (props.filters.acquiredTo && props.filters.acquiredTo < dateString) {
      emit('update-field', { key: 'acquiredTo', value: dateString })
    }
  } else {
    emit('update-field', { key: 'acquiredTo', value: dateString })
    if (props.filters.acquiredFrom && props.filters.acquiredFrom > dateString) {
      emit('update-field', { key: 'acquiredFrom', value: dateString })
    }
  }

  datePickerValue.value = [year, month, day]
  showDatePicker.value = false
}
</script>

<style scoped>
/* 原 Popup 内联尺寸：bottom 85vh；tablet center 900×720 —— 改为 sheet-class 覆盖 */
:global(.search-filter-popup-popup) {
  height: 85vh;
}

:global(.search-filter-popup-popup .app-sheet__scroll) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

:global(.app-sheet-overlay--center .search-filter-popup-popup--tablet.search-filter-popup-popup) {
  width: min(900px, calc(100vw - 32px)) !important;
  height: min(720px, calc(100dvh - 32px)) !important;
}

.filter-popup {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  background: transparent;
}

/* ── Header ── */
.filter-popup__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px var(--page-padding) 8px;
  flex-shrink: 0;
}

.filter-popup__header .icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text);
  flex-shrink: 0;
}

.filter-popup__header .icon-btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.filter-popup__search {
  flex: 1;
  min-width: 0;
}

.filter-popup__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--app-pending-bg, #0e74e9);
  color: #fff;
  font-size: var(--font-small);
  font-weight: 700;
  flex-shrink: 0;
}

/* ── Body ── */
.filter-popup__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--page-padding);
  scrollbar-width: none;
}

.filter-popup__body::-webkit-scrollbar {
  display: none;
}

/* ── Footer ── */
.filter-popup__footer {
  display: flex;
  gap: 10px;
  padding: 12px var(--page-padding) calc(12px + env(safe-area-inset-bottom, 0px));
  flex-shrink: 0;
}

.filter-popup__footer .secondary-btn,
.filter-popup__footer .primary-btn {
  flex: 1;
}

/* ── Content section ── */
.content-section {
  margin-bottom: var(--section-gap);
}

.content-section--compact {
  margin-bottom: 8px;
  padding: 0 var(--page-padding);
}

/* ── Match option tiles (square, label on top, switch below) ── */
.match-tile-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.match-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 72px;
  padding: 10px 6px;
  border: 1px solid var(--app-glass-border);
  border-radius: var(--radius-small);
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.match-tile:active {
  transform: scale(0.97);
}

.match-tile--active {
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
  background: color-mix(in srgb, var(--app-surface) 96%, var(--app-text) 4%);
  color: var(--app-text);
}

.match-tile__label {
  font-size: var(--font-small);
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.match-tile__switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 24px;
  flex-shrink: 0;
}

.match-tile__slider {
  position: absolute;
  inset: 0;
  background-color: var(--app-surface-muted, #e5e5ea);
  transition: background-color 0.25s ease;
  border-radius: var(--radius-large);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

.match-tile__slider::before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.08);
}

.match-tile__switch--on .match-tile__slider {
  background-color: var(--app-chip-accent-text);
}

.match-tile__switch--on .match-tile__slider::before {
  transform: translateX(16px);
}

html.theme-dark .match-tile__slider {
  background-color: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

html.theme-dark .match-tile__slider::before {
  background-color: #f5f5f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

html.theme-dark .match-tile__switch--on .match-tile__slider {
  background-color: var(--app-chip-accent-text);
}

.match-mode-hint {
  margin: 6px 0 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-small);
  line-height: 1.4;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.advanced-toggle {
  display: block;
  width: 100%;
  padding: 18px;
  border: 1px solid var(--app-glass-border);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
  box-shadow: var(--app-shadow), inset 0 0 0 1px color-mix(in srgb, var(--app-text) 2%, transparent);
  text-align: left;
  transition: transform 0.14s ease, opacity 0.16s ease;
}

.advanced-toggle:active {
  transform: scale(0.988);
}

.advanced-toggle__inner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.advanced-toggle__hero {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.advanced-toggle__hero .section-label,
.advanced-toggle__hero .section-title,
.advanced-summary {
  margin: 0;
}

.advanced-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-small);
  color: var(--app-text-secondary);
}

.advanced-toggle__count {
  display: inline-block;
  padding: 2px 6px;
  border: 1px solid var(--app-glass-border);
  border-radius: var(--radius-tiny);
  background: color-mix(in srgb, var(--app-glass) 82%, var(--app-surface));
  color: var(--app-text);
  font-size: var(--font-caption);
  font-weight: 500;
}

.advanced-toggle__icon svg {
  width: 18px;
  height: 18px;
  stroke: var(--app-text-secondary);
  stroke-width: 2;
  transition: transform 0.2s ease;
}

.advanced-toggle__arrow--open {
  transform: rotate(180deg);
}

.advanced-panel-enter-active,
.advanced-panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.advanced-panel-enter-from,
.advanced-panel-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.advanced-panel-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-label {
  margin: 0;
  font-size: var(--font-caption);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--app-text-tertiary);
}

.section-title {
  margin: 2px 0 0;
  font-size: var(--font-title-lg);
  font-weight: 700;
  color: var(--app-text);
}

.section-title--sub {
  font-size: var(--font-title);
}

.section-title--tight {
  margin-top: 2px;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Buttons ── */
.ghost-btn {
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
}

.ghost-btn:active {
  background: var(--app-surface-soft);
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--button-height);
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-text);
  color: var(--app-bg);
  font-size: var(--font-subtitle);
  font-weight: 600;
}

.primary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--button-height);
  padding: 0 20px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-small);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-subtitle);
  font-weight: 600;
}

.secondary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Surface card ── */
.surface-card {
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
}

.muted-copy {
  color: var(--app-text-tertiary);
  font-size: var(--font-body-lg);
}

/* ── Preset list ── */
.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-card {
  display: flex;
  align-items: stretch;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  overflow: hidden;
}

.preset-card--active {
  box-shadow: inset 0 0 0 2px var(--app-pending);
}

.preset-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  text-align: left;
}

.preset-name {
  font-size: var(--font-subtitle);
  font-weight: 600;
  color: var(--app-text);
}

.preset-meta {
  font-size: var(--font-small);
  color: var(--app-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.preset-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
}

.preset-delete svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Preset editor ── */
.preset-editor {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preset-editor .head-actions {
  margin-top: 4px;
}

/* ── Filter card ── */
.filter-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 价格 / 备注 / 星标同组区块：内部等距，与 filter-card 节奏一致 */
.field-grid {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--app-text-secondary);
}

.field-toggle {
  border: none;
  background: transparent;
  color: var(--app-pending);
  font-size: var(--font-body);
  font-weight: 600;
}

.profile-entry-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-entry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  margin-top: 2px;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-pill);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: var(--font-small);
  font-weight: 600;
}

.profile-entry svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.profile-entry:active {
  transform: scale(0.97);
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border, rgba(20, 20, 22, 0.08));
  border-radius: var(--radius-medium);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-title);
  outline: none;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
  transition: border-color 0.18s ease;
}

.field-input:focus {
  border-color: var(--app-input-focus-border, rgba(20, 20, 22, 0.16));
}

.field-input::placeholder {
  color: var(--app-placeholder);
}

.field-input::-webkit-inner-spin-button,
.field-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.field-input[type='number'] {
  -moz-appearance: textfield;
}

/* ── Range row ── */
.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-row .field-input {
  flex: 1;
  min-width: 0;
}

.range-gap {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-body-lg);
  font-weight: 600;
}

.range-row--date {
  margin-top: 4px;
}

/* ── Date field ── */
.date-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border, rgba(20, 20, 22, 0.08));
  border-radius: var(--radius-medium);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-subtitle);
  text-align: left;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
  transition: border-color 0.18s ease;
}

.date-field:active {
  border-color: var(--app-input-focus-border, rgba(20, 20, 22, 0.16));
}

.date-field__value--placeholder {
  color: var(--app-placeholder);
}

.date-field__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Chips ── */
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 8px 12px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.chip:active {
  transform: scale(0.988);
}

.chip--active {
  background: #141416;
  color: #fff;
}

html.theme-dark .chip--active {
  background: #f5f5f7;
  color: #141416;
}

/* ── Location tree ── */
.location-tree {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

/* ── Dark mode overrides ── */
html.theme-dark .filter-popup__header .icon-btn {
    background: rgba(255, 255, 255, 0.08);
  }

html.theme-dark .chip--active {
    background: #f5f5f7;
    color: #141416;
  }

html.theme-dark .primary-btn {
    background: #f5f5f7;
    color: #141416;
  }

html.theme-dark .secondary-btn {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: #f5f5f7;
  }

html.theme-dark .field-input {
    border-color: rgba(255, 255, 255, 0.05) !important;
    background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
  }

html.theme-dark .field-input:focus {
    border-color: rgba(118, 148, 210, 0.28) !important;
  }

html.theme-dark .date-field {
    border-color: rgba(255, 255, 255, 0.05) !important;
    background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
  }

html.theme-dark .date-field__value--placeholder {
    color: rgba(245, 245, 247, 0.72);
  }

html.theme-dark .date-field__icon {
    stroke: rgba(245, 245, 247, 0.72);
  }

html.theme-dark .preset-card {
    background: rgba(255, 255, 255, 0.04);
  }

html.theme-dark .surface-card {
    background: rgba(255, 255, 255, 0.04);
  }

html.theme-dark .chip {
    background: rgba(255, 255, 255, 0.08);
    color: #f5f5f7;
  }

html.theme-dark .advanced-toggle {
    border-color: rgba(255, 255, 255, 0.1);
    background: color-mix(in srgb, var(--app-surface) 90%, var(--app-glass));
    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.22),
      inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  }

html.theme-dark .advanced-toggle__count {
    border-color: rgba(255, 255, 255, 0.1);
    background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
    color: var(--app-text);
  }
</style>
