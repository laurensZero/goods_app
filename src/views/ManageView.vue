<template>
  <div class="page manage-page" :class="{ 'manage-page--restoring': !manageDisplayReady }">
    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Presets & Data</p>
          <h1 class="hero-title">数据管理</h1>
          <p class="hero-desc">维护下拉筛选选项和导入数据。</p>
        </div>
      </section>

      <div class="manage-column manage-column--primary">
        <section class="hub-section">
          <RouterLink class="entry-card" to="/manage/categories">
            <span class="entry-icon cat-icon">分</span>
            <div class="entry-body">
              <p class="entry-kicker">预设 / 分类</p>
              <h2 class="entry-name">分类管理</h2>
              <p class="entry-desc">维护收藏分类预设</p>
              <p class="entry-count">{{ presets.categories.length }} 项</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>

          <RouterLink class="entry-card" to="/manage/ips">
            <span class="entry-icon ip-icon">IP</span>
            <div class="entry-body">
              <p class="entry-kicker">预设 / 作品</p>
              <h2 class="entry-name">IP 管理</h2>
              <p class="entry-desc">维护作品或系列名称</p>
              <p class="entry-count">{{ presets.ips.length }} 项</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>

          <RouterLink class="entry-card" to="/manage/characters">
            <span class="entry-icon char-icon">角</span>
            <div class="entry-body">
              <p class="entry-kicker">预设 / 角色</p>
              <h2 class="entry-name">角色管理</h2>
              <p class="entry-desc">维护角色名称和所属 IP</p>
              <p class="entry-count">{{ presets.characters.length }} 项</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>
        </section>

        <section class="hub-section section-gap">
          <RouterLink class="entry-card" to="/storage-locations">
            <span class="entry-icon storage-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
                <path d="M9 11h6" />
                <path d="M9 15h4" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">日常管理</p>
              <h2 class="entry-name">收纳位置</h2>
              <p class="entry-desc">按柜子、抽屉、活页册管理层级位置</p>
              <p class="entry-count">{{ presets.storageLocations.length }} 个节点</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>
        </section>
      </div>

      <div class="manage-column manage-column--secondary">
        <section class="hub-section">
          <RouterLink class="entry-card" to="/manage/theme">
            <span class="entry-icon theme-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="M4.93 4.93l1.41 1.41" />
                <path d="M17.66 17.66l1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="M4.93 19.07l1.41-1.41" />
                <path d="M17.66 6.34l1.41-1.41" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">外观与主题</p>
              <h2 class="entry-name">主题模式</h2>
              <p class="entry-desc">切换主题风格与外观模式</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>

          <RouterLink class="entry-card" to="/trash">
            <span class="entry-icon trash-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6H21" />
                <path d="M8 6V4H16V6" />
                <path d="M19 6L18 20H6L5 6" />
                <path d="M10 11V17" />
                <path d="M14 11V17" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">日常管理</p>
              <h2 class="entry-name">回收站</h2>
              <p class="entry-desc">误删后可恢复，支持清空回收站</p>
              <p class="entry-count">{{ goodsStore.trashList.length }} 条待处理</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>
        </section>

        <section class="hub-section section-gap">
          <button
            type="button"
            class="entry-card"
            @click="handleExportClick"
            @touchstart.passive="startExportLongPress"
            @touchend="cancelExportLongPress"
            @touchcancel="cancelExportLongPress"
            @mousedown.left="startExportLongPress"
            @mouseup="cancelExportLongPress"
            @mouseleave="cancelExportLongPress"
            @contextmenu.prevent="openExportPicker"
          >
            <span class="entry-icon export-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">数据管理</p>
              <h2 class="entry-name">导出数据</h2>
              <p class="entry-desc">长按可选择导出的数据范围</p>
              <p class="entry-count">{{ exportSummaryText }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

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

          <button type="button" class="entry-card" @click="triggerImport">
            <span class="entry-icon import-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">数据管理</p>
              <h2 class="entry-name">导入数据</h2>
              <p class="entry-desc">从备份文件恢复或合并数据</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <input ref="importFileRef" type="file" accept=".json" hidden @change="handleImport" />

          <RouterLink class="entry-card" to="/manage/sync">
            <span class="entry-icon sync-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">云同步</p>
              <h2 class="entry-name">GitHub Gist 同步</h2>
              <p class="entry-desc">多设备数据同步</p>
              <p v-if="syncStore.lastSyncedAt" class="entry-count">上次同步：{{ formatSyncTime(syncStore.lastSyncedAt) }}</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>

          <RouterLink class="entry-card" to="/manage/about">
            <span class="entry-icon about-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 10v6" />
                <path d="M12 7h.01" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">应用信息</p>
              <h2 class="entry-name">关于应用</h2>
              <p class="entry-desc">查看版本、数据说明与同步使用方式</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </RouterLink>
        </section>
      </div>

      <Transition name="toast-fade">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Popup } from 'vant'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { useManageScrollRestore } from '@/composables/scroll/useManageScrollRestore'
