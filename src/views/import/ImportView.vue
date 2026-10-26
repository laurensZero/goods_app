<template>
  <ImportPage class="import-page" :title="pageTitle">
    <template #right>
      <!-- 内嵌购物车/账号 Tab 的切号胶囊 Teleport 目标（同 NavBar 右上角） -->
      <div id="import-nav-account-slot" />
    </template>
    <main class="page-body">
      <ImportTabs v-model="activeTab" :tabs="importTabs" :aria-label="pageTitle" />

      <ImportSearchCard
        v-model="searchKeyword"
        v-show="activeTab === 'search'"
        :label="quickSearchLabel"
        :title="quickSearchTitle"
        :placeholder="quickSearchPlaceholder"
        :searching="searching"
        :error="searchError"
        @search="handleGoodsSearch"
      >
        <!-- v-memo：deps 不含 activeTab，切 Tab 时父组件重渲染会整段跳过，避免大列表重建拖垮 INP -->
        <div
          v-memo="[
            visibleSearchResults,
            queue.length,
            searchExpanded,
            showSearchToggle,
            showSearchLoadMoreStatus,
            searchLoadingMore,
          ]"
        >
        <div v-if="visibleSearchResults.length > 0" class="search-results-toolbar">
            <span class="search-results-toolbar__hint">{{ t('import.searchAddHint') }}</span>
            <span v-if="queue.length > 0" class="search-results-toolbar__actions">
              <span class="search-results-toolbar__count">{{ t('import.queueSelectedCount', { count: queue.length }) }}</span>
              <button type="button" class="search-results-toolbar__clear" @click="clearQueue">
                {{ t('import.clearQueue') }}
              </button>
            </span>
          </div>

          <div v-if="visibleSearchResults.length > 0" class="search-results">
            <button
              v-for="item in visibleSearchResults"
              :key="item.goods_id"
              type="button"
              class="search-result-card"
              :class="{ 'search-result-card--selected': isQueued(item) }"
              @click="onSearchResultClick(item)"
            >
              <div class="search-result-thumb">
                <img v-if="getSearchResultCover(item)" :src="getSearchResultCover(item)" :alt="item.name" loading="lazy" />
                <span v-else>{{ (item.name || '?').charAt(0) }}</span>
              </div>
              <span class="search-result-name">{{ item.name }}</span>
              <span
                v-if="isQueued(item)"
                class="search-result-queued"
                :aria-label="t('mihoyoStock.inQueue')"
                :title="t('mihoyoStock.inQueue')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </button>
          </div>

          <div v-if="showSearchToggle" class="search-results-toggle-wrap">
            <button
              type="button"
              class="search-results-toggle"
              :class="{ 'search-results-toggle--expanded': searchExpanded }"
              @click="toggleSearchExpanded"
            >
              {{ searchExpanded ? t('import.collapseResults') : t('import.expandMore') }}
            </button>
          </div>

          <div
            v-if="showSearchLoadMoreStatus"
            ref="searchLoadMoreRef"
            class="search-results-status"
          >
            <span v-if="searchLoadingMore">{{ t('import.loadingMore') }}</span>
            <template v-else>
              <span>{{ t('import.scrollForMore') }}</span>
              <button type="button" class="search-results-load-more" @click="loadMoreSearchResults">
                {{ t('import.loadMore') }}
              </button>
            </template>
          </div>
        </div>
      </ImportSearchCard>

      <!-- ① URL 输入区（Tab 2：链接导入）；外层管显示，内层 v-memo 切 Tab 时跳过重建 -->
      <div v-show="activeTab === 'link'" class="url-section-wrap">
      <section class="url-section" v-memo="[urlInput, parsingLinks, batchParseButtonText, urlHintText, urlPlaceholder]">
        <div class="url-card">
          <div class="url-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div class="url-body">
            <p class="url-hint">{{ urlHintText }}</p>
            <div class="url-input-row">
              <textarea
                ref="urlInputRef"
                :value="urlInput"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                class="url-input"
                :placeholder="urlPlaceholder"
                @input="syncUrlInput($event)"
                @blur="syncUrlInput($event)"
                @change="syncUrlInput($event)"
                @compositionend="syncUrlInput($event)"
                @paste="syncUrlInputLater"
              />
              <button
                class="btn-parse"
                :class="{ 'btn-parse--loading': parsingLinks }"
                :disabled="parsingLinks"
                @pointerdown="syncUrlInput()"
                @click="handleBatchImport()"
              >
                <span v-if="!parsingLinks">{{ batchParseButtonText }}</span>
                <span v-else class="parse-spinner" />
              </button>
            </div>
          </div>
        </div>
      </section>
      </div>

      <!-- 批量链接解析进度（多链接 / 带数量入队解析时显示） -->
      <transition name="result-fade">
        <section v-if="parsingLinks" class="batch-section">
          <div class="section-head">
            <p class="section-label">{{ t('import.batchParse') }}</p>
            <h2 class="section-title">{{ t('import.identifyingProgress', { done: linkProgress.done, total: linkProgress.total }) }}</h2>
          </div>
          <div class="field-card batch-progress-card">
            <div class="batch-progress-row">
              <span class="batch-status-indicator batch-si--parsing">
                <span class="parse-spinner batch-spinner" />
              </span>
              <span class="batch-progress-text">{{ t('import.identifyingLinks') }}</span>
            </div>
          </div>
          <button class="batch-reparse-link" type="button" @click="stopBatchParsing">
            {{ t('import.stopParsing') }}
          </button>
        </section>
      </transition>

      <!-- 待导入队列：手机端左右滑动、平板端右侧条切换；选择款式 + 填入/修改信息 -->
      <!-- 与有货监控共用同一套队列面板（MihoyoGoodsQueuePanel + useMihoyoGoodsQueue） -->
      <!-- v-memo 锁在外层 div：切购物车/账号等无关重渲染时跳过整块面板；activeUid/布局变化仍放行 -->
      <section v-if="queue.length > 0" v-show="activeTab === 'search'" class="queue-section">
        <div v-memo="[activeUid, isTabletViewport]">
        <MihoyoGoodsQueuePanel
          ref="queuePanelRef"
          :queue="queue"
          :active-uid="activeUid"
          :is-tablet="isTabletViewport"
          :queue-summary="queueSummary"
          @activate="activateQueueEntry($event, { scrollDeck: true })"
          @remove="removeFromQueue($event)"
          @deck-scroll="onDeckScroll"
        >
          <template #slide="{ entry }">
            <div class="import-queue-slide">
              <!-- 链接解析失败项：留在队列里可重试/移除 -->
              <div v-if="entry.parseFailed" class="queue-parse-error">
                <span class="queue-parse-error__thumb">
                  <span class="queue-parse-error__initial">{{ (entry.name || '?').charAt(0) }}</span>
                </span>
                <div class="queue-parse-error__copy">
                  <p class="queue-parse-error__title">{{ entry.name }}</p>
                  <p class="queue-parse-error__msg">{{ entry.parseError || t('import.linkParseFailed') }}</p>
                </div>
                <button
                  type="button"
                  class="queue-parse-error__retry"
                  :disabled="entry.loading"
                  @click="retryParseLink(entry)"
                >
                  <span v-if="entry.loading" class="parse-spinner" />
                  <span v-else>{{ t('import.retryParse') }}</span>
                </button>
                <button
                  type="button"
                  class="queue-parse-error__remove"
                  :aria-label="t('common.remove')"
                  @click="removeFromQueue(entry.uid)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <template v-else>
                <!-- 款式选择（共享 SKU 卡片：自动选款 / 多选 / 整件） -->
                <MihoyoSkuPickerCard
                  :entry="entry"
                  :show-remove="queue.length > 1"
                  :counter="queue.length > 1 ? `${queue.indexOf(entry) + 1} / ${queue.length}` : ''"
                  :label="t('import.selectVariant')"
                  :multi-select="false"
                  :show-whole="false"
                  :large-thumb="true"
                  @select-skus="setEntrySkus(entry, $event)"
                  @select-whole="selectWholeGoods(entry)"
                  @expand="expandSkuPicker(entry)"
                  @collapse="collapseSkuPicker(entry)"
                  @retry="retryLoadVariants(entry)"
                  @remove="removeFromQueue(entry.uid)"
                />

                <!-- 信息编辑（展开/收起）：按钮与上方 SKU 卡片的「修改款式」按钮右侧对齐 -->
                <div class="import-queue-info">
                  <div class="import-queue-info__head">
                    <span v-if="isQueueItemOwned(entry)" class="queue-owned-tag">{{ t('import.maybeOwned') }}</span>
                    <!-- 收起态展示基础信息：IP / 分类 / 角色 -->
                    <div v-if="!entry.infoExpanded" class="queue-info-mini">
                      <span v-if="entry.info.ip" class="queue-mini-chip">{{ entry.info.ip }}</span>
                      <span v-if="entry.info.category" class="queue-mini-chip">{{ entry.info.category }}</span>
                      <span
                        v-for="char in entry.info.characters"
                        :key="char"
                        class="queue-mini-chip queue-mini-chip--char"
                      >{{ char }}</span>
                    </div>
                    <button
                      type="button"
                      class="info-toggle"
                      :class="{ 'info-toggle--open': entry.infoExpanded }"
                      @click="entry.infoExpanded = !entry.infoExpanded"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-toggle__icon">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span>{{ entry.infoExpanded ? t('import.collapseInfo') : t('import.editInfo') }}</span>
                    </button>
                  </div>

                  <div v-if="entry.infoExpanded && entry.info" class="info-fields field-card">
                    <label class="field">
                      <span class="field-label">{{ t('common.name') }} <span class="required">*</span></span>
                      <input v-model="entry.name" type="text" :placeholder="t('import.goodsName')" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('common.category') }}</span>
                      <AppSelect v-model="entry.info.category" :options="presets.categories" :placeholder="t('import.selectCategory')" />
                    </label>
                    <label class="field">
                      <span class="field-label">IP</span>
                      <AppSelect v-model="entry.info.ip" :options="presets.ips" :placeholder="t('import.selectIp')" />
                    </label>
                    <!-- 智能识别建议（分类/IP/角色/标签） -->
                    <div class="field">
                      <span class="field-label">{{ t('common.character') }}</span>
                      <ImportCharacterPicker v-model="entry.info.characters" :ip="entry.info.ip" />
                    </div>
                    <ImportQueueTagSuggestions :entry="entry" />
                    <label class="field">
                      <span class="field-label">{{ t('import.price') }}</span>
                      <input v-model.number="entry.info.price" type="number" placeholder="0.00" min="0" step="1" />
                    </label>
                    <!-- 图片选择（支持多选） -->
                    <ImportImagePicker
                      v-if="entry.parsedImages.length > 1"
                      :model-value="entry.info.images"
                      :images="entry.parsedImages"
                      thumb-query="?x-oss-process=image/resize,m_lfit,w_120,h_120,limit_1/format,webp"
                      @update:model-value="(v) => setQueueImages(entry, v)"
                    />
                    <label class="field">
                      <span class="field-label">{{ t('import.imageUrl') }}</span>
                      <input v-model="entry.info.image" type="text" inputmode="url"
                        autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"
                        placeholder="https://..." />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ isWishlistMode ? t('import.expectedDate') : t('import.purchaseDate') }}</span>
                      <button class="date-field" type="button" @click="openQueueDatePicker(entry)">
                        <span :class="{ 'date-field__value--placeholder': !entry.info.purchaseDate }">
                          {{ entry.info.purchaseDate || (isWishlistMode ? t('import.optionalNoPlan') : t('import.selectDate')) }}
                        </span>
                        <svg class="date-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="3" y="5" width="18" height="16" rx="3" />
                          <path d="M8 3V7" />
                          <path d="M16 3V7" />
                          <path d="M3 10H21" />
                        </svg>
                      </button>
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('common.note') }}</span>
                      <textarea
                        v-model="entry.info.notes"
                        class="markdown-textarea"
                        :placeholder="t('import.notesPlaceholder')"
                        rows="3"
                      />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('common.tag') }}</span>
                      <TagInput v-model="entry.info.tags" :placeholder="t('import.tagsPlaceholder')" />
                    </label>
                  </div>
                </div>
              </template>
            </div>
          </template>

          <template #actions>
            <button
              class="confirm-btn confirm-btn--ghost"
              type="button"
              :disabled="savingAll || parsingLinks"
              @click="clearQueue"
            >
              {{ t('import.clearQueue') }}
            </button>
            <button
              class="confirm-btn confirm-btn--primary"
              type="button"
              :disabled="savingAll || parsingLinks || !queue.length"
              @click="confirmImportQueue"
            >
              <svg v-if="savingAll" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9" stroke-dasharray="60" />
              </svg>
              <span>{{ t('import.confirmImportCount', { count: queueImportCount }) }}</span>
            </button>
          </template>
        </MihoyoGoodsQueuePanel>
        </div>
      </section>

      <!-- 购物车 / 账号导入：独立视图内嵌为 tab，首次切到时才挂载（避免进页就拉账号状态） -->
      <!-- v-show 挪到 display:contents 包装层：组件节点上的 v-show 会在父级任何重渲染时强制子组件重渲染，切 Tab 变卡 -->
      <div v-show="activeTab === 'cart'" style="display: contents">
        <CartImportView
          v-if="tabMounted.cart"
          embedded
          :embedded-active="activeTab === 'cart'"
        />
      </div>
      <div v-show="activeTab === 'account'" style="display: contents">
        <AccountImportView
          v-if="!isWishlistMode && tabMounted.account"
          embedded
          :embedded-active="activeTab === 'account'"
        />
      </div>

      <!-- 批量导入结果列表已迁移到上方共享队列面板（MihoyoGoodsQueuePanel） -->
      <!-- 底部空白，防止内容被浮动按钮遮挡 -->
      <div style="height: 120px" />
    </main>

    <!-- 队列项日期选择器 -->
    <AppDatePicker
      v-model:show="showQueueDatePicker"
      v-model="queueDatePickerValue"
      :z-index="2100"
      :is-tablet="isTabletViewport"
      :title="t('import.selectPurchaseDate')"
      :min-date="minDate"
      :max-date="maxDate"
      @confirm="onQueueDateConfirm"
    />
  </ImportPage>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { formatDate } from '@/utils/format'
