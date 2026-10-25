<template>
  <AppSheet
    v-model="visible"
    placement="auto"
    sheet-class="fine-export-sheet"
    :close-on-overlay="!isExporting"
  >
    <div class="fine-export">
      <header class="fe-header">
        <div class="fe-header__copy">
          <p class="fe-kicker">{{ t('manage.fineExportKicker') }}</p>
          <h2 class="fe-title">{{ t('manage.fineExportTitle') }}</h2>
          <p class="fe-subtitle">{{ t('manage.fineExportSubtitle') }}</p>
        </div>
        <button class="fe-close" type="button" :aria-label="t('common.cancel')" @click="closeMain">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div class="fe-body">
        <!-- ── 字段 ── -->
        <section class="fe-section">
          <header class="fe-section__head">
            <div>
              <h3 class="fe-section__title">{{ t('manage.fineExportFieldsTitle') }}</h3>
              <p class="fe-section__hint">{{ t('manage.fineExportFieldsHint') }}</p>
            </div>
            <span class="fe-section__meta">
              {{ t('manage.fineExportFieldCount', { selected: selectedSelectableFields.length, total: selectableFields.length }) }}
            </span>
          </header>

          <div
            v-for="group in fieldGroups"
            :key="group.key"
            class="fe-field-group"
          >
            <div class="fe-group-head">
              <button
                class="fe-group-toggle"
                type="button"
                :aria-expanded="!collapsedGroups[group.key]"
                @click="collapsedGroups[group.key] = !collapsedGroups[group.key]"
              >
                <svg
                  class="fe-chevron"
                  :class="{ 'fe-chevron--closed': collapsedGroups[group.key] }"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
                <span>{{ group.label }}</span>
                <span v-if="group.selectedCount" class="fe-group-badge">{{ group.selectedCount }}</span>
              </button>
              <button
                v-if="group.fields.length"
                class="fe-mini-neutral"
                type="button"
                @click="toggleGroup(group)"
              >
                {{ group.allSelected ? t('common.deselectAll') : t('common.selectAll') }}
              </button>
            </div>

            <div v-show="!collapsedGroups[group.key]" class="fe-chips">
              <button
                v-for="field in group.fields"
                :key="field.key"
                type="button"
                :class="['fe-chip', { 'fe-chip--active': isFieldSelected(field.key) }]"
                @click="toggleField(field.key)"
              >
                <span class="fe-chip__check" aria-hidden="true">✓</span>
                <span>{{ field.label }}</span>
              </button>
              <p v-if="!group.fields.length" class="fe-empty-inline">
                {{ t('manage.fineExportNoCustomFields') }}
              </p>
            </div>
          </div>
        </section>

        <!-- ── 范围 ── -->
        <section class="fe-section">
          <header class="fe-section__head">
            <div>
              <h3 class="fe-section__title">{{ t('manage.fineExportRangeTitle') }}</h3>
              <p class="fe-section__hint">{{ t('manage.fineExportRangeHint') }}</p>
            </div>
          </header>

          <button class="fe-manual-entry" type="button" @click="openPicker">
            <span class="fe-manual-entry__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h10M4 17h7" />
                <path d="M17 13l4 3-4 3" />
              </svg>
            </span>
            <span class="fe-manual-entry__body">
              <span class="fe-manual-entry__title">{{ t('manage.fineExportManualPick') }}</span>
              <span class="fe-manual-entry__desc">{{ t('manage.fineExportManualPickDesc') }}</span>
            </span>
            <span class="fe-manual-entry__meta">
              {{
                pickIds.length
                  ? t('manage.fineExportPickerSelected', { count: pickIds.length })
                  : t('manage.fineExportOpen')
              }}
            </span>
          </button>

          <div v-if="manualPick" class="fe-manual-hint">
            <span>{{ t('manage.fineExportManualModeHint') }}</span>
            <button type="button" @click="exitManualPick">{{ t('manage.fineExportExitManual') }}</button>
          </div>

          <label class="fe-field">
            <span class="fe-field__label">{{ t('manage.fineExportKeywordLabel') }}</span>
            <input
              v-model="filters.keyword"
              class="fe-input"
              type="search"
              :placeholder="t('manage.fineExportKeywordPlaceholder')"
            />
          </label>

          <div
            v-for="dim in rangeDimensions"
            :key="dim.key"
            class="fe-dimension"
          >
            <div class="fe-dimension__head">
              <span class="fe-dimension__label">{{ dim.label }}</span>
              <span v-if="filters[dim.key].length" class="fe-dimension__badge">
                {{ t('manage.fineExportSelectedCount', { count: filters[dim.key].length }) }}
              </span>
              <button
                v-if="chipsOverflow[dim.key]"
                class="fe-expand fe-expand--inline"
                type="button"
                :aria-expanded="!!chipsExpanded[dim.key]"
                @click="chipsExpanded[dim.key] = !chipsExpanded[dim.key]"
              >
                {{
                  chipsExpanded[dim.key]
                    ? t('manage.fineExportCollapse')
                    : t('manage.fineExportExpand', { total: dim.options.length })
                }}
                <svg
                  class="fe-expand__chevron"
                  :class="{ 'fe-expand__chevron--open': chipsExpanded[dim.key] }"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div
              :ref="(el) => setDimensionRef(dim.key, el)"
              class="fe-chips fe-chips--range"
              :class="{ 'fe-chips--collapsed': !chipsExpanded[dim.key] }"
            >
              <button
                v-for="option in dim.options"
                :key="option.value"
                type="button"
                :class="['fe-chip', { 'fe-chip--active': filters[dim.key].includes(option.value) }]"
                @click="toggleFilterValue(dim.key, option.value)"
              >
                <span class="fe-chip__check" aria-hidden="true">✓</span>
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- ── 格式 ── -->
        <section class="fe-section">
          <header class="fe-section__head">
            <div>
              <h3 class="fe-section__title">{{ t('manage.fineExportFormatTitle') }}</h3>
            </div>
          </header>

          <div class="fe-format-grid" role="radiogroup" :aria-label="t('manage.fineExportFormatTitle')">
            <button
              v-for="option in formatOptions"
              :key="option.key"
              type="button"
              role="radio"
              :aria-checked="format === option.key"
              :class="['fe-format-card', { 'fe-format-card--active': format === option.key }]"
              @click="format = option.key"
            >
              <span class="fe-format-card__name">{{ option.name }}</span>
              <span class="fe-format-card__desc">{{ option.desc }}</span>
            </button>
          </div>

          <div v-if="format === 'xlsx'" class="fe-switch-row">
            <span class="fe-switch-row__copy">
              <span class="fe-switch-row__title">{{ t('manage.fineExportEmbedImages') }}</span>
              <span class="fe-switch-row__desc">{{ t('manage.fineExportEmbedImagesDesc') }}</span>
            </span>
            <button
              type="button"
              role="switch"
              :aria-checked="embedImages"
              :class="['fe-switch', { 'fe-switch--on': embedImages }]"
              @click="embedImages = !embedImages"
            >
              <span class="fe-switch__thumb" />
            </button>
          </div>
        </section>
      </div>

      <footer class="fe-footer">
        <div class="fe-footer__summary">
          <span class="fe-footer__count">{{ summaryText }}</span>
          <span class="fe-footer__hint">{{ format === 'xlsx' ? t('manage.fineExportFormatXlsxDesc') : t('manage.fineExportFormatCsvDesc') }}</span>
        </div>
        <div class="fe-footer__actions">
          <button class="fe-btn fe-btn--ghost" type="button" @click="closeMain">
            {{ t('common.cancel') }}
          </button>
          <button class="fe-btn fe-btn--primary" type="button" :disabled="!canExport" @click="startExport">
            {{ t('manage.fineExportStart') }}
          </button>
        </div>
      </footer>

      <div v-if="isExporting" class="fe-progress">
        <div class="fe-progress__card" role="status" aria-live="polite">
          <p class="fe-progress__title">{{ t('manage.fineExportExporting') }}</p>
          <p class="fe-progress__text">{{ progressText }}</p>
          <div class="fe-progress__track">
            <span class="fe-progress__bar" :style="{ width: `${progress.percent}%` }" />
          </div>
          <button class="fe-btn fe-btn--ghost" type="button" @click="cancelExport">
            {{ t('manage.fineExportCancelExport') }}
          </button>
        </div>
      </div>
    </div>
  </AppSheet>

  <!-- ── 逐件挑选二级弹层 ── -->
  <AppSheet v-model="showPicker" placement="auto" sheet-class="fine-picker-sheet">
    <div class="fe-picker">
      <header class="fe-picker__head">
        <div>
          <h2 class="fe-title">{{ t('manage.fineExportPickerTitle') }}</h2>
          <p class="fe-subtitle">{{ t('manage.fineExportPickerDesc') }}</p>
        </div>
        <button class="fe-close" type="button" :aria-label="t('common.cancel')" @click="showPicker = false">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div class="fe-picker__tools">
        <label class="fe-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            v-model="pickerFilters.keyword"
            type="search"
            :placeholder="t('manage.fineExportPickerSearch')"
          />
        </label>
      </div>

      <div class="fe-picker-scope" role="tablist" :aria-label="t('manage.fineExportRangeTitle')">
        <button
          v-for="scope in pickerScopeOptions"
          :key="scope.key"
          type="button"
          role="tab"
          :aria-selected="pickerListScope === scope.key"
          :class="['fe-picker-scope__tab', { 'fe-picker-scope__tab--active': pickerListScope === scope.key }]"
          @click="pickerListScope = scope.key"
        >
          <span>{{ scope.label }}</span>
          <span class="fe-picker-scope__count">{{ scope.count }}</span>
        </button>
      </div>

      <div class="fe-picker__meta">
        <div class="fe-picker-sort-wrap">
          <button
            class="fe-sort-trigger"
            type="button"
            :aria-expanded="showPickerSort"
            :aria-label="t('home.toolbar.sortMethod')"
            @click="showPickerSort = !showPickerSort"
          >
            <svg class="fe-sort-trigger__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 19V5M8 5L5 8M8 5l3 3" />
              <path d="M16 5v14M16 19l-3-3M16 19l3-3" />
            </svg>
            <span class="fe-sort-trigger__label">{{ pickerSortTriggerLabel }}</span>
            <svg
              class="fe-sort-trigger__chevron"
              :class="{ 'fe-sort-trigger__chevron--open': showPickerSort }"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <div
            v-if="showPickerSort"
            class="fe-sort-popover"
            role="dialog"
            :aria-label="t('home.toolbar.sortMethod')"
          >
            <div class="fe-sort-popover__head">
              <span>{{ t('home.toolbar.sortMethod') }}</span>
              <button class="fe-sort-dir" type="button" @click="togglePickerSortDirection">
                {{ pickerSortDirectionLabel }}
              </button>
            </div>
            <button
              v-for="option in pickerSortOptions"
              :key="option.value"
              type="button"
              :class="['fe-sort-option', { 'fe-sort-option--active': pickerSortMode === option.value }]"
              @click="selectPickerSort(option.value)"
            >
              <span class="fe-sort-option__label">{{ option.label }}</span>
              <span class="fe-sort-option__meta">
                {{ pickerSortDirection === 'asc' ? option.ascLabel : option.descLabel }}
              </span>
              <span class="fe-sort-option__check" aria-hidden="true">✓</span>
            </button>
          </div>
        </div>

        <span class="fe-picker__selected">
          {{ t('manage.fineExportPickerSelected', { count: pickIds.length }) }}
        </span>
      </div>

      <div class="fe-picker__layout">
        <aside class="fe-picker__aside">
          <div v-for="dim in pickerDimensions" :key="dim.key" class="fe-picker-dim">
            <div class="fe-dimension__head">
              <span class="fe-dimension__label">{{ dim.label }}</span>
              <span v-if="pickerFilters[dim.key].length" class="fe-dimension__badge">
                {{ t('manage.fineExportSelectedCount', { count: pickerFilters[dim.key].length }) }}
              </span>
              <button
                v-if="dim.options.length > PICKER_ROWS"
                class="fe-expand fe-expand--inline"
                type="button"
                :aria-expanded="!!pickerExpanded[dim.key]"
                @click="pickerExpanded[dim.key] = !pickerExpanded[dim.key]"
              >
                {{
                  pickerExpanded[dim.key]
                    ? t('manage.fineExportCollapse')
                    : t('manage.fineExportExpand', { total: dim.options.length })
                }}
                <svg
                  class="fe-expand__chevron"
                  :class="{ 'fe-expand__chevron--open': pickerExpanded[dim.key] }"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            <div class="fe-picker-dim__list">
              <button
                v-for="option in pickerDimensionOptions(dim)"
                :key="option"
                type="button"
                :class="['fe-picker-option', { 'fe-picker-option--active': pickerFilters[dim.key].includes(option) }]"
                @click="togglePickerFilter(dim.key, option)"
              >
                <span class="fe-picker-option__check" aria-hidden="true">✓</span>
                <span>{{ option }}</span>
              </button>
            </div>
          </div>
          <button class="fe-picker-reset" type="button" @click="clearPickerFilters">
            {{ t('manage.fineExportPickerReset') }}
          </button>
        </aside>

        <section class="fe-picker__main">
          <div
            ref="pickerListRef"
            class="fe-picker__list"
            @scroll.passive="onPickerScroll"
          >
            <button
              v-for="item in pickerDisplayed"
              :key="item.id"
              type="button"
              :class="['fe-pick-row', { 'fe-pick-row--selected': pickIdSet.has(item.id) }]"
              @click="togglePick(item.id)"
            >
              <span class="fe-pick-row__bar" aria-hidden="true" />
              <LazyCachedImage
                class="fe-pick-row__thumb"
                :src="itemCoverSrc(item)"
                :alt="item.name"
                thumb-max-size="160"
                loading="lazy"
              />
              <span class="fe-pick-row__body">
                <span class="fe-pick-row__name">{{ item.name }}</span>
                <span class="fe-pick-row__meta">{{ itemMeta(item) }}</span>
              </span>
              <span class="fe-pick-row__check" aria-hidden="true">✓</span>
            </button>
            <p v-if="!pickerMatches.length" class="fe-empty">
              {{ t('manage.fineExportPickerEmpty') }}
            </p>
            <p v-else class="fe-picker-shown">
              {{ t('manage.fineExportShownCount', { shown: pickerDisplayed.length, total: pickerSorted.length }) }}
            </p>
          </div>
        </section>
      </div>

      <footer class="fe-picker__footer">
        <button
          class="fe-btn fe-btn--ghost"
          type="button"
          :disabled="!pickerMatches.length"
          @click="toggleSelectAll"
        >
          {{ allPickerMatchesSelected ? t('common.deselectAll') : t('common.selectAll') }}
        </button>
        <button class="fe-btn fe-btn--primary" type="button" :disabled="!pickIds.length" @click="finishPicker">
          {{ t('common.done') }}
        </button>
      </footer>
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { showGlobalToast } from '@/utils/globalToast'
import { buildSearchText } from '@/utils/goods/filters'
import { getStatusLabel } from '@/utils/goods/status'
import { ensurePinyin } from '@/utils/pinyin'
import { createHomeSortOptions, sortHomeGoodsList } from '@/utils/goods/homeSort'
import { writeExportPayload } from '@/composables/manage/useManageExport'
import {
  FINE_EXPORT_CONFIG_STORAGE_KEY,
  FINE_EXPORT_FORMAT_CSV,
  FINE_EXPORT_FORMAT_XLSX,
  FINE_EXPORT_STATUS_VALUES,
  buildFineExportFields,
  collectFineExportCharacterOptions,
  collectFineExportFilterOptions,
  countFineExportUnits,
  createDefaultFineExportFilters,
  filterFineExportItems,
  normalizeFineExportConfig,
  resolveFineExportCover
} from '@/utils/table/exportFields'
import {
  FINE_EXPORT_CSV_MIME,
  FINE_EXPORT_XLSX_MIME,
  buildFineExportFilename,
  serializeFineExportCsv
} from '@/utils/table/fineExportSerialize'
import { createFineExportXlsx } from '@/utils/table/fineExportXlsx'