import { useRechargeStore } from '@/composables/recharge/useRechargeStore'
import { sanitizeGoodsItemForExport, sanitizeEventForExport } from '@/utils/goodsImages'

defineOptions({ name: 'ManageView' })

const presets = usePresetsStore()
const goodsStore = useGoodsStore()
const eventsStore = useEventsStore()
const syncStore = useSyncStore()
const rechargeStore = useRechargeStore()

const collectionCount = computed(() => goodsStore.list.filter((item) => !item?.isWishlist).length)
const wishlistCount = computed(() => goodsStore.list.filter((item) => item?.isWishlist).length)
const eventCount = computed(() => eventsStore.list.length)
const rechargeCount = computed(() => rechargeStore.sortedRecords.value.length)
const exportSummaryText = computed(() => (
  `${collectionCount.value} 件收藏 ${wishlistCount.value} 件心愿 ${eventCount.value} 场活动 ${rechargeCount.value} 条充值`
))

const EXPORT_LONG_PRESS_DELAY_MS = 420
const exportSectionOptions = [
  { key: 'goods', label: '收藏', desc: '当前收藏记录' },
  { key: 'wishlist', label: '心愿单', desc: '计划入手记录' },
  { key: 'trash', label: '回收站', desc: '已删除但尚未清空的数据' },
  { key: 'events', label: '活动', desc: '活动、曲目与关联谷子' },
  { key: 'recharge', label: '充值', desc: '充值记录与回收站' },
  { key: 'presets', label: '预设', desc: '分类、IP、角色和收纳位置' }
]

function createDefaultExportSelection() {
  return exportSectionOptions.reduce((result, option) => {
    result[option.key] = true
    return result
  }, {})
}

const windowWidth = ref(window.innerWidth)
const isTabletViewport = computed(() => windowWidth.value >= 900)
const exportPickerPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))

async function ensureEventsReady() {
  if (!eventsStore.isReady) {
    await eventsStore.init()
  }
}

function formatSyncTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const pageBodyRef = ref(null)
const importFileRef = ref(null)
const toastMsg = ref('')
const showExportPicker = ref(false)
const exportSelection = ref(createDefaultExportSelection())
const manageDisplayReady = ref(true)
let toastTimer = null
let pageScrollBound = false
let pageScrollRaf = 0
let elementScrollHandler = null
let windowScrollHandler = null
let exportLongPressTimer = 0
let suppressNextExportClick = false
const BACKUP_DIR = 'GoodsAppBackup'

const allExportSectionsSelected = computed(() => exportSectionOptions.every((option) => exportSelection.value[option.key]))

const {
  getScrollEl,
  getStoredScrollState,
  markScrollSource,
  readScrollTop,
  hasPendingRestore,
  saveScrollPosition,
  restorePendingScrollPosition,
  restoreActivatedScrollPosition,
  rememberCurrentScrollPosition,
  clearDisplayedScrollPosition,
  resetStoredScrollOnReload,
  cancelPendingRestore
} = useManageScrollRestore(pageBodyRef)

function openExportPicker() {
  exportSelection.value = createDefaultExportSelection()
  showExportPicker.value = true
}

function closeExportPicker() {
  showExportPicker.value = false
  suppressNextExportClick = false
}

function toggleExportSection(key) {
  exportSelection.value = {
    ...exportSelection.value,
    [key]: !exportSelection.value[key]
  }
}

function toggleExportAll() {
  const nextValue = !allExportSectionsSelected.value
  exportSelection.value = exportSectionOptions.reduce((result, option) => {
    result[option.key] = nextValue
    return result
  }, {})
}

