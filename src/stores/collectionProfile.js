// @ts-check
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { deleteManagedLocalImages } from '@/utils/image/localImage'
import {
  PROFILE_SCHEMA_VERSION,
  buildCharacterProfileKey,
  collectProfileImageRefs,
  collectProfileSetLocalPaths,
  hydrateProfileMapFromSync,
  normalizeBackgroundSet,
  normalizeProfileItem,
  normalizeProfileMap,
  resolveProfileBackground,
  serializeProfileMapForSync
} from '@/utils/profile/collectionProfile'

export const COLLECTION_PROFILE_STORAGE_KEY = 'goods_collection_profiles_v1'

/**
 * 收藏馆（IP / 角色）本地个性化资料。
 *
 * 第一阶段纯本地：Preferences/localStorage 存 JSON，背景图片走
 * `utils/image/localImage` 的受管本地图（复制进 app 私有目录）。
 * 字段结构按将来同步到 `sync_presets.ip_profiles` 的形态设计，上云时无需迁移。
 */
export const useCollectionProfileStore = defineStore('collectionProfile', () => {
  /**
   * 同步快照：localStorage 里总有一份镜像（writePersisted 先写它），先按它把
   * 状态填好，页面首帧就能拿到正确结果；`init()` 再走 Preferences 权威源校正。
   * 否则原生端 Preferences 的桥接延迟会让「有背景 -> 无背景」的页头高度闪一下。
   */
  function readLocalSnapshot() {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(COLLECTION_PROFILE_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return {
        ipProfiles: normalizeProfileMap(parsed?.ipProfiles),
        characterProfiles: normalizeProfileMap(parsed?.characterProfiles)
      }
    } catch {
      return null
    }
  }

  const localSnapshot = readLocalSnapshot()

  /** @type {import('vue').Ref<Record<string, import('@/utils/profile/collectionProfile').ProfileBackgroundSet>>} */
  const ipProfiles = ref(localSnapshot?.ipProfiles || {})
  /** @type {import('vue').Ref<Record<string, import('@/utils/profile/collectionProfile').ProfileBackgroundSet>>} */
  const characterProfiles = ref(localSnapshot?.characterProfiles || {})
  const isReady = ref(false)

  let persistTimer = 0

  function buildPersistPayload() {
    return {
      version: PROFILE_SCHEMA_VERSION,
      ipProfiles: ipProfiles.value,
      characterProfiles: characterProfiles.value
    }
  }

  function schedulePersist() {
    if (typeof window === 'undefined') return
    if (persistTimer) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      persistTimer = 0
      void writePersisted(COLLECTION_PROFILE_STORAGE_KEY, JSON.stringify(buildPersistPayload()))
    }, 120)
  }

  async function persistNow() {
    if (typeof window === 'undefined') return
    if (persistTimer) {
      window.clearTimeout(persistTimer)
      persistTimer = 0
    }
    await writePersisted(COLLECTION_PROFILE_STORAGE_KEY, JSON.stringify(buildPersistPayload()))
  }

  /**
   * 背景编辑属于 presets 块同步域（ip_profiles / character_profiles 挂在 sync_presets）。
   * 动态 import 避免 collectionProfile ↔ sync 的模块循环依赖。
   */
  function notifyProfilesChanged() {
    if (typeof window === 'undefined') return
    void import('@/stores/sync')
      .then(({ useSyncStore }) => {
        const syncStore = useSyncStore()
        syncStore.autoPushGoods('profiles')
        syncStore.autoPushGoods('presets')
      })
      .catch((e) => {
        console.warn('[collectionProfile] mark sync dirty failed', e)
      })
  }

  async function init() {
    if (isReady.value) return
    try {
      const raw = await readPersisted(COLLECTION_PROFILE_STORAGE_KEY, null)
      if (raw) {
        const parsed = JSON.parse(raw)
        ipProfiles.value = normalizeProfileMap(parsed?.ipProfiles)
        characterProfiles.value = normalizeProfileMap(parsed?.characterProfiles)
      }
    } catch (e) {
      console.error('[collectionProfile] init failed, starting empty:', e)
    }
    isReady.value = true
  }

  function getIpProfile(ip) {
    const key = String(ip || '').trim()
    return key ? (ipProfiles.value[key] || null) : null
  }

  function getCharacterProfile(ip, characterName) {
    const key = buildCharacterProfileKey(ip, characterName)
    return characterProfiles.value[key] || null
  }

  /** 角色自有 → 所属 IP → 无 */
  function resolve({ ip, character }) {
    return resolveProfileBackground({
      ip,
      character,
      ipProfiles: ipProfiles.value,
      characterProfiles: characterProfiles.value
    })
  }

  function hasCharacterProfile(ip, characterName) {
    const set = getCharacterProfile(ip, characterName)
    return Boolean(set && set.items.length > 0)
  }

  /**
   * @param {string} ip
   * @param {any} set
   * @param {{ silent?: boolean }} [options] silent: 同步回填时不标脏、不触发自动推送
   */
  function writeIpProfile(ip, set, options = {}) {
    const key = String(ip || '').trim()
    if (!key) return
    const normalized = normalizeBackgroundSet(set)
    const next = { ...ipProfiles.value }
    if (normalized.items.length > 0) {
      next[key] = normalized
    } else {
      delete next[key]
    }
    ipProfiles.value = next
    schedulePersist()
    if (!options.silent) notifyProfilesChanged()
  }

  /**
   * @param {string} ip
   * @param {string} characterName
   * @param {any} set
   * @param {{ silent?: boolean }} [options]
   */
  function writeCharacterProfile(ip, characterName, set, options = {}) {
    const key = buildCharacterProfileKey(ip, characterName)
    if (!key) return
    const normalized = normalizeBackgroundSet(set)
    const next = { ...characterProfiles.value }
    if (normalized.items.length > 0) {
      next[key] = normalized
    } else {
      delete next[key]
    }
    characterProfiles.value = next
    schedulePersist()
    if (!options.silent) notifyProfilesChanged()
  }

  async function deleteFiles(paths) {
    const targets = (Array.isArray(paths) ? paths : [paths])
      .map((path) => String(path || '').trim())
      .filter(Boolean)
    if (targets.length === 0) return
    try {
      await deleteManagedLocalImages(targets)
    } catch (e) {
      console.warn('[collectionProfile] delete local background files failed', e)
    }
  }

  async function deleteSetFiles(set) {
    await deleteFiles(collectProfileSetLocalPaths(set))
  }

  /**
   * 角色「跟随所属 IP」：清空角色自有背景。被清掉的图片文件会一并删除。
   */
  async function clearCharacterProfile(ip, characterName) {
    const key = buildCharacterProfileKey(ip, characterName)
    const existing = characterProfiles.value[key]
    if (!existing) return
    const next = { ...characterProfiles.value }
    delete next[key]
    characterProfiles.value = next
    schedulePersist()
    notifyProfilesChanged()
    await deleteSetFiles(existing)
  }

  /* ── 同步辅助 ───────────────────────────────────────────── */

  /** 同步序列化快照（只含跨设备可重建字段，不含本机 uri/localPath） */
  function getProfilesForSync() {
    return {
      ipProfiles: serializeProfileMapForSync(ipProfiles.value),
      characterProfiles: serializeProfileMapForSync(characterProfiles.value)
    }
  }

  /** 云端图片引用（孤儿回收登记用） */
  function collectImageRefs() {
    return collectProfileImageRefs(getProfilesForSync())
  }

  /**
   * 拉取远端快照后回填：远端图片换成公开 URL，本机已有同 cloudFileName 的文件保留本地路径。
   * @param {{ ipProfiles?: object, characterProfiles?: object }} remote
   * @param {{ resolveImageUrl?: (cloudFileName: string) => string }} [options]
   */
  async function applyRemoteProfiles(remote, options = {}) {
    if (!remote) return
    const nextIp = hydrateProfileMapFromSync(remote.ipProfiles, {
      resolveImageUrl: options.resolveImageUrl,
      previous: ipProfiles.value
    })
    const nextCharacters = hydrateProfileMapFromSync(remote.characterProfiles, {
      resolveImageUrl: options.resolveImageUrl,
      previous: characterProfiles.value
    })
    ipProfiles.value = nextIp
    characterProfiles.value = nextCharacters
    await persistNow()
  }

  /**
   * 图片上传成功后把 cloudFileName / 公开 URL 写回本地，后续序列化与云端一致。
   * @param {{ ipProfiles?: object, characterProfiles?: object }} syncedProfiles 本次推送用的同步快照
   * @param {(cloudFileName: string) => string} getPublicUrl
   * @param {Set<string>} [failedImageFiles]
   */
  async function markProfileImagesAsRemote(syncedProfiles, getPublicUrl, failedImageFiles = null) {
    if (!syncedProfiles) return
    const isFailed = (name) => !!name && !!failedImageFiles && failedImageFiles.has(name)

    const applyToMap = (localMap, remoteMap) => {
      const next = { ...localMap }
      for (const [key, remoteSet] of Object.entries(remoteMap || {})) {
        const localSet = next[key]
        if (!localSet) continue
        const items = (localSet.items || []).map((item) => {
          const remoteItem = (remoteSet.items || []).find((candidate) => candidate.id === item.id)
          if (!remoteItem || remoteItem.kind !== 'image') return item
          const cloudFileName = String(remoteItem.cloudFileName || '').trim()
          if (!cloudFileName || isFailed(cloudFileName)) return item
          if (item.cloudFileName === cloudFileName && item.uri) return item

          const localUri = String(item.uri || '').trim()
          // 原生端保留本地文件（离线可看）；Web 端本机 uri 是 data URL，换成公开 URL
          // 避免把整张图写进 localStorage
          const keepLocalUri = localUri && !localUri.startsWith('data:')
          return normalizeProfileItem({
            ...item,
            ...remoteItem,
            uri: keepLocalUri ? localUri : getPublicUrl(cloudFileName),
            localPath: item.localPath || ''
          })
        })
        next[key] = { ...localSet, items }
      }
      return next
    }

    ipProfiles.value = applyToMap(ipProfiles.value, syncedProfiles.ipProfiles)
    characterProfiles.value = applyToMap(characterProfiles.value, syncedProfiles.characterProfiles)
    await persistNow()
  }

  return {
    ipProfiles,
    characterProfiles,
    isReady,
    init,
    getIpProfile,
    getCharacterProfile,
    resolve,
    hasCharacterProfile,
    writeIpProfile,
    writeCharacterProfile,
    clearCharacterProfile,
    deleteFiles,
    getProfilesForSync,
    collectImageRefs,
    applyRemoteProfiles,
    markProfileImagesAsRemote
  }
})