import { useTabletViewport } from '@/composables/viewport/useTabletViewport'
import ImportPage from '@/components/import/ImportPage.vue'
import ImportSearchCard from '@/components/import/ImportSearchCard.vue'
import ImportImagePicker from '@/components/import/ImportImagePicker.vue'
import ImportTabs from '@/components/import/ImportTabs.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import TagInput from '@/components/common/TagInput.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { showGlobalToast } from '@/utils/globalToast'
import {
  addMihoyoImportContextItem,
  buildMihoyoImportContext,
} from '@/utils/mihoyo/importResolver'
import { useMihoyoGoodsSearch, normalizeSearchHintText } from '@/composables/import/useMihoyoGoodsSearch'
import { useBatchImport } from '@/composables/import/useBatchImport'
import { getSharedTaggingContext, warmTaggingContext } from '@/utils/tagging/taggingContextCache'
import MihoyoSkuPickerCard from '@/components/my/mihoyoStock/MihoyoSkuPickerCard.vue'
import MihoyoGoodsQueuePanel from '@/components/my/mihoyoStock/MihoyoGoodsQueuePanel.vue'
import ImportQueueTagSuggestions from '@/components/import/ImportQueueTagSuggestions.vue'
import ImportCharacterPicker from '@/components/import/ImportCharacterPicker.vue'