function startExportLongPress() {
  if (exportLongPressTimer) {
    window.clearTimeout(exportLongPressTimer)
  }

  exportLongPressTimer = window.setTimeout(() => {
    suppressNextExportClick = true
    openExportPicker()
    exportLongPressTimer = 0
  }, EXPORT_LONG_PRESS_DELAY_MS)
}

function cancelExportLongPress() {
  if (exportLongPressTimer) {
    window.clearTimeout(exportLongPressTimer)
    exportLongPressTimer = 0
  }
}

function handleResize() {
  windowWidth.value = window.innerWidth
}

function handleExportClick() {
  if (suppressNextExportClick) {
    suppressNextExportClick = false
    return
  }

  handleExport()
}

function confirmExportSelection() {
  const selectedCount = exportSectionOptions.reduce((sum, option) => sum + (exportSelection.value[option.key] ? 1 : 0), 0)
  if (selectedCount === 0) {
    showToast('请至少选择一项导出内容')
    return
  }

  handleExport(exportSelection.value)
  closeExportPicker()
}

function syncVisibleGoodsCount() {}
function syncVisibleTimelineMonthCount() {}

function shouldMaskManageDisplay() {
  const storedTop = getStoredScrollState()?.top || 0
  if (storedTop <= 0) return false
  return Math.abs(readScrollTop() - storedTop) > 1
}

function handlePageScroll() {
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    rememberCurrentScrollPosition()
  })
}

function bindPageScroll() {
  if (pageScrollBound) return

  elementScrollHandler = () => {
    markScrollSource('element')
    handlePageScroll()
  }
  windowScrollHandler = () => {
    markScrollSource('window')
    handlePageScroll()
  }

  getScrollEl()?.addEventListener('scroll', elementScrollHandler, { passive: true })
  window.addEventListener('scroll', windowScrollHandler, { passive: true })
  pageScrollBound = true
}

function unbindPageScroll() {
  if (!pageScrollBound) return

  if (elementScrollHandler) {
    getScrollEl()?.removeEventListener('scroll', elementScrollHandler)
    elementScrollHandler = null
  }
  if (windowScrollHandler) {
    window.removeEventListener('scroll', windowScrollHandler)
    windowScrollHandler = null
  }

  pageScrollBound = false
}

onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize, { passive: true })
  const didResetOnReload = resetStoredScrollOnReload()
  if (didResetOnReload) {
    clearDisplayedScrollPosition()
  }
})

onMounted(async () => {
  const shouldMaskDisplay = shouldMaskManageDisplay()
  manageDisplayReady.value = !shouldMaskDisplay
  await ensureEventsReady()
  await nextTick()
  bindPageScroll()
  const pendingState = getStoredScrollState()
  if (pendingState?.source) {
    markScrollSource(pendingState.source)
  }
  await restorePendingScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  manageDisplayReady.value = true
  syncStore.init()
})

onActivated(async () => {
  const shouldMaskDisplay = shouldMaskManageDisplay()
  if (shouldMaskDisplay) {
    manageDisplayReady.value = false
  }
  await ensureEventsReady()
  const storedState = getStoredScrollState()
  if (storedState?.source) {
    markScrollSource(storedState.source)
  }
  await restoreActivatedScrollPosition(syncVisibleGoodsCount, syncVisibleTimelineMonthCount)
  await nextTick()
  manageDisplayReady.value = true
  bindPageScroll()
})

onDeactivated(() => {
  cancelPendingRestore()
  if (hasPendingRestore()) {
    manageDisplayReady.value = false
  }
  if (!hasPendingRestore()) {
    rememberCurrentScrollPosition()
  }
  unbindPageScroll()
})

onBeforeUnmount(() => {
  cancelPendingRestore()
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
  if (!hasPendingRestore()) {
    rememberCurrentScrollPosition()
  }
  clearTimeout(toastTimer)
  window.removeEventListener('resize', handleResize)
  if (exportLongPressTimer) {
    window.clearTimeout(exportLongPressTimer)
    exportLongPressTimer = 0
  }
})

onBeforeRouteLeave(() => {
  saveScrollPosition(true, 'manage:onBeforeRouteLeave')
  if (exportLongPressTimer) {
    window.clearTimeout(exportLongPressTimer)
    exportLongPressTimer = 0
  }
  suppressNextExportClick = false
})

function showToast(message, duration = 2600) {
  toastMsg.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, duration)
}

