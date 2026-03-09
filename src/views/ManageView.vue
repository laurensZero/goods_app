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
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'

const presets = usePresetsStore()
const goodsStore = useGoodsStore()

const importFileRef = ref(null)
const toastMsg = ref('')
let toastTimer = null

function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 2600)
}

// ── 导出 ──────────────────────────────────────────────────────
async function handleExport() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    goods: goodsStore.list,
    presets: {
      categories: presets.categories,
      ips: presets.ips,
      characters: presets.characters,
    },
  }
  const json = JSON.stringify(data, null, 2)
  const filename = `谷子备份_${new Date().toISOString().split('T')[0]}.json`

  try {
    if (Capacitor.isNativePlatform() && navigator.canShare) {
      const file = new File([json], filename, { type: 'application/json' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
        return
      }
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
  showToast('已导出备份文件')
}

// ── 导入 ──────────────────────────────────────────────────────
function triggerImport() {
  importFileRef.value.value = ''
  importFileRef.value.click()
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    let goodsAdded = 0
    if (Array.isArray(data.goods) && data.goods.length > 0) {
      goodsAdded = await goodsStore.importGoodsBackup(data.goods)
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
</style>
