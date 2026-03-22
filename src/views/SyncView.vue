<template>
  <div class="page sync-page">
    <NavBar title="云同步" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section hero-section--sync">
        <article class="hero-card">
          <div class="hero-head">
            <div class="hero-copy">
              <p class="hero-label">Cloud Sync</p>
              <h1 class="hero-title">GitHub Gist 同步</h1>
              <p class="hero-desc">在多设备之间同步收藏、心愿单、回收站、预设数据和本地图片。</p>
            </div>
            <span class="status-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
          </div>

          <div class="hero-grid">
            <div class="hero-metric">
              <p class="hero-metric__label">最近同步</p>
              <p class="hero-metric__value">{{ lastSyncDisplay }}</p>
            </div>
            <div class="hero-metric">
              <p class="hero-metric__label">远端 Gist</p>
              <p class="hero-metric__value hero-metric__value--mono">{{ syncStore.gistId || '未创建' }}</p>
            </div>
            <button
              type="button"
              class="hero-metric hero-metric--interactive"
              :disabled="!syncStore.token"
              @click="copyText(syncStore.token)"
            >
              <p class="hero-metric__label">同步 Token</p>
              <p class="hero-metric__value hero-metric__value--mono">{{ tokenDisplay }}</p>
            </button>
          </div>
        </article>
      </section>

      <section class="content-section overview-section">
        <div class="section-head">
          <p class="section-label">Sync Overview</p>
          <h2 class="section-title">同步概览</h2>
        </div>

        <div class="overview-grid">
          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Connection</p>
                <h3 class="panel-title">连接信息</h3>
              </div>
              <span class="panel-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
            </div>

            <div class="detail-list">
              <button type="button" class="detail-row detail-row--button" :disabled="!syncStore.token" @click="copyText(syncStore.token)">
                <span class="detail-label">Token</span>
                <span class="detail-value detail-value--mono">{{ tokenDisplay }}</span>
              </button>
              <div class="detail-row">
                <span class="detail-label">Data Gist</span>
                <span class="detail-value detail-value--mono">{{ syncStore.gistId || '未创建' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">设备 ID</span>
                <span class="detail-value detail-value--mono">{{ syncStore.deviceId }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Image Gist</span>
                <span class="detail-value detail-value--mono">{{ resolvedImageGistId || '未创建' }}</span>
              </div>
              <div class="detail-row detail-row--last">
                <span class="detail-label">最近同步</span>
                <span class="detail-value">{{ lastSyncDisplay }}</span>
              </div>
            </div>
          </article>

          <article v-if="false" class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Image Sync</p>
                <h3 class="panel-title">图片同步</h3>
              </div>
            </div>

            <div class="detail-list">
              <div class="detail-row">
                <span class="detail-label">Image Gist</span>
                <span class="detail-value detail-value--mono">{{ resolvedImageGistId || '未创建' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">图片文件数</span>
                <span class="detail-value">{{ imageFileCount }}</span>
              </div>
              <article class="stat-card stat-card--image">
                <p class="stat-label">Images</p>
                <p class="stat-value">{{ imageFileCount }}</p>
                <p class="stat-desc">图片 Gist 当前保存的图片文件数量。</p>
              </article>
            </div>
            <p class="section-note">本地图片会同步到独立图片 Gist，最近图片同步时间：{{ imageSyncDisplay }}。</p>
          </article>

          <article class="panel-card">
            <div class="panel-head">
              <div>
                <p class="panel-kicker">Remote Data</p>
                <h3 class="panel-title">远端数据</h3>
              </div>
            </div>

            <div class="stats-grid">
              <article class="stat-card stat-card--collection">
                <p class="stat-label">收藏</p>
                <p class="stat-value">{{ collectionCount }}</p>
                <p class="stat-desc">云端已记录的正式收藏条目。</p>
              </article>
              <article class="stat-card stat-card--wishlist">
                <p class="stat-label">心愿单</p>
                <p class="stat-value">{{ wishlistCount }}</p>
                <p class="stat-desc">云端当前标记为心愿单的条目。</p>
              </article>
              <article class="stat-card stat-card--trash">
                <p class="stat-label">回收站</p>
                <p class="stat-value">{{ trashCount }}</p>
                <p class="stat-desc">云端保留的已删除数据数量。</p>
              </article>
              <article class="stat-card stat-card--image">
                <p class="stat-label">图片文件</p>
                <p class="stat-value">{{ imageFileCount }}</p>
                <p class="stat-desc">图片 Gist 当前保存的图片文件数量。</p>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section actions-section">
        <div class="section-head">
          <p class="section-label">Sync Actions</p>
          <h2 class="section-title">同步操作</h2>
        </div>

        <div class="action-grid">
          <button
            type="button"
            class="entry-card"
            :disabled="syncStore.isSyncing || !syncStore.token"
            @click="handleSync"
          >
            <span class="entry-icon sync-icon">
              <svg v-if="!syncStore.isSyncing" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
              <span v-else class="sync-spinner" aria-hidden="true" />
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Push & Resolve</p>
              <h3 class="entry-name">{{ syncStore.isSyncing ? (syncStore.syncStatus || '同步中') : '上传到云端' }}</h3>
              <p class="entry-desc">将本地数据推送到 Gist，若发现冲突会提示你选择处理方式。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button
            type="button"
            class="entry-card"
            :disabled="syncStore.isSyncing || !syncStore.gistId"
            @click="handlePull"
          >
            <span class="entry-icon pull-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Remote to Local</p>
              <h3 class="entry-name">拉取远端数据</h3>
              <p class="entry-desc">把 Gist 中的最新数据合并到当前设备，不会直接覆盖本地收藏。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <section class="content-section config-section">
        <div class="section-head">
          <p class="section-label">Config</p>
          <h2 class="section-title">配置与维护</h2>
        </div>

        <div class="action-grid">
          <a v-if="gistUrl" class="entry-card" :href="gistUrl" target="_blank" rel="noopener">
            <span class="entry-icon link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Remote Inspect</p>
              <h3 class="entry-name">查看数据 Gist</h3>
              <p class="entry-desc">直接打开当前 Gist 页面，检查远端文件、更新时间与历史版本。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

          <a v-if="imageGistUrl" class="entry-card" :href="imageGistUrl" target="_blank" rel="noopener">
            <span class="entry-icon link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Image Store</p>
              <h3 class="entry-name">查看图片 Gist</h3>
              <p class="entry-desc">打开独立图片 Gist，查看同步后的本地图片文件和更新时间。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

                    <button type="button" class="entry-card" @click="openTokenDialog">
            <span class="entry-icon token-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">GitHub Access</p>
              <h3 class="entry-name">{{ syncStore.token ? '更换 Token' : '配置 Token' }}</h3>
              <p class="entry-desc">保存带有 `gist` 权限的 Personal Access Token，用于创建和更新 Gist。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <button v-if="syncStore.gistId || resolvedImageGistId" type="button" class="entry-card entry-card--danger" @click="showResetConfirm = true">
            <span class="entry-icon danger-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </span>
            <div class="entry-body">
              <p class="entry-kicker">Reset</p>
              <h3 class="entry-name">清除同步配置</h3>
              <p class="entry-desc">移除当前设备保存的 Token 和 Gist 配置，但不会删除 GitHub 上的远端数据。</p>
            </div>
            <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </section>

      <Transition name="overlay-fade">
        <div v-if="showTokenDialog" class="overlay" @click.self="closeTokenDialog">
          <div class="dialog">
            <h3 class="dialog-title">配置 GitHub Token</h3>
            <p class="dialog-desc">
              需要一个包含 <code>gist</code> 权限的 Personal Access Token。
              <a href="https://github.com/settings/tokens/new?scopes=gist&description=goods-app-sync" target="_blank" rel="noopener">点击创建</a>
            </p>
            <input
              v-model="tokenInput"
              class="dialog-input"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              autocomplete="off"
            />
            <div v-if="tokenError" class="dialog-error">{{ tokenError }}</div>
            <div v-if="tokenValidLogin" class="dialog-success">已验证：{{ tokenValidLogin }}</div>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="closeTokenDialog">取消</button>
              <button
                class="dialog-btn dialog-btn--primary"
                :disabled="isVerifyingToken || !tokenInput.trim()"
                @click="handleSaveToken"
              >
                {{ isVerifyingToken ? '验证中...' : '验证并保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showResetConfirm" class="overlay" @click.self="showResetConfirm = false">
          <div class="dialog">
            <h3 class="dialog-title">确认清除配置</h3>
            <p class="dialog-desc">
              清除后需要重新配置 Token。远端 Gist 中的数据不会被删除。
            </p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="showResetConfirm = false">取消</button>
              <button class="dialog-btn dialog-btn--danger" @click="handleReset">确认清除</button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showPullConflict" class="overlay">
          <div class="dialog dialog--wide">
            <h3 class="dialog-title">检测到远端数据</h3>
            <div class="conflict-info">
              <div class="conflict-row">
                <span class="conflict-label">来源设备</span>
                <span class="conflict-value">{{ pullConflictData.remoteDevice }}</span>
              </div>
              <div class="conflict-row">
                <span class="conflict-label">远端时间</span>
                <span class="conflict-value">{{ formatTime(pullConflictData.remoteTime) }}</span>
              </div>
              <div class="conflict-row">
                <span class="conflict-label">远端总数</span>
                <span class="conflict-value">{{ pullConflictData.remoteCollectionCount }} 收藏，{{ pullConflictData.remoteWishlistCount }} 心愿单，{{ pullConflictData.remoteTrashCount }} 回收站</span>
              </div>
            </div>
            <div class="conflict-diff">
              <p class="conflict-diff-title">差异</p>
              <div class="conflict-diff-row">
                <span class="conflict-diff-label">远端新增</span>
                <span class="conflict-diff-value conflict-diff-value--add">+{{ pullConflictData.remoteOnlyCollection }} 收藏，+{{ pullConflictData.remoteOnlyWishlist }} 心愿单，+{{ pullConflictData.remoteOnlyTrash }} 回收站</span>
              </div>
              <div v-if="pullConflictData.updatedGoods > 0" class="conflict-diff-row">
                <span class="conflict-diff-label">远端修改</span>
                <span class="conflict-diff-value conflict-diff-value--update">{{ pullConflictData.updatedGoods }} 条</span>
              </div>
              <div class="conflict-diff-row">
                <span class="conflict-diff-label">本地独有</span>
                <span class="conflict-diff-value conflict-diff-value--local">{{ pullConflictData.localOnlyCollection }} 收藏，{{ pullConflictData.localOnlyWishlist }} 心愿单，{{ pullConflictData.localOnlyTrash }} 回收站</span>
              </div>
            </div>
            <p class="conflict-desc">确认拉取后，当前设备会对齐远端状态。远端已经删除的数据，也会从本地同步移除。</p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="handlePullConflict(false)">取消</button>
              <button class="dialog-btn dialog-btn--primary" :disabled="syncStore.isSyncing" @click="handlePullConflict(true)">
                确认拉取
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="overlay-fade">
        <div v-if="showSyncConflict" class="overlay">
          <div class="dialog">
            <h3 class="dialog-title">检测到冲突</h3>
            <p class="conflict-desc">远端存在其他设备更新的数据。下面会同时显示本地上次同步时间和本地最近修改时间。</p>
            <div class="conflict-info">
              <div class="conflict-row">
                <span class="conflict-label">远端时间</span>
                <span class="conflict-value">{{ formatTime(syncConflictData.remoteTime) }}</span>
              </div>
              <div class="conflict-row">
                <span class="conflict-label">本地上次同步</span>
                <span class="conflict-value">{{ formatTime(syncConflictData.localTime) || '从未同步' }}</span>
              </div>
              <div class="conflict-row">
                <span class="conflict-label">本地最近修改</span>
                <span class="conflict-value">{{ formatTime(syncConflictData.localModifiedTime) || '无本地改动' }}</span>
              </div>
            </div>
            <p class="conflict-desc">请选择要保留哪一边的数据：</p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" :disabled="syncStore.isSyncing" @click="handleSyncConflict(false)">
                上传本地
              </button>
              <button class="dialog-btn dialog-btn--primary" :disabled="syncStore.isSyncing" @click="handleSyncConflict(true)">
                拉取远端
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="toast-fade">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { validateToken, getGist, getGistFileContent } from '@/utils/githubGist'
import NavBar from '@/components/NavBar.vue'

const syncStore = useSyncStore()

const pageBodyRef = ref(null)
const showTokenDialog = ref(false)
const showResetConfirm = ref(false)
const showPullConflict = ref(false)
const showSyncConflict = ref(false)
const syncConflictData = ref({})
const tokenInput = ref('')
const tokenError = ref('')
const tokenValidLogin = ref('')
const isVerifyingToken = ref(false)
const toastMsg = ref('')
const gistInfo = ref(null)
const pullConflictData = ref({})
let toastTimer = null

watch(() => syncStore.conflictData, (val) => {
  if (val?.isPullOnly) {
    pullConflictData.value = val
    showPullConflict.value = true
  } else {
    showPullConflict.value = false
  }
})

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncedAt) return '从未同步'
  return formatTime(syncStore.lastSyncedAt)
})

const resolvedImageGistId = computed(() => gistInfo.value?.imageGistId || syncStore.imageGistId || '')

const statusBadgeClass = computed(() => {
  if (syncStore.isSyncing) return 'badge--syncing'
  if (syncStore.lastError) return 'badge--error'
  if (!syncStore.token) return 'badge--warning'
  if (syncStore.gistId) return 'badge--success'
  return 'badge--warning'
})

const statusBadgeText = computed(() => {
  if (syncStore.isSyncing) return '同步中'
  if (syncStore.lastError) return '有错误'
  if (!syncStore.token) return '未配置'
  if (syncStore.gistId) return '已连接'
  return '待上传'
})

const tokenDisplay = computed(() => {
  if (!syncStore.token) return '未配置'
  const token = syncStore.token
  return `${token.slice(0, 4)}...${token.slice(-4)}`
})

const gistUrl = computed(() => {
  if (!syncStore.gistId) return ''
  return `https://gist.github.com/${syncStore.gistId}`
})

const imageGistUrl = computed(() => {
  if (!resolvedImageGistId.value) return ''
  return `https://gist.github.com/${resolvedImageGistId.value}`
})

const collectionCount = computed(() => gistInfo.value?.collectionCount ?? '-')
const wishlistCount = computed(() => gistInfo.value?.wishlistCount ?? '-')
const trashCount = computed(() => gistInfo.value?.trashCount ?? '-')
const imageFileCount = computed(() => gistInfo.value?.imageFileCount ?? '-')
const imageSyncDisplay = computed(() => {
  if (!gistInfo.value?.imageUpdatedAt) return '未同步图片'
  return formatTime(gistInfo.value.imageUpdatedAt)
})

function resetPageScrollTop() {
  try {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    window.scrollTo(0, 0)
  } catch {
    // ignore scroll reset failures in non-browser contexts
  }

  if (pageBodyRef.value) {
    pageBodyRef.value.scrollTop = 0
  }
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function showToast(message, duration = 2600) {
  toastMsg.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, duration)
}

async function loadGistInfo() {
  if (!syncStore.token || !syncStore.gistId) {
    gistInfo.value = null
    return
  }

  try {
    const gist = await getGist(syncStore.token, syncStore.gistId)
    if (!gist) {
      gistInfo.value = null
      return
    }

    const [content, manifestContent] = await Promise.all([
      getGistFileContent(syncStore.token, gist, 'data.json'),
      getGistFileContent(syncStore.token, gist, 'manifest.json')
    ])
    const manifest = manifestContent ? JSON.parse(manifestContent) : null

    let nextCollectionCount = 0
    let nextWishlistCount = 0
    let nextTrashCount = 0

    if (content) {
      try {
        const data = JSON.parse(content)
        const goods = Array.isArray(data.goods) ? data.goods : []
        nextCollectionCount = goods.filter((item) => !item.isWishlist).length
        nextWishlistCount = goods.filter((item) => item.isWishlist).length
        nextTrashCount = Array.isArray(data.trash) ? data.trash.length : 0
      } catch {
        // ignore parse error
      }
    }

    gistInfo.value = {
      collectionCount: nextCollectionCount,
      wishlistCount: nextWishlistCount,
      trashCount: nextTrashCount,
      imageGistId: manifest?.imageGistId || '',
      imageFileCount: Number(manifest?.imageFileCount) || 0,
      imageUpdatedAt: manifest?.imageUpdatedAt || ''
    }
  } catch {
    gistInfo.value = null
  }
}

function buildImageSyncText(result) {
  const parts = []
  if (result?.uploadedImages > 0) parts.push(`上传 ${result.uploadedImages} 张图片`)
  if (result?.reusedImages > 0) parts.push(`复用 ${result.reusedImages} 张图片`)
  if (result?.restoredImages > 0) parts.push(`恢复 ${result.restoredImages} 张图片`)
  return parts.join('，')
}

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
}

async function handleSync() {
  if (syncStore.isSyncing) return

  try {
    const result = await syncStore.fullSync()

    if (!result) {
      showToast('上传完成')
      await loadGistInfo()
      return
    }

    if (result.action === 'conflict') {
      syncConflictData.value = {
        remoteTime: syncStore.conflictData?.remoteTime,
        localTime: syncStore.conflictData?.localTime,
        localModifiedTime: syncStore.conflictData?.localModifiedTime
      }
      showSyncConflict.value = true
      return
    }

    let message = ''
    if (result.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
    } else if (result.action === 'no_changes') {
      message = '数据已经是最新，无需上传'
    } else if (result.action === 'pushed') {
      if (result.hasChanges) {
        const parts = []
        if (result.updatedGoods > 0) parts.push(`收藏 ${result.updatedGoods} 件`)
        if (result.updatedTrash > 0) parts.push(`回收站 ${result.updatedTrash} 条`)
        message = `上传完成，${parts.join('，')}`
      } else {
        message = '已按当前本地数据重新上传'
      }
    } else {
      message = '上传完成'
    }

    showToast(message, 3500)
    await loadGistInfo()
  } catch (error) {
    showToast(`上传失败：${error.message}`)
  }
}

async function handlePull() {
  if (syncStore.isSyncing) return

  try {
    const result = await syncStore.pullOnly()

    if (result?.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      const message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
      showToast(message, 3500)
      await loadGistInfo()
    } else if (result?.action === 'no_changes') {
      showToast('数据已经是最新')
    }
  } catch (error) {
    showToast(`拉取失败：${error.message}`)
  }
}

async function handlePullConflict(confirm) {
  showPullConflict.value = false
  try {
    const result = await syncStore.resolvePullConflict(confirm)

    if (result?.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      const message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
      showToast(message, 3500)
      await loadGistInfo()
    } else if (result?.action === 'cancelled') {
      showToast('已取消拉取')
    }
  } catch (error) {
    showToast(`拉取失败：${error.message}`)
  }
}

async function handleSyncConflict(useRemote) {
  try {
    const result = await syncStore.resolveConflict(useRemote)
    showSyncConflict.value = false

    if (result?.action === 'pulled') {
      const parts = []
      if (result.importedGoods > 0) parts.push(`导入 ${result.importedGoods} 件`)
      if (result.updatedGoods > 0) parts.push(`更新 ${result.updatedGoods} 件`)
      if (result.importedTrash > 0) parts.push(`回收站 ${result.importedTrash} 条`)
      const message = parts.length > 0 ? `拉取完成，${parts.join('，')}` : '数据已经是最新'
      showToast(message, 3500)
    } else if (result?.action === 'pushed') {
      showToast('上传完成')
    }
    await loadGistInfo()
  } catch (error) {
    showToast(useRemote ? `拉取失败：${error.message}` : `上传失败：${error.message}`)
  }
}

function openTokenDialog() {
  tokenInput.value = syncStore.token
  tokenError.value = ''
  tokenValidLogin.value = ''
  showTokenDialog.value = true
}

function closeTokenDialog() {
  showTokenDialog.value = false
  tokenInput.value = ''
  tokenError.value = ''
  tokenValidLogin.value = ''
}

async function handleSaveToken() {
  const input = tokenInput.value.trim()
  if (!input) return

  isVerifyingToken.value = true
  tokenError.value = ''

  try {
    const check = await validateToken(input)
    if (!check.valid) {
      tokenError.value = 'Token 无效或网络错误'
      return
    }
    tokenValidLogin.value = check.login
    await syncStore.saveToken(input)
    showToast(`Token 已保存（${tokenValidLogin.value}）`)
    closeTokenDialog()
    await loadGistInfo()
  } catch (error) {
    tokenError.value = error.message
  } finally {
    isVerifyingToken.value = false
  }
}

async function handleReset() {
  await syncStore.resetConfig()
  gistInfo.value = null
  showResetConfirm.value = false
  showToast('配置已清除')
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  await syncStore.init()
  await loadGistInfo()
})
</script>

<style scoped>
.sync-page {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--app-bg);
}

.sync-page::before,
.sync-page::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  filter: blur(10px);
}