// 购物车/账号是独立重视图：拆异步 chunk；进页首帧后立刻预下载 + 预挂载（见下）
const loadCartImportView = () => import('@/views/import/CartImportView.vue')
const loadAccountImportView = () => import('@/views/import/AccountImportView.vue')
// setup 阶段就发起下载，首帧后挂载时 chunk 多半已在缓存
const cartChunkWarm = loadCartImportView().catch(() => {})
const accountChunkWarm = loadAccountImportView().catch(() => {})
const CartImportView = defineAsyncComponent({
  loader: loadCartImportView,
  delay: 0,
})
const AccountImportView = defineAsyncComponent({
  loader: loadAccountImportView,
  delay: 0,
})

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const goodsStore = useGoodsStore()
const presets = usePresetsStore()

const isWishlistMode = computed(() => route.query.mode === 'wishlist')
const pageTitle = computed(() => isWishlistMode.value ? t('import.wishlistTitle') : t('import.mihoyo'))
const quickSearchLabel = computed(() => isWishlistMode.value ? t('import.wishlistQuickSearch') : t('import.mihoyoQuickSearch'))
const quickSearchTitle = computed(() => isWishlistMode.value ? t('import.searchByCharacter') : t('import.searchByKeyword'))
const quickSearchPlaceholder = computed(() => (
  isWishlistMode.value
    ? t('import.wishlistSearchPlaceholder')
    : t('import.searchPlaceholder')
))

