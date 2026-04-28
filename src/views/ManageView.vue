<template>
  <div class="page manage-page" :class="{ 'manage-page--restoring': !manageDisplayReady }">
    <main ref="pageBodyRef" class="page-body">
      <NavBar title="设置" show-back />

      <section v-if="isDesktopSettingsViewport" class="settings-workspace">
        <aside class="settings-sidebar">
          <div class="settings-group">
            <p class="settings-group__label">Settings</p>
            <div class="settings-nav">
              <button
                v-for="entry in manageEntries"
                :key="entry.key"
                type="button"
                :class="['settings-nav__item', { 'settings-nav__item--active': selectedManageKey === entry.key }]"
                @click="selectManageEntry(entry.key)"
              >
                <span :class="['settings-icon', entry.iconClass]">
                  <template v-if="entry.iconMode === 'text'">{{ entry.iconText }}</template>
                  <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path v-for="(path, index) in entry.iconPaths" :key="index" :d="path" />
                  </svg>
                </span>
                <span class="settings-nav__copy">
                  <span class="settings-nav__title">{{ entry.title }}</span>
                  <span class="settings-nav__meta">{{ entry.meta }}</span>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <section v-if="activeManageEntry" class="settings-detail">
          <div class="settings-detail__header settings-detail__header--compact">
            <div>
              <h2 class="settings-detail__title settings-detail__title--compact">{{ activeManageEntry.title }}</h2>
            </div>
          </div>

          <div v-if="activeManageEntry.key === 'export'" class="settings-action-panel">
            <p class="settings-action-panel__text">{{ exportSummaryText }}</p>
            <div class="settings-action-panel__inline-export" style="margin-top: 24px;">
              <div class="export-picker__head">
                <div>
                  <p class="export-picker__label">自定义导出</p>
                  <h3 class="export-picker__title">选择要导出的数据</h3>
                </div>
                <button class="export-picker__toggle-all" type="button" @click="toggleExportAll">
                  {{ allExportSectionsSelected ? '清空' : '全选' }}
                </button>
              </div>

              <div class="export-picker__options">
                <button
                  v-for="option in exportSectionOptions"
                  :key="option.key"
                  type="button"
                  :class="['export-picker__option', { 'export-picker__option--active': exportSelection[option.key] }]"
                  @click="toggleExportSection(option.key)"
                >
                  <div class="export-picker__option-body">
                    <span class="export-picker__option-name">{{ option.label }}</span>
                    <span class="export-picker__option-desc">{{ option.desc }}</span>
                  </div>
                  <span class="export-picker__check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                </button>
              </div>
              <div class="export-picker__actions" style="margin-top: 16px;">
                <button class="export-picker__action" type="button" @click="confirmExportSelection" style="width: 100%;">
                  开始导出
                </button>
              </div>
            </div>
          </div>

          <div v-else-if="activeManageEntry.key === 'import'" class="settings-action-panel">
            <p class="settings-action-panel__text">从现有备份文件恢复或合并数据。</p>
            <div class="settings-action-panel__actions">
              <button type="button" class="detail-action detail-action--primary" @click="triggerImport">选择备份文件</button>
            </div>
          </div>

          <div
            v-else-if="activeManageComponent"
            :class="[
              'settings-embedded',
              {
                'settings-embedded--about': activeManageEntry.key === 'about',
                'settings-embedded--with-hero': ['sync', 'theme', 'trash', 'storage', 'shares'].includes(activeManageEntry.key),
                'settings-embedded--hero-trimmed': ['sync', 'theme', 'trash', 'storage', 'shares'].includes(activeManageEntry.key),
                'settings-embedded--hero-textless': ['theme', 'trash', 'storage'].includes(activeManageEntry.key)
              }
            ]"
          >
            <component :is="activeManageComponent" />
          </div>
        </section>
      </section>

      <section v-else class="settings-mobile">
        <div v-for="group in manageEntryGroups" :key="group.key" class="mobile-group">
          <div class="mobile-group__head">
            <p class="mobile-group__label">{{ group.label }}</p>
            <h2 class="mobile-group__title">{{ group.title }}</h2>
          </div>

          <div class="mobile-list">
            <button
              v-for="entry in group.entries"
              :key="entry.key"
              type="button"
              class="mobile-entry"
              @click="runManageEntryPrimary(entry)"
              @touchstart.passive="entry.key === 'export' ? startExportLongPress() : null"
              @touchend="entry.key === 'export' ? cancelExportLongPress() : null"
              @touchcancel="entry.key === 'export' ? cancelExportLongPress() : null"
              @mousedown.left="entry.key === 'export' ? startExportLongPress() : null"
              @mouseup="entry.key === 'export' ? cancelExportLongPress() : null"
              @mouseleave="entry.key === 'export' ? cancelExportLongPress() : null"
              @contextmenu.prevent="entry.key === 'export' ? openExportPicker() : null"
            >
              <span :class="['settings-icon', entry.iconClass]">
                <template v-if="entry.iconMode === 'text'">{{ entry.iconText }}</template>
                <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path v-for="(path, index) in entry.iconPaths" :key="index" :d="path" />
                </svg>
              </span>
              <span class="mobile-entry__copy">
                <span class="mobile-entry__kicker">{{ entry.kicker }}</span>
                <span class="mobile-entry__title">{{ entry.title }}</span>
                <span class="mobile-entry__desc">{{ entry.meta }}</span>
              </span>
              <svg class="mobile-entry__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <Popup
        v-model:show="showExportPicker"
        :position="exportPickerPosition"
        :round="!isTabletViewport"
        teleport="body"
        :class="['picker-popup', { 'picker-popup--center': isTabletViewport }]"
      >
        <div class="export-picker-body">
          <div class="export-picker__handle" />
          <div class="export-picker__head">
            <div>
              <p class="export-picker__label">导出内容</p>
              <h3 class="export-picker__title">选择要导出的数据</h3>
            </div>
            <button class="export-picker__toggle-all" type="button" @click="toggleExportAll">
              {{ allExportSectionsSelected ? '清空' : '全选' }}
            </button>
          </div>
          <div class="export-picker__options">
            <button
              v-for="option in exportSectionOptions"
              :key="option.key"
              type="button"
              :class="['export-picker__option', { 'export-picker__option--active': exportSelection[option.key] }]"
              @click="toggleExportSection(option.key)"
            >
              <div class="export-picker__option-body">
                <span class="export-picker__option-name">{{ option.label }}</span>
                <span class="export-picker__option-desc">{{ option.desc }}</span>
              </div>
              <span class="export-picker__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            </button>
          </div>
          <div class="export-picker__actions">
            <button class="export-picker__action export-picker__action--ghost" type="button" @click="closeExportPicker">
              取消
            </button>
            <button class="export-picker__action" type="button" @click="confirmExportSelection">
              开始导出
            </button>
          </div>
        </div>
      </Popup>

      <input ref="importFileRef" type="file" accept=".json" hidden @change="handleImport" />

      <Transition name="toast-fade">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { Popup } from 'vant'
