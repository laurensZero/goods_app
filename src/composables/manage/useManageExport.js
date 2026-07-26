import { computed, onBeforeUnmount, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import i18n from '@/locales'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useRechargeStore } from '@/stores/recharge'

const BACKUP_DIR = 'GoodsAppBackup'
const BACKUP_RETENTION_COUNT = 5
const EXPORT_LONG_PRESS_DELAY_MS = 420

const EXPORT_OPTION_KEYS = [
  { key: 'goods', labelKey: 'manage.exportGoods', descKey: 'manage.exportGoodsDesc' },
  { key: 'wishlist', labelKey: 'manage.exportWishlist', descKey: 'manage.exportWishlistDesc' },
  { key: 'trash', labelKey: 'manage.exportTrash', descKey: 'manage.exportTrashDesc' },
  { key: 'events', labelKey: 'manage.exportEvents', descKey: 'manage.exportEventsDesc' },
  { key: 'images', labelKey: 'manage.exportImages', descKey: 'manage.exportImagesDesc' },
  { key: 'recharge', labelKey: 'manage.exportRecharge', descKey: 'manage.exportRechargeDesc' },
  { key: 'presets', labelKey: 'manage.exportPresets', descKey: 'manage.exportPresetsDesc' }
]

export const exportSectionOptions = EXPORT_OPTION_KEYS.map((opt) => ({
  ...opt,
  get label() { return i18n.global.t(opt.labelKey) },
  get desc() { return i18n.global.t(opt.descKey) }
}))

export function createDefaultExportSelection() {
  return exportSectionOptions.reduce((result, option) => {
    result[option.key] = option.key === 'images' ? false : true
    return result
  }, {})
}

function extractUserImagePath(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const match = text.match(/user-images\/[\w.\-]+/)
  return match ? match[0] : ''
}

function collectReferencedUserImagePaths() {
  const goodsStore = useGoodsStore()
  const eventsStore = useEventsStore()
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

  const { Filesystem, Directory } = await import('@capacitor/filesystem')
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

async function exportBackupToNative(json, filename) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
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

    return { path: publicPath, uri: result.uri, visibleToUser: true }
  } catch {
    const fallbackPath = `backup/${filename}`
    const result = await Filesystem.writeFile({
      path: fallbackPath,
      data: json,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true
    })

    return { path: fallbackPath, uri: result.uri, visibleToUser: false }
  }
}

async function exportBackupToShareCache(json, filename) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const sharePath = `backup-share/${filename}`
  const result = await Filesystem.writeFile({
    path: sharePath,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true
  })
  return { path: sharePath, uri: result.uri }
}

async function shareBackupFile(uri) {
  const { Share } = await import('@capacitor/share')
  const canShare = await Share.canShare().catch(() => ({ value: false }))
  if (!canShare.value) return false
  await Share.share({
    title: i18n.global.t('manage.exportBackupTitle'),
    text: i18n.global.t('manage.exportBackupText'),
    dialogTitle: i18n.global.t('manage.exportBackupTitle'),
    files: [uri]
  })
  return true
}

async function pruneDirectoryBackupFiles(path, directory, keepCount = BACKUP_RETENTION_COUNT) {
  const { Filesystem } = await import('@capacitor/filesystem')
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

  const { Directory } = await import('@capacitor/filesystem')
  await Promise.all([
    pruneDirectoryBackupFiles(BACKUP_DIR, Directory.Documents),
    pruneDirectoryBackupFiles('backup', Directory.Data),
    pruneDirectoryBackupFiles('backup-share', Directory.Cache)
  ])
}

