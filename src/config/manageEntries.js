import { computed } from 'vue'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { useRechargeStore } from '@/stores/recharge'
import i18n from '@/locales'

const t = i18n.global.t

function formatSyncTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function useManageEntries() {
  const goodsStore = useGoodsStore()
  const eventsStore = useEventsStore()
  const presets = usePresetsStore()
  const syncStore = useSyncStore()
  const rechargeStore = useRechargeStore()

  const collectionCount = computed(() => goodsStore.list.filter((item) => !item?.isWishlist).length)
  const wishlistCount = computed(() => goodsStore.list.filter((item) => item?.isWishlist).length)
  const eventCount = computed(() => eventsStore.list.length)
  const rechargeCount = computed(() => rechargeStore.sortedRecords.length)

  const exportSummaryText = computed(() =>
    t('manage.exportSummaryText', {
      collection: collectionCount.value,
      wishlist: wishlistCount.value,
      events: eventCount.value,
      recharge: rechargeCount.value
    })
  )

  const syncMetaText = computed(() => {
    const statusText = String(syncStore.syncStatus || '')
    if (!syncStore.isSyncing && new RegExp(t('sync.dataUpToDate') + '|' + t('sync.uploadComplete') + '|' + t('sync.pullComplete')).test(statusText)) {
      return syncStore.lastSyncedAt ? t('manage.syncDataUpToDateTime', { time: formatSyncTime(syncStore.lastSyncedAt) }) : t('manage.syncDataUpToDate')
    }
    if (syncStore.lastSyncedAt) {
      return t('manage.syncLastTime', { time: formatSyncTime(syncStore.lastSyncedAt) })
    }
    return t('manage.syncNeverCompleted')
  })

  const manageEntries = computed(() => [
    {
      key: 'categories', group: 'preset', title: t('manage.categoryManage'), kicker: t('manage.categoryKicker'),
      meta: t('manage.categoryMeta', { count: presets.categories.length }),
      detail: t('manage.categoryDetail'),
      summary: t('manage.categorySummary'),
      recommendation: t('manage.categoryRecommendation'),
      primaryLabel: t('manage.categoryPrimaryLabel'), secondaryLabel: '',
      iconMode: 'text', iconClass: 'cat-icon', iconText: '分',
      path: '/manage/categories',
      stats: [{ label: t('manage.statCategoryCount'), value: `${presets.categories.length}` }, { label: t('manage.statImpactScope'), value: t('manage.statCollectionList') }]
    },
    {
      key: 'ips', group: 'preset', title: t('manage.ipManage'), kicker: t('manage.ipKicker'),
      meta: t('manage.ipMeta', { count: presets.ips.length }),
      detail: t('manage.ipDetail'),
      summary: t('manage.ipSummary'),
      recommendation: t('manage.ipRecommendation'),
      primaryLabel: t('manage.ipPrimaryLabel'), secondaryLabel: '',
      iconMode: 'text', iconClass: 'ip-icon', iconText: 'IP',
      path: '/manage/ips',
      stats: [{ label: t('manage.statIpCount'), value: `${presets.ips.length}` }, { label: t('manage.statApplicableScene'), value: t('manage.statCharacterAttribution') }]
    },
    {
      key: 'characters', group: 'preset', title: t('manage.characterManage'), kicker: t('manage.characterKicker'),
      meta: t('manage.characterMeta', { count: presets.characters.length }),
      detail: t('manage.characterDetail'),
      summary: t('manage.characterSummary'),
      recommendation: t('manage.characterRecommendation'),
      primaryLabel: t('manage.characterPrimaryLabel'), secondaryLabel: '',
      iconMode: 'text', iconClass: 'char-icon', iconText: '角',
      path: '/manage/characters',
      stats: [{ label: t('manage.statCharacterCount'), value: `${presets.characters.length}` }, { label: t('manage.statRelatedField'), value: t('manage.statIpCollection') }]
    },
    {
      key: 'storage', group: 'daily', title: t('manage.storageLocations'), kicker: t('manage.storageKicker'),
      meta: t('manage.storageMeta', { count: presets.storageLocations.length }),
      detail: t('manage.storageDetail'),
      summary: t('manage.storageSummary'),
      recommendation: t('manage.storageRecommendation'),
      primaryLabel: t('manage.storagePrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'storage-icon',
      iconPaths: ['M4 7h16', 'M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7', 'M9 11h6', 'M9 15h4'],
      path: '/storage-locations',
      stats: [{ label: t('manage.statLocationNodes'), value: `${presets.storageLocations.length}` }, { label: t('manage.statUsage'), value: t('manage.statPhysicalStorage') }]
    },
    {
      key: 'theme', group: 'daily', title: t('manage.themeAppearance'), kicker: t('manage.themeKicker'),
      meta: t('manage.themeMeta'),
      detail: t('manage.themeDetail'),
      summary: t('manage.themeSummary'),
      recommendation: t('manage.themeRecommendation'),
      primaryLabel: t('manage.themePrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'theme-icon',
      iconPaths: ['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41', 'M12 16a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z'],
      path: '/manage/theme',
      stats: [{ label: t('manage.statGoal'), value: t('manage.statUnifiedAppearance') }, { label: t('manage.statImpactScope'), value: t('manage.statGlobalInterface') }]
    },
    {
      key: 'trash', group: 'daily', title: t('manage.trash'), kicker: t('manage.trashKicker'),
      meta: t('manage.trashMeta', { count: goodsStore.trashList.length }),
      detail: t('manage.trashDetail'),
      summary: t('manage.trashSummary'),
      recommendation: t('manage.trashRecommendation'),
      primaryLabel: t('manage.trashPrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'trash-icon',
      iconPaths: ['M3 6H21', 'M8 6V4H16V6', 'M19 6L18 20H6L5 6', 'M10 11V17', 'M14 11V17'],
      path: '/trash',
      stats: [{ label: t('manage.statPending'), value: `${goodsStore.trashList.length}` }, { label: t('manage.statRisk'), value: t('manage.statRecoverable') }]
    },
    {
      key: 'export', group: 'data', title: t('manage.export'), kicker: t('manage.exportKicker'),
      meta: exportSummaryText.value,
      detail: t('manage.exportDetail'),
      summary: t('manage.exportEntrySummary'),
      recommendation: t('manage.exportRecommendation'),
      primaryLabel: t('manage.exportPrimaryLabel'), secondaryLabel: t('manage.exportSecondaryLabel'),
      iconMode: 'svg', iconClass: 'export-icon',
      iconPaths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8L12 3L7 8', 'M12 3V15'],
      action: 'export', secondaryAction: 'export-picker',
      stats: [
        { label: t('manage.statExportScope'), value: t('manage.statExportScopeValue') },
        { label: t('manage.statCurrentSize'), value: `${collectionCount.value + wishlistCount.value + eventCount.value + rechargeCount.value}` }
      ]
    },
    {
      key: 'import', group: 'data', title: t('manage.import'), kicker: t('manage.importKicker'),
      meta: t('manage.importMeta'),
      detail: t('manage.importDetail'),
      summary: t('manage.importSummary'),
      recommendation: t('manage.importRecommendation'),
      primaryLabel: t('manage.importPrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'import-icon',
      iconPaths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10L12 15L17 10', 'M12 15V3'],
      action: 'import',
      stats: [{ label: t('manage.statSupportedFormat'), value: t('manage.statJsonBackup') }, { label: t('manage.statApplicableScene'), value: t('manage.statMigrationRestore') }]
    },
    {
      key: 'sync', group: 'cloud', title: t('manage.cloudSync'), kicker: t('manage.syncKicker'),
      meta: syncMetaText.value,
      detail: t('manage.syncDetail'),
      summary: t('manage.syncSummary'),
      recommendation: t('manage.syncRecommendation'),
      primaryLabel: t('manage.syncPrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'sync-icon',
      iconPaths: ['M21.5 2v6h-6', 'M2.5 22v-6h6', 'M2 11.5a10 10 0 0 1 18.8-4.3', 'M22 12.5a10 10 0 0 1-18.8 4.3'],
      path: '/manage/sync',
      stats: [
        { label: t('manage.statConnectionStatus'), value: syncStore.isSupabaseMode() ? t('manage.syncConnected') : t('manage.syncNotConnected') },
        { label: t('manage.statRecentSync'), value: syncStore.lastSyncedAt ? formatSyncTime(syncStore.lastSyncedAt) : t('manage.syncNeverSynced') }
      ]
    },
    {
      key: 'shares', group: 'cloud', title: t('manage.shareManage'), kicker: t('manage.shareKicker'),
      meta: t('manage.shareMeta'),
      detail: t('manage.shareDetail'),
      summary: t('manage.shareSummary'),
      recommendation: t('manage.shareRecommendation'),
      primaryLabel: t('manage.sharePrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'share-icon',
      iconPaths: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
      path: '/manage/shares',
      stats: [{ label: t('manage.statUsage'), value: t('manage.statShareManage') }, { label: t('manage.statDependency'), value: 'Supabase' }]
    },
    {
      key: 'language', group: 'app', title: t('manage.language'), kicker: 'Language',
      meta: t('manage.languageDesc'),
      detail: t('manage.languageDesc'),
      summary: '',
      recommendation: '',
      primaryLabel: '', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'lang-icon',
      iconPaths: ['M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10a15.3 15.3 0 0 1-4 10a15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z'],
      path: '/manage/language',
      stats: []
    },
    {
      key: 'notifications', group: 'app', title: t('manage.notifications'), kicker: 'Notification',
      meta: t('manage.notificationsDesc'),
      detail: t('manage.notificationsDesc'),
      summary: '',
      recommendation: '',
      primaryLabel: '', secondaryLabel: '',
      iconMode: 'svg', iconClass: 'notify-icon',
      iconPaths: ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
      path: '/manage/notifications',
      stats: []
    },
    {
      key: 'about', group: 'app', title: t('manage.about'), kicker: t('manage.aboutKicker'),
      meta: t('manage.aboutMeta'),
      detail: t('manage.aboutDetail'),
      summary: t('manage.aboutSummary'),
      recommendation: t('manage.aboutRecommendation'),
      primaryLabel: t('manage.aboutPrimaryLabel'), secondaryLabel: '',
      iconMode: 'svg', iconClass: 'about-icon',
      iconPaths: ['M12 10v6', 'M12 7h.01', 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18Z'],
      path: '/manage/about',
      stats: [{ label: t('manage.statContentType'), value: t('manage.statInfoVersion') }, { label: t('manage.statTiming'), value: t('manage.statTroubleshootReview') }]
    }
  ])

  const manageEntryGroups = computed(() => {
    const groups = [
      { key: 'preset', label: 'Presets', title: t('manage.groupPreset') },
      { key: 'daily', label: 'Daily', title: t('manage.groupDaily') },
      { key: 'data', label: 'Data', title: t('manage.groupData') },
      { key: 'cloud', label: 'Cloud', title: t('manage.groupCloud') },
      { key: 'app', label: 'App', title: t('manage.groupApp') }
    ]
    return groups.map((group) => ({
      ...group,
      entries: manageEntries.value.filter((entry) => entry.group === group.key)
    })).filter((group) => group.entries.length > 0)
  })

  return { manageEntries, manageEntryGroups, exportSummaryText, syncMetaText, formatSyncTime }
}
