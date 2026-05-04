<template>
  <div class="page share-manage-page">
    <NavBar title="管理分享" show-back />

    <main class="page-body">
      <section class="share-hero">
        <div class="share-hero__copy">
          <p class="share-hero__label">Share Center</p>
          <h1 class="share-hero__title">分享管理</h1>
          <p class="share-hero__desc">
            统一查看已发起的分享链接，按需复制、停用或删除，避免失效分享散落。
          </p>
        </div>

        <div class="share-hero__stats">
          <article class="hero-stat-card">
            <span class="hero-stat-card__label">全部分享</span>
            <strong class="hero-stat-card__value">{{ stats.total }}</strong>
          </article>
          <article class="hero-stat-card">
            <span class="hero-stat-card__label">生效中</span>
            <strong class="hero-stat-card__value">{{ stats.active }}</strong>
          </article>
          <article class="hero-stat-card">
            <span class="hero-stat-card__label">已停用</span>
            <strong class="hero-stat-card__value">{{ stats.disabled }}</strong>
          </article>
        </div>
      </section>

      <section v-if="!syncStore.token" class="share-state-card share-state-card--empty">
        <span class="share-state-card__icon">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <h2 class="share-state-card__title">需要先配置 GitHub Token</h2>
        <p class="share-state-card__desc">分享记录保存在 GitHub Gist 里。先去云同步页完成 token 配置，才能查看和管理已有分享。</p>
        <button class="share-primary-btn" type="button" @click="openSync">前往云同步</button>
      </section>

      <section v-else-if="loading" class="share-state-card share-state-card--loading">
        <span class="load-spinner" />
        <p class="share-state-card__desc">正在加载分享记录...</p>
      </section>

      <section v-else-if="loadError" class="share-state-card share-state-card--empty">
        <span class="share-state-card__icon share-state-card__icon--danger">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </svg>
        </span>
        <h2 class="share-state-card__title">{{ loadError }}</h2>
        <button class="share-primary-btn" type="button" @click="loadShares">重新加载</button>
      </section>

      <section v-else class="share-content">
        <div class="share-toolbar">
          <div class="share-toolbar__copy">
            <p class="share-toolbar__label">Records</p>
            <h2 class="share-toolbar__title">{{ shares.length > 0 ? `共 ${shares.length} 条分享` : '暂无分享记录' }}</h2>
            <p class="share-toolbar__desc">
              {{ gistMetaText }}
            </p>
          </div>

          <div class="share-toolbar__actions">
            <button class="share-secondary-btn" type="button" :disabled="loading" @click="loadShares">刷新</button>
            <button v-if="shareGist?.id" class="share-secondary-btn share-secondary-btn--mono" type="button" @click="copyGistId">
              {{ gistCopied ? 'Gist 已复制' : '复制 Gist ID' }}
            </button>
          </div>
        </div>

        <section v-if="shares.length === 0" class="share-state-card share-state-card--empty">
          <span class="share-state-card__icon">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <h2 class="share-state-card__title">还没有分享记录</h2>
          <p class="share-state-card__desc">从收藏详情或批量选择里发起分享后，记录会自动出现在这里。</p>
        </section>

        <section v-else class="share-grid">
          <article
            v-for="share in shares"
            :key="share.shareId"
            :class="['share-record', { 'share-record--disabled': share.disabled }]"
          >
            <div class="share-record__head">
              <div class="share-record__media">
                <div class="share-record__thumb">
                  <img
                    v-if="share.coverUri"
                    :src="share.coverUri"
                    class="share-record__thumb-img"
                    loading="lazy"
                  />
                  <span v-else class="share-record__thumb-fallback">{{ share.firstGoodsName.charAt(0) }}</span>
                </div>

                <div class="share-record__copy">
                  <div class="share-record__topline">
                    <h3 class="share-record__title">{{ share.firstGoodsName }}{{ share.goodsCount > 1 ? ` 等 ${share.goodsCount} 件` : '' }}</h3>
                    <span :class="['share-status-chip', share.disabled ? 'share-status-chip--off' : 'share-status-chip--on']">
                      {{ share.disabled ? '已停用' : '生效中' }}
                    </span>
                  </div>

                  <div class="share-record__meta">
                    <span class="share-meta-pill">{{ share.goodsCount }} 件谷子</span>
                    <span class="share-meta-pill share-meta-pill--mono">{{ share.shareId }}</span>
                    <span class="share-record__date">{{ formatShareDate(share.sharedAt) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="share-record__linkbox">
              <span class="share-record__linklabel">分享链接</span>
              <code class="share-record__linkvalue">{{ buildShareLink(share) }}</code>
            </div>

            <div class="share-record__actions">
              <button class="share-action-btn share-action-btn--primary" type="button" @click="shareAgain(share)">
                {{ copiedId === share.shareId ? '已分享' : '再次分享' }}
              </button>
              <button class="share-action-btn" type="button" :disabled="togglingId === share.shareId" @click="toggleShare(share)">
                {{ togglingId === share.shareId ? '处理中...' : share.disabled ? '重新启用' : '停用分享' }}
              </button>
              <button class="share-action-btn share-action-btn--danger" type="button" :disabled="deletingId === share.shareId" @click="confirmDelete(share)">
                {{ deletingId === share.shareId ? '删除中...' : '删除' }}
              </button>
            </div>
          </article>
        </section>
      </section>
    </main>

    <ShareSheet :show="showShareSheet" :goods-items="shareSheetItems" :initial-share="shareInitial" @close="showShareSheet = false" />

    <Teleport to="body">
      <Transition name="sheet-backdrop">
        <div v-if="deleteTarget" class="confirm-backdrop" @click="deleteTarget = null" />
      </Transition>
      <Transition name="sheet-slide">
        <div v-if="deleteTarget" class="confirm-sheet" role="dialog" aria-modal="true">
          <div class="confirm-handle" aria-hidden="true" />
          <p class="confirm-title">删除这个分享？</p>
          <p class="confirm-desc">删除后，该分享码和链接将无法继续导入。此操作不可撤销。</p>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--cancel" type="button" @click="deleteTarget = null">取消</button>
            <button class="confirm-btn confirm-btn--delete" type="button" @click="doDelete">确认删除</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Share } from '@capacitor/share'
import NavBar from '@/components/common/NavBar.vue'
import ShareSheet from '@/components/goods/ShareSheet.vue'
import { getShareGist, deleteGistFiles, updateGist } from '@/utils/githubGist'
import { extractSharePayloadFromGist, getShareAssetFilenames, listSharesFromGist, toggleShareDisabled } from '@/utils/shareGoods'
import { buildShareUrl } from '@/config/share'
import { formatDate } from '@/utils/format'
import { useSyncStore } from '@/stores/sync'
import { runWithRouteTransition } from '@/utils/routeTransition'

const router = useRouter()
const syncStore = useSyncStore()

const loading = ref(false)
const loadError = ref('')
const shares = ref([])
const shareGist = ref(null)

const copiedId = ref('')
const gistCopied = ref(false)
const togglingId = ref('')
const deletingId = ref('')
const deleteTarget = ref(null)
const showShareSheet = ref(false)
const shareSheetItems = ref([])
const shareInitial = ref(null)

const stats = computed(() => {
  const total = shares.value.length
  const disabled = shares.value.filter((entry) => entry.disabled).length
  return {
    total,
    disabled,
    active: Math.max(0, total - disabled)
  }
})

const gistMetaText = computed(() => {
  if (!shareGist.value?.id) return '当前未找到分享 Gist。'
  return `当前 Gist：${shareGist.value.id}`
})

function formatShareDate(dateStr) {
  if (!dateStr) return '未知时间'
  return formatDate(dateStr, 'YYYY-MM-DD HH:mm') || '未知时间'
}

function buildShareLink(share) {
  const gistId = shareGist.value?.id || ''
  return buildShareUrl(gistId, share.shareId) || `goodsapp://share/${gistId}?s=${share.shareId}`
}

function shareCode(share) {
  const gistId = shareGist.value?.id || ''
  return share.shareId ? `${gistId}-${share.shareId}` : gistId
}

function openSync() {
  runWithRouteTransition(() => router.push('/manage/sync'), { direction: 'forward' })
}

async function loadShares() {
  if (!syncStore.token) {
    shares.value = []
    shareGist.value = null
    return
  }

  loading.value = true
  loadError.value = ''

  try {
    const gist = await getShareGist(syncStore.token, 'goods-app-share')
    shareGist.value = gist
    shares.value = gist ? listSharesFromGist(gist) : []
  } catch (error) {
    loadError.value = error.message || '加载分享记录失败'
  } finally {
    loading.value = false
  }
}

async function copyText(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function copyGistId() {
  const success = await copyText(shareGist.value?.id || '')
  if (!success) return
  gistCopied.value = true
  window.setTimeout(() => {
    gistCopied.value = false
  }, 2000)
}

async function shareAgain(share) {
  const gistId = shareGist.value?.id || ''

  // Fetch full share payload so multi-item shares show all goods in poster
  let loadedItems = []
  try {
    const payload = extractSharePayloadFromGist(shareGist.value, share.shareId)
    if (payload?.goods?.length) {
      loadedItems = payload.goods
    }
  } catch {
    // ignore, fall back to summary data
  }

  if (loadedItems.length === 0) {
    loadedItems = [{
      name: share.firstGoodsName || '未命名',
      images: share.coverUri ? [{ uri: share.coverUri, isPrimary: true }] : []
    }]
  }

  shareSheetItems.value = loadedItems
  shareInitial.value = {
    gistId,
    shareId: share.shareId,
    code: `${gistId}-${share.shareId}`,
    url: buildShareLink(share)
  }
  void nextTick().then(() => { showShareSheet.value = true })
  copiedId.value = share.shareId
  window.setTimeout(() => { if (copiedId.value === share.shareId) copiedId.value = '' }, 2000)
}

async function toggleShare(share) {
  if (!shareGist.value?.id) return

  togglingId.value = share.shareId
  try {
    const newContent = toggleShareDisabled(shareGist.value, share.filename, !share.disabled)
    if (!newContent) throw new Error('无法读取分享数据')

    await updateGist(syncStore.token, shareGist.value.id, {
      [share.filename]: { content: newContent }
    })

    share.disabled = !share.disabled
  } finally {
    togglingId.value = ''
  }
}

function confirmDelete(share) {
  deleteTarget.value = share
}

async function doDelete() {
  const share = deleteTarget.value
  if (!share || !shareGist.value?.id) return

  deletingId.value = share.shareId
  deleteTarget.value = null

  try {
    const filenames = getShareAssetFilenames(shareGist.value, share.filename)
    await deleteGistFiles(syncStore.token, shareGist.value.id, filenames)
    shares.value = shares.value.filter((entry) => entry.shareId !== share.shareId)
    if (shareGist.value?.files) {
      for (const filename of filenames) {
        delete shareGist.value.files[filename]
      }
    }
  } finally {
    deletingId.value = ''
  }
}

onMounted(() => {
  void loadShares()
})
</script>

<style scoped>
.share-manage-page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at top right, rgba(90, 120, 250, 0.14), transparent 30%),
    radial-gradient(circle at left 20%, rgba(40, 200, 128, 0.08), transparent 28%),
    var(--app-bg-gradient);
}