.sync-page::before {
  top: 104px;
  right: -118px;
  width: 316px;
  height: 316px;
  background: radial-gradient(circle, rgba(114, 102, 255, 0.16) 0%, rgba(114, 102, 255, 0) 72%);
}

.sync-page::after {
  top: 284px;
  left: -140px;
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(73, 163, 255, 0.12) 0%, rgba(73, 163, 255, 0) 74%);
}

.page-body {
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 1;
  width: min(100%, 1160px);
  margin: 0 auto;
  padding: 0 var(--page-padding) 120px;
}

.hero-section,
.content-section {
  margin-top: var(--section-gap);
}

.hero-section--sync {
  order: 1;
}

.overview-section {
  order: 3;
}

.actions-section {
  order: 2;
}

.config-section {
  order: 4;
}

.hero-card,
.panel-card,
.stat-card,
.entry-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-card {
  position: relative;
  padding: 22px;
  overflow: hidden;
  border-radius: var(--radius-large);
}

.hero-card::before {
  content: '';
  position: absolute;
  inset: auto -84px -108px auto;
  width: 248px;
  height: 248px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(118, 102, 255, 0.18) 0%, rgba(118, 102, 255, 0) 72%);
  pointer-events: none;
}

.hero-head,
.hero-grid,
.panel-head,
.section-head,
.detail-list,
.stats-grid,
.action-grid {
  position: relative;
  z-index: 1;
}