defineOptions({ name: 'FineExportSheet' })

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const goodsStore = useGoodsStore()
const presetsStore = usePresetsStore()

const PICKER_ROWS = 6

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const showPicker = ref(false)
// 使用视图列表：价格排序依赖 totalValueNumber，原始 list 没有这个派生字段。
const allGoods = computed(() => (goodsStore.viewList || goodsStore.list || []).filter((item) => !item?.trashed))

// 逐件挑选会反复搜索同一批谷子：按对象缓存搜索文本，避免每次输入都重算拼音。
const pinyinReady = ref(false)
let searchTextCache = new WeakMap()
function getSearchText(item) {
  // 读取 ref 让依赖它的 computed 在拼音加载完成后自动刷新一次。
  void pinyinReady.value
  const cached = searchTextCache.get(item)
  if (cached != null) return cached
  const text = buildSearchText(item)
  searchTextCache.set(item, text)
  return text
}

const fieldSelection = ref([])
const filters = reactive(createDefaultFineExportFilters())
const format = ref(FINE_EXPORT_FORMAT_CSV)
const embedImages = ref(true)
const collapsedGroups = reactive({ custom: false })
const chipsExpanded = reactive({})
const chipsOverflow = reactive({})
const dimensionEls = new Map()

const manualPick = ref(false)
const pickIds = ref([])
const pickerFilters = reactive({ keyword: '', categories: [], ips: [], characters: [] })
const pickerExpanded = reactive({})
const pickerListScope = ref('collection')
const pickerSortMode = ref('createdAt')
const pickerSortDirection = ref('desc')
const showPickerSort = ref(false)
const pickerVisibleLimit = ref(50)
const pickerListRef = ref(null)
const PICKER_PAGE_SIZE = 50

