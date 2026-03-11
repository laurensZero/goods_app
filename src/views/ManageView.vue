<template>
  <div class="page page--transition manage-page">
    <header class="manage-header">
      <h1 class="manage-title">管理</h1>
    </header>

    <main class="page-body">
      <section class="hub-section">
        <RouterLink class="entry-card" to="/manage/categories">
          <span class="entry-icon cat-icon">◈</span>
          <div class="entry-body">
            <p class="entry-kicker">预设 · 分类</p>
            <h2 class="entry-name">分类管理</h2>
            <p class="entry-desc">管理收藏分类标签</p>
            <p class="entry-count">{{ presets.categories.length }} 项</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </RouterLink>

        <RouterLink class="entry-card" to="/manage/ips">
          <span class="entry-icon ip-icon">✦</span>
          <div class="entry-body">
            <p class="entry-kicker">预设 · 作品</p>
            <h2 class="entry-name">IP 管理</h2>
            <p class="entry-desc">管理所属 IP / 作品名称</p>
            <p class="entry-count">{{ presets.ips.length }} 项</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </RouterLink>

        <RouterLink class="entry-card" to="/manage/characters">
          <span class="entry-icon char-icon">◎</span>
          <div class="entry-body">
            <p class="entry-kicker">预设 · 角色</p>
            <h2 class="entry-name">角色名管理</h2>
            <p class="entry-desc">管理谷子关联的角色名</p>
            <p class="entry-count">{{ presets.characters.length }} 项</p>
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
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <div class="entry-body">
            <p class="entry-kicker">数据管理</p>
            <h2 class="entry-name">导出数据</h2>
            <p class="entry-desc">备份谷子记录和预设配置</p>
            <p class="entry-count">{{ goodsStore.list.length }} 件谷子</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <button type="button" class="entry-card" @click="triggerImport">
          <span class="entry-icon import-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </span>
          <div class="entry-body">
            <p class="entry-kicker">数据管理</p>
            <h2 class="entry-name">导入数据</h2>
            <p class="entry-desc">从备份文件还原或合并数据</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <input type="file" accept=".json" ref="importFileRef" style="display:none" @change="handleImport" />
      </section>

      <!-- 操作反馈提示 -->
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

function showToast(msg, duration = 2600) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, duration)
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
      recursive: true,
    })

    return {
      path: publicPath,
      uri: result.uri,
      visibleToUser: true,
    }
  } catch {
    const fallbackPath = `backup/${filename}`
    const result = await Filesystem.writeFile({
      path: fallbackPath,
      data: json,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    })

    return {
      path: fallbackPath,
      uri: result.uri,
      visibleToUser: false,
    }
  }
}

// ── 导出 ──────────────────────────────────────────────────────
/**
 * 将 goods 列表中所有本地图片（capacitor://）替换为 data: URL，
 * 使备份文件在其他设备上也可还原图片。
 */
async function exportBackupToShareCache(json, filename) {
  const sharePath = `backup-share/${filename}`
  const result = await Filesystem.writeFile({
    path: sharePath,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  })

  return {
    path: sharePath,
    uri: result.uri,
  }
}

async function shareBackupFile(uri) {
  const canShare = await Share.canShare().catch(() => ({ value: false }))
  if (!canShare.value) return false

  await Share.share({
    title: '导出备份',
    text: '请选择保存位置或分享方式',
    dialogTitle: '导出备份',
    files: [uri],
  })

  return true
}

async function _embedLocalImages(goodsList) {
  return Promise.all(goodsList.map(async (item) => {
    if (!isLocalImageUri(item.image)) return item
    const dataUrl = await readLocalImageAsDataUrl(item.image)
    return dataUrl ? { ...item, image: dataUrl } : item
  }))
}

async function handleExport() {
  let goodsList = goodsStore.list
  // 将本地图片嵌入为 base64，使备份自包含
  try {
    goodsList = await _embedLocalImages(goodsList)
  } catch (e) {
    console.warn('[export] 图片嵌入部分失败，以原始链接代替', e)
  }

  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    goods: goodsList,
    presets: {
      categories: presets.categories,
      ips: presets.ips,
      characters: presets.characters,
    },
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
          if (saved.visibleToUser) {
            showToast(`已打开保存面板；同时写入 文档/${saved.path}`, 4200)
          } else {
            showToast('已打开保存面板，请选择“保存到文件”或分享目标', 4200)
          }
          return
        }
      }
      if (saved.visibleToUser) {
        showToast(`已导出到文档/${saved.path}`, 4200)
      } else {
        showToast(`已导出到应用目录 ${saved.path}`, 4200)
      }
      return
    }
  } catch {}

  // Web 回退：触发浏览器下载
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  showToast(`已导出到浏览器下载目录：${filename}`, 4200)
}