const urlHintText = computed(() =>
  isWishlistMode.value
    ? t('import.wishlistUrlHint')
    : t('import.urlHint')
)
const urlPlaceholder = computed(() =>
  isWishlistMode.value
    ? t('import.wishlistUrlPlaceholder')
    : t('import.urlPlaceholder')
)

const { isTabletViewport, updateViewport } = useTabletViewport()

const urlInputRef = ref(null)
const urlInput = ref('')

// ── Composables ──
const search = useMihoyoGoodsSearch({ scrollRootSelector: '.import-page .page-body' })
const {
  searchKeyword, searchExpanded, searching, searchLoadingMore, searchError,
  variantSearchHint, selectedSearchCharacter, searchLoadMoreRef,
  visibleSearchResults, showSearchToggle, showSearchLoadMoreStatus,
  getSearchResultCover, handleGoodsSearch, loadMoreSearchResults, toggleSearchExpanded, selectSearchResult,
} = search

// 队列项日期选择器
const queuePanelRef = ref(null)

function getSearchContext() {
  return {
    hint: normalizeSearchHintText(variantSearchHint.value),
    preferredCharacter: preferredSearchCharacterName.value,
  }
}

const {
  queue, activeUid, isQueued, getQueuedEntry,
  enqueueFromSearch, activateQueueEntry, onDeckScroll, removeFromQueue, clearQueue,
  selectWholeGoods, expandSkuPicker, collapseSkuPicker, retryLoadVariants,
  batchParseButtonText, parsingLinks, linkProgress,
  savingAll, queueImportCount, isQueueItemOwned, queueSummary,
  handleBatchImport, stopBatchParsing, retryParseLink, confirmImportQueue,
  setEntrySkus,
} = useBatchImport({
  urlInput, urlInputRef, syncUrlInput, isWishlistMode,
  ensureHistoricalTagContext, updateHistoricalTagContextFromItem,
  getSearchContext,
  getDeckEl: () => queuePanelRef.value?.deckEl || null,
})

