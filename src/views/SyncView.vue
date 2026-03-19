<template>
  <div class="page sub-page">
    <NavBar title="云同步" show-back />

    <main class="page-body">
      <div class="info-grid">
        <section class="card-section">
          <div class="card">
            <div class="card-header">
              <p class="card-kicker">Sync Status</p>
              <span class="status-badge" :class="statusBadgeClass">{{ statusBadgeText }}</span>
            </div>

            <div class="info-list">
              <div class="info-row">
                <span class="info-label">Token</span>
                <span class="info-value">{{ tokenDisplay }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Gist ID</span>
                <span class="info-value">{{ syncStore.gistId || '未创建' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">设备 ID</span>
                <span class="info-value">{{ syncStore.deviceId }}</span>
              </div>
              <div class="info-row info-row--last">
                <span class="info-label">上次同步</span>
                <span class="info-value">{{ lastSyncDisplay }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="card-section">
          <div class="card">
            <p class="card-kicker card-kicker--spaced">Gist Detail</p>
            <div class="info-list">
              <div class="info-row">
                <span class="info-label">收藏</span>
                <span class="info-value">{{ collectionCount }} 件</span>
              </div>
              <div class="info-row">
                <span class="info-label">心愿单</span>
                <span class="info-value">{{ wishlistCount }} 件</span>
              </div>
              <div class="info-row info-row--last">
                <span class="info-label">回收站</span>
                <span class="info-value">{{ trashCount }} 条</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="card-section">
        <div class="action-group">
          <button class="action-item action-item--primary" :disabled="syncStore.isSyncing || !syncStore.token" @click="handleSync">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6" />
              <path d="M2.5 22v-6h6" />
              <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
              <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
            <span>{{ syncStore.isSyncing ? (syncStore.syncStatus || '同步中...') : '同步' }}</span>
            <span v-if="!syncStore.isSyncing" class="action-arrow">↑</span>
            <span v-else class="sync-spinner action-icon" aria-hidden="true" />
          </button>

          <button v-if="syncStore.gistId" class="action-item action-item--primary" :disabled="syncStore.isSyncing" @click="handlePull">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>拉取</span>
            <span class="action-arrow">↓</span>
          </button>
        </div>
      </section>

      <section class="card-section">
        <div class="action-group">
          <button class="action-item" @click="openTokenDialog">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>{{ syncStore.token ? '更换 Token' : '配置 Token' }}</span>
            <svg class="action-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <a v-if="gistUrl" class="action-item" :href="gistUrl" target="_blank" rel="noopener">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>在 GitHub 查看</span>
            <svg class="action-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>

          <button v-if="syncStore.gistId" class="action-item action-item--danger" @click="showResetConfirm = true">
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
            <span>清除配置</span>
            <svg class="action-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
              需要一个具有 <code>gist</code> 权限的 Personal Access Token。
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
              清除后需要重新配置 Token，Gist 中的数据不会被删除。
            </p>
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn--secondary" @click="showResetConfirm = false">取消</button>
              <button class="dialog-btn dialog-btn--danger" @click="handleReset">确认清除</button>
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
import { computed, onMounted, ref } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { validateToken, getGist, extractGistFileContent } from '@/utils/githubGist'
import NavBar from '@/components/NavBar.vue'

const syncStore = useSyncStore()

const showTokenDialog = ref(false)
const showResetConfirm = ref(false)
const tokenInput = ref('')
const tokenError = ref('')
const tokenValidLogin = ref('')
const isVerifyingToken = ref(false)
const toastMsg = ref('')
const gistInfo = ref(null)
let toastTimer = null

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncedAt) return '从未同步'
  return formatTime(syncStore.lastSyncedAt)
})

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
  return '待同步'
})

const tokenDisplay = computed(() => {
  if (!syncStore.token) return '未配置'
  const t = syncStore.token
  return `${t.slice(0, 4)}...${t.slice(-4)}`
})

const gistUrl = computed(() => {
  if (!syncStore.gistId) return ''
  return `https://gist.github.com/${syncStore.gistId}`
})

