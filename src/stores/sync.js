import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useGoodsStore } from './goods'
import { usePresetsStore, normalizeCharacterName } from './presets'
import { deleteItems } from '@/utils/db'
import {
  validateToken,
  createGist,
  getGist,
  updateGist,
  listGists,
  extractGistFileContent,
  buildSyncDescription
} from '@/utils/githubGist'
import { sanitizeGoodsItemForSync } from '@/utils/goodsImages'

const TOKEN_KEY = 'sync_github_token'
const GIST_ID_KEY = 'sync_gist_id'
const LAST_SYNC_KEY = 'sync_last_synced_at'
const DEVICE_ID_KEY = Capacitor.isNativePlatform() ? 'sync_native_device_id' : 'sync_web_device_id'

const DATA_FILENAME = 'data.json'
const MANIFEST_FILENAME = 'manifest.json'
const IS_NATIVE = Capacitor.isNativePlatform()

function generateDeviceId() {
  const platform = IS_NATIVE ? 'native' : 'web'
  return `device_${platform}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function getItemTimestamp(item) {
  return Number(item?.updatedAt) || 0
}

function resolveGoodsTrashMaps(goodsList = [], trashList = []) {
  const goodsMap = new Map(goodsList.map((item) => [item.id, item]))
  const trashMap = new Map(trashList.map((item) => [item.id, item]))

  for (const [id, trashItem] of trashMap) {
    const goodsItem = goodsMap.get(id)
    if (!goodsItem) continue

    if (getItemTimestamp(trashItem) >= getItemTimestamp(goodsItem)) {
      goodsMap.delete(id)
    } else {
      trashMap.delete(id)
    }
  }

  return { goodsMap, trashMap }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObjectKeys(value[key])
      return result
    }, {})
}

async function readKey(key) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch {
      // fall through
    }
  }

  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

async function writeKey(key, value) {
  try {
    localStorage.setItem(key, value ?? '')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key, value: value ?? '' })
  } catch {
    // ignore
  }
}

async function readDeviceId() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: DEVICE_ID_KEY })
      if (value) return value
    } catch {
      // fall through
    }
  }

  let id = ''
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) || ''
  } catch {
    id = ''
  }

  if (id) return id

  id = generateDeviceId()

  try {
    localStorage.setItem(DEVICE_ID_KEY, id)
  } catch {
    // ignore
  }

  if (IS_NATIVE) {
    try {
      await Preferences.set({ key: DEVICE_ID_KEY, value: id })
    } catch {
      // ignore
    }
  }

  return id
}

export const useSyncStore = defineStore('sync', () => {
  const token = ref('')
  const gistId = ref('')
  const lastSyncedAt = ref('')
  const deviceId = ref('')
  const isInitialized = ref(false)
  const isSyncing = ref(false)
  const syncStatus = ref('')
  const lastError = ref('')
  const conflictData = ref(null)

  const isConfigured = computed(() => !!token.value && !!gistId.value)

  async function init() {
    token.value = (await readKey(TOKEN_KEY)) || ''
    gistId.value = (await readKey(GIST_ID_KEY)) || ''
    lastSyncedAt.value = (await readKey(LAST_SYNC_KEY)) || ''
    deviceId.value = await readDeviceId()
    isInitialized.value = true

    if (token.value && !gistId.value) {
      try {
        const matched = await listGists(token.value, 'goods-app-sync')
        if (matched.length > 0) {
          await saveGistId(matched[0].id)
        }
      } catch {
        // ignore
      }
    }
  }

  async function saveToken(newToken) {
    token.value = newToken
    await writeKey(TOKEN_KEY, newToken)
    gistId.value = ''
    lastSyncedAt.value = ''
    await writeKey(GIST_ID_KEY, '')
    await writeKey(LAST_SYNC_KEY, '')
  }

  async function saveGistId(newGistId) {
    gistId.value = newGistId
    await writeKey(GIST_ID_KEY, newGistId)
  }

  async function saveLastSyncedAt(timestamp) {
    lastSyncedAt.value = timestamp
    await writeKey(LAST_SYNC_KEY, timestamp)
  }

  async function checkTokenValidity() {
    if (!token.value) return { valid: false, login: '' }
    return validateToken(token.value)
  }

  async function buildPresetsData() {
    const presets = usePresetsStore()
    return {
      categories: [...presets.categories],
      ips: [...presets.ips],
      characters: presets.characters
        .map((item) => ({
          ...item,
          name: normalizeCharacterName(item?.name || ''),
          ip: String(item?.ip || '').trim()
        }))
        .filter((item) => item.name),
      storageLocations: [...presets.storageLocationPaths]
    }
  }

  async function buildSyncData(incremental = false) {
    const goodsStore = useGoodsStore()
    const lastSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)

    const sourceGoods = [...resolvedLocal.goodsMap.values()]
    const sourceTrash = [...resolvedLocal.trashMap.values()]

    const goods = await Promise.all(
      sourceGoods
        .filter((item) => !incremental || lastSyncTime <= 0 || getItemTimestamp(item) > lastSyncTime)
        .map((item) => sanitizeGoodsItemForSync(item))
    )

    const trash = await Promise.all(
      sourceTrash
        .filter((item) => !incremental || lastSyncTime <= 0 || getItemTimestamp(item) > lastSyncTime)
        .map((item) => sanitizeGoodsItemForSync(item))
    )

    return {
      version: 5,
      updatedAt: new Date().toISOString(),
      deviceId: deviceId.value,
      goods,
      trash,
      presets: await buildPresetsData()
    }
  }

  async function buildComparableSyncStateFromData(data) {
    const resolved = resolveGoodsTrashMaps(data?.goods || [], data?.trash || [])
    const goods = [...resolved.goodsMap.values()]
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const trash = [...resolved.trashMap.values()]
      .map((item) => sortObjectKeys(item))
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))
    const presetsData = data?.presets || await buildPresetsData()

    return JSON.stringify(sortObjectKeys({
      goods,
      trash,
      presets: presetsData
    }))
  }

  function buildManifest() {
    return {
      version: 1,
      deviceId: deviceId.value,
      lastSyncAt: new Date().toISOString()
    }
  }

  function getLocalChangesSince(timestamp) {
    const goodsStore = useGoodsStore()
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const goods = [...resolvedLocal.goodsMap.values()]
    const trash = [...resolvedLocal.trashMap.values()]

    const updatedGoods = goods.filter((item) => getItemTimestamp(item) > timestamp).length
    const updatedTrash = trash.filter((item) => getItemTimestamp(item) > timestamp).length

    return {
      updatedGoods,
      updatedTrash,
      totalGoods: goods.length,
      totalTrash: trash.length,
      hasChanges: updatedGoods > 0 || updatedTrash > 0
    }
  }

  function getLatestLocalModifiedAt() {
    const goodsStore = useGoodsStore()
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)
    const timestamps = [
      ...[...resolvedLocal.goodsMap.values()].map((item) => getItemTimestamp(item)),
      ...[...resolvedLocal.trashMap.values()].map((item) => getItemTimestamp(item))
    ]
    const latest = Math.max(0, ...timestamps)
    return latest > 0 ? new Date(latest).toISOString() : ''
  }

  async function ensureGist() {
    if (gistId.value) {
      try {
        const existing = await getGist(token.value, gistId.value)
        if (existing) return existing
        gistId.value = ''
        await writeKey(GIST_ID_KEY, '')
      } catch (error) {
        if (error.message.includes('401')) {
          throw new Error('Token 无效或已过期，请重新配置')
        }
      }
    }

    const desc = buildSyncDescription(deviceId.value)
    const matched = await listGists(token.value, 'goods-app-sync')
    if (matched.length > 0) {
      await saveGistId(matched[0].id)
      return getGist(token.value, matched[0].id)
    }

    const syncData = await buildSyncData()
    const manifest = buildManifest()
    const created = await createGist(token.value, desc, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    })

    await saveGistId(created.id)
    await saveLastSyncedAt(manifest.lastSyncAt)
    return created
  }

  async function pullFromRemote(gist) {
    const dataContent = extractGistFileContent(gist, DATA_FILENAME)
    if (!dataContent) throw new Error('远端数据为空')

    const remoteData = JSON.parse(dataContent)
    const goodsStore = useGoodsStore()
    const presets = usePresetsStore()

    if (remoteData.presets) {
      for (const category of (remoteData.presets.categories || [])) {
        if (category) await presets.addCategory(category)
      }
      for (const ip of (remoteData.presets.ips || [])) {
        if (ip) await presets.addIp(ip)
      }
      for (const character of (remoteData.presets.characters || [])) {
        if (character?.name) {
          await presets.addCharacter(character.name, character.ip || '')
        }
      }
      await presets.syncStorageLocationsFromPaths(remoteData.presets.storageLocations || [])
    }

    const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
    const remoteGoods = [...resolvedRemote.goodsMap.values()]
    const remoteTrash = [...resolvedRemote.trashMap.values()]

    const goodsToImport = []
    const goodsToUpdate = []
    const trashIdsToRemove = new Set()
    const localGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const localTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))

    for (const remoteItem of remoteGoods) {
      const localItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)

      if (localTrashItem) {
        if (getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) {
          trashIdsToRemove.add(remoteItem.id)
        } else {
          continue
        }
      }

      if (!localItem) {
        goodsToImport.push(remoteItem)
      } else if (getItemTimestamp(remoteItem) > getItemTimestamp(localItem)) {
        goodsToUpdate.push(remoteItem)
      }
    }

    if (trashIdsToRemove.size > 0) {
      for (const id of trashIdsToRemove) {
        await goodsStore.deleteTrashItem(id)
      }
    }

    if (goodsToImport.length > 0) {
      await goodsStore.importGoodsBackup(goodsToImport)
      await presets.syncCharactersFromGoods(goodsToImport)
      await presets.syncStorageLocationsFromPaths(
        goodsToImport.map((item) => item.storageLocation).filter(Boolean)
      )
    }

    await goodsStore.updateGoodsBackup(goodsToUpdate)

    const currentGoodsMap = new Map(goodsStore.list.map((item) => [item.id, item]))
    const currentTrashMap = new Map(goodsStore.trashList.map((item) => [item.id, item]))
    const goodsIdsToDelete = new Set()
    const trashToImport = []
    const trashToUpdate = []

    for (const remoteItem of remoteTrash) {
      const localGoodsItem = currentGoodsMap.get(remoteItem.id)
      const localTrashItem = currentTrashMap.get(remoteItem.id)

      if (localGoodsItem) {
        if (getItemTimestamp(remoteItem) >= getItemTimestamp(localGoodsItem)) {
          goodsIdsToDelete.add(remoteItem.id)
        } else {
          continue
        }
      }

      if (!localTrashItem) {
        trashToImport.push(remoteItem)
      } else if (getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) {
        trashToUpdate.push(remoteItem)
      }
    }

    if (goodsIdsToDelete.size > 0) {
      goodsStore.list = goodsStore.list.filter((item) => !goodsIdsToDelete.has(item.id))
      await deleteItems([...goodsIdsToDelete])
    }

    if (trashToImport.length > 0) {
      await goodsStore.importTrashBackup(trashToImport)
    }

    if (trashToUpdate.length > 0) {
      await goodsStore.updateTrashBackup(trashToUpdate)
    }

    const remoteGoodsIds = new Set(remoteGoods.map((item) => item.id))
    const remoteTrashIds = new Set(remoteTrash.map((item) => item.id))
    const localOnlyGoodsIds = goodsStore.list
      .filter((item) => !remoteGoodsIds.has(item.id) && !remoteTrashIds.has(item.id))
      .map((item) => item.id)
    const localOnlyTrashIds = goodsStore.trashList
      .filter((item) => !remoteTrashIds.has(item.id) && !remoteGoodsIds.has(item.id))
      .map((item) => item.id)

    if (localOnlyGoodsIds.length > 0) {
      const localOnlyGoodsSet = new Set(localOnlyGoodsIds)
      goodsStore.list = goodsStore.list.filter((item) => !localOnlyGoodsSet.has(item.id))
      await deleteItems(localOnlyGoodsIds)
    }

    if (localOnlyTrashIds.length > 0) {
      for (const id of localOnlyTrashIds) {
        await goodsStore.deleteTrashItem(id)
      }
    }

    return {
      importedGoods: goodsToImport.length,
      updatedGoods: goodsToUpdate.length,
      importedTrash: trashToImport.length,
      updatedTrash: trashToUpdate.length,
      totalGoods: remoteGoods.length,
      totalTrash: remoteTrash.length
    }
  }

  async function pushToRemote(existingGist = null) {
    if (!existingGist && gistId.value) {
      await getGist(token.value, gistId.value)
    }

    const syncData = await buildSyncData()

    const manifest = buildManifest()

    await updateGist(token.value, gistId.value, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    })

    await saveLastSyncedAt(manifest.lastSyncAt)
  }

  async function buildPullConflictData(gist, remoteManifest) {
    const goodsStore = useGoodsStore()
    const dataContent = extractGistFileContent(gist, DATA_FILENAME)
    const resolvedLocal = resolveGoodsTrashMaps(goodsStore.list, goodsStore.trashList)

    let remoteGoods = []
    let remoteTrash = []

    if (dataContent) {
      try {
        const remoteData = JSON.parse(dataContent)
        const resolvedRemote = resolveGoodsTrashMaps(remoteData.goods || [], remoteData.trash || [])
        remoteGoods = [...resolvedRemote.goodsMap.values()]
        remoteTrash = [...resolvedRemote.trashMap.values()]
      } catch {
        // ignore
      }
    }

    const localGoodsMap = resolvedLocal.goodsMap
    const localTrashMap = resolvedLocal.trashMap
    const remoteGoodsMap = new Map(remoteGoods.map((item) => [item.id, item]))
    const remoteTrashMap = new Map(remoteTrash.map((item) => [item.id, item]))

    let remoteOnlyGoods = 0
    let remoteOnlyTrash = 0
    let updatedGoods = 0

    for (const remoteItem of remoteGoods) {
      const localGoodsItem = localGoodsMap.get(remoteItem.id)
      const localTrashItem = localTrashMap.get(remoteItem.id)

      if (!localGoodsItem && !localTrashItem) {
        remoteOnlyGoods++
      } else if (localGoodsItem && getItemTimestamp(remoteItem) > getItemTimestamp(localGoodsItem)) {
        updatedGoods++
      } else if (localTrashItem && getItemTimestamp(remoteItem) > getItemTimestamp(localTrashItem)) {
        updatedGoods++
      }
    }

    for (const remoteItem of remoteTrash) {
      if (!localTrashMap.has(remoteItem.id) && !localGoodsMap.has(remoteItem.id)) {
        remoteOnlyTrash++
      }
    }

    const localOnlyGoods = [...localGoodsMap.keys()].filter((id) => !remoteGoodsMap.has(id) && !remoteTrashMap.has(id)).length
    const localOnlyTrash = [...localTrashMap.keys()].filter((id) => !remoteTrashMap.has(id) && !remoteGoodsMap.has(id)).length

    return {
      remoteTime: remoteManifest?.lastSyncAt || '',
      remoteDevice: remoteManifest?.deviceId || '',
      localTime: lastSyncedAt.value,
      localModifiedTime: getLatestLocalModifiedAt(),
      gist,
      remoteGoodsCount: remoteGoods.length,
      remoteTrashCount: remoteTrash.length,
      remoteOnlyGoods,
      remoteOnlyTrash,
      localOnlyGoods,
      localOnlyTrash,
      updatedGoods
    }
  }

  async function fullSync() {
    if (isSyncing.value) return { action: 'skipped', reason: 'syncing' }
    if (!token.value) throw new Error('未配置 Token')

    isSyncing.value = true
    lastError.value = ''
    conflictData.value = null
    syncStatus.value = '正在同步...'

    try {
      const gist = await ensureGist()
      syncStatus.value = '正在检查远端数据...'

      const manifestContent = extractGistFileContent(gist, MANIFEST_FILENAME)
      const dataContent = extractGistFileContent(gist, DATA_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
      const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
      const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value)
      const localChanges = getLocalChangesSince(localSyncTime)
      const remoteData = dataContent ? JSON.parse(dataContent) : { goods: [], trash: [], presets: {} }
      const localSyncData = await buildSyncData()
      const localComparableState = await buildComparableSyncStateFromData(localSyncData)
      const remoteComparableState = await buildComparableSyncStateFromData(remoteData)
      const hasEffectiveDiff = localComparableState !== remoteComparableState

      if (!hasEffectiveDiff) {
        if (remoteManifest?.lastSyncAt) {
          await saveLastSyncedAt(remoteManifest.lastSyncAt)
        }
        syncStatus.value = '数据已经是最新'
        return {
          action: 'no_changes',
          ...getLocalChangesSince(remoteTime || localSyncTime)
        }
      }

      if (remoteTime > localSyncTime || !remoteManifest) {
        if (isRemoteFromOtherDevice && remoteManifest && localChanges.hasChanges) {
          conflictData.value = {
            remoteTime: remoteManifest.lastSyncAt,
            remoteDevice: remoteManifest.deviceId,
            localTime: lastSyncedAt.value,
            localModifiedTime: getLatestLocalModifiedAt(),
            gist
          }
          syncStatus.value = '检测到冲突'
          return { action: 'conflict' }
        }

        syncStatus.value = '正在拉取远端数据...'
        const result = await pullFromRemote(gist)
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
        syncStatus.value = '拉取完成'
        return { action: 'pulled', ...result }
      }

      syncStatus.value = '正在上传本地数据...'
      await pushToRemote(gist)
      syncStatus.value = '上传完成'
      return { action: 'pushed', ...getLocalChangesSince(remoteTime || localSyncTime) }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '同步失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  async function resolveConflict(useRemote) {
    if (!conflictData.value) return

    isSyncing.value = true
    syncStatus.value = '正在解决冲突...'

    try {
      if (useRemote) {
        syncStatus.value = '正在拉取远端数据...'
        const result = await pullFromRemote(conflictData.value.gist)
        const manifestContent = extractGistFileContent(conflictData.value.gist, MANIFEST_FILENAME)
        const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
        conflictData.value = null
        syncStatus.value = '拉取完成'
        return { action: 'pulled', ...result }
      }

      syncStatus.value = '正在上传本地数据...'
      await pushToRemote(conflictData.value.gist)
      conflictData.value = null
      syncStatus.value = '上传完成'
      return { action: 'pushed' }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '同步失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  function clearConflict() {
    conflictData.value = null
  }

  async function pullOnly() {
    if (isSyncing.value) return
    if (!token.value) throw new Error('未配置 Token')
    if (!gistId.value) throw new Error('未找到 Gist')

    isSyncing.value = true
    lastError.value = ''
    conflictData.value = null
    syncStatus.value = '正在拉取...'

    try {
      const gist = await getGist(token.value, gistId.value)
      if (!gist) throw new Error('未找到 Gist')

      const manifestContent = extractGistFileContent(gist, MANIFEST_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      const isRemoteFromOtherDevice = !!(remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value)

      if (isRemoteFromOtherDevice) {
        const diff = await buildPullConflictData(gist, remoteManifest)
        if (
          diff.remoteOnlyGoods === 0
          && diff.remoteOnlyTrash === 0
          && diff.localOnlyGoods === 0
          && diff.localOnlyTrash === 0
          && diff.updatedGoods === 0
        ) {
          syncStatus.value = '数据已是最新'
          return { action: 'no_changes' }
        }

        conflictData.value = {
          ...diff,
          isPullOnly: true
        }
        syncStatus.value = '检测到远端数据'
        return { action: 'conflict' }
      }

      syncStatus.value = '正在拉取远端数据...'
      const result = await pullFromRemote(gist)
      await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
      syncStatus.value = '拉取完成'
      return { action: 'pulled', ...result }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '拉取失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  async function resolvePullConflict(confirm) {
    if (!conflictData.value?.isPullOnly) return

    isSyncing.value = true
    syncStatus.value = '正在拉取...'

    try {
      if (!confirm) {
        syncStatus.value = '已取消'
        conflictData.value = null
        return { action: 'cancelled' }
      }

      syncStatus.value = '正在拉取远端数据...'
      const result = await pullFromRemote(conflictData.value.gist)
      const manifestContent = extractGistFileContent(conflictData.value.gist, MANIFEST_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
      syncStatus.value = '拉取完成'
      conflictData.value = null
      return { action: 'pulled', ...result }
    } catch (error) {
      lastError.value = error.message
      syncStatus.value = '拉取失败'
      throw error
    } finally {
      isSyncing.value = false
    }
  }

  async function resetConfig() {
    token.value = ''
    gistId.value = ''
    lastSyncedAt.value = ''
    await writeKey(TOKEN_KEY, '')
    await writeKey(GIST_ID_KEY, '')
    await writeKey(LAST_SYNC_KEY, '')
  }

  return {
    token,
    gistId,
    lastSyncedAt,
    deviceId,
    isInitialized,
    isSyncing,
    syncStatus,
    lastError,
    conflictData,
    isConfigured,
    init,
    saveToken,
    checkTokenValidity,
    fullSync,
    pullOnly,
    resolveConflict,
    resolvePullConflict,
    clearConflict,
    resetConfig
  }
})