const isExporting = ref(false)
const progress = reactive({ stage: 'prepare', done: 0, total: 0, percent: 0 })
let abortController = null

function resolveFineExportFieldLabel(field) {
  const fallback = String(field?.label || field?.key || '').trim()
  if (!field?.labelKey) return fallback
  const translated = t(field.labelKey)
  return translated === field.labelKey ? fallback : translated
}

const allFields = computed(() => buildFineExportFields(presetsStore.customFieldDefs || []).map((field) => ({
  ...field,
  label: resolveFineExportFieldLabel(field)
})))

const selectableFields = computed(() => allFields.value.filter((field) => !field.locked))
const selectedFieldSet = computed(() => new Set(fieldSelection.value))
const selectedSelectableFields = computed(() =>
  selectableFields.value.filter((field) => selectedFieldSet.value.has(field.key))
)
const selectedFields = computed(() =>
  allFields.value.filter((field) => field.locked || selectedFieldSet.value.has(field.key))
)

const fieldGroups = computed(() => {
  const definitions = [
    { key: 'profile', label: t('manage.fineExportGroupProfile') },
    { key: 'order', label: t('manage.fineExportGroupOrder') },
    { key: 'custom', label: t('manage.fineExportGroupCustom') }
  ]

  return definitions.map((definition) => {
    const fields = selectableFields.value.filter((field) => field.group === definition.key)
    const selectedCount = fields.filter((field) => selectedFieldSet.value.has(field.key)).length
    return {
      ...definition,
      fields,
      selectedCount,
      allSelected: fields.length > 0 && selectedCount === fields.length
    }
  })
})