import { Capacitor } from '@capacitor/core'
import { useManageScrollRestore } from '@/composables/scroll/useManageScrollRestore'
import { useManageExport, exportSectionOptions } from '@/composables/manage/useManageExport'
import { useManageEntries } from '@/config/manageEntries'
import { runManageForwardNavigation } from '@/utils/routeTransition'
import NavBar from '@/components/common/NavBar.vue'

// Lazy-loaded sub-pages
const CategoryManageView = defineAsyncComponent(() => import('@/views/CategoryManageView.vue'))
const IpManageView = defineAsyncComponent(() => import('@/views/IpManageView.vue'))
const CharacterManageView = defineAsyncComponent(() => import('@/views/CharacterManageView.vue'))
const StorageLocationsView = defineAsyncComponent(() => import('@/views/StorageLocationsView.vue'))
const ThemeView = defineAsyncComponent(() => import('@/views/ThemeView.vue'))
const TrashView = defineAsyncComponent(() => import('@/views/TrashView.vue'))
const SyncView = defineAsyncComponent(() => import('@/views/SyncView.vue'))
const AboutView = defineAsyncComponent(() => import('@/views/AboutView.vue'))
const ShareManageView = defineAsyncComponent(() => import('@/views/ShareManageView.vue'))

defineOptions({ name: 'ManageView' })

