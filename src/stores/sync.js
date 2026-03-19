import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useGoodsStore } from './goods'
import { usePresetsStore } from './presets'
import { saveItems } from '@/utils/db'
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
  const platform = Capacitor.isNativePlatform() ? 'native' : 'web'
  return `device_${platform}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
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
  // 优先从 Preferences 读取（原生端）
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: DEVICE_ID_KEY })
      if (value) return value
    } catch {
      // fall through
    }
  }

  // 从 localStorage 读取
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (id) return id

  // 生成新的设备 ID
  id = generateDeviceId()

  // 保存到 localStorage
  try {
    localStorage.setItem(DEVICE_ID_KEY, id)
  } catch {
    // ignore
  }

  // 原生端也保存到 Preferences
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

    // 如果有 Token 但没有 Gist ID，尝试查找已有的 Gist
    if (token.value && !gistId.value) {
      try {
        const matched = await listGists(token.value, 'goods-app-sync')
        if (matched.length > 0) {
          await saveGistId(matched[0].id)
        }
      } catch {
        // ignore network errors
      }
    }
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

  async function buildSyncData(incremental = false) {
    const goodsStore = useGoodsStore()
    const presets = usePresetsStore()

    const lastSyncTime = lastSyncedAt.value ? new Date(lastSyncedAt.value).getTime() : 0

    let goodsList
    if (incremental && lastSyncTime > 0) {
      goodsList = await Promise.all(
        goodsStore.list
          .filter((item) => (item.updatedAt || 0) > lastSyncTime)
          .map((item) => sanitizeGoodsItemForSync(item))
      )
    } else {
      goodsList = await Promise.all(
        goodsStore.list.map((item) => sanitizeGoodsItemForSync(item))
      )
    }

    let trashList
    if (incremental && lastSyncTime > 0) {
      trashList = await Promise.all(
        goodsStore.trashList
          .filter((item) => (item.updatedAt || 0) > lastSyncTime)
          .map((item) => sanitizeGoodsItemForSync(item))
      )
    } else {
      trashList = await Promise.all(
        goodsStore.trashList.map((item) => sanitizeGoodsItemForSync(item))
      )
    }

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

    // 合并远端数据：导入本地没有的，更新本地已有的（如果远端更新）
    const localGoodsMap = new Map(goodsStore.list.map(item => [item.id, item]))

    const goodsToImport = []
    const goodsToUpdate = []

    for (const remoteItem of (remoteData.goods || [])) {
      const localItem = localGoodsMap.get(remoteItem.id)
      if (!localItem) {
        // 本地没有，导入
        goodsToImport.push(remoteItem)
      } else if ((remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
        // 远端更新，需要更新本地
        goodsToUpdate.push(remoteItem)
      }
    }

    // 导入新增的数据
    if (goodsToImport.length) {
      await goodsStore.importGoodsBackup(goodsToImport)
      await presets.syncCharactersFromGoods(goodsToImport)
      await presets.syncStorageLocationsFromPaths(
        goodsToImport.map((item) => item.storageLocation).filter(Boolean)
      )
    }

    // 更新已有的数据（远端更新的版本）
    if (goodsToUpdate.length) {
      for (const item of goodsToUpdate) {
        const idx = goodsStore.list.findIndex(g => g.id === item.id)
        if (idx !== -1) {
          goodsStore.list[idx] = { ...goodsStore.list[idx], ...item }
        }
      }
      await saveItems(goodsToUpdate)
    }

    // 同步回收站：导入本地没有的，更新本地已有的
    const localTrashMap = new Map(goodsStore.trashList.map(item => [item.id, item]))
    const trashToImport = []
    const trashToUpdate = []

    for (const remoteItem of (remoteData.trash || [])) {
      const localItem = localTrashMap.get(remoteItem.id)
      if (!localItem) {
        trashToImport.push(remoteItem)
      } else if ((remoteItem.updatedAt || 0) > (localItem.updatedAt || 0)) {
        trashToUpdate.push(remoteItem)
      }
    }

    if (trashToImport.length) {
      await goodsStore.importTrashBackup(trashToImport)
    }
  }

  async function pushToRemote() {
    const goodsStore = useGoodsStore()

    // 先拉取远端数据
    const gist = await getGist(token.value, gistId.value)
    let remoteGoods = []
    let remoteTrash = []

    if (gist) {
      const content = extractGistFileContent(gist, DATA_FILENAME)
      if (content) {
        try {
          const remoteData = JSON.parse(content)
          remoteGoods = Array.isArray(remoteData.goods) ? remoteData.goods : []
          remoteTrash = Array.isArray(remoteData.trash) ? remoteData.trash : []
        } catch {
          // ignore parse error
        }
      }
    }

    // 合并：远端没有的本地数据 + 远端已有的数据
    const localGoodsIds = new Set(goodsStore.list.map((item) => item.id))
    const localTrashIds = new Set(goodsStore.trashList.map((item) => item.id))
    const remoteGoodsIds = new Set(remoteGoods.map((item) => item.id))
    const remoteTrashIds = new Set(remoteTrash.map((item) => item.id))

    // 本地新增的数据
    const newLocalGoods = await Promise.all(
      goodsStore.list
        .filter((item) => !remoteGoodsIds.has(item.id))
        .map((item) => sanitizeGoodsItemForSync(item))
    )
    const newLocalTrash = await Promise.all(
      goodsStore.trashList
        .filter((item) => !remoteTrashIds.has(item.id))
        .map((item) => sanitizeGoodsItemForSync(item))
    )

    // 合并相同 ID 的数据，使用 updatedAt 更大的版本
    const remoteGoodsMap = new Map(remoteGoods.map(item => [item.id, item]))
    const localGoodsMap = new Map(goodsStore.list.map(item => [item.id, item]))

    const mergedGoodsMap = new Map()

    // 添加远端数据
    for (const [id, remoteItem] of remoteGoodsMap) {
      mergedGoodsMap.set(id, remoteItem)
    }

    // 合并本地数据
    for (const [id, localItem] of localGoodsMap) {
      const remoteItem = remoteGoodsMap.get(id)
      if (!remoteItem) {
        // 本地新增
        mergedGoodsMap.set(id, await sanitizeGoodsItemForSync(localItem))
      } else if ((localItem.updatedAt || 0) >= (remoteItem.updatedAt || 0)) {
        // 本地更新
        mergedGoodsMap.set(id, await sanitizeGoodsItemForSync(localItem))
      }
      // 否则保留远端版本
    }

    const syncData = {
      version: 5,
      updatedAt: new Date().toISOString(),
      deviceId: deviceId.value,
      goods: [...mergedGoodsMap.values()],
      trash: await Promise.all(goodsStore.trashList.map(item => sanitizeGoodsItemForSync(item))),
      presets: await buildPresetsData()
    }

    const manifest = buildManifest()

    await updateGist(token.value, gistId.value, {
      [DATA_FILENAME]: { content: JSON.stringify(syncData) },
      [MANIFEST_FILENAME]: { content: JSON.stringify(manifest) }
    })

    await saveLastSyncedAt(manifest.lastSyncAt)
  }

  async function buildPresetsData() {
    const presets = usePresetsStore()
    return {
      categories: [...presets.categories],
      ips: [...presets.ips],
      characters: presets.characters.map((c) => ({ ...c })),
      storageLocations: [...presets.storageLocationPaths]
    }
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

      // 远端有数据且比本地记录更新，或者无法读取 manifest（被截断）
      if (remoteTime > localSyncTime || !remoteManifest) {
        // 是其他设备上传的 → 冲突，让用户选择
        if (isRemoteFromOtherDevice && remoteManifest) {
          conflictData.value = {
            remoteTime: remoteManifest.lastSyncAt,
            remoteDevice: remoteManifest.deviceId,
            localTime: lastSyncedAt.value,
            gist
          }
          syncStatus.value = '检测到冲突'
          return
        }

        // 同一设备或 manifest 丢失 → 拉取
        syncStatus.value = '正在拉取远端数据...'
        await pullFromRemote(gist)
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
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
    conflictData.value = null
    syncStatus.value = '正在拉取...'

    try {
      const gist = await getGist(token.value, gistId.value)
      if (!gist) throw new Error('未找到 Gist')

      // 检测远端数据来源
      const manifestContent = extractGistFileContent(gist, MANIFEST_FILENAME)
      const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
      const isRemoteFromOtherDevice = remoteManifest?.deviceId && remoteManifest.deviceId !== deviceId.value

      // 如果是其他设备的数据，弹窗提醒
      if (isRemoteFromOtherDevice) {
        const dataContent = extractGistFileContent(gist, DATA_FILENAME)
        let remoteGoodsCount = 0
        let remoteTrashCount = 0
        let remoteGoodsIds = new Set()
        let remoteTrashIds = new Set()
        if (dataContent) {
          try {
            const remoteData = JSON.parse(dataContent)
            const remoteGoods = Array.isArray(remoteData.goods) ? remoteData.goods : []
            const remoteTrash = Array.isArray(remoteData.trash) ? remoteData.trash : []
            remoteGoodsCount = remoteGoods.length
            remoteTrashCount = remoteTrash.length
            remoteGoodsIds = new Set(remoteGoods.map(g => g.id))
            remoteTrashIds = new Set(remoteTrash.map(t => t.id))
          } catch {
            // ignore
          }
        }

        // 计算差异
        const goodsStore = useGoodsStore()
        const localGoodsMap = new Map(goodsStore.list.map(g => [g.id, g]))
        const localTrashIds = new Set(goodsStore.trashList.map(t => t.id))

        let remoteOnlyGoods = 0
        let remoteOnlyTrash = 0
        let updatedGoods = 0

        const remoteGoodsArray = dataContent ? JSON.parse(dataContent).goods || [] : []

        for (const remoteItem of remoteGoodsArray) {
          if (!localGoodsMap.has(remoteItem.id)) {
            remoteOnlyGoods++
          } else if ((remoteItem.updatedAt || 0) > (localGoodsMap.get(remoteItem.id).updatedAt || 0)) {
            updatedGoods++
          }
        }

        remoteOnlyTrash = remoteTrashIds.size ? [...remoteTrashIds].filter(id => !localTrashIds.has(id)).length : 0
        const localOnlyGoods = [...localGoodsMap.keys()].filter(id => !remoteGoodsIds.has(id)).length
        const localOnlyTrash = [...localTrashIds].filter(id => !remoteTrashIds.has(id)).length

        conflictData.value = {
          remoteTime: remoteManifest.lastSyncAt,
          remoteDevice: remoteManifest.deviceId,
          localTime: lastSyncedAt.value,
          gist,
          remoteGoodsCount,
          remoteTrashCount,
          remoteOnlyGoods,
          remoteOnlyTrash,
          localOnlyGoods,
          localOnlyTrash,
          updatedGoods,
          isPullOnly: true
        }
        syncStatus.value = '检测到远端数据'
        return
      }

      syncStatus.value = '正在拉取远端数据...'
      await pullFromRemote(gist)
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

  async function resolvePullConflict(confirm) {
    if (!conflictData.value?.isPullOnly) return

    isSyncing.value = true
    syncStatus.value = '正在拉取...'

    try {
      if (confirm) {
        syncStatus.value = '正在拉取远端数据...'
        await pullFromRemote(conflictData.value.gist)

        const manifestContent = extractGistFileContent(conflictData.value.gist, MANIFEST_FILENAME)
        const remoteManifest = manifestContent ? JSON.parse(manifestContent) : null
        await saveLastSyncedAt(remoteManifest?.lastSyncAt || new Date().toISOString())
        syncStatus.value = '拉取完成'
      } else {
        syncStatus.value = '已取消'
      }
      conflictData.value = null
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