async function exportBackupToNative(json, filename) {
  const publicPath = `${BACKUP_DIR}/${filename}`

  try {
    if (Capacitor.getPlatform() === 'android') {
      const permissions = await Filesystem.checkPermissions()
      if (permissions.publicStorage !== 'granted') {
        const requested = await Filesystem.requestPermissions()
        if (requested.publicStorage !== 'granted') {
          throw new Error('PUBLIC_STORAGE_DENIED')
        }
      }
    }

    const result = await Filesystem.writeFile({
      path: publicPath,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    })

    return {
      path: publicPath,
      uri: result.uri,
      visibleToUser: true
    }
  } catch {
    const fallbackPath = `backup/${filename}`
    const result = await Filesystem.writeFile({
      path: fallbackPath,
      data: json,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true
    })

    return {
      path: fallbackPath,
      uri: result.uri,
      visibleToUser: false
    }
  }
}

async function exportBackupToShareCache(json, filename) {
  const sharePath = `backup-share/${filename}`
  const result = await Filesystem.writeFile({
    path: sharePath,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true
  })

  return {
    path: sharePath,
    uri: result.uri
  }
}

async function shareBackupFile(uri) {
  const canShare = await Share.canShare().catch(() => ({ value: false }))
  if (!canShare.value) return false

  await Share.share({
    title: '导出备份',
    text: '请选择保存位置或分享方式',
    dialogTitle: '导出备份',
    files: [uri]
  })

  return true
}