.page-body {
  padding: 0 var(--page-padding) 40px;
}

.share-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(240px, 0.8fr);
  gap: 18px;
  margin-top: 8px;
}

.share-hero__copy,
.share-hero__stats,
.share-toolbar,
.share-state-card,
.share-record {
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
}

.share-hero__copy {
  padding: 24px;
  border-radius: 30px;
}

.share-hero__label,
.share-toolbar__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.share-hero__title {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.share-hero__desc,
.share-toolbar__desc,
.share-state-card__desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.65;
}

.share-hero__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  border-radius: 30px;
}

.hero-stat-card {
  min-width: 0;
  padding: 18px 16px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
}

.hero-stat-card__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.hero-stat-card__value {
  display: block;
  margin-top: 10px;
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.share-content {
  margin-top: 18px;
}

.share-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px;
  border-radius: 28px;
}

.share-toolbar__title,
.share-state-card__title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.share-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.share-primary-btn,
.share-secondary-btn {
  min-height: 46px;
  padding: 0 18px;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.share-primary-btn {
  background: var(--app-text);
  color: var(--app-surface);
}

.share-secondary-btn {
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
}

.share-secondary-btn--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
}

.share-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 42px 24px;
  border-radius: 28px;
  text-align: center;
}

.share-state-card--loading {
  justify-content: center;
}

