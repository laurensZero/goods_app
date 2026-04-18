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
                'settings-embedded--with-hero': ['sync', 'theme', 'trash', 'storage'].includes(activeManageEntry.key),
                'settings-embedded--hero-trimmed': ['sync', 'theme', 'trash', 'storage'].includes(activeManageEntry.key),
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
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
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
import { sanitizeGoodsItemForExport, sanitizeEventForExport, sanitizeGoodsItemForSync } from '@/utils/goodsImages'
import {
  runManageForwardNavigation
} from '@/utils/routeTransition'
import NavBar from '@/components/common/NavBar.vue'
import CategoryManageView from '@/views/CategoryManageView.vue'
import IpManageView from '@/views/IpManageView.vue'
import CharacterManageView from '@/views/CharacterManageView.vue'
import StorageLocationsView from '@/views/StorageLocationsView.vue'
import ThemeView from '@/views/ThemeView.vue'
import TrashView from '@/views/TrashView.vue'
import SyncView from '@/views/SyncView.vue'
import AboutView from '@/views/AboutView.vue'

defineOptions({ name: 'ManageView' })

const router = useRouter()

function goManageChild(path) {
  runManageForwardNavigation(() => router.push(path))
}

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
const isDesktopSettingsViewport = computed(() => windowWidth.value >= 1200)
const selectedManageKey = ref('categories')
const syncMetaText = computed(() => {
  const statusText = String(syncStore.syncStatus || '')
  if (!syncStore.isSyncing && /(数据已是最新|数据已经是最新|上传完成|拉取完成)/.test(statusText)) {
    return syncStore.lastSyncedAt ? `数据已最新 · ${formatSyncTime(syncStore.lastSyncedAt)}` : '数据已最新'
  }
  if (syncStore.lastSyncedAt) {
    return `上次同步 ${formatSyncTime(syncStore.lastSyncedAt)}`
  }
  return '尚未完成同步'
})