const filterOptions = computed(() => collectFineExportFilterOptions(allGoods.value, {
  categories: presetsStore.categories,
  ips: presetsStore.ips,
  characters: presetsStore.characters
}))

const statusOptions = computed(() => FINE_EXPORT_STATUS_VALUES.map((value) => ({
  value,
  label: getStatusLabel(value)
})))

const mainCharacterOptions = computed(() =>
  collectFineExportCharacterOptions(
    allGoods.value,
    { characters: presetsStore.characters || [] },
    filters.ips
  )
)

const rangeDimensions = computed(() => [
  {
    key: 'categories',
    label: t('manage.fineExportCategoryLabel'),
    options: filterOptions.value.categories.map((value) => ({ value, label: value }))
  },
  {
    key: 'ips',
    label: t('manage.fineExportIpLabel'),
    options: filterOptions.value.ips.map((value) => ({ value, label: value }))
  },
  {
    key: 'characters',
    label: t('manage.fineExportCharacterLabel'),
    options: mainCharacterOptions.value.map((value) => ({ value, label: value }))
  },
  {
    key: 'statuses',
    label: t('manage.fineExportStatusLabel'),
    options: statusOptions.value
  }
])

const filteredItems = computed(() => filterFineExportItems(allGoods.value, filters, { getSearchText }))

const pickedItems = computed(() => {
  const byId = new Map(allGoods.value.map((item) => [item.id, item]))
  return pickIds.value.map((id) => byId.get(id)).filter(Boolean)
})

const pickIdSet = computed(() => new Set(pickIds.value))

const scopeItems = computed(() => (manualPick.value ? pickedItems.value : filteredItems.value))
const scopeUnits = computed(() => countFineExportUnits(scopeItems.value))

const summaryText = computed(() => {
  if (manualPick.value) {
    return t('manage.fineExportSummaryManual', {
      records: scopeItems.value.length,
      units: scopeUnits.value
    })
  }
  return t('manage.fineExportSummaryFiltered', {
    records: scopeItems.value.length,
    units: scopeUnits.value
  })
})

const canExport = computed(() =>
  !isExporting.value && selectedSelectableFields.value.length > 0 && scopeItems.value.length > 0
)

const formatOptions = computed(() => [
  {
    key: FINE_EXPORT_FORMAT_CSV,
    name: t('manage.fineExportFormatCsv'),
    desc: t('manage.fineExportFormatCsvDesc')
  },
  {
    key: FINE_EXPORT_FORMAT_XLSX,
    name: t('manage.fineExportFormatXlsx'),
    desc: t('manage.fineExportFormatXlsxDesc')
  }
])

const pickerScopeOptions = computed(() => {
  const collectionCount = allGoods.value.filter((item) => !item.isWishlist).length
  const wishlistCount = allGoods.value.filter((item) => item.isWishlist).length
  return [
    { key: 'collection', label: t('manage.fineExportCollection'), count: collectionCount },
    { key: 'wishlist', label: t('manage.fineExportWishlist'), count: wishlistCount }
  ]
})

const pickerSortOptions = computed(() => createHomeSortOptions(t))
const currentPickerSortOption = computed(() =>
  pickerSortOptions.value.find((option) => option.value === pickerSortMode.value) || pickerSortOptions.value[0]
)
const pickerSortDirectionLabel = computed(() =>
  pickerSortDirection.value === 'asc'
    ? t('manage.fineExportSortAsc')
    : t('manage.fineExportSortDesc')
)
const pickerSortTriggerLabel = computed(() => {
  const option = currentPickerSortOption.value
  if (!option) return t('manage.fineExportSort')
  if (option.value === 'custom') return option.label
  return `${option.label} · ${pickerSortDirection.value === 'asc' ? option.ascLabel : option.descLabel}`
})

const progressText = computed(() => {
  switch (progress.stage) {
    case 'images':
      return t('manage.fineExportStageImages', { done: progress.done, total: progress.total })
    case 'build':
      return t('manage.fineExportStageBuild')
    case 'save':
      return t('manage.fineExportStageSave')
    case 'done':
      return t('manage.fineExportStageSave')
    default:
      return t('manage.fineExportStagePrepare')
  }
})

const pickerCharacterOptions = computed(() =>
  collectFineExportCharacterOptions(
    allGoods.value,
    { characters: presetsStore.characters || [] },
    pickerFilters.ips
  )
)

const pickerDimensions = computed(() => [
  {
    key: 'categories',
    label: t('manage.fineExportCategoryLabel'),
    options: filterOptions.value.categories
  },
  {
    key: 'ips',
    label: t('manage.fineExportIpLabel'),
    options: filterOptions.value.ips
  },
  {
    key: 'characters',
    label: t('manage.fineExportCharacterLabel'),
    options: pickerCharacterOptions.value
  }
])