const collectionCount = computed(() => gistInfo.value?.collectionCount ?? '-')
const wishlistCount = computed(() => gistInfo.value?.wishlistCount ?? '-')
const trashCount = computed(() => gistInfo.value?.trashCount ?? '-')

function formatTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

    const content = extractGistFileContent(gist, 'data.json')

    let collectionCount = 0
    let wishlistCount = 0
    let trashCount = 0

    if (content) {
      try {
        const data = JSON.parse(content)
        const goods = Array.isArray(data.goods) ? data.goods : []
        collectionCount = goods.filter((item) => !item.isWishlist).length
        wishlistCount = goods.filter((item) => item.isWishlist).length
        trashCount = Array.isArray(data.trash) ? data.trash.length : 0
      } catch {
        // ignore parse error
      }
    }

    gistInfo.value = { collectionCount, wishlistCount, trashCount }
  } catch {
    gistInfo.value = null
  }
}

async function handleSync() {
  if (syncStore.isSyncing) return

  try {
    await syncStore.fullSync()
    if (!syncStore.conflictData) {
      showToast('同步完成')
      await loadGistInfo()
    }
  } catch (error) {
    showToast(`同步失败：${error.message}`)
  }
}

async function handlePull() {
  if (syncStore.isSyncing) return

  try {
    await syncStore.pullOnly()
    showToast('拉取完成')
    await loadGistInfo()
  } catch (error) {
    showToast(`拉取失败：${error.message}`)
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
    showToast(`Token 已保存 (${tokenValidLogin.value})`)
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
  await syncStore.init()
  await loadGistInfo()
})
</script>

<style scoped>
.sub-page {
  min-height: 100dvh;
  background: var(--app-bg);
}

.page-body {
  padding: 16px var(--page-padding) 120px;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.card-section {
  margin-bottom: 12px;
}

.card {
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-kicker {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.card-kicker--spaced {
  margin-bottom: 12px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
}

.badge--success { background: rgba(40, 200, 128, 0.12); color: #28c880; }
.badge--warning { background: rgba(255, 162, 0, 0.12); color: #d07a0b; }
.badge--error { background: rgba(199, 68, 68, 0.1); color: #c74444; }
.badge--syncing { background: rgba(120, 100, 255, 0.1); color: #7864ff; }

.info-list {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--app-border);
}

.info-row--last {
  border-bottom: none;
}

.info-label {
  color: var(--app-text-secondary);
  font-size: 14px;
}

.info-value {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
}

.action-group {
  border-radius: var(--radius-card);
  overflow: hidden;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
}

.action-item:last-child {
  border-bottom: none;
}

.action-item--primary {
  color: var(--app-text);
  font-weight: 500;
}

.action-item--danger {
  color: #c74444;
}

.action-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.action-arrow {
  margin-left: auto;
  font-size: 14px;
  color: var(--app-text-tertiary);
  font-weight: 600;
}

.action-arrow-icon {
  margin-left: auto;
  width: 16px;
  height: 16px;
  stroke: var(--app-text-tertiary);
}

.sync-spinner {
  margin-left: auto;
  border: 2px solid var(--app-text-tertiary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  width: 16px;
  height: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.dialog {
  width: 100%;
  max-width: 340px;
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 17px;
  font-weight: 600;
}

.dialog-desc {
  margin: 0 0 16px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-desc code {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--app-surface-soft);
  font-size: 13px;
}

.dialog-desc a {
  color: var(--app-text);
  text-decoration: underline;
}

.dialog-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  font-family: monospace;
  outline: none;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: var(--app-text-tertiary);
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

.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  justify-content: flex-end;
}

.dialog-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
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
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

.dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + max(env(safe-area-inset-bottom), 12px) + 12px);
  z-index: 999;
  padding: 10px 20px;
  border-radius: 20px;
  background: var(--app-text);
  color: var(--app-bg);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transform: translateX(-50%);
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

@media (min-width: 768px) {
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
}
</style>