.share-state-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-text) 7%, transparent);
  color: var(--app-text-secondary);
}

.share-state-card__icon--danger {
  color: #d15353;
  background: color-mix(in srgb, #d15353 10%, transparent);
}

.share-state-card__icon svg {
  width: 28px;
  height: 28px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.load-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(142, 142, 147, 0.2);
  border-top-color: var(--app-text);
  border-radius: 50%;
  animation: spin 0.72s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.share-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.share-record {
  padding: 18px;
  border-radius: 28px;
  border: 1px solid color-mix(in srgb, var(--app-border) 74%, transparent);
}

.share-record--disabled {
  opacity: 0.68;
}

.share-record__media {
  display: flex;
  gap: 14px;
  align-items: center;
}

.share-record__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  overflow: hidden;
  background: color-mix(in srgb, var(--app-surface-soft) 80%, transparent);
  flex-shrink: 0;
}

.share-record__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.share-record__thumb-fallback {
  color: var(--app-text-tertiary);
  font-size: 24px;
  font-weight: 700;
}

.share-record__copy {
  min-width: 0;
  flex: 1;
}

.share-record__topline {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.share-record__title {
  flex: 1;
  min-width: 0;
  color: var(--app-text);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.03em;
}

.share-status-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.share-status-chip--on {
  background: rgba(40, 200, 128, 0.12);
  color: #28a56d;
}

.share-status-chip--off {
  background: rgba(142, 142, 147, 0.12);
  color: var(--app-text-tertiary);
}

.share-record__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.share-meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 90%, transparent);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.share-meta-pill--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
}