const pickerMatches = computed(() => {
  const keyword = pickerFilters.keyword.trim().toLowerCase()
  const wantWishlist = pickerListScope.value === 'wishlist'
  return allGoods.value.filter((item) => {
    if (Boolean(item.isWishlist) !== wantWishlist) return false
    if (keyword && !getSearchText(item).toLowerCase().includes(keyword)) return false
    if (pickerFilters.categories.length > 0 && !pickerFilters.categories.includes(item.category)) {
      return false
    }
    if (pickerFilters.ips.length > 0 && !pickerFilters.ips.includes(item.ip)) {
      return false
    }
    if (pickerFilters.characters.length > 0) {
      const characters = Array.isArray(item.characters) ? item.characters : []
      if (!pickerFilters.characters.some((name) => characters.includes(name))) return false
    }
    return true
  })
})

const pickerSorted = computed(() =>
  sortHomeGoodsList(pickerMatches.value, pickerSortMode.value, pickerSortDirection.value)
)

const allPickerMatchesSelected = computed(() =>
  pickerMatches.value.length > 0 && pickerMatches.value.every((item) => pickIdSet.value.has(item.id))
)

const pickerDisplayed = computed(() => pickerSorted.value.slice(0, pickerVisibleLimit.value))

function onPickerScroll(event) {
  const element = event.currentTarget
  if (!element || pickerVisibleLimit.value >= pickerSorted.value.length) return
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
  if (remaining > 180) return
  pickerVisibleLimit.value += PICKER_PAGE_SIZE
}

function resetPickerScroll() {
  nextTick(() => {
    if (pickerListRef.value) pickerListRef.value.scrollTop = 0
  })
}

function isFieldSelected(key) {
  return selectedFieldSet.value.has(key)
}