const router = useRouter()

function goManageChild(path) {
  runManageForwardNavigation(() => router.push(path))
}

// ---- toast ----
const toastMsg = ref('')
let toastTimer = null
let lastToastText = ''
let lastToastAt = 0

const showToast = (message, duration = 2600) => {
  const nextMessage = String(message || '').trim()
  if (!nextMessage) return
  const now = Date.now()
  if (nextMessage === lastToastText && now - lastToastAt < 1200) return
  lastToastText = nextMessage
  lastToastAt = now
  toastMsg.value = nextMessage
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, duration)
}

async function ensureEventsReady() {}

// ---- entries & export (extracted composables) ----
const { manageEntries, manageEntryGroups, exportSummaryText, formatSyncTime } = useManageEntries()

const {
  importFileRef, showExportPicker, exportSelection, allExportSectionsSelected,
  openExportPicker, closeExportPicker, toggleExportSection, toggleExportAll,
  startExportLongPress, cancelExportLongPress,
  handleExportClick, confirmExportSelection,
  triggerImport, handleImport,
  cleanupUnreferencedLocalImages, formatCompactSize, cleanupExportTimers
} = useManageExport({ showToast, ensureEventsReady })

// ---- viewport ----
const windowWidth = ref(window.innerWidth)
const isTabletViewport = computed(() => windowWidth.value >= 900)
const isDesktopSettingsViewport = computed(() => windowWidth.value >= 1200)
const exportPickerPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
const selectedManageKey = ref('categories')

// ---- component routing ----
const activeManageEntry = computed(() =>
  manageEntries.value.find((e) => e.key === selectedManageKey.value) || manageEntries.value[0] || null
)

const manageComponentMap = {
  categories: CategoryManageView, ips: IpManageView, characters: CharacterManageView,
  storage: StorageLocationsView, theme: ThemeView, trash: TrashView,
  sync: SyncView, shares: ShareManageView, about: AboutView
}

const activeManageComponent = computed(() => manageComponentMap[activeManageEntry.value?.key] || null)

function selectManageEntry(key) { selectedManageKey.value = key }

function runManageEntryPrimary(entry) {
  if (!entry) return
  if (entry.action === 'export') { handleExportClick(); return }
  if (entry.action === 'import') { triggerImport(); return }
  if (entry.path) goManageChild(entry.path)
}

function handleResize() { windowWidth.value = window.innerWidth }

// ---- scroll management ----
const pageBodyRef = ref(null)
const manageDisplayReady = ref(true)
let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let isRouteLeaving = false

const {
  getScrollEl, getStoredScrollState, markScrollSource, readScrollTop,
  hasPendingRestore, saveScrollPosition, restorePendingScrollPosition,
  restoreActivatedScrollPosition, rememberCurrentScrollPosition,
  clearDisplayedScrollPosition, resetStoredScrollOnReload, cancelPendingRestore
} = useManageScrollRestore(pageBodyRef)

function syncVisibleGoodsCount() {}
function syncVisibleTimelineMonthCount() {}

function shouldMaskManageDisplay() {
  const storedTop = getStoredScrollState()?.top || 0
  if (storedTop <= 0) return false
  return Math.abs(readScrollTop() - storedTop) > 1
}

function handlePageScroll() {
  if (isRouteLeaving) return
  if (pageScrollRaf) return
  pageScrollRaf = requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
    rememberCurrentScrollPosition()
  })
}

