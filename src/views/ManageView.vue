<template>
  <div class="page page--transition manage-page">
    <header class="manage-header">
      <h1 class="manage-title">管理</h1>
    </header>

    <main class="page-body">
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
          <button type="button" class="entry-card" @click="handleExport">
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
              <p class="entry-desc">备份谷子记录、回收站和全部预设</p>
              <p class="entry-count">{{ goodsStore.list.length }} 件收藏</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

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
        </section>
      </div>

      <Transition name="toast-fade">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { isLocalImageUri, readLocalImageAsDataUrl, restoreLocalImageFromDataUrl } from '@/utils/localImage'

const presets = usePresetsStore()
const goodsStore = useGoodsStore()

const importFileRef = ref(null)
const toastMsg = ref('')
let toastTimer = null
const BACKUP_DIR = 'GoodsAppBackup'

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

async function embedLocalImages(goodsList) {
  return Promise.all(goodsList.map(async (item) => {
    if (!isLocalImageUri(item.image)) return item
    const dataUrl = await readLocalImageAsDataUrl(item.image)
    return dataUrl ? { ...item, image: dataUrl } : item
  }))
}

async function restoreLocalImages(goodsList) {
  return Promise.all(goodsList.map(async (item) => {
    if (!item.image?.startsWith('data:image/')) return item
    const localUri = await restoreLocalImageFromDataUrl(item.image)
    return { ...item, image: localUri }
  }))
}

async function handleExport() {
  let goodsList = goodsStore.list
  let trashList = goodsStore.trashList

  try {
    goodsList = await embedLocalImages(goodsList)
    trashList = await embedLocalImages(trashList)
  } catch (error) {
    console.warn('[export] embed local images failed', error)
  }

  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    goods: goodsList,
    trash: trashList,
    presets: {
      categories: presets.categories,
      ips: presets.ips,
      characters: presets.characters,
      storageLocations: presets.storageLocationPaths
    }
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
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    let goodsToImport = Array.isArray(data.goods) ? data.goods : []
    let trashToImport = Array.isArray(data.trash) ? data.trash : []

    if (goodsToImport.length > 0) {
      goodsToImport = await restoreLocalImages(goodsToImport)
    }
    if (trashToImport.length > 0) {
      trashToImport = await restoreLocalImages(trashToImport)
    }

    const goodsAdded = goodsToImport.length > 0
      ? await goodsStore.importGoodsBackup(goodsToImport)
      : 0
    const trashAdded = trashToImport.length > 0
      ? await goodsStore.importTrashBackup(trashToImport)
      : 0

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
      goodsToImport.map((item) => item.storageLocation).filter(Boolean)
    )

    if (goodsAdded > 0 || trashAdded > 0) {
      showToast(`成功导入 ${goodsAdded} 件收藏，${trashAdded} 条回收站记录`)
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

.manage-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 40px var(--page-padding) 14px;
  background: rgba(245, 245, 247, 0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.manage-title {
  width: min(100%, 1160px);
  margin: 0 auto;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.page-body {
  position: relative;
  z-index: 1;
  width: min(100%, 1160px);
  margin: 0 auto;
  padding: 18px var(--page-padding) 120px;
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
.trash-icon { background: rgba(199, 68, 68, 0.10); color: #c74444; }
.export-icon { background: rgba(90, 120, 250, 0.10); color: #5a78fa; }
.import-icon { background: rgba(50, 200, 140, 0.10); color: #28c880; }

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
  padding: 10px 20px;
  border-radius: 20px;
  background: rgba(20, 20, 22, 0.88);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
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
    align-items: start;
    width: min(100%, 1100px);
    padding-top: 26px;
    padding-inline: 28px;
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
  .manage-header {
    padding-top: 48px;
    padding-bottom: 18px;
  }

  .manage-title {
    font-size: 38px;
    letter-spacing: -0.06em;
  }

  .page-body {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;
    row-gap: 24px;
    align-items: start;
    width: min(100%, 1100px);
    padding-top: 26px;
    padding-inline: 28px;
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

@media (prefers-color-scheme: dark) {
  .manage-header {
    background: rgba(15, 15, 16, 0.9);
  }

  .entry-card {
    border-color: rgba(255, 255, 255, 0.04);
  }
}
</style>