.hero-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: space-between;
}

.hero-label,
.section-label,
.panel-kicker,
.entry-kicker,
.stat-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title,
.section-title,
.panel-title,
.entry-name {
  margin-top: 6px;
  color: var(--app-text);
  letter-spacing: -0.04em;
}

.hero-title {
  font-size: 30px;
  font-weight: 700;
}

.hero-desc,
.entry-desc,
.stat-desc,
.detail-label,
.detail-value,
.dialog-desc,
.conflict-desc {
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.hero-desc {
  margin-top: 10px;
  max-width: 540px;
}

.status-badge,
.panel-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.badge--success {
  background: rgba(40, 200, 128, 0.12);
  color: #28c880;
}

.badge--warning {
  background: rgba(255, 162, 0, 0.12);
  color: #d07a0b;
}

.badge--error {
  background: rgba(199, 68, 68, 0.10);
  color: #c74444;
}

.badge--syncing {
  background: rgba(120, 100, 255, 0.10);
  color: #7864ff;
}

.hero-grid {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.hero-metric {
  display: block;
  width: 100%;
  padding: 16px 18px;
  border: none;
  border-radius: calc(var(--radius-card) - 2px);
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  text-align: left;
}

.hero-metric--interactive {
  cursor: pointer;
  transition: transform var(--motion-fast) var(--motion-emphasis), background var(--motion-fast) var(--motion-emphasis);
}

.hero-metric--interactive:not(:disabled):active {
  transform: scale(var(--press-scale-card));
}

.hero-metric--interactive:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.hero-metric__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-metric__value {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

.hero-metric__value--mono,
.detail-value--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 14px;
  letter-spacing: -0.01em;
}

.section-head {
  margin-bottom: 14px;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
}

.section-note {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.overview-grid,
.action-grid {
  display: grid;
  gap: 12px;
}

.panel-card {
  padding: 18px;
  border-radius: var(--radius-large);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-title {
  font-size: 22px;
  font-weight: 600;
}

.detail-list {
  display: flex;
  flex-direction: column;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.detail-row--last {
  border-bottom: none;
  padding-bottom: 0;
}

.detail-row--button {
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.detail-row--button:not(:disabled):active {
  transform: scale(var(--press-scale-card));
}

.detail-row--button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.detail-label {
  flex-shrink: 0;
}

.detail-value {
  color: var(--app-text);
  font-weight: 500;
  text-align: right;
  overflow-wrap: anywhere;
}

.stats-grid {
  display: grid;
  gap: 12px;
}

.stat-card {
  padding: 16px 18px;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--app-surface-soft) 84%, transparent);
}

.stat-value {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.stat-card--collection .stat-value {
  color: #5a78fa;
}

.stat-card--wishlist .stat-value {
  color: #7864ff;
}

.stat-card--trash .stat-value {
  color: #c74444;
}

.stat-card--image .stat-value {
  color: #1f9a8a;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 120px;
  padding: 18px;
  border: 1px solid rgba(17, 20, 22, 0.04);
  border-radius: var(--radius-card);
  color: var(--app-text);
  text-align: left;
  text-decoration: none;
  transition: transform var(--motion-fast) var(--motion-emphasis), box-shadow var(--motion-fast) var(--motion-emphasis);
}

.entry-card:not(:disabled):active {
  transform: scale(var(--press-scale-card));
}

.entry-card:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.entry-card--danger .entry-name,
.entry-card--danger .entry-desc {
  color: #c74444;
}

.entry-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 16px;
}

.entry-icon svg,
.sync-spinner {
  width: 22px;
  height: 22px;
}

.sync-icon {
  background: rgba(120, 100, 255, 0.10);
  color: #7864ff;
}

.pull-icon {
  background: rgba(50, 200, 140, 0.10);
  color: #28c880;
}

.token-icon {
  background: rgba(90, 120, 250, 0.10);
  color: #5a78fa;
}

.link-icon {
  background: rgba(255, 162, 0, 0.12);
  color: #d07a0b;
}

.danger-icon {
  background: rgba(199, 68, 68, 0.10);
  color: #c74444;
}

.entry-body {
  flex: 1;
  min-width: 0;
}

.entry-name {
  font-size: 18px;
  font-weight: 600;
}

.entry-desc {
  margin-top: 4px;
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

.sync-spinner {
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(14, 18, 28, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.dialog {
  width: min(100%, 420px);
  padding: 24px;
  border-radius: var(--radius-large);
  border: 1px solid var(--app-glass-border);
  background: var(--app-glass-strong);
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}

.dialog--wide {
  width: min(100%, 520px);
}

.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.03em;
}

.dialog-desc {
  margin: 0 0 16px;
}

.dialog-desc code {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--app-surface-soft);
  font-size: 13px;
}

.dialog-desc a {
  color: var(--app-text);
  text-decoration: underline;
}

.dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: 14px;
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  outline: none;
}

.dialog-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 24%, transparent);
}

.dialog-error {
  margin-top: 8px;
  color: #c74444;
  font-size: 13px;
}

.dialog-success {
  margin-top: 8px;
  color: #28c880;
  font-size: 13px;
}

.conflict-info,
.conflict-diff {
  margin: 16px 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--app-surface-soft);
}

.conflict-row,
.conflict-diff-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.conflict-row:not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
}