.share-record__date {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.share-record__linkbox {
  margin-top: 16px;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-surface-soft) 76%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
}

.share-record__linklabel {
  display: block;
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.share-record__linkvalue {
  display: block;
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
  white-space: normal;
}

.share-record__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.share-action-btn {
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-glass) 80%, var(--app-surface));
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.share-action-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: transparent;
}

.share-action-btn--danger {
  color: #d15353;
  border-color: color-mix(in srgb, #d15353 28%, transparent);
}

.share-action-btn:disabled,
.share-secondary-btn:disabled {
  opacity: 0.42;
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

.confirm-sheet {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 100;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 22px 54px color-mix(in srgb, var(--app-text) 14%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 4%, transparent);
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
}

.confirm-handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
}

.confirm-title {
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  letter-spacing: -0.02em;
}

.confirm-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
  text-align: center;
}

.confirm-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.confirm-btn {
  min-height: 48px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.confirm-btn--cancel {
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  color: var(--app-text);
}

.confirm-btn--delete {
  background: #d15353;
  color: #fff;
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 0.28s ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active {
  transition: transform 0.32s cubic-bezier(0.34, 1.1, 0.64, 1), opacity 0.22s ease;
}

.sheet-slide-leave-active {
  transition: transform 0.24s ease, opacity 0.18s ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0.6;
}

@media (max-width: 1023px) {
  .share-hero {
    grid-template-columns: 1fr;
  }

  .share-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .share-hero__copy,
  .share-toolbar,
  .share-record,
  .share-state-card {
    border-radius: 24px;
  }

  .share-hero__stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
  }

  .hero-stat-card {
    padding: 14px 10px;
    border-radius: 18px;
    text-align: center;
  }

  .hero-stat-card__label {
    font-size: 11px;
  }

  .hero-stat-card__value {
    margin-top: 8px;
    font-size: 24px;
  }

  .share-toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 20px;
  }

  .share-toolbar__actions {
    width: 100%;
  }

  .share-toolbar__actions > * {
    flex: 1;
  }

  .share-record__topline {
    flex-direction: column;
  }

  .share-record__actions {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 900px) {
  .confirm-sheet {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
  }

  .confirm-handle {
    display: none;
  }

  .sheet-slide-enter-from,
  .sheet-slide-leave-to {
    transform: translateX(-50%) translateY(-50%) scale(0.94);
    opacity: 0;
  }
}

:global(html.theme-dark) .share-hero__copy,
:global(html.theme-dark) .share-hero__stats,
:global(html.theme-dark) .share-toolbar,
:global(html.theme-dark) .share-state-card,
:global(html.theme-dark) .share-record {
  box-shadow:
    0 24px 48px rgba(0, 0, 0, 0.24),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .hero-stat-card,
:global(html.theme-dark) .share-record__linkbox,
:global(html.theme-dark) .share-meta-pill,
:global(html.theme-dark) .share-action-btn,
:global(html.theme-dark) .share-secondary-btn {
  background: color-mix(in srgb, var(--app-glass) 56%, var(--app-surface));
}

:global(html.theme-dark) .share-action-btn--primary,
:global(html.theme-dark) .share-primary-btn {
  background: #f5f5f7;
  color: #141416;
}

:global(html.theme-dark) .confirm-sheet {
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}
</style>
