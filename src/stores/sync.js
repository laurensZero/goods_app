import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useGoodsStore } from './goods'
import { usePresetsStore } from './presets'
import {
  validateToken,
  createGist,
  getGist,
  updateGist,
  listGists,
  extractGistFileContent,
  buildSyncDescription
} from '@/utils/githubGist'
import { sanitizeGoodsItemForExport } from '@/utils/goodsImages'

const TOKEN_KEY = 'sync_github_token'
const GIST_ID_KEY = 'sync_gist_id'
const LAST_SYNC_KEY = 'sync_last_synced_at'
const DEVICE_ID_KEY = 'sync_device_id'

const DATA_FILENAME = 'data.json'
const MANIFEST_FILENAME = 'manifest.json'

const IS_NATIVE = Capacitor.isNativePlatform()

function generateDeviceId() {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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
  let id = await readKey(DEVICE_ID_KEY)
  if (!id) {
    id = generateDeviceId()
    await writeKey(DEVICE_ID_KEY, id)
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
  }

  async function saveToken(newToken) {
    token.value = newToken
    await writeKey(TOKEN_KEY, newToken)
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

  async function buildSyncData() {
    const goodsStore = useGoodsStore()
    const presets = usePresetsStore()

    const goodsList = await Promise.all(
      goodsStore.list.map((item) => sanitizeGoodsItemForExport(item))
    )
    const trashList = await Promise.all(
      goodsStore.trashList.map((item) => sanitizeGoodsItemForExport(item))
    )

    return {
      version: 5,
      updatedAt: new Date().toISOString(),
      deviceId: deviceId.value,
      goods: goodsList,
      trash: trashList,
      presets: {
        categories: [...presets.categories],
        ips: [...presets.ips],
        characters: presets.characters.map((c) => ({ ...c })),
        storageLocations: [...presets.storageLocationPaths]
      }
    }
  }

  function buildManifest() {
    return {
      version: 1,
      deviceId: deviceId.value,
      lastSyncAt: new Date().toISOString()
    }
  }

  async function ensureGist() {
    if (gistId.value) {
      const existing = await getGist(token.value, gistId.value)
      if (existing) return existing
    }

    const desc = buildSyncDescription(deviceId.value)
    const matched = await listGists(token.value, 'goods-app-sync')
    if (matched.length > 0) {
      await saveGistId(matched[0].id)
      return matched[0]
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

  function detectConflict(localData, remoteManifest) {
    if (!remoteManifest?.lastSyncAt) return false
    if (!lastSyncedAt.value) return false

    const remoteTime = new Date(remoteManifest.lastSyncAt).getTime()
    const localTime = new Date(lastSyncedAt.value).getTime()

    return remoteTime > localTime && remoteManifest.deviceId !== deviceId.value
  }

  async function pullFromRemote(gist) {
    const dataContent = extractGistFileContent(gist, DATA_FILENAME)
    if (!dataContent) throw new Error('远程数据为空')

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

    if (remoteData.goods?.length) {
      await goodsStore.importGoodsBackup(remoteData.goods)
      await presets.syncCharactersFromGoods(remoteData.goods)
      await presets.syncStorageLocationsFromPaths(
        remoteData.goods.map((item) => item.storageLocation).filter(Boolean)
      )
    }

    if (remoteData.trash?.length) {
      await goodsStore.importTrashBackup(remoteData.trash)
    }
  }

  async function pushToRemote() {
    const syncData = await buildSyncData()
    const manifest = buildManifest()

    await updateGist(token.value, gistId.value, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    })

    await saveLastSyncedAt(manifest.lastSyncAt)
  }

  async function fullSync() {
    if (isSyncing.value) return
    if (!token.value) throw new Error('未配置 Token')

    isSyncing.value = true
    lastError.value = ''
    conflictData.value = null
    syncStatus.value = '正在连接...'

    try {
      const gist = await ensureGist()
      syncStatus.value = '检查远端数据...'

      const manifestContent = extractGistFileContent(gist, MANIFEST_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      const remoteTime = remoteManifest?.lastSyncAt ? new Date(remoteManifest.lastSyncAt).getTime() : 0
      const localSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0
      const isRemoteFromOtherDevice = remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value

      // 远端有数据且比本地记录更新
      if (remoteTime > localSyncTime) {
        // 是其他设备上传的 → 冲突，让用户选择
        if (isRemoteFromOtherDevice && localSyncTime > 0) {
          conflictData.value = {
            remoteTime: remoteManifest.lastSyncAt,
            remoteDevice: remoteManifest.deviceId,
            localTime: lastSyncedAt.value,
            gist
          }
          syncStatus.value = '检测到冲突'
          return
        }

        // 同一设备或首次同步 → 拉取
        syncStatus.value = '正在拉取远端数据...'
        await pullFromRemote(gist)
        await saveLastSyncedAt(remoteManifest.lastSyncAt)
        syncStatus.value = '同步完成'
        return
      }

      // 本地是最新的或从未同步 → 上传
      syncStatus.value = '正在上传数据...'
      await pushToRemote()
      syncStatus.value = '同步完成'
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
        await pullFromRemote(conflictData.value.gist)
        const manifestContent = extractGistFileContent(conflictData.value.gist, MANIFEST_FILENAME)
        const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
      } else {
        syncStatus.value = '正在上传本地数据...'
        await pushToRemote()
      }
      conflictData.value = null
      syncStatus.value = '同步完成'
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

    isSyncing.value = true
    lastError.value = ''
    syncStatus.value = '正在拉取...'

    try {
      const gist = await getGist(token.value, gistId.value)
      if (!gist) throw new Error('未找到 Gist')

      syncStatus.value = '正在拉取远端数据...'
      await pullFromRemote(gist)

      const manifestContent = extractGistFileContent(gist, MANIFEST_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())

      syncStatus.value = '拉取完成'
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
    clearConflict,
    resetConfig
  }
})