.conflict-label,
.conflict-diff-label,
.conflict-diff-title {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.conflict-diff-title {
  margin: 0 0 8px;
  font-weight: 600;
}

.conflict-value,
.conflict-diff-value {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}

.conflict-diff-value--add {
  color: #28c880;
}

.conflict-diff-value--update {
  color: #f59e0b;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.dialog-btn--danger {
  background: rgba(199, 68, 68, 0.10);
  color: #c74444;
}

.dialog-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + max(env(safe-area-inset-bottom), 12px) + 12px);
  z-index: 999;
  box-sizing: border-box;
  width: max-content;
  max-width: min(calc(100vw - 32px), 420px);
  padding: 11px 16px;
  border-radius: 18px;
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 90%, transparent);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
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

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .dialog,
.overlay-fade-leave-to .dialog {
  transform: scale(0.95) translateY(8px);
}

:deep(.nav-bar) {
  z-index: 60;
}

:deep(.nav-back) {
  background: color-mix(in srgb, var(--app-surface) 84%, transparent);
  border-color: color-mix(in srgb, var(--app-text) 8%, transparent);
}

@media (max-width: 767px) {
  .hero-head,
  .panel-head,
  .detail-row,
  .conflict-row,
  .conflict-diff-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .detail-value,
  .conflict-value,
  .conflict-diff-value {
    text-align: left;
  }

  .dialog-actions {
    flex-direction: column;
  }
}

@media (min-width: 768px) {
  .overview-section {
    order: 2;
  }

  .actions-section {
    order: 3;
  }

  .hero-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 900px) and (max-width: 1279px) {
  .page-body {
    width: min(100%, 1100px);
    padding-inline: 28px;
  }

  .overview-grid,
  .action-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
}

@media (min-width: 1280px) {
  .page-body {
    width: min(100%, 1100px);
    padding-inline: 28px;
  }

  .overview-grid,
  .action-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
}

:global(html.theme-dark) .entry-card,
:global(html.theme-dark) .panel-card,
:global(html.theme-dark) .hero-card,
:global(html.theme-dark) .dialog {
  border-color: rgba(255, 255, 255, 0.04);
}
</style>