async function handleExport(selection = null) {
  await ensureEventsReady()
  const selected = selection || createDefaultExportSelection()
  const includeGoods = selected.goods !== false
  const includeWishlist = selected.wishlist !== false
  const includeTrash = selected.trash !== false
  const includeEvents = selected.events !== false
  const includeRecharge = selected.recharge !== false
  const includePresets = selected.presets !== false

  const safeSanitizeGoodsItemForExport = async (item) => {
    try {
      return await sanitizeGoodsItemForExport(item)
    } catch {
      return null
    }
  }
  const safeSanitizeEventForExport = async (event) => {
    try {
      return await sanitizeEventForExport(event)
    } catch {
      return null
    }
  }

  const goodsList = includeGoods
    ? (await Promise.all(goodsStore.list.filter((item) => !item?.isWishlist).map((item) => safeSanitizeGoodsItemForExport(item)))).filter(Boolean)
    : undefined
  const wishlistList = includeWishlist
    ? (await Promise.all(goodsStore.list.filter((item) => item?.isWishlist).map((item) => safeSanitizeGoodsItemForExport(item)))).filter(Boolean)
    : undefined
  const trashList = includeTrash
    ? (await Promise.all(goodsStore.trashList.map((item) => safeSanitizeGoodsItemForExport(item)))).filter(Boolean)
    : undefined
  const rechargeRecords = includeRecharge ? rechargeStore.exportBackup({ includeDeleted: false, stripImage: true }) : undefined
  const rechargeTrash = includeRecharge ? [] : undefined
  const eventsList = includeEvents
    ? (await Promise.all(eventsStore.list.map((event) => safeSanitizeEventForExport(event)))).filter(Boolean)
    : undefined

  const data = {
    version: 8,
    exportedAt: new Date().toISOString(),
    ...(includeGoods ? { goods: goodsList } : {}),
    ...(includeWishlist ? { wishlist: wishlistList } : {}),
    ...(includeTrash ? { trash: trashList } : {}),
    ...(includeRecharge ? { recharge: rechargeRecords, rechargeTrash } : {}),
    ...(includeEvents ? { events: eventsList } : {}),
    ...(includePresets
      ? {
          presets: {
            categories: presets.categories,
            ips: presets.ips,
            characters: presets.characters,
            storageLocations: presets.storageLocationPaths
          }
        }
      : {})
  }
  const json = JSON.stringify(data, null, 2)
  const filename = `谷子备份_${new Date().toISOString().split('T')[0]}.json`

  try {
    if (Capacitor.isNativePlatform()) {
      const saved = await exportBackupToNative(json, filename)
      const shareable = await exportBackupToShareCache(json, filename).catch(() => null)

      if (shareable) {
        const shared = await shareBackupFile(shareable.uri).catch(() => false)
        if (shared) {
          showToast(
            saved.visibleToUser
              ? `已打开分享面板，并写入 文档/${saved.path}`
              : '已打开分享面板，请选择“保存到文件”或其他目标',
            4200
          )
          return
        }
      }

      showToast(
        saved.visibleToUser
          ? `已导出到 文档/${saved.path}`
          : `已导出到应用目录 ${saved.path}`,
        4200
      )
      return
    }
  } catch {
    // fallback to browser download
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  showToast(`已导出到浏览器下载目录：${filename}`, 4200)
}

function triggerImport() {
  if (!importFileRef.value) return
  importFileRef.value.value = ''
  importFileRef.value.click()
}

async function handleImport(event) {
  await ensureEventsReady()
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    const goodsToImport = Array.isArray(data.goods) ? data.goods : []
    const wishlistToImport = Array.isArray(data.wishlist)
      ? data.wishlist.map((item) => ({ ...item, isWishlist: true }))
      : []
    const trashToImport = Array.isArray(data.trash) ? data.trash : []
    const rechargeActive = Array.isArray(data.recharge) ? data.recharge : []
    const rechargeDeleted = Array.isArray(data.rechargeTrash) ? data.rechargeTrash : []
    const rechargeLegacy = Array.isArray(data.rechargeRecords) ? data.rechargeRecords : []
    const rechargeToImport = [...rechargeActive, ...rechargeDeleted, ...rechargeLegacy]
    const eventsToImport = Array.isArray(data.events) ? data.events : []
    const mergedGoodsToImport = [...goodsToImport, ...wishlistToImport]

    const goodsAdded = mergedGoodsToImport.length > 0
      ? await goodsStore.importGoodsBackup(mergedGoodsToImport)
      : 0
    const trashAdded = trashToImport.length > 0
      ? await goodsStore.importTrashBackup(trashToImport)
      : 0
    const rechargeResult = rechargeToImport.length > 0
      ? rechargeStore.importBackup(rechargeToImport)
      : { added: 0, updated: 0 }

    if (data.presets) {
      for (const category of (data.presets.categories || [])) {
        if (category) await presets.addCategory(category)
      }
      for (const ip of (data.presets.ips || [])) {
        if (ip) await presets.addIp(ip)
      }
      for (const character of (data.presets.characters || [])) {
        if (character?.name) {
          await presets.addCharacter(character.name, character.ip || '')
        }
      }
      await presets.syncStorageLocationsFromPaths(data.presets.storageLocations || [])
    }

    await presets.syncStorageLocationsFromPaths(
      mergedGoodsToImport.map((item) => item.storageLocation).filter(Boolean)
    )

    const rechargeChanged = Number(rechargeResult.added || 0) + Number(rechargeResult.updated || 0)
    const eventResult = eventsToImport.length > 0
      ? await eventsStore.importEventsBackup(eventsToImport)
      : { added: 0, updated: 0 }
    const eventsChanged = Number(eventResult.added || 0) + Number(eventResult.updated || 0)

    if (goodsAdded > 0 || trashAdded > 0 || rechargeChanged > 0 || eventsChanged > 0) {
      showToast(`成功导入 ${goodsAdded} 件收藏，${trashAdded} 条回收站记录，${rechargeChanged} 条充值记录，${eventResult.added} 场新活动，更新 ${eventResult.updated} 场活动`)
      return
    }

    showToast('数据已是最新，无需导入')
  } catch (error) {
    showToast(`导入失败：${error.message}`)
  }
}
</script>

<style scoped>
.manage-page {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--app-bg);
}

.manage-page--restoring {
  visibility: hidden;
}

.manage-page::before,
.manage-page::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  filter: blur(10px);
}

.manage-page::before {
  top: 110px;
  right: -120px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(90, 120, 250, 0.16) 0%, rgba(90, 120, 250, 0) 72%);
}

.manage-page::after {
  top: 280px;
  left: -140px;
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(40, 200, 128, 0.12) 0%, rgba(40, 200, 128, 0) 74%);
}





.page-body {
  position: relative;
  z-index: 1;
  width: min(100%, 1160px);
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 20px) var(--page-padding) 120px;
}

.hero-section {
  display: grid;
  gap: 14px;
  grid-column: 1 / -1;
  margin-bottom: 24px;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.manage-column {
  display: flex;
  flex-direction: column;
}

.manage-column + .manage-column {
  margin-top: 16px;
}

.hub-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-gap {
  margin-top: 16px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 108px;
  padding: 18px;
  border: 1px solid rgba(17, 20, 22, 0.04);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  text-decoration: none;
  box-shadow: var(--app-shadow);
}

.entry-card:active {
  transform: scale(var(--press-scale-card));
}

.entry-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  font-size: 18px;
  font-weight: 700;
}