// ── 页内 Tab：搜索/队列 与 链接导入（搜索加购与队列是同一闭环，不拆开） ──
const activeTab = ref('search')
const importTabs = computed(() => [
  { key: 'search', label: t('import.mihoyoTabSearch'), badge: queue.value.length > 0 ? String(queue.value.length) : '' },
  { key: 'link', label: t('import.mihoyoTabLink') },
  { key: 'cart', label: t('import.mihoyoTabCart') },
  ...(isWishlistMode.value ? [] : [{ key: 'account', label: t('import.mihoyoTabAccount') }]),
])
// 购物车/账号是独立视图，首次切到时才挂载（避免进页就拉账号/Cookie 状态）
const tabMounted = reactive({ search: true, link: true, cart: false, account: false })
let tabMountRaf = 0
// 卸载后要停掉的延迟任务：隐藏挂载、历史标签上下文预热、共享缓存空闲预热
let unmounted = false
let tagSeedTimer = 0
let cancelTagWarmup = null
watch(activeTab, (tab) => {
  if (tabMounted[tab]) return
  // 先让 Tab 切换本身完成绘制，再挂载重型子视图；同步首挂会把 button.import-tab 的 INP 拉到秒级
  cancelAnimationFrame(tabMountRaf)
  tabMountRaf = requestAnimationFrame(() => {
    tabMounted[tab] = true
  })
})
// 链接解析（含单条）的结果统一落在队列（搜索 tab），进度结束自动切过去
watch(parsingLinks, (now, was) => {
  if (was && !now) activeTab.value = 'search'
})

// ── 日期选择器（队列项编辑用） ──
const showQueueDatePicker = ref(false)
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)
const queueDatePickerValue = ref(toDatePickerValue(''))
const queueDateEntry = ref(null) // 正在编辑日期的队列项

const preferredSearchCharacterName = computed(() =>
  normalizeSearchHintText(selectedSearchCharacter.value || searchKeyword.value)
)

let historicalTagContextCache = null

function seedHistoricalTagContextFromGoods() {
  historicalTagContextCache = buildMihoyoImportContext({
    goodsList: goodsStore?.list || [],
    presetCharacters: presets.characters || [],
    categories: presets.categories || [],
    ips: presets.ips || [],
    // n-gram 关键词学习走共享缓存，避免再做一次全量扫描
    learnedCategories: getSharedTaggingContext(presets, goodsStore).getLearnedKeywords(),
  })
  return historicalTagContextCache
}

function ensureHistoricalTagContext() {
  return historicalTagContextCache || seedHistoricalTagContextFromGoods()
}

function updateHistoricalTagContextFromItem(item) {
  const context = ensureHistoricalTagContext()
  return addMihoyoImportContextItem(context, item)
}