// ── 导入 ──────────────────────────────────────────────────────
function triggerImport() {
  importFileRef.value.value = ''
  importFileRef.value.click()
}

/**
 * 将备份 JSON 中的 data: 图片 URL 还原保存为本地文件，
 * 返回替换后的 goods 列表。
 */
async function _restoreLocalImages(goodsList) {
  return Promise.all(goodsList.map(async (item) => {
    if (!item.image?.startsWith('data:image/')) return item
    const localUri = await restoreLocalImageFromDataUrl(item.image)
    return { ...item, image: localUri }
  }))
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    let goodsToImport = Array.isArray(data.goods) ? data.goods : []
    // 还原备份中嵌入的 data: 图片为本地文件
    if (goodsToImport.length > 0) {
      try {
        goodsToImport = await _restoreLocalImages(goodsToImport)
      } catch (e) {
        console.warn('[import] 图片还原部分失败', e)
      }
    }

    let goodsAdded = 0
    if (goodsToImport.length > 0) {
      goodsAdded = await goodsStore.importGoodsBackup(goodsToImport)
    }

    if (data.presets) {
      for (const cat of (data.presets.categories || [])) {
        if (cat) await presets.addCategory(cat)
      }
      for (const ip of (data.presets.ips || [])) {
        if (ip) await presets.addIp(ip)
      }
      for (const ch of (data.presets.characters || [])) {
        if (ch?.name) await presets.addCharacter(ch.name, ch.ip || '')
      }
    }

    showToast(goodsAdded > 0 ? `成功导入 ${goodsAdded} 件谷子` : '数据已是最新，无需导入')
  } catch (err) {
    showToast(`导入失败：${err.message}`)
  }
}
</script>

<style scoped>
.manage-page {
  background: var(--app-bg);
  min-height: 100dvh;
}

.manage-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 56px var(--page-padding) 12px;
  background: rgba(245, 245, 247, 0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.manage-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--app-text);
  margin: 0;
}

.page-body {
  padding: var(--section-gap) var(--page-padding) 120px;
}

.hub-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-gap {
  margin-top: 20px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  text-decoration: none;
  color: var(--app-text);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.entry-card:active {
  transform: scale(var(--press-scale-card));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.entry-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.entry-icon svg {
  width: 22px;
  height: 22px;
}

.cat-icon    { background: rgba(90, 120, 250, 0.12); color: #5a78fa; }
.ip-icon     { background: rgba(250, 149, 90, 0.12); color: #fa9040; }
.char-icon   { background: rgba(50, 200, 140, 0.12); color: #28c880; }
.export-icon { background: rgba(90, 120, 250, 0.10); color: #5a78fa; }
.import-icon { background: rgba(50, 200, 140, 0.10); color: #28c880; }

.entry-body {
  flex: 1;
  min-width: 0;
}

.entry-kicker {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--app-text-tertiary);
  margin: 0 0 2px;
  text-transform: uppercase;
}

.entry-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 2px;
  color: var(--app-text);
}

.entry-desc {
  font-size: 13px;
  color: var(--app-text-tertiary);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-count {
  font-size: 12px;
  font-weight: 500;
  color: #5a78fa;
  margin: 0;
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

/* ── Toast 提示 ── */
.toast {
  position: fixed;
  bottom: calc(80px + max(env(safe-area-inset-bottom), 12px) + 12px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 22, 0.88);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  padding: 10px 20px;
  border-radius: 20px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  white-space: nowrap;
  z-index: 999;
  pointer-events: none;
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

/* ── 平板：两列并排布局（左：管理 / 右：导入导出）── */
@media (min-width: 900px) {
  .page-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 28px;
    align-items: start;
    max-width: 860px;
    margin-inline: auto;
    padding-inline: 28px;
  }

  .hub-section {
    /* 每列内部仍为单列竖向堆叠 */
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-gap {
    margin-top: 0;
  }
}

@media (prefers-color-scheme: dark) {
  .manage-header {
    background: rgba(15, 15, 16, 0.90);
  }
}
</style>