.entry-icon svg {
  width: 22px;
  height: 22px;
}

.cat-icon { background: rgba(90, 120, 250, 0.12); color: #5a78fa; }
.ip-icon { background: rgba(250, 149, 90, 0.12); color: #fa9040; }
.char-icon { background: rgba(50, 200, 140, 0.12); color: #28c880; }
.storage-icon { background: rgba(80, 120, 230, 0.10); color: #4f76d6; }
.theme-icon { background: rgba(255, 162, 0, 0.12); color: #d07a0b; }
.about-icon { background: rgba(50, 122, 255, 0.10); color: #327aff; }
.trash-icon { background: rgba(199, 68, 68, 0.10); color: #c74444; }
.export-icon { background: rgba(90, 120, 250, 0.10); color: #5a78fa; }
.import-icon { background: rgba(50, 200, 140, 0.10); color: #28c880; }
.sync-icon { background: rgba(120, 100, 255, 0.10); color: #7864ff; }

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
  background-clip: padding-box;
}

.export-picker-body {
  width: 100%;
  margin: 0 auto;
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

.export-picker__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.export-picker__title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.export-picker__toggle-all {
  flex-shrink: 0;
  min-height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
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

.export-picker__option-body {
  min-width: 0;
}

.export-picker__option-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.export-picker__option-desc {
  display: block;
  margin-top: 4px;
  color: var(--app-text-tertiary);
  font-size: 12px;
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

.export-picker__action {
  height: 46px;
  border: none;
  border-radius: 16px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 15px;
  font-weight: 600;
}

.export-picker__action--ghost {
  background: color-mix(in srgb, var(--app-surface-soft) 92%, transparent);
  color: var(--app-text);
}

.entry-body {
  flex: 1;
  min-width: 0;
}

.entry-kicker {
  margin: 0 0 2px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.entry-name {
  margin: 0 0 2px;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}

.entry-desc {
  margin: 0 0 4px;
  color: var(--app-text-tertiary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-count {
  margin: 0;
  color: #5a78fa;
  font-size: 12px;
  font-weight: 500;
}

.entry-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + max(env(safe-area-inset-bottom), 12px) + 12px);
  z-index: 999;
  box-sizing: border-box;
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
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@media (min-width: 900px) and (max-width: 1279px) {
  .page-body {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;
    row-gap: 18px;
    align-items: start;
    width: min(100%, 1100px);
    padding-top: 26px;
    padding-inline: 28px;
  }

  .hero-section {
    margin-bottom: 0;
  }

  .manage-column,
  .hub-section {
    display: contents;
  }

  .manage-column {
    gap: 24px;
  }

  .manage-column + .manage-column {
    margin-top: 0;
  }

  .hub-section {
    gap: 18px;
  }

  .section-gap {
    margin-top: 0;
  }

  .entry-card {
    grid-column: span 1;
    min-height: 136px;
    padding: 22px;
    border-radius: 24px;
  }

  .entry-icon {
    width: 58px;
    height: 58px;
    border-radius: 18px;
  }

  .entry-name {
    font-size: 18px;
  }

  .entry-desc {
    white-space: normal;
    line-height: 1.5;
  }
}

@media (min-width: 1280px) {
  

  

  .page-body {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;
    row-gap: 18px;
    align-items: start;
    width: min(100%, 1100px);
    padding-top: 26px;
    padding-inline: 28px;
  }

  .hero-section {
    margin-bottom: 0;
  }

  .manage-column,
  .hub-section {
    display: contents;
  }

  .manage-column {
    gap: 24px;
  }

  .manage-column + .manage-column {
    margin-top: 0;
  }

  .hub-section {
    gap: 18px;
  }

  .section-gap {
    margin-top: 0;
  }

  .entry-card {
    grid-column: span 1;
    min-height: 136px;
    padding: 22px;
    border-radius: 24px;
  }

  .entry-icon {
    width: 58px;
    height: 58px;
    border-radius: 18px;
  }

  .entry-name {
    font-size: 18px;
  }

  .entry-desc {
    white-space: normal;
    line-height: 1.5;
  }
}

:global(html.theme-dark) .entry-card {
    border-color: rgba(255, 255, 255, 0.04);
  }
</style>