export function useManageExport({ showToast, ensureEventsReady } = {}) {
  const goodsStore = useGoodsStore()
  const eventsStore = useEventsStore()
  const presetsStore = usePresetsStore()
  const rechargeStore = useRechargeStore()

  const importFileRef = ref(null)
  const showExportPicker = ref(false)
  const exportSelection = ref(createDefaultExportSelection())
  let exportLongPressTimer = 0
  let suppressNextExportClick = false

  const allExportSectionsSelected = computed(() =>
    exportSectionOptions.every((option) => exportSelection.value[option.key])
  )

  function openExportPicker() {
    exportSelection.value = createDefaultExportSelection()
    showExportPicker.value = true
  }

  function closeExportPicker() {
    showExportPicker.value = false
    suppressNextExportClick = false
  }

  function toggleExportSection(key) {
    exportSelection.value = { ...exportSelection.value, [key]: !exportSelection.value[key] }
  }

  function toggleExportAll() {
    const nextValue = !allExportSectionsSelected.value
    exportSelection.value = exportSectionOptions.reduce((result, option) => {
      result[option.key] = nextValue
      return result
    }, {})
  }

  function startExportLongPress() {
    if (exportLongPressTimer) window.clearTimeout(exportLongPressTimer)
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

  function handleExportClick() {
    if (suppressNextExportClick) {
      suppressNextExportClick = false
      return
    }
    handleExport()
  }

  function confirmExportSelection() {
    const selectedCount = exportSectionOptions.reduce(
      (sum, option) => sum + (exportSelection.value[option.key] ? 1 : 0), 0
    )
    if (selectedCount === 0) {
      showToast(i18n.global.t('manage.exportSelectAtLeastOne'))
      return
    }
    handleExport(exportSelection.value)
    closeExportPicker()
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
        ? await goodsStore.importGoodsBackup(mergedGoodsToImport) : 0
      const trashAdded = trashToImport.length > 0
        ? await goodsStore.importTrashBackup(trashToImport) : 0
      const rechargeResult = rechargeToImport.length > 0
        ? await rechargeStore.importBackup(rechargeToImport) : { added: 0, updated: 0 }

      if (data.presets) {
        for (const category of (data.presets.categories || [])) {
          if (category) await presetsStore.addCategory(category)
        }
        for (const ip of (data.presets.ips || [])) {
          if (ip) await presetsStore.addIp(ip)
        }
        for (const character of (data.presets.characters || [])) {
          if (character?.name) await presetsStore.addCharacter(character.name, character.ip || '')
        }
        await presetsStore.syncStorageLocationsFromPaths(data.presets.storageLocations || [])
      }

      await presetsStore.syncStorageLocationsFromPaths(
        mergedGoodsToImport.map((item) => item.storageLocation).filter(Boolean)
      )

      const rechargeChanged = Number(rechargeResult.added || 0) + Number(rechargeResult.updated || 0)
      const eventResult = eventsToImport.length > 0
        ? await eventsStore.importEventsBackup(eventsToImport) : { added: 0, updated: 0 }
      const eventsChanged = Number(eventResult.added || 0) + Number(eventResult.updated || 0)

      if (goodsAdded > 0 || trashAdded > 0 || rechargeChanged > 0 || eventsChanged > 0) {
        showToast(i18n.global.t('manage.importSuccess', { goods: goodsAdded, trash: trashAdded, recharge: rechargeChanged, newEvents: eventResult.added, updatedEvents: eventResult.updated }))
        return
      }

      showToast(i18n.global.t('manage.importUpToDate'))
    } catch (error) {
      showToast(i18n.global.t('manage.importFailed', { error: error.message }))
    }
  }

  async function handleExport(selection = null) {
    const { sanitizeGoodsItemForExport, sanitizeEventForExport, sanitizeGoodsItemForSync } = await import('@/utils/goods/images')
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
      try { return await sanitizeGoodsItemForExport(item) } catch { return null }
    }
    const safeSanitizeEventForExport = async (event) => {
      try { return await sanitizeEventForExport(event) } catch { return null }
    }
    const safeSanitizeGoodsItemLight = async (item) => {
      try { return sanitizeGoodsItemForSync(item) } catch { return null }
    }
    const safeSanitizeEventLight = async (event) => {
      try {
        if (!event) return null
        const { coverImage, photos, ...rest } = event
        return { ...rest, coverImage: String(coverImage || ''), photos: Array.isArray(photos) ? photos.map((p) => ({ ...p })) : [] }
      } catch { return null }
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
      ) : undefined
    const wishlistList = includeWishlist
      ? await sanitizeSequential(
        goodsStore.list.filter((item) => item?.isWishlist),
        useLightweightImageExport ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
      ) : undefined
    const trashList = includeTrash
      ? await sanitizeSequential(
        goodsStore.trashList,
        useLightweightImageExport ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
      ) : undefined
    const rechargeRecords = includeRecharge ? rechargeStore.exportBackup({ includeDeleted: false, stripImage: true }) : undefined
    const rechargeTrash = includeRecharge ? [] : undefined
    const eventsList = includeEvents
      ? await sanitizeSequential(
        eventsStore.list.filter((event) => !event?.deleted),
        useLightweightImageExport ? safeSanitizeEventLight : safeSanitizeEventForExport
      ) : undefined

    const data = {
      version: 8,
      exportedAt: new Date().toISOString(),
      ...(includeGoods ? { goods: goodsList } : {}),
      ...(includeWishlist ? { wishlist: wishlistList } : {}),
      ...(includeTrash ? { trash: trashList } : {}),
      ...(includeRecharge ? { recharge: rechargeRecords, rechargeTrash } : {}),
      ...(includeEvents ? { events: eventsList } : {}),
      ...(includePresets ? {
        presets: {
          categories: presetsStore.categories,
          ips: presetsStore.ips,
          characters: presetsStore.characters,
          storageLocations: presetsStore.storageLocationPaths
        }
      } : {})
    }
    const json = JSON.stringify(data)
    const filename = i18n.global.t('manage.backupFilename', { date: new Date().toISOString().split('T')[0] })

    try {
      if (Capacitor.isNativePlatform()) {
        const saved = await exportBackupToNative(json, filename)
        let shared = await shareBackupFile(saved.uri).catch(() => false)

        const shouldTryShareCacheFallback = !shared && json.length < 4 * 1024 * 1024
        if (shouldTryShareCacheFallback) {
          const shareable = await exportBackupToShareCache(json, filename).catch(() => null)
          if (shareable) shared = await shareBackupFile(shareable.uri).catch(() => false)
        }

        if (shared) {
          void pruneBackupArtifacts().catch(() => {})
          showToast(
            useLightweightImageExport
              ? i18n.global.t('manage.exportSharedLightweight')
              : (saved.visibleToUser
                ? i18n.global.t('manage.exportSharedWritten', { path: saved.path })
                : i18n.global.t('manage.exportSharedChoose')),
            4200
          )
          return
        }

        void pruneBackupArtifacts().catch(() => {})
        showToast(
          useLightweightImageExport
            ? i18n.global.t('manage.exportedLightweightTo', { location: saved.visibleToUser ? i18n.global.t('manage.exportedToDocument', { path: saved.path }) : i18n.global.t('manage.exportedToAppDir', { path: saved.path }) })
            : (saved.visibleToUser
              ? i18n.global.t('manage.exportedToDocument', { path: saved.path })
              : i18n.global.t('manage.exportedToAppDir', { path: saved.path })),
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
    showToast(i18n.global.t('manage.exportedToDownload', { filename }), 4200)
  }

  function cleanupExportTimers() {
    if (exportLongPressTimer) {
      window.clearTimeout(exportLongPressTimer)
      exportLongPressTimer = 0
    }
    suppressNextExportClick = false
  }

  onBeforeUnmount(cleanupExportTimers)

  return {
    // state
    importFileRef,
    showExportPicker,
    exportSelection,
    allExportSectionsSelected,
    // actions
    openExportPicker,
    closeExportPicker,
    toggleExportSection,
    toggleExportAll,
    startExportLongPress,
    cancelExportLongPress,
    handleExportClick,
    confirmExportSelection,
    triggerImport,
    handleImport,
    handleExport,
    // cleanup helpers
    cleanupUnreferencedLocalImages,
    formatCompactSize,
    cleanupExportTimers
  }
}