function toggleField(key) {
  const next = new Set(fieldSelection.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  fieldSelection.value = [...next]
}

function toggleGroup(group) {
  const keys = group.fields.map((field) => field.key)
  const next = new Set(fieldSelection.value)
  if (group.allSelected) {
    for (const key of keys) next.delete(key)
  } else {
    for (const key of keys) next.add(key)
  }
  fieldSelection.value = [...next]
}

function toggleFilterValue(key, value) {
  const current = Array.isArray(filters[key]) ? filters[key] : []
  filters[key] = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

function setDimensionRef(key, element) {
  if (element) dimensionEls.set(key, element)
  else dimensionEls.delete(key)
}

function measureAllDimensions() {
  for (const dimension of rangeDimensions.value) {
    const element = dimensionEls.get(dimension.key)
    if (!element) continue
    chipsOverflow[dimension.key] = element.scrollHeight > 82
  }
}

function scheduleMeasure() {
  nextTick(() => {
    measureAllDimensions()
  })
}

function pickerDimensionOptions(dimension) {
  if (pickerExpanded[dimension.key]) return dimension.options
  return dimension.options.slice(0, PICKER_ROWS)
}

function togglePickerFilter(key, value) {
  const current = Array.isArray(pickerFilters[key]) ? pickerFilters[key] : []
  pickerFilters[key] = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

function clearPickerFilters() {
  pickerFilters.keyword = ''
  pickerFilters.categories = []
  pickerFilters.ips = []
  pickerFilters.characters = []
}

function selectPickerSort(value) {
  pickerSortMode.value = value
  showPickerSort.value = false
}

function togglePickerSortDirection() {
  pickerSortDirection.value = pickerSortDirection.value === 'asc' ? 'desc' : 'asc'
}

function handlePickerSortOutside(event) {
  if (!showPickerSort.value) return
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.some((node) => node?.classList?.contains('fe-picker-sort-wrap'))) return
  showPickerSort.value = false
}

function openPicker() {
  showPicker.value = true
}

function togglePick(id) {
  if (pickIds.value.includes(id)) {
    pickIds.value = pickIds.value.filter((value) => value !== id)
  } else {
    pickIds.value = [...pickIds.value, id]
  }
}

function toggleSelectAll() {
  const next = new Set(pickIds.value)
  if (allPickerMatchesSelected.value) {
    for (const item of pickerMatches.value) next.delete(item.id)
  } else {
    // 按当前排序加入，保证“全选”后的导出顺序与列表一致。
    for (const item of pickerSorted.value) next.add(item.id)
  }
  pickIds.value = [...next]
}

function finishPicker() {
  manualPick.value = pickIds.value.length > 0
  showPicker.value = false
}

function exitManualPick() {
  pickIds.value = []
  manualPick.value = false
}

function itemCoverSrc(item) {
  return resolveFineExportCover(item).uri || item?.coverImage || item?.image || ''
}

function itemMeta(item) {
  const parts = []
  if (item.ip) parts.push(item.ip)
  if (Array.isArray(item.characters) && item.characters.length > 0) {
    parts.push(item.characters.join(' / '))
  }
  parts.push(`×${Math.max(1, Number(item.quantity) || 1)}`)
  return parts.join(' · ')
}

function closeMain() {
  visible.value = false
}

function resetSessionState() {
  showPicker.value = false
  showPickerSort.value = false
  pickIds.value = []
  manualPick.value = false
  clearPickerFilters()
}

function persistConfig() {
  try {
    const payload = {
      fields: selectableFields.value
        .filter((field) => selectedFieldSet.value.has(field.key))
        .map((field) => field.key),
      filters: {
        keyword: filters.keyword,
        categories: [...filters.categories],
        ips: [...filters.ips],
        characters: [...filters.characters],
        statuses: [...filters.statuses]
      },
      format: format.value,
      embedImages: embedImages.value
    }
    localStorage.setItem(FINE_EXPORT_CONFIG_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage 不可用时静默降级：本次会话仍然可用
  }
}

function applyConfig(config) {
  fieldSelection.value = [...config.fields]
  filters.keyword = config.filters.keyword
  filters.categories = [...config.filters.categories]
  filters.ips = [...config.filters.ips]
  filters.characters = [...config.filters.characters]
  filters.statuses = [...config.filters.statuses]
  format.value = config.format
  embedImages.value = config.embedImages
}

function loadConfig() {
  let raw = null
  try {
    const stored = localStorage.getItem(FINE_EXPORT_CONFIG_STORAGE_KEY)
    raw = stored ? JSON.parse(stored) : null
  } catch {
    raw = null
  }
  applyConfig(normalizeFineExportConfig(raw, {
    customDefs: presetsStore.customFieldDefs || []
  }))
}

async function startExport() {
  if (!selectedSelectableFields.value.length) {
    showGlobalToast(t('manage.fineExportEmptyFields'))
    return
  }
  if (!scopeItems.value.length) {
    showGlobalToast(t('manage.fineExportEmptyScope'))
    return
  }

  const filename = buildFineExportFilename({
    format: format.value,
    prefix: t('manage.fineExportFilenamePrefix')
  })

  isExporting.value = true
  progress.stage = 'prepare'
  progress.done = 0
  progress.total = scopeItems.value.length
  progress.percent = 0

  try {
    let payload
    let mimeType
    if (format.value === FINE_EXPORT_FORMAT_XLSX) {
      abortController = new AbortController()
      payload = await createFineExportXlsx({
        items: scopeItems.value,
        fields: selectedFields.value,
        embedImages: embedImages.value,
        signal: abortController.signal,
        onProgress: (next) => Object.assign(progress, next),
        coverLabel: t('manage.fineExportCover'),
        linkText: t('manage.fineExportLinkText')
      })
      mimeType = FINE_EXPORT_XLSX_MIME
    } else {
      payload = serializeFineExportCsv(scopeItems.value, selectedFields.value)
      mimeType = FINE_EXPORT_CSV_MIME
    }

    const result = await writeExportPayload(payload, filename, { mimeType })
    showGlobalToast(result.message, 4200)
    closeMain()
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (visible.value) showGlobalToast(t('manage.fineExportCancelled'))
    } else {
      showGlobalToast(t('manage.fineExportFailed', { error: error?.message || String(error) }), 4200)
    }
  } finally {
    isExporting.value = false
    abortController = null
  }
}

function cancelExport() {
  abortController?.abort()
}

watch(visible, (open) => {
  if (open) {
    scheduleMeasure()
  } else {
    resetSessionState()
    abortController?.abort()
  }
})

watch(selectedFieldSet, () => {
  persistConfig()
})

watch(filters, () => {
  persistConfig()
  scheduleMeasure()
}, { deep: true })

watch([format, embedImages], () => {
  persistConfig()
})

watch(rangeDimensions, scheduleMeasure, { deep: true })

watch(() => filters.ips.slice(), () => {
  const allowed = new Set(mainCharacterOptions.value)
  const next = filters.characters.filter((name) => allowed.has(name))
  if (next.length !== filters.characters.length) filters.characters = next
})

watch(() => pickerFilters.ips.slice(), () => {
  const allowed = new Set(pickerCharacterOptions.value)
  pickerFilters.characters = pickerFilters.characters.filter((name) => allowed.has(name))
})

watch(pickerMatches, () => {
  pickerVisibleLimit.value = PICKER_PAGE_SIZE
  resetPickerScroll()
})

watch([pickerSortMode, pickerSortDirection], () => {
  pickerVisibleLimit.value = PICKER_PAGE_SIZE
  resetPickerScroll()
})

watch(showPicker, (open) => {
  if (!open) {
    showPickerSort.value = false
    // 点右上角关闭也算确认：勾了记录就切到逐件模式，全部取消则回到筛选模式。
    manualPick.value = pickIds.value.length > 0
    return
  }
  pickerVisibleLimit.value = PICKER_PAGE_SIZE
  resetPickerScroll()
})

watch(() => presetsStore.customFieldDefs, () => {
  const allowed = new Set(selectableFields.value.map((field) => field.key))
  const next = fieldSelection.value.filter((key) => allowed.has(key))
  if (next.length !== fieldSelection.value.length) fieldSelection.value = next
}, { deep: true })

onMounted(() => {
  loadConfig()
  window.addEventListener('resize', scheduleMeasure)
  document.addEventListener('pointerdown', handlePickerSortOutside)
  scheduleMeasure()
  ensurePinyin()
    .then(() => {
      searchTextCache = new WeakMap()
      pinyinReady.value = true
    })
    .catch(() => {
      pinyinReady.value = true
    })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleMeasure)
  document.removeEventListener('pointerdown', handlePickerSortOutside)
  abortController?.abort()
})
</script>

<style scoped>
:global(.app-sheet-overlay--center .fine-export-sheet.app-sheet--center) {
  width: min(560px, calc(100vw - 48px)) !important;
  max-height: min(calc(100dvh - 48px), 860px) !important;
}

:global(.fine-export-sheet .app-sheet__scroll) {
  overflow: hidden;
}

:global(.fine-export-sheet.app-sheet--bottom) {
  max-height: min(calc(100dvh - 24px), 92dvh);
}

:global(.app-sheet-overlay--center .fine-picker-sheet.app-sheet--center) {
  width: min(880px, calc(100vw - 48px)) !important;
  max-height: min(calc(100dvh - 48px), 900px) !important;
}

:global(.fine-picker-sheet .app-sheet__scroll) {
  overflow: hidden;
}

.fine-export,
.fe-picker {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  color: var(--app-text);
}

.fe-header,
.fe-picker__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}

.fe-kicker {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fe-title {
  margin: 4px 0 0;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.fe-subtitle {
  margin: 6px 0 0;
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  line-height: 1.55;
}

.fe-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.fe-close svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.fe-body {
  flex: 1;
  min-height: 0;
  margin-top: 16px;
  padding: 0 2px 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.fe-body::-webkit-scrollbar,
.fe-picker__list::-webkit-scrollbar {
  display: none;
}

.fe-section {
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--app-text) 6%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface) 62%, transparent);
}

.fe-section + .fe-section {
  margin-top: 10px;
}