const manageEntries = computed(() => ([
  {
    key: 'categories',
    group: 'preset',
    title: '分类管理',
    kicker: '预设 / 分类',
    meta: `${presets.categories.length} 项分类预设`,
    detail: '维护收藏分类的命名和归类规则，影响添加、搜索和整理时的筛选体验。',
    summary: '适合先清理命名，再逐步收敛同义分类，避免后续统计分散。',
    recommendation: '如果分类数量已经开始增长，优先统一主分类，再处理细分标签。',
    primaryLabel: '打开分类管理',
    secondaryLabel: '',
    iconMode: 'text',
    iconClass: 'cat-icon',
    iconText: '分',
    path: '/manage/categories',
    stats: [
      { label: '分类数量', value: `${presets.categories.length}` },
      { label: '影响范围', value: '收藏列表' }
    ]
  },
  {
    key: 'ips',
    group: 'preset',
    title: 'IP 管理',
    kicker: '预设 / 作品',
    meta: `${presets.ips.length} 个作品系列`,
    detail: '统一维护作品、系列和企划名称，减少录入时的拼写分裂。',
    summary: 'IP 是角色、搜索和统计的上层语义，先稳定这里，后续数据会更干净。',
    recommendation: '建议把同系列不同写法先合并，再补齐常用缩写。',
    primaryLabel: '打开 IP 管理',
    secondaryLabel: '',
    iconMode: 'text',
    iconClass: 'ip-icon',
    iconText: 'IP',
    path: '/manage/ips',
    stats: [
      { label: 'IP 数量', value: `${presets.ips.length}` },
      { label: '适用场景', value: '角色归属' }
    ]
  },
  {
    key: 'characters',
    group: 'preset',
    title: '角色管理',
    kicker: '预设 / 角色',
    meta: `${presets.characters.length} 个角色`,
    detail: '维护角色名称与所属 IP，用于细粒度检索和偏好聚合。',
    summary: '如果你经常按角色收纳或统计，这一项应该保持最完整。',
    recommendation: '优先补齐高频角色，再回头清理低频或重复条目。',
    primaryLabel: '打开角色管理',
    secondaryLabel: '',
    iconMode: 'text',
    iconClass: 'char-icon',
    iconText: '角',
    path: '/manage/characters',
    stats: [
      { label: '角色数量', value: `${presets.characters.length}` },
      { label: '关联字段', value: 'IP / 收藏' }
    ]
  },
  {
    key: 'storage',
    group: 'daily',
    title: '收纳位置',
    kicker: '日常管理',
    meta: `${presets.storageLocations.length} 个层级节点`,
    detail: '按柜子、抽屉和活页册建立位置树，适合把现实收纳映射到应用里。',
    summary: '位置结构比单个标签更利于找物和回看，也方便后续批量搬迁。',
    recommendation: '先搭出一级和二级结构，再逐步补录具体格位。',
    primaryLabel: '打开收纳位置',
    secondaryLabel: '',
    iconMode: 'svg',
    iconClass: 'storage-icon',
    iconPaths: ['M4 7h16', 'M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7', 'M9 11h6', 'M9 15h4'],
    path: '/storage-locations',
    stats: [
      { label: '位置节点', value: `${presets.storageLocations.length}` },
      { label: '用途', value: '实体收纳' }
    ]
  },
  {
    key: 'theme',
    group: 'daily',
    title: '主题模式',
    kicker: '外观与主题',
    meta: '切换界面主题和外观偏好',
    detail: '管理浅色、深色和主题风格，让信息密度和阅读对比更适合当前设备。',
    summary: '大屏更适合清晰的层次和更低噪声的色彩，小屏则优先保证点击识别。',
    recommendation: '建议在常用设备上分别看一次，确认对比和留白是否稳定。',
    primaryLabel: '打开主题设置',
    secondaryLabel: '',
    iconMode: 'svg',
    iconClass: 'theme-icon',
    iconPaths: ['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41', 'M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z'],
    path: '/manage/theme',
    stats: [
      { label: '目标', value: '观感统一' },
      { label: '影响范围', value: '全局界面' }
    ]
  },
  {
    key: 'trash',
    group: 'daily',
    title: '回收站',
    kicker: '日常管理',
    meta: `${goodsStore.trashList.length} 条待处理记录`,
    detail: '查看误删内容、恢复项目，或在确认后彻底清空历史删除项。',
    summary: '当回收站条目持续增长时，说明日常整理路径可能还需要再顺手一些。',
    recommendation: '建议定期清理长期无恢复价值的记录，保持状态轻量。',
    primaryLabel: '打开回收站',
    secondaryLabel: '',
    iconMode: 'svg',
    iconClass: 'trash-icon',
    iconPaths: ['M3 6H21', 'M8 6V4H16V6', 'M19 6L18 20H6L5 6', 'M10 11V17', 'M14 11V17'],
    path: '/trash',
    stats: [
      { label: '待处理', value: `${goodsStore.trashList.length}` },
      { label: '风险', value: '可恢复' }
    ]
  },
  {
    key: 'export',
    group: 'data',
    title: '导出数据',
    kicker: '数据管理',
    meta: exportSummaryText.value,
    detail: '把收藏、心愿、活动、充值和预设导出为备份文件，支持轻量导出和自定义导出范围。',
    summary: '备份应该是低负担的日常动作，而不是出问题后才想起来做的补救。',
    recommendation: '建议在大改预设或批量导入前先做一次轻量导出。',
    primaryLabel: '立即导出',
    secondaryLabel: '自定义导出',
    iconMode: 'svg',
    iconClass: 'export-icon',
    iconPaths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8L12 3L7 8', 'M12 3V15'],
    action: 'export',
    secondaryAction: 'export-picker',
    stats: [
      { label: '导出范围', value: '收藏 / 活动 / 预设' },
      { label: '当前规模', value: `${collectionCount.value + wishlistCount.value + eventCount.value + rechargeCount.value}` }
    ]
  },
  {
    key: 'import',
    group: 'data',
    title: '导入数据',
    kicker: '数据管理',
    meta: '从备份文件恢复或合并数据',
    detail: '读取备份 JSON，合并收藏、活动、充值和预设信息。',
    summary: '导入属于高影响操作，入口应该明确，反馈也应该足够直接。',
    recommendation: '导入前先做一次当前数据备份，避免误覆盖后难以回滚。',
    primaryLabel: '选择备份文件',
    secondaryLabel: '',
    iconMode: 'svg',
    iconClass: 'import-icon',
    iconPaths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10L12 15L17 10', 'M12 15V3'],
    action: 'import',
    stats: [
      { label: '支持格式', value: 'JSON 备份' },
      { label: '适用场景', value: '迁移 / 恢复' }
    ]
  },
  {
    key: 'sync',
    group: 'cloud',
    title: 'GitHub Gist 同步',
    kicker: '云同步',
    meta: syncMetaText.value,
    detail: '连接 GitHub 后可在多设备之间同步数据，并检查令牌、Gist 和远端状态。',
    summary: '同步页应该更偏状态中心，而不是单次操作页，核心是看得清“现在是否安全”。',
    recommendation: '如果已经登录，优先确认最近同步时间和授权范围是否正常。',
    primaryLabel: '打开同步中心',
    secondaryLabel: '',
    iconMode: 'svg',
    iconClass: 'sync-icon',
    iconPaths: ['M21.5 2v6h-6', 'M2.5 22v-6h6', 'M2 11.5a10 10 0 0 1 18.8-4.3', 'M22 12.5a10 10 0 0 1-18.8 4.3'],
    path: '/manage/sync',
    stats: [
      { label: '连接状态', value: syncStore.githubLogin ? '已连接' : '未连接' },
      { label: '最近同步', value: syncStore.lastSyncedAt ? formatSyncTime(syncStore.lastSyncedAt) : '从未同步' }
    ]
  },
  {
    key: 'about',
    group: 'app',
    title: '关于应用',
    kicker: '应用信息',
    meta: '版本、说明与使用方式',
    detail: '查看版本、数据说明和同步使用方式，方便回顾规则和排查问题。',
    summary: '说明页应该承担“减少疑问”的职责，而不是单纯展示版本号。',
    recommendation: '把常见导入导出或同步说明放在这里，能显著减少误操作。',
    primaryLabel: '打开关于页',
    secondaryLabel: '',
    iconMode: 'svg',
    iconClass: 'about-icon',
    iconPaths: ['M12 10v6', 'M12 7h.01', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18Z'],
    path: '/manage/about',
    stats: [
      { label: '内容类型', value: '说明 / 版本' },
      { label: '适用时机', value: '排查 / 回顾' }
    ]
  }
]))

const manageEntryGroups = computed(() => {
  const groups = [
    { key: 'preset', label: 'Presets', title: '预设与命名' },
    { key: 'daily', label: 'Daily', title: '日常整理' },
    { key: 'data', label: 'Data', title: '备份与恢复' },
    { key: 'cloud', label: 'Cloud', title: '云端状态' },
    { key: 'app', label: 'App', title: '应用信息' }
  ]

  return groups.map((group) => ({
    ...group,
    entries: manageEntries.value.filter((entry) => entry.group === group.key)
  })).filter((group) => group.entries.length > 0)
})

const activeManageEntry = computed(() => (
  manageEntries.value.find((entry) => entry.key === selectedManageKey.value) || manageEntries.value[0] || null
))

const manageComponentMap = {
  categories: CategoryManageView,
  ips: IpManageView,
  characters: CharacterManageView,
  storage: StorageLocationsView,
  theme: ThemeView,
  trash: TrashView,
  sync: SyncView,
  about: AboutView
}

const activeManageComponent = computed(() => manageComponentMap[activeManageEntry.value?.key] || null)

const EXPORT_LONG_PRESS_DELAY_MS = 420
const exportSectionOptions = [
  { key: 'goods', label: '收藏', desc: '当前收藏记录' },
  { key: 'wishlist', label: '心愿单', desc: '计划入手记录' },
  { key: 'trash', label: '回收站', desc: '已删除但尚未清空的数据' },
  { key: 'events', label: '活动', desc: '活动、曲目与关联谷子' },
  { key: 'images', label: '图片', desc: '导出时内嵌本地图片（体积大、更慢）' },
  { key: 'recharge', label: '充值', desc: '充值记录与回收站' },
  { key: 'presets', label: '预设', desc: '分类、IP、角色和收纳位置' }
]

function createDefaultExportSelection() {
  return exportSectionOptions.reduce((result, option) => {
    result[option.key] = option.key === 'images' ? false : true
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

function extractUserImagePath(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const match = text.match(/user-images\/[\w.\-]+/)
  return match ? match[0] : ''
}

function collectReferencedUserImagePaths() {
  const refs = new Set()
  const collectFromImageList = (images) => {
    if (!Array.isArray(images)) return
    for (const image of images) {
      if (!image) continue
      if (typeof image === 'string') {
        const path = extractUserImagePath(image)
        if (path) refs.add(path)
        continue
      }

      const uriPath = extractUserImagePath(image.uri)
      if (uriPath) refs.add(uriPath)
      const localPath = extractUserImagePath(image.localPath)
      if (localPath) refs.add(localPath)
    }
  }

  const collectFromGoodsItem = (item) => {
    if (!item) return
    const imagePath = extractUserImagePath(item.image)
    if (imagePath) refs.add(imagePath)
    const coverPath = extractUserImagePath(item.coverImage)
    if (coverPath) refs.add(coverPath)
    collectFromImageList(item.images)
  }

  const collectFromEvent = (event) => {
    if (!event) return
    const coverPath = extractUserImagePath(event.coverImage)
    if (coverPath) refs.add(coverPath)
    if (Array.isArray(event.photos)) {
      for (const photo of event.photos) {
        if (!photo) continue
        const uriPath = extractUserImagePath(photo.uri)
        if (uriPath) refs.add(uriPath)
        const localPath = extractUserImagePath(photo.localPath)
        if (localPath) refs.add(localPath)
      }
    }
  }

  for (const item of goodsStore.list) collectFromGoodsItem(item)
  for (const item of goodsStore.trashList) collectFromGoodsItem(item)
  for (const event of eventsStore.list) collectFromEvent(event)

  return refs
}

function formatCompactSize(bytes) {
  const value = Number(bytes) || 0
  if (value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

async function cleanupUnreferencedLocalImages() {
  if (!Capacitor.isNativePlatform()) return { removed: 0, bytes: 0 }

  const referenced = collectReferencedUserImagePaths()
  let removed = 0
  let bytes = 0

  try {
    const res = await Filesystem.readdir({ path: 'user-images', directory: Directory.Data })
    const files = (res?.files || []).filter((entry) => entry?.type !== 'directory')

    for (const entry of files) {
      const filePath = `user-images/${entry.name}`
      if (referenced.has(filePath)) continue
      await Filesystem.deleteFile({ path: filePath, directory: Directory.Data })
      removed += 1
      bytes += Number(entry.size) || 0
    }
  } catch {
    // ignore when directory does not exist or platform has limitations
  }

  return { removed, bytes }
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
let isRouteLeaving = false
const BACKUP_DIR = 'GoodsAppBackup'
const BACKUP_RETENTION_COUNT = 5

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

function selectManageEntry(key) {
  selectedManageKey.value = key
}

function runManageEntryPrimary(entry) {
  if (!entry) return
  if (entry.action === 'export') {
    handleExportClick()
    return
  }
  if (entry.action === 'import') {
    triggerImport()
    return
  }
  if (entry.path) {
    goManageChild(entry.path)
  }
}

function runManageEntrySecondary(entry) {
  if (!entry) return
  if (entry.secondaryAction === 'export-picker') {
    openExportPicker()
    return
  }
  if (entry.path) {
    goManageChild(entry.path)
  }
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
  if (isRouteLeaving) return
  if (pageScrollRaf) return
  pageScrollRaf = window.requestAnimationFrame(() => {
    pageScrollRaf = 0
    if (isRouteLeaving) return
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
  isRouteLeaving = false
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

  void cleanupUnreferencedLocalImages().then(({ removed, bytes }) => {
    if (removed > 0) {
      showToast(`已清理 ${removed} 张无引用本地图，释放 ${formatCompactSize(bytes)}`, 3800)
    }
  }).catch(() => {})
})

onActivated(async () => {
  isRouteLeaving = false
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
  if (!hasPendingRestore() && !isRouteLeaving) {
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
  if (!hasPendingRestore() && !isRouteLeaving) {
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
  isRouteLeaving = true
  saveScrollPosition(false, 'manage:onBeforeRouteLeave')
  if (pageScrollRaf) {
    window.cancelAnimationFrame(pageScrollRaf)
    pageScrollRaf = 0
  }
  unbindPageScroll()
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

async function pruneDirectoryBackupFiles(path, directory, keepCount = BACKUP_RETENTION_COUNT) {
  try {
    const res = await Filesystem.readdir({ path, directory })
    const files = (res?.files || [])
      .filter((entry) => entry?.type !== 'directory')
      .sort((a, b) => String(b?.name || '').localeCompare(String(a?.name || '')))

    if (files.length <= keepCount) return

    const stale = files.slice(keepCount)
    for (const entry of stale) {
      const filePath = `${path}/${entry.name}`
      await Filesystem.deleteFile({ path: filePath, directory })
    }
  } catch {
    // ignore missing directories or delete failures
  }
}

async function pruneBackupArtifacts() {
  if (!Capacitor.isNativePlatform()) return

  await Promise.all([
    pruneDirectoryBackupFiles(BACKUP_DIR, Directory.Documents),
    pruneDirectoryBackupFiles('backup', Directory.Data),
    pruneDirectoryBackupFiles('backup-share', Directory.Cache)
  ])
}

async function handleExport(selection = null) {
  await ensureEventsReady()
  const selected = selection || createDefaultExportSelection()
  const includeGoods = selected.goods !== false
  const includeWishlist = selected.wishlist !== false
  const includeTrash = selected.trash !== false
  const includeEvents = selected.events !== false
  const includeImages = selected.images === true
  const includeRecharge = selected.recharge !== false
  const includePresets = selected.presets !== false
  const useLightweightImageExport = !includeImages

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

  const safeSanitizeGoodsItemLight = async (item) => {
    try {
      return sanitizeGoodsItemForSync(item)
    } catch {
      return null
    }
  }

  const safeSanitizeEventLight = async (event) => {
    try {
      if (!event) return null
      const { coverImage, photos, ...rest } = event
      return {
        ...rest,
        coverImage: String(coverImage || ''),
        photos: Array.isArray(photos) ? photos.map((photo) => ({ ...photo })) : []
      }
    } catch {
      return null
    }
  }

  const sanitizeSequential = async (list, sanitizeFn) => {
    const result = []
    for (const item of list) {
      const sanitized = await sanitizeFn(item)
      if (sanitized) result.push(sanitized)
    }
    return result
  }

  const goodsList = includeGoods
    ? await sanitizeSequential(
      goodsStore.list.filter((item) => !item?.isWishlist),
      useLightweightImageExport ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
    )
    : undefined
  const wishlistList = includeWishlist
    ? await sanitizeSequential(
      goodsStore.list.filter((item) => item?.isWishlist),
      useLightweightImageExport ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
    )
    : undefined
  const trashList = includeTrash
    ? await sanitizeSequential(
      goodsStore.trashList,
      useLightweightImageExport ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
    )
    : undefined
  const rechargeRecords = includeRecharge ? rechargeStore.exportBackup({ includeDeleted: false, stripImage: true }) : undefined
  const rechargeTrash = includeRecharge ? [] : undefined
  const eventsList = includeEvents
    ? await sanitizeSequential(
      eventsStore.list,
      useLightweightImageExport ? safeSanitizeEventLight : safeSanitizeEventForExport
    )
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
  const json = JSON.stringify(data)
  const filename = `谷子备份_${new Date().toISOString().split('T')[0]}.json`

  try {
    if (Capacitor.isNativePlatform()) {
      const saved = await exportBackupToNative(json, filename)
      let shared = await shareBackupFile(saved.uri).catch(() => false)

      const shouldTryShareCacheFallback = !shared && json.length < 4 * 1024 * 1024
      if (shouldTryShareCacheFallback) {
        const shareable = await exportBackupToShareCache(json, filename).catch(() => null)
        if (shareable) {
          shared = await shareBackupFile(shareable.uri).catch(() => false)
        }
      }

      if (shared) {
        void pruneBackupArtifacts().catch(() => {})
        showToast(
          useLightweightImageExport
            ? '已打开分享面板（轻量导出：图片未内嵌）'
            : (
              saved.visibleToUser
                ? `已打开分享面板，并写入 文档/${saved.path}`
                : '已打开分享面板，请选择“保存到文件”或其他目标'
            ),
          4200
        )
        return
      }

      void pruneBackupArtifacts().catch(() => {})
      showToast(
        useLightweightImageExport
          ? `已导出轻量备份到 ${saved.visibleToUser ? `文档/${saved.path}` : `应用目录 ${saved.path}`}`
          : (
            saved.visibleToUser
              ? `已导出到 文档/${saved.path}`
              : `已导出到应用目录 ${saved.path}`
          ),
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
  padding: calc(env(safe-area-inset-top) + 12px) var(--page-padding) 120px;
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
.settings-embedded :deep(.about-page) {
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
