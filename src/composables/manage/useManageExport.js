import { computed, onBeforeUnmount, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import i18n from '@/locales'
import { useGoodsStore } from '@/stores/goods'
import { useEventsStore } from '@/stores/events'
import { usePresetsStore } from '@/stores/presets'
import { useRechargeStore } from '@/stores/recharge'
import { useGoodsGroupStore } from '@/stores/goodsGroup'
import { appLog } from '@/utils/logger'
import {
  buildAppCsvFiles,
  packAppCsvZip,
  parseAppCsv,
  parseAppCsvFiles,
  unpackAppCsvZip
} from '@/utils/table/appDataCsv'

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
  { key: 'presets', labelKey: 'manage.exportPresets', descKey: 'manage.exportPresetsDesc' },
  { key: 'groups', labelKey: 'manage.exportGroups', descKey: 'manage.exportGroupsDesc' }
]

export const exportSectionOptions = EXPORT_OPTION_KEYS.map((opt) => ({
  ...opt,
  get label() { return i18n.global.t(opt.labelKey) },
  get desc() { return i18n.global.t(opt.descKey) }
}))

export function createDefaultExportSelection() {
  return exportSectionOptions.reduce((result, option) => {
    result[option.key] = true
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

function bytesToBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function writeExportPayload(payload, filename) {
  const isBinary = payload instanceof Uint8Array
  const data = isBinary ? bytesToBase64(payload) : payload

  try {
    if (Capacitor.isNativePlatform()) {
      const saved = await exportBackupToNative(data, filename, isBinary)
      let shared = await shareBackupFile(saved.uri).catch(() => false)

      const shouldTryShareCacheFallback = !shared && !isBinary && payload.length < 4 * 1024 * 1024
      if (shouldTryShareCacheFallback) {
        const shareable = await exportBackupToShareCache(data, filename).catch(() => null)
        if (shareable) shared = await shareBackupFile(shareable.uri).catch(() => false)
      } else if (!shared && isBinary) {
        const shareable = await exportBackupToShareCache(data, filename).catch(() => null)
        if (shareable) shared = await shareBackupFile(shareable.uri).catch(() => false)
      }

      if (shared) {
        void pruneBackupArtifacts().catch(() => {})
        return {
          kind: 'share',
          message: saved.visibleToUser
            ? i18n.global.t('manage.exportSharedWritten', { path: saved.path })
            : i18n.global.t('manage.exportSharedChoose')
        }
      }

      void pruneBackupArtifacts().catch(() => {})
      return {
        kind: 'path',
        message: saved.visibleToUser
          ? i18n.global.t('manage.exportedToDocument', { path: saved.path })
          : i18n.global.t('manage.exportedToAppDir', { path: saved.path })
      }
    }
  } catch (error) {
    appLog('warn', 'export: native write failed, falling back to browser download', { error: error?.message })
  }

  const blob = isBinary
    ? new Blob([payload], { type: 'application/zip' })
    : new Blob([payload], { type: filename.toLowerCase().endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  return {
    kind: 'download',
    message: i18n.global.t('manage.exportedToDownload', { filename })
  }
}

async function exportBackupToNative(data, filename, isBinary = false) {
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
      data,
      directory: Directory.Documents,
      encoding: isBinary ? undefined : Encoding.UTF8,
      recursive: true
    })

    return { path: publicPath, uri: result.uri, visibleToUser: true }
  } catch {
    const fallbackPath = `backup/${filename}`
    const result = await Filesystem.writeFile({
      path: fallbackPath,
      data,
      directory: Directory.Data,
      encoding: isBinary ? undefined : Encoding.UTF8,
      recursive: true
    })

    return { path: fallbackPath, uri: result.uri, visibleToUser: false }
  }
}

async function exportBackupToShareCache(data, filename) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const sharePath = `backup-share/${filename}`
  const result = await Filesystem.writeFile({
    path: sharePath,
    data,
    directory: Directory.Cache,
    encoding: typeof data === 'string' ? Encoding.UTF8 : undefined,
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
  const goodsGroupStore = useGoodsGroupStore()

  const importFileRef = ref(null)
  const showExportPicker = ref(false)
  const exportSelection = ref(createDefaultExportSelection())
  const exportFormat = ref('csv')
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

  function setExportFormat(format) {
    exportFormat.value = format === 'csv' ? 'csv' : 'json'
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
    handleExport(exportSelection.value, exportFormat.value)
    closeExportPicker()
  }

  function triggerImport() {
    if (!importFileRef.value) return
    importFileRef.value.value = ''
    importFileRef.value.click()
  }

  async function ensureGoodsGroupReady() {
    if (!goodsGroupStore.isReady) {
      try { await goodsGroupStore.init() } catch { /* ignore */ }
    }
  }

  async function applyPresetsFromPayload(presets) {
    if (!presets) return
    for (const category of (presets.categories || [])) {
      if (category) await presetsStore.addCategory(category)
    }
    for (const ip of (presets.ips || [])) {
      if (ip) await presetsStore.addIp(ip)
    }
    for (const character of (presets.characters || [])) {
      if (character?.name) await presetsStore.addCharacter(character.name, character.ip || '')
    }
    await presetsStore.syncStorageLocationsFromPaths(presets.storageLocations || [])
  }

  /** CSV 的 images/coverImage 可能是字符串或 JSON 文本；统一还原成 images 数组供 store 使用 */
  function prepareGoodsImages(item) {
    if (!item) return item
    let images = item.images
    if (typeof images === 'string') {
      const text = images.trim()
      if (text.startsWith('[')) {
        try { images = JSON.parse(text) } catch { images = [] }
      } else if (text) {
        images = [{ uri: text, isPrimary: true }]
      } else {
        images = []
      }
    }
    if (!Array.isArray(images) || images.length === 0) {
      const cover = String(item.coverImage || item.image || '').trim()
      images = cover ? [{ uri: cover, isPrimary: true }] : []
    }
    return {
      ...item,
      images,
      // importGoodsBackup 会清空 coverImage；这里先带齐主图，避免 images 解析失败时丢图
      coverImage: String(item.coverImage || images.find((i) => i?.isPrimary)?.uri || images[0]?.uri || ''),
      image: String(item.image || images.find((i) => i?.isPrimary)?.uri || images[0]?.uri || '')
    }
  }

  async function importGoodsLike(items) {
    if (!Array.isArray(items) || items.length === 0) return 0
    const prepared = items.map(prepareGoodsImages)
    const withId = prepared.filter((item) => item?.id)
    const withoutId = prepared.filter((item) => !item?.id).map((item) => ({ ...item, updatedAt: item.updatedAt || Date.now() }))
    let added = 0
    if (withId.length > 0) added += await goodsStore.importGoodsBackup(withId)
    if (withoutId.length > 0) added += await goodsStore.addGoodsBatch(withoutId)
    return added
  }

  async function importTrashLike(items) {
    if (!Array.isArray(items) || items.length === 0) return 0
    return goodsStore.importTrashBackup(items.map(prepareGoodsImages))
  }

  async function importEventsLike(events) {
    if (!Array.isArray(events) || events.length === 0) return { added: 0, updated: 0 }
    return eventsStore.importEventsBackup(events)
  }

  async function importRechargeLike(records) {
    if (!Array.isArray(records) || records.length === 0) return { added: 0, updated: 0 }
    return rechargeStore.importBackup(records)
  }

  async function importGroupsLike(groups, groupItems) {
    await ensureGoodsGroupReady()
    if ((groups?.length || 0) === 0 && (groupItems?.length || 0) === 0) return
    await goodsGroupStore.updateGroupsBackup(groups || [], groupItems || [])
  }

  async function importParsedAppCsv(files) {
    const bySchema = parseAppCsvFiles(files)
    const goodsAdded = await importGoodsLike(bySchema.goods.items)
    const trashAdded = await importTrashLike(bySchema.trash.items)
    const rechargeResult = await importRechargeLike(bySchema.recharge.items)
    const eventResult = await importEventsLike(bySchema.events.items)
    await importGroupsLike(bySchema.goods_groups.items, bySchema.goods_group_items.items)

    for (const item of bySchema.categories.items) {
      if (item?.name) await presetsStore.addCategory(item.name)
    }
    for (const item of bySchema.ips.items) {
      if (item?.name) await presetsStore.addIp(item.name)
    }
    for (const item of bySchema.characters.items) {
      if (item?.name) await presetsStore.addCharacter(item.name, item.ip || '')
    }
    if (bySchema.storage_locations.items.length > 0) {
      await presetsStore.syncStorageLocationsFromPaths(
        bySchema.storage_locations.items.map((item) => item.path).filter(Boolean)
      )
    }
    await presetsStore.syncStorageLocationsFromPaths(
      bySchema.goods.items.map((item) => item.storageLocation).filter(Boolean)
    )

    const rechargeChanged = Number(rechargeResult.added || 0) + Number(rechargeResult.updated || 0)
    const eventsChanged = Number(eventResult.added || 0) + Number(eventResult.updated || 0)
    const totalErrors = Object.values(bySchema).reduce((sum, bucket) => sum + (bucket.errors?.length || 0), 0)

    return {
      goods: goodsAdded,
      trash: trashAdded,
      recharge: rechargeChanged,
      eventsAdded: eventResult.added || 0,
      eventsUpdated: eventResult.updated || 0,
      eventsChanged,
      errorCount: totalErrors
    }
  }

  async function handleImport(event) {
    await ensureEventsReady()
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const lower = String(file.name || '').toLowerCase()

      if (lower.endsWith('.zip')) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const csvFiles = unpackAppCsvZip(bytes)
        if (csvFiles.length === 0) {
          showToast(i18n.global.t('manage.importCsvEmptyZip'))
          return
        }
        const result = await importParsedAppCsv(csvFiles)
        appLog('info', 'csv-zip-import: done', result)
        showToast(i18n.global.t('manage.importCsvSuccess', {
          goods: result.goods,
          trash: result.trash,
          recharge: result.recharge,
          newEvents: result.eventsAdded,
          updatedEvents: result.eventsUpdated
        }), 4200)
        return
      }

      if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        const text = await file.text()
        let parsed
        try {
          parsed = parseAppCsv(text, undefined, file.name)
        } catch (e) {
          if (e?.message === 'CSV_UNSTANDARD') {
            showToast(i18n.global.t('manage.importCsvUnstandard'), 4200)
            return
          }
          throw e
        }
        const result = await importParsedAppCsv([{ filename: file.name, text }])
        appLog('info', 'csv-import: done', { schema: parsed.schemaKey, ...result })
        showToast(i18n.global.t('manage.importCsvSuccess', {
          goods: result.goods,
          trash: result.trash,
          recharge: result.recharge,
          newEvents: result.eventsAdded,
          updatedEvents: result.eventsUpdated
        }), 4200)
        return
      }

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
      const groupsToImport = Array.isArray(data.goodsGroups) ? data.goodsGroups : []
      const groupItemsToImport = Array.isArray(data.goodsGroupItems) ? data.goodsGroupItems : []
      const mergedGoodsToImport = [...goodsToImport, ...wishlistToImport]

      const goodsAdded = mergedGoodsToImport.length > 0
        ? await goodsStore.importGoodsBackup(mergedGoodsToImport) : 0
      const trashAdded = trashToImport.length > 0
        ? await goodsStore.importTrashBackup(trashToImport) : 0
      const rechargeResult = rechargeToImport.length > 0
        ? await rechargeStore.importBackup(rechargeToImport) : { added: 0, updated: 0 }

      if (data.presets) await applyPresetsFromPayload(data.presets)
      await importGroupsLike(groupsToImport, groupItemsToImport)

      await presetsStore.syncStorageLocationsFromPaths(
        mergedGoodsToImport.map((item) => item.storageLocation).filter(Boolean)
      )

      const rechargeChanged = Number(rechargeResult.added || 0) + Number(rechargeResult.updated || 0)
      const eventResult = eventsToImport.length > 0
        ? await eventsStore.importEventsBackup(eventsToImport) : { added: 0, updated: 0 }
      const eventsChanged = Number(eventResult.added || 0) + Number(eventResult.updated || 0)

      appLog('info', 'backup-import: done', { goodsAdded, trashAdded, rechargeChanged, eventsAdded: eventResult.added, eventsUpdated: eventResult.updated })
      if (goodsAdded > 0 || trashAdded > 0 || rechargeChanged > 0 || eventsChanged > 0) {
        showToast(i18n.global.t('manage.importSuccess', { goods: goodsAdded, trash: trashAdded, recharge: rechargeChanged, newEvents: eventResult.added, updatedEvents: eventResult.updated }))
        return
      }

      showToast(i18n.global.t('manage.importUpToDate'))
    } catch (error) {
      appLog('error', 'backup-import: failed', { error: error.message, file: file.name, size: file.size })
      showToast(i18n.global.t('manage.importFailed', { error: error.message }))
    }
  }

  async function collectExportLists(selected, { lightweight }) {
    const { sanitizeGoodsItemForExport, sanitizeEventForExport, sanitizeGoodsItemForSync } = await import('@/utils/goods/images')
    const includeGoods = selected.goods !== false
    const includeWishlist = selected.wishlist !== false
    const includeTrash = selected.trash !== false
    const includeEvents = selected.events !== false
    const includeRecharge = selected.recharge !== false
    const includePresets = selected.presets !== false
    const includeGroups = selected.groups !== false

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
        const { coverImageData: _coverImageData, ...rest } = event
        return {
          ...rest,
          coverImage: String(rest.coverImage || ''),
          photos: Array.isArray(rest.photos) ? rest.photos.map((p) => ({ ...p })) : [],
          tracks: Array.isArray(rest.tracks) ? rest.tracks.map((t) => ({ ...t })) : []
        }
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
        lightweight ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
      ) : []
    const wishlistList = includeWishlist
      ? await sanitizeSequential(
        goodsStore.list.filter((item) => item?.isWishlist),
        lightweight ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
      ) : []
    const trashList = includeTrash
      ? await sanitizeSequential(
        goodsStore.trashList,
        lightweight ? safeSanitizeGoodsItemLight : safeSanitizeGoodsItemForExport
      ) : []
    const rechargeRecords = includeRecharge
      ? rechargeStore.exportBackup({ includeDeleted: false, stripImage: false })
      : []
    const eventsList = includeEvents
      ? await sanitizeSequential(
        eventsStore.list.filter((event) => !event?.deleted),
        lightweight ? safeSanitizeEventLight : safeSanitizeEventForExport
      ) : []

    let groupList = []
    let groupItemList = []
    if (includeGroups) {
      await ensureGoodsGroupReady()
      groupList = goodsGroupStore.groupList.filter((g) => !g?.deleted)
      const groupIds = new Set(groupList.map((g) => g.id))
      groupItemList = goodsGroupStore.groupItemList.filter((item) => !item?.deleted && groupIds.has(item.groupId))
    }

    const presets = includePresets ? {
      categories: presetsStore.categories,
      ips: presetsStore.ips,
      characters: presetsStore.characters,
      storageLocations: presetsStore.storageLocationPaths
    } : null

    return {
      goodsList, wishlistList, trashList, rechargeRecords, eventsList,
      groupList, groupItemList, presets,
      includeGoods, includeWishlist, includeTrash, includeEvents, includeRecharge, includePresets, includeGroups,
      includeImages: selected.images === true
    }
  }

  async function handleExportAsCsv(selection) {
    const selected = selection || createDefaultExportSelection()
    const lists = await collectExportLists(selected, { lightweight: true })
    const csvGoods = [
      ...(lists.includeGoods ? lists.goodsList : []),
      ...(lists.includeWishlist ? lists.wishlistList.map((item) => ({ ...item, isWishlist: true })) : [])
    ]

    const files = buildAppCsvFiles({
      goods: csvGoods,
      trash: lists.trashList,
      events: lists.eventsList,
      recharge: lists.rechargeRecords,
      groups: lists.groupList,
      groupItems: lists.groupItemList,
      categories: lists.presets?.categories || [],
      ips: lists.presets?.ips || [],
      characters: lists.presets?.characters || [],
      storageLocations: lists.presets?.storageLocations || []
    })

    if (Object.keys(files).length === 0) {
      showToast(i18n.global.t('manage.exportSelectAtLeastOne'))
      return
    }

    const zip = packAppCsvZip(files)
    const filename = i18n.global.t('manage.csvZipFilename', { date: new Date().toISOString().split('T')[0] })
    appLog('info', 'csv-export: start', {
      files: Object.keys(files),
      zipKB: Math.round(zip.length / 1024)
    })

    const result = await writeExportPayload(zip, filename)
    showToast(result.message, 4200)
  }

  async function handleExportAsJson(selection) {
    const selected = selection || createDefaultExportSelection()
    const lists = await collectExportLists(selected, { lightweight: selected.images !== true })
    const includeImages = lists.includeImages
    const useLightweightImageExport = !includeImages

    const data = {
      version: 9,
      exportedAt: new Date().toISOString(),
      ...(lists.includeGoods ? { goods: lists.goodsList } : {}),
      ...(lists.includeWishlist ? { wishlist: lists.wishlistList } : {}),
      ...(lists.includeTrash ? { trash: lists.trashList } : {}),
      ...(lists.includeRecharge ? { recharge: lists.rechargeRecords, rechargeTrash: [] } : {}),
      ...(lists.includeEvents ? { events: lists.eventsList } : {}),
      ...(lists.includeGroups ? { goodsGroups: lists.groupList, goodsGroupItems: lists.groupItemList } : {}),
      ...(lists.presets ? { presets: lists.presets } : {})
    }
    const json = JSON.stringify(data)
    const filename = i18n.global.t('manage.backupFilename', { date: new Date().toISOString().split('T')[0] })
    appLog('info', 'backup-export: start', {
      goods: lists.goodsList?.length, wishlist: lists.wishlistList?.length, trash: lists.trashList?.length,
      events: lists.eventsList?.length, recharge: lists.rechargeRecords?.length,
      groups: lists.groupList?.length,
      includeImages, sizeKB: Math.round(json.length / 1024)
    })

    const result = await writeExportPayload(json, filename)
    if (result.kind === 'share') {
      showToast(
        useLightweightImageExport
          ? i18n.global.t('manage.exportSharedLightweight')
          : result.message,
        4200
      )
      return
    }
    showToast(
      useLightweightImageExport && result.kind === 'path'
        ? i18n.global.t('manage.exportedLightweightTo', { location: result.message })
        : result.message,
      4200
    )
  }

  async function handleExport(selection = null, format = 'json') {
    await ensureEventsReady()
    const mode = format === 'csv' ? 'csv' : exportFormat.value === 'csv' ? 'csv' : 'json'
    if (mode === 'csv') {
      await handleExportAsCsv(selection)
      return
    }
    await handleExportAsJson(selection)
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
    exportFormat,
    allExportSectionsSelected,
    // actions
    openExportPicker,
    closeExportPicker,
    setExportFormat,
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