.fe-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.fe-section__title {
  margin: 0;
  color: var(--app-text);
  font-size: var(--font-title-md, 17px);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.fe-section__hint {
  margin: 4px 0 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  line-height: 1.5;
}

.fe-section__meta {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  white-space: nowrap;
}

.fe-field-group {
  margin-top: 12px;
}

.fe-field-group + .fe-field-group {
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--app-text) 5%, transparent);
}

.fe-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
}

.fe-group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
}

.fe-chevron {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.16s ease;
}

.fe-chevron--closed {
  transform: rotate(-90deg);
}

.fe-group-badge,
.fe-dimension__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 19px;
  height: 19px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-text) 9%, transparent);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.fe-mini-neutral {
  flex-shrink: 0;
  min-height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
}

.fe-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}

.fe-chips--range {
  overflow: hidden;
  transition: max-height 0.18s ease;
}

.fe-chips--collapsed {
  max-height: 80px;
}

.fe-chip {
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-height: 30px;
  max-width: 100%;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--app-text) 5%, transparent);
  border-radius: var(--radius-small);
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  color: var(--app-text-secondary);
  font-size: var(--font-body);
  font-weight: 600;
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.fe-chip:active {
  transform: scale(0.985);
}

/* 未选中时不占位：避免每颗 chip 左侧多出一段“看不见的 ✓”空白 */
.fe-chip__check {
  width: 0;
  overflow: hidden;
  flex-shrink: 0;
  opacity: 0;
  font-size: 11px;
  font-weight: 800;
  transition: width 0.14s ease, opacity 0.14s ease;
}

.fe-chip--active {
  border-color: #141416;
  background: #141416;
  color: #fff;
}

.fe-chip--active .fe-chip__check {
  width: 12px;
  margin-right: 2px;
  opacity: 1;
}

html.theme-dark .fe-chip--active {
  border-color: #f5f5f7;
  background: #f5f5f7;
  color: #141416;
}

.fe-field {
  display: block;
  margin-top: 14px;
}

.fe-field__label,
.fe-dimension__label {
  display: block;
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.fe-input {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  margin-top: 7px;
  padding: 0 14px;
  border: 1px solid var(--app-input-border, rgba(20, 20, 22, 0.08));
  border-radius: var(--radius-medium);
  outline: none;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: var(--font-body-lg);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
}

.fe-input::placeholder {
  color: var(--app-placeholder);
}

.fe-input:focus {
  border-color: var(--app-input-focus-border, rgba(20, 20, 22, 0.18));
}

.fe-dimension {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--app-text) 6%, transparent);
}

.fe-dimension__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
}

.fe-expand {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  font-weight: 600;
  white-space: nowrap;
}

.fe-expand--inline {
  margin-left: auto;
}

.fe-expand__chevron {
  width: 13px;
  height: 13px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.16s ease;
}

.fe-expand__chevron--open {
  transform: rotate(180deg);
}

.fe-manual-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-medium);
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
  color: var(--app-text);
  text-align: left;
}

.fe-manual-entry__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-text) 7%, transparent);
}

.fe-manual-entry__icon svg {
  width: 19px;
  height: 19px;
  stroke: var(--app-text-secondary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.fe-manual-entry__body {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.fe-manual-entry__title {
  color: var(--app-text);
  font-size: var(--font-body-lg);
  font-weight: 600;
}

.fe-manual-entry__desc {
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  line-height: 1.4;
}

.fe-manual-entry__meta {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  font-weight: 600;
}

.fe-manual-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  line-height: 1.45;
}

.fe-manual-hint button {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: var(--font-caption);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.fe-format-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 14px;
}

.fe-format-card {
  display: grid;
  gap: 3px;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--app-text) 7%, transparent);
  border-radius: var(--radius-medium);
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
  color: var(--app-text);
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.fe-format-card--active {
  border-color: #141416;
  background: #141416;
  color: #fff;
}

.fe-format-card__name {
  font-size: var(--font-body-lg);
  font-weight: 700;
}

.fe-format-card__desc {
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  line-height: 1.4;
}

.fe-format-card--active .fe-format-card__desc {
  color: rgba(255, 255, 255, 0.7);
}

html.theme-dark .fe-format-card--active {
  border-color: #f5f5f7;
  background: #f5f5f7;
  color: #141416;
}

html.theme-dark .fe-format-card--active .fe-format-card__desc {
  color: rgba(20, 20, 22, 0.6);
}

.fe-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-medium);
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
}

.fe-switch-row__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.fe-switch-row__title {
  color: var(--app-text);
  font-size: var(--font-body);
  font-weight: 600;
}

.fe-switch-row__desc {
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  line-height: 1.4;
}

.fe-switch {
  position: relative;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--app-text) 18%, transparent);
  transition: background 0.18s ease;
}

.fe-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.18s ease;
}

.fe-switch--on {
  background: var(--app-text);
}

.fe-switch--on .fe-switch__thumb {
  transform: translateX(18px);
}

.fe-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-shrink: 0;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.fe-footer__summary {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.fe-footer__count {
  color: var(--app-text);
  font-size: var(--font-body);
  font-weight: 600;
  line-height: 1.35;
}

.fe-footer__hint {
  color: var(--app-text-tertiary);
  font-size: 11px;
  line-height: 1.35;
}

.fe-footer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.fe-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-medium);
  font-size: var(--font-body);
  font-weight: 600;
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.fe-btn:active {
  transform: scale(0.985);
}

.fe-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.fe-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.fe-btn--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.fe-progress {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border-radius: inherit;
  background: color-mix(in srgb, var(--app-surface) 72%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.fe-progress__card {
  display: grid;
  gap: 10px;
  width: min(100%, 320px);
  padding: 20px;
  border: 1px solid var(--app-glass-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  text-align: center;
}

.fe-progress__title {
  margin: 0;
  color: var(--app-text);
  font-size: var(--font-body-lg);
  font-weight: 700;
}

.fe-progress__text {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  line-height: 1.5;
}

.fe-progress__track {
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--app-surface-soft);
}

.fe-progress__bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--app-text);
  transition: width 0.2s ease;
}