function bindPageScroll() {
  if (pageScrollBound) return
  elementScrollHandler = () => { markScrollSource('element'); handlePageScroll() }
  windowScrollHandler = () => { markScrollSource('window'); handlePageScroll() }
  getScrollEl()?.addEventListener('scroll', elementScrollHandler, { passive: true })
  window.addEventListener('scroll', windowScrollHandler, { passive: true })
  pageScrollBound = true
}

function unbindPageScroll() {
  if (!pageScrollBound) return
  if (elementScrollHandler) { getScrollEl()?.removeEventListener('scroll', elementScrollHandler); elementScrollHandler = null }
  if (windowScrollHandler) { window.removeEventListener('scroll', windowScrollHandler); windowScrollHandler = null }
  pageScrollBound = false
}

// ---- lifecycle ----
onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize, { passive: true })
  if (resetStoredScrollOnReload()) clearDisplayedScrollPosition()
})

onMounted(async () => {
  isRouteLeaving = false
  const shouldMask = shouldMaskManageDisplay()
  manageDisplayReady.value = !shouldMask
  await nextTick()
  bindPageScroll()
  const pending = getStoredScrollState()
  if (pending?.source) markScrollSource(pending.source)
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  manageDisplayReady.value = true

  void cleanupUnreferencedLocalImages().then(({ removed, bytes }) => {
    if (removed > 0) showToast(`已清理 ${removed} 张无引用本地图，释放 ${formatCompactSize(bytes)}`, 3800)
  }).catch(() => {})
})

onActivated(async () => {
  isRouteLeaving = false
  const shouldMask = shouldMaskManageDisplay()
  if (shouldMask) manageDisplayReady.value = false
  const stored = getStoredScrollState()
  if (stored?.source) markScrollSource(stored.source)
  await restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  manageDisplayReady.value = true
  bindPageScroll()
})

onDeactivated(() => {
  cancelPendingRestore()
  if (hasPendingRestore()) manageDisplayReady.value = false
  if (!hasPendingRestore() && !isRouteLeaving) rememberCurrentScrollPosition()
  unbindPageScroll()
})

onBeforeUnmount(() => {
  cancelPendingRestore()
  if (pageScrollRaf) { cancelAnimationFrame(pageScrollRaf); pageScrollRaf = 0 }
  unbindPageScroll()
  if (!hasPendingRestore() && !isRouteLeaving) rememberCurrentScrollPosition()
  clearTimeout(toastTimer)
  window.removeEventListener('resize', handleResize)
  cleanupExportTimers()
})

onBeforeRouteLeave(() => {
  isRouteLeaving = true
  saveScrollPosition(false, 'manage:onBeforeRouteLeave')
  if (pageScrollRaf) { cancelAnimationFrame(pageScrollRaf); pageScrollRaf = 0 }
  unbindPageScroll()
  cleanupExportTimers()
})
</script>

<style scoped>
.manage-page {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(90, 120, 250, 0.14), transparent 28%),
    radial-gradient(circle at left 30%, rgba(40, 200, 128, 0.10), transparent 30%),
    var(--app-bg-gradient);
}

.manage-page--restoring {
  visibility: hidden;
}

.page-body {
  position: relative;
  z-index: 1;
  width: min(100%, 1480px);
  margin: 0 auto;
  padding: 0 var(--page-padding) 120px;
  background: transparent;
}

.page-body :deep(.nav-bar) {
  padding-left: 0;
  padding-right: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.settings-group__label,
.mobile-group__label,
.detail-summary__label,
.detail-stat__label,
.export-picker__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.settings-sidebar {
  display: grid;
  gap: 18px;
  height: 100%;
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-text) 18%, transparent) transparent;
}

.settings-group {
  padding: 16px;
  border-radius: 26px;
  background: color-mix(in srgb, var(--app-surface) 86%, transparent);
  box-shadow: var(--app-shadow);
}