function syncUrlInput(event) {
  if (event?.target) {
    urlInput.value = event.target.value ?? ''
    return
  }

  if (urlInputRef.value) {
    urlInput.value = urlInputRef.value.value ?? ''
  }
}

function syncUrlInputLater() {
  requestAnimationFrame(() => {
    syncUrlInput()
  })
}

// 搜索结果点击：加入/移出「待导入队列」（支持多选，与有货监控同一套交互）
function onSearchResultClick(item) {
  // 米游铺搜索接口通常返回 snake_case，但部分代理/缓存响应会返回 camelCase。
  // 统一取值，避免搜索结果实际有 ID 却因为字段名不同而无法入队。
  const mihoyoGoodsId = item?.goods_id || item?.goodsId
  if (!mihoyoGoodsId) return
  const existing = getQueuedEntry(item)
  if (existing) {
    removeFromQueue(existing.uid)
    showGlobalToast(t('import.removedFromQueue'))
    return
  }
  selectSearchResult(item)
  const priceYuan = Number(item?.price)
  enqueueFromSearch({
    goodsId: mihoyoGoodsId,
    name: item?.name || '',
    priceCents: priceYuan > 0 ? Math.round(priceYuan * 100) : 0,
    coverUrl: getSearchResultCover(item) || item?.cover_url || '',
  })
}

// ── 图片多选变更（ImportImagePicker v-model） ──
function setQueueImages(entry, images) {
  if (!entry?.info) return
  entry.info.images = images
  entry.info.image = images[0] || ''
}

// ── 队列项日期选择器 ──
function openQueueDatePicker(entry) {
  if (!entry?.info) return
  queueDateEntry.value = entry
  queueDatePickerValue.value = toDatePickerValue(entry.info.purchaseDate)
  showQueueDatePicker.value = true
}

function onQueueDateConfirm({ selectedValues }) {
  const [year, month, day] = normalizeDateParts(selectedValues.join('-'))
  if (queueDateEntry.value?.info) {
    queueDateEntry.value.info.purchaseDate = `${year}-${month}-${day}`
  }
  queueDatePickerValue.value = [year, month, day]
  showQueueDatePicker.value = false
}

function toDatePickerValue(dateString) {
  const [year, month, day] = normalizeDateParts(dateString)
  return [year, month, day]
}

function normalizeDateParts(dateString) {
  const [fy, fm, fd] = formatDate(new Date(), 'YYYY-MM-DD').split('-')
  if (!dateString) return [fy, fm, fd]
  const [year = fy, month = fm, day = fd] = `${dateString}`.split('-')
  return [year, month.padStart(2, '0'), day.padStart(2, '0')]
}

onMounted(() => {
  updateViewport()
  // 预挂载购物车/账号：双 rAF 等首帧画完 → 等 chunk 下载完 → 立刻隐藏挂载。
  // 不再用 idle timeout:2500（进页头几秒点购物车/账号仍走首挂，会卡死）。
  // 历史标签上下文预热再往后推，避开用户连点 Tab 的窗口。
  const preMount = async () => {
    await Promise.allSettled([cartChunkWarm, accountChunkWarm])
    // 等 chunk 期间用户可能已经离开：不要再挂隐藏视图/排预热任务，
    // 否则整表上下文构建会落在别的页面上，主线程被占住表现为卡死
    if (unmounted) return
    tabMounted.cart = true
    if (!isWishlistMode.value) tabMounted.account = true
    tagSeedTimer = setTimeout(() => {
      tagSeedTimer = 0
      if (unmounted) return
      try {
        seedHistoricalTagContextFromGoods()
      } catch {
        // 预热失败不影响后续懒建
      }
    }, 4000)
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (unmounted) return
      void preMount()
    })
  })
  // 标签共享缓存只在进入本页时算（不随 App 启动算）：空闲期静默预热，
  // timeout 250 抢在首个建议读取（~300ms 防抖）前完成；期间读旧值也不会重复全扫
  cancelTagWarmup = warmTaggingContext(presets, goodsStore, { timeout: 250 })
})

onBeforeUnmount(() => {
  unmounted = true
  cancelAnimationFrame(tabMountRaf)
  if (tagSeedTimer) {
    clearTimeout(tagSeedTimer)
    tagSeedTimer = 0
  }
  // 离开页面就取消待执行的空闲预热，别再抢占下一个页面的主线程
  cancelTagWarmup?.()
  cancelTagWarmup = null
})
</script>

<style scoped src="@/assets/views/ImportView.css"></style>