.fe-progress__card .fe-btn {
  width: 100%;
  margin-top: 2px;
}

/* ── 挑选弹层 ── */
.fe-picker__head {
  flex-shrink: 0;
}

.fe-picker__tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 14px;
}

.fe-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--app-input-border, rgba(20, 20, 22, 0.08));
  border-radius: var(--radius-medium);
  background: var(--app-surface);
}

.fe-search svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
}

.fe-search input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-size: var(--font-body);
}

.fe-search input::placeholder {
  color: var(--app-placeholder);
}

.fe-picker__selected {
  flex-shrink: 0;
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
}

.fe-picker-scope {
  display: inline-flex;
  align-self: flex-start;
  gap: 3px;
  flex-shrink: 0;
  margin-top: 10px;
  padding: 3px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
}

.fe-picker-scope__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 31px;
  padding: 0 13px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
}

.fe-picker-scope__tab--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.fe-picker-scope__count {
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.fe-picker__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 10px;
}

.fe-picker-sort-wrap {
  position: relative;
  min-width: 0;
}

.fe-sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  border-radius: var(--radius-pill);
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  font-weight: 600;
}

.fe-sort-trigger__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.fe-sort-trigger__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe-sort-trigger__chevron {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.16s ease;
}

.fe-sort-trigger__chevron--open {
  transform: rotate(180deg);
}

.fe-sort-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 252px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  border-radius: 14px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.fe-sort-popover__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 4px 8px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.fe-sort-dir {
  padding: 5px 9px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.fe-sort-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  text-align: left;
}

.fe-sort-option--active {
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-weight: 600;
}

.fe-sort-option__label {
  flex: 1;
  min-width: 0;
}

.fe-sort-option__meta {
  color: var(--app-text-tertiary);
  font-size: 11px;
  white-space: nowrap;
}

.fe-sort-option__check {
  width: 0;
  overflow: hidden;
  flex-shrink: 0;
  opacity: 0;
  color: var(--app-text);
  font-size: 11px;
  font-weight: 800;
  transition: width 0.14s ease, opacity 0.14s ease;
}

.fe-sort-option--active .fe-sort-option__check {
  width: 12px;
  opacity: 1;
}

.fe-picker__layout {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
  margin-top: 10px;
}

.fe-picker__aside {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--app-text) 5%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface) 55%, transparent);
  overflow-y: auto;
  scrollbar-width: none;
}

.fe-picker__aside::-webkit-scrollbar {
  display: none;
}

.fe-picker-dim + .fe-picker-dim {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--app-text) 6%, transparent);
}

.fe-picker-dim__list {
  display: grid;
  gap: 2px;
  margin-top: 5px;
  /* 固定预留 6 行：选完 IP 后角色变少时左侧栏高度不塌，避免整栏跳动 */
  min-height: calc(6 * 27px + 5 * 2px);
  align-content: start;
}

.fe-picker-option {
  display: flex;
  align-items: center;
  gap: 0;
  width: 100%;
  min-height: 27px;
  padding: 0 6px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: var(--font-caption);
  text-align: left;
}

.fe-picker-option__check {
  width: 0;
  overflow: hidden;
  flex-shrink: 0;
  opacity: 0;
  font-size: 10px;
  font-weight: 800;
  transition: width 0.14s ease, opacity 0.14s ease;
}

.fe-picker-option--active {
  background: var(--app-surface);
  color: var(--app-text);
  font-weight: 600;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--app-text) 4%, transparent);
}

.fe-picker-option--active .fe-picker-option__check {
  width: 12px;
  margin-right: 3px;
  opacity: 1;
}

.fe-picker-reset {
  align-self: flex-start;
  margin-top: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.fe-picker__main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fe-picker__list {
  flex: 1;
  min-height: 0;
  padding-right: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.fe-pick-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 4%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--app-text);
  text-align: left;
  /* 长列表滚动优化：只绘制视口附近的记录 */
  content-visibility: auto;
  contain-intrinsic-size: auto 65px;
}

.fe-pick-row:first-child {
  border-radius: 10px 10px 0 0;
}

.fe-pick-row:last-of-type {
  border-bottom: none;
  border-radius: 0 0 10px 10px;
}

.fe-pick-row--selected {
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
}

.fe-pick-row__bar {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: var(--radius-pill);
  background: transparent;
}

.fe-pick-row--selected .fe-pick-row__bar {
  background: var(--app-text);
}

.fe-pick-row__thumb {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 10px;
  background: var(--app-surface-soft);
}

.fe-pick-row__body {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.fe-pick-row__name {
  overflow: hidden;
  color: var(--app-text);
  font-size: var(--font-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe-pick-row__meta {
  overflow: hidden;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe-pick-row__check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--app-text-secondary) 24%, transparent);
  border-radius: 50%;
  color: transparent;
  font-size: 11px;
  font-weight: 800;
}

.fe-pick-row--selected .fe-pick-row__check {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-surface);
}

.fe-empty,
.fe-empty-inline {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: var(--font-caption);
  line-height: 1.5;
}

.fe-empty {
  padding: 40px 12px;
  text-align: center;
}

.fe-picker-shown {
  margin: 0;
  padding: 14px 8px 18px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  text-align: center;
}

.fe-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

@media (max-width: 700px) {
  :global(.fine-picker-sheet.app-sheet--bottom) {
    height: 95dvh;
    max-height: 95dvh;
  }

  .fe-picker__layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(120px, 36%) minmax(0, 1fr);
    gap: 12px;
  }

  .fe-picker__aside {
    padding: 10px;
  }

  .fe-picker__tools {
    align-items: stretch;
  }

  .fe-picker-scope {
    align-self: stretch;
  }

  .fe-picker-scope__tab {
    flex: 1;
    justify-content: center;
  }

  .fe-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .fe-footer__actions {
    width: 100%;
  }

  .fe-footer__actions .fe-btn {
    flex: 1;
  }
}

@media (max-width: 420px) {
  .fe-format-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .fe-picker__footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .fe-picker__footer .fe-btn {
    width: 100%;
  }
}
</style>