.settings-nav {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.settings-nav__item,
.mobile-entry {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: var(--app-text);
  text-align: left;
  transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.settings-nav__item--active {
  background: color-mix(in srgb, var(--app-text) 8%, var(--app-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.settings-icon,
.settings-detail__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  font-size: 18px;
  font-weight: 700;
}

.settings-icon svg,
.settings-detail__icon svg {
  width: 22px;
  height: 22px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cat-icon { background: rgba(90, 120, 250, 0.12); color: #5a78fa; }
.ip-icon { background: rgba(250, 149, 90, 0.12); color: #fa9040; }
.char-icon { background: rgba(50, 200, 140, 0.12); color: #28c880; }
.storage-icon { background: rgba(80, 120, 230, 0.12); color: #4f76d6; }
.theme-icon { background: rgba(255, 162, 0, 0.12); color: #d07a0b; }
.about-icon { background: rgba(50, 122, 255, 0.12); color: #327aff; }
.trash-icon { background: rgba(199, 68, 68, 0.12); color: #c74444; }
.export-icon { background: rgba(90, 120, 250, 0.12); color: #5a78fa; }
.import-icon { background: rgba(50, 200, 140, 0.12); color: #28c880; }
.sync-icon { background: rgba(120, 100, 255, 0.12); color: #7864ff; }
.share-icon { background: rgba(90, 120, 250, 0.12); color: #5a78fa; }

.settings-nav__copy,
.mobile-entry__copy {
  display: grid;
  min-width: 0;
  flex: 1;
}

.settings-nav__title,
.mobile-entry__title,
.settings-detail__title,
.mobile-group__title,
.export-picker__title {
  color: var(--app-text);
  letter-spacing: -0.04em;
}

.settings-nav__title,
.mobile-entry__title {
  font-size: 16px;
  font-weight: 600;
}

.settings-nav__meta,
.mobile-entry__desc,
.settings-detail__desc,
.detail-summary__text,
.export-picker__option-desc {
  margin-top: 4px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.settings-detail {
  height: 100%;
  padding: 28px;
  border-radius: 32px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-text) 18%, transparent) transparent;
}

.settings-detail__header {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.settings-detail__icon {
  width: 64px;
  height: 64px;
  border-radius: 22px;
  font-size: 24px;
}

.settings-detail__eyebrow {
  margin: 0 0 6px;
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-detail__title {
  margin: 0;
  font-size: 34px;
  font-weight: 700;
}

.settings-detail__header--compact {
  position: sticky;
  top: -28px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 78px;
  margin: -28px -28px 6px;
  padding: 16px 72px 22px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--app-surface) 72%, transparent) 0%,
      color-mix(in srgb, var(--app-surface) 58%, transparent) 70%,
      color-mix(in srgb, var(--app-surface) 10%, transparent) 100%
    );
  backdrop-filter: blur(22px) saturate(125%);
  -webkit-backdrop-filter: blur(22px) saturate(125%);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--app-text) 6%, transparent);
}

.settings-detail__title--compact {
  font-size: 24px;
  text-align: center;
}

.settings-action-panel {
  padding: 22px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface-soft) 78%, transparent);
}

.settings-action-panel__text {
  color: var(--app-text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.settings-action-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

.settings-embedded {
  min-height: 100%;
}

.settings-embedded :deep(.page),
.settings-embedded :deep(.page-body),
.settings-embedded :deep(.theme-page),
.settings-embedded :deep(.sync-page),
 .settings-embedded :deep(.about-page),
 .settings-embedded :deep(.share-manage-page) {
  min-height: auto;
  width: 100%;
  margin: 0;
  padding-top: 0;
  padding-left: 0;
  padding-right: 0;
  background: transparent;
}

.settings-embedded :deep(.page-body) {
  padding-bottom: 24px;
}

.settings-embedded :deep(.share-manage-page .page-body) {
  padding-left: 0;
  padding-right: 0;
}

.settings-embedded :deep(.nav-bar) {
  position: static;
  top: auto;
  z-index: 1;
  padding: 4px 0 14px;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.settings-embedded :deep(.nav-bar__inner) {
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: 12px;
}

.settings-embedded :deep(.nav-back),
.settings-embedded :deep(.nav-placeholder) {
  display: none;
}

.settings-embedded :deep(.nav-title) {
  display: none;
}

.settings-embedded :deep(.nav-right) {
  min-width: auto;
}

.settings-embedded :deep(.add-btn) {
  width: 38px;
  height: 38px;
  margin-top: 2px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  box-shadow: none;
}

.settings-embedded :deep(.hero-section),
.settings-embedded :deep(.hero-copy),
.settings-embedded :deep(.hero-label),
.settings-embedded :deep(.hero-title),
.settings-embedded :deep(.hero-desc),
.settings-embedded :deep(.theme-hero),
.settings-embedded :deep(.theme-overview),
.settings-embedded :deep(.summary-hero),
.settings-embedded :deep(.summary-section__header),
.settings-embedded :deep(.page-hero),
.settings-embedded :deep(.section-head),
.settings-embedded :deep(.section-title),
.settings-embedded :deep(.section-label) {
  display: none !important;
}

.settings-embedded--about :deep(.hero-section),
.settings-embedded--about :deep(.hero-copy),
.settings-embedded--about :deep(.hero-label),
.settings-embedded--about :deep(.hero-title),
.settings-embedded--about :deep(.hero-desc),
.settings-embedded--about :deep(.section-head),
.settings-embedded--about :deep(.section-title),
.settings-embedded--about :deep(.section-label) {
  display: revert !important;
}

.settings-embedded--with-hero :deep(.hero-section),
.settings-embedded--with-hero :deep(.hero-copy),
.settings-embedded--with-hero :deep(.hero-label),
.settings-embedded--with-hero :deep(.hero-title),
.settings-embedded--with-hero :deep(.hero-desc),
.settings-embedded--with-hero :deep(.theme-hero),
.settings-embedded--with-hero :deep(.theme-overview),
.settings-embedded--with-hero :deep(.summary-hero),
.settings-embedded--with-hero :deep(.summary-section__header),
.settings-embedded--with-hero :deep(.page-hero),
.settings-embedded--with-hero :deep(.section-head),
.settings-embedded--with-hero :deep(.section-title),
.settings-embedded--with-hero :deep(.section-label) {
  display: revert !important;
}

.settings-embedded--hero-trimmed :deep(.hero-section),
.settings-embedded--hero-trimmed :deep(.theme-hero),
.settings-embedded--hero-trimmed :deep(.summary-hero),
.settings-embedded--hero-trimmed :deep(.page-hero) {
  margin-top: 0 !important;
  padding-top: 0 !important;
  min-height: 0 !important;
}

.settings-embedded--hero-trimmed :deep(.hero-card),
.settings-embedded--hero-trimmed :deep(.theme-overview) {
  margin-top: 0 !important;
}

.settings-embedded--hero-trimmed :deep(.nav-bar) {
  display: none !important;
}

.settings-embedded--hero-trimmed :deep(.page-body) {
  padding-top: 0 !important;
}

.settings-embedded--hero-textless :deep(.hero-copy),
.settings-embedded--hero-textless :deep(.hero-label),
.settings-embedded--hero-textless :deep(.hero-title),
.settings-embedded--hero-textless :deep(.hero-desc) {
  display: none !important;
}

.settings-embedded--hero-textless :deep(.hero-section),
.settings-embedded--hero-textless :deep(.theme-hero) {
  display: none !important;
}

.settings-embedded--hero-textless :deep(.hero-section) {
  padding-block: 0 !important;
}

.settings-embedded--hero-textless :deep(.hero-card),
.settings-embedded--hero-textless :deep(.theme-overview) {
  padding-top: 0 !important;
}

.settings-embedded--about :deep(.nav-bar) {
  display: none;
}

.settings-sidebar::-webkit-scrollbar,
.settings-detail::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.settings-sidebar::-webkit-scrollbar-track,
.settings-detail::-webkit-scrollbar-track {
  background: transparent;
}

.settings-sidebar::-webkit-scrollbar-thumb,
.settings-detail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 16%, transparent);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.settings-sidebar::-webkit-scrollbar-thumb:hover,
.settings-detail::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--app-text) 24%, transparent);
  background-clip: padding-box;
}

@media (min-width: 768px) {
  .settings-sidebar,
  .settings-detail {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .settings-sidebar::-webkit-scrollbar,
  .settings-detail::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
}

.settings-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.detail-action,
.export-picker__toggle-all,
.export-picker__action {
  min-height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 94%, transparent);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.detail-action--primary,
.export-picker__action {
  background: var(--app-text);
  color: var(--app-surface);
}

.settings-mobile {
  display: grid;
  gap: 18px;
}

.mobile-group {
  padding: 18px;
  border-radius: 28px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
}

.mobile-group__head {
  margin-bottom: 12px;
}

.mobile-group__title {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 700;
}

.mobile-list {
  display: grid;
  gap: 8px;
}

.mobile-entry__kicker {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mobile-entry__arrow {
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.picker-popup {
  overflow: hidden;
}

:global(.picker-popup.van-popup),
:global(.picker-popup.van-popup--bottom) {
  --van-popup-background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

:global(.picker-popup--center.van-popup--center) {
  width: min(520px, calc(100vw - 40px));
  border-radius: 28px !important;
  overflow: hidden;
  box-shadow:
    0 28px 80px color-mix(in srgb, var(--app-text) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.export-picker-body {
  width: 100%;
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
  color: var(--app-text);
  background: transparent;
}

:global(.picker-popup--center.van-popup--center) .export-picker-body {
  padding: 22px;
}

.export-picker__handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 16%, transparent);
}

.export-picker__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.export-picker__title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 700;
}

.export-picker__options {
  display: grid;
  gap: 0;
  overflow: hidden;
  border-radius: 20px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
  border: 1px solid var(--app-border);
}

.export-picker__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 15px 16px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--app-text);
  text-align: left;
}

.export-picker__option:not(:last-child) {
  border-bottom: 1px solid var(--app-border);
}

.export-picker__option--active {
  background: color-mix(in srgb, var(--app-text) 4%, transparent);
}

.export-picker__option-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.export-picker__check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--app-text-secondary) 26%, transparent);
  color: transparent;
  flex-shrink: 0;
}

.export-picker__option--active .export-picker__check {
  background: var(--app-text);
  border-color: var(--app-text);
  color: var(--app-surface);
}

.export-picker__check svg,
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.export-picker__check svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.export-picker__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + max(env(safe-area-inset-bottom), 12px) + 12px);
  z-index: 999;
  width: max-content;
  max-width: min(calc(100vw - 32px), 420px);
  padding: 11px 16px;
  border: 1px solid var(--app-glass-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass-strong) 90%, transparent);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@media (max-width: 1199px) {
  .page-body {
    width: min(100%, 960px);
    padding-bottom: 88px;
  }

  .settings-workspace {
    height: auto;
    min-height: 0;
    overflow: visible;
  }
}

@media (min-width: 1200px) {
  .manage-page {
    height: 100dvh;
    overflow: hidden;
  }

  .page-body {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100dvh;
    padding-top: calc(env(safe-area-inset-top) + 4px);
    padding-bottom: 20px;
    padding-inline: 28px;
    overflow: hidden;
  }

  .page-body :deep(.nav-bar) {
    align-self: start;
    padding-top: 0;
    padding-bottom: 8px;
  }

  .page-body :deep(.nav-bar__inner) {
    min-height: 48px;
  }
}

:global(html.theme-dark) .settings-group,
:global(html.theme-dark) .settings-detail,
:global(html.theme-dark) .mobile-group {
  box-shadow:
    0 24px 48px rgba(0, 0, 0, 0.24),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}
</style>
