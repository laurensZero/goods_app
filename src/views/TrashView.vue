<template>
  <div class="page trash-page">
    <NavBar :title="t('common.trash')" show-back />

    <main class="page-body">
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Trash Bin</p>
          <h1 class="hero-title">{{ t('trash.heroTitle') }}</h1>
          <p class="hero-desc">{{ t('trash.heroDesc') }}</p>
        </div>

        <div class="summary-grid">
          <article class="summary-card">
            <span class="summary-kicker">{{ t('trash.trashItems') }}</span>
            <strong class="summary-value">{{ store.trashList.length }}</strong>
          </article>
          <article class="summary-card">
            <span class="summary-kicker">{{ t('trash.totalQuantity') }}</span>
            <strong class="summary-value">{{ totalQuantity }}</strong>
          </article>
        </div>
      </section>

      <section class="action-section">
        <button class="action-btn action-btn--ghost" type="button" :disabled="store.trashList.length === 0" @click="restoreAll">
          {{ t('trash.restoreAll') }}
        </button>
        <button class="action-btn action-btn--danger" type="button" :disabled="store.trashList.length === 0" @click="emptyAll">
          {{ t('trash.emptyTrash') }}
        </button>
      </section>

      <section class="list-section">
        <div v-if="store.trashViewList.length > 0" class="trash-list">
          <article v-for="item in store.trashViewList" :key="item.id" class="trash-card">
            <div class="trash-thumb">
              <LazyCachedImage v-if="item.coverImage" :src="item.coverImage" :alt="item.name" class="trash-thumb__img" />
              <span v-else>{{ item.name.trim().charAt(0).toUpperCase() || t('goods.heroFallbackGoods') }}</span>
            </div>

            <div class="trash-body">
              <div class="trash-main">
                <p class="trash-name">{{ item.name }}</p>
                <p class="trash-meta">{{ t('trash.deletedAt', { date: formatDeletedAt(item.deletedAt) }) }}</p>
              </div>

              <div class="trash-chips">
                <span v-if="item.category" class="trash-chip">{{ item.category }}</span>
                <span v-if="item.ip" class="trash-chip">{{ item.ip }}</span>
                <span class="trash-chip">{{ t('common.items', { count: item.quantityNumber }) }}</span>
                <span v-if="item.totalValueNumber > 0" class="trash-chip">{{ formatPrice(item.totalValueNumber) }}</span>
              </div>

              <div class="trash-actions">
                <button class="trash-btn trash-btn--ghost" type="button" @click="restoreItem(item.id)">{{ t('trash.restore') }}</button>
                <button class="trash-btn trash-btn--danger" type="button" @click="deleteItem(item.id)">{{ t('trash.permanentDelete') }}</button>
              </div>
            </div>
          </article>
        </div>

        <EmptyState
          v-else
          icon="✓"
          :title="t('trash.emptyTitle')"
          :description="t('trash.emptyDesc')"
        />
      </section>

      <DangerConfirmDialog
        :show="showDeleteConfirm"
        :title="t('trash.deleteConfirmTitle')"
        :description="t('trash.deleteConfirmDesc')"
        :confirm-text="t('trash.permanentDelete')"
        @cancel="cancelDelete"
        @confirm="confirmDelete"
      />

      <DangerConfirmDialog
        :show="showEmptyConfirm"
        :title="t('trash.emptyConfirmTitle')"
        :description="t('trash.emptyConfirmDesc')"
        :confirm-text="t('trash.emptyTrash')"
        @cancel="showEmptyConfirm = false"
        @confirm="confirmEmptyAll"
      />
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatPrice } from '@/utils/format'
import { useGoodsStore } from '@/stores/goods'
import NavBar from '@/components/common/NavBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import DangerConfirmDialog from '@/components/common/DangerConfirmDialog.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import { showGlobalToast } from '@/utils/globalToast'

const { t } = useI18n()
const store = useGoodsStore()
const showDeleteConfirm = ref(false)
const showEmptyConfirm = ref(false)
const pendingDeleteId = ref('')

const totalQuantity = computed(() =>
  store.trashViewList.reduce((sum, item) => sum + item.quantityNumber, 0)
)

function formatDeletedAt(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('trash.justNow')

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

async function restoreItem(id) {
  try {
    await store.restoreTrashItem(id)
  } catch (e) {
    console.error('[trash] restore failed:', e)
    showGlobalToast(t('toast.operationFailed'))
  }
}

function deleteItem(id) {
  pendingDeleteId.value = id
  showDeleteConfirm.value = true
}

async function restoreAll() {
  const ids = store.trashViewList.map((item) => item.id)
  try {
    await Promise.all(ids.map((id) => store.restoreTrashItem(id)))
  } catch (e) {
    console.error('[trash] restore all failed:', e)
    showGlobalToast(t('toast.operationFailed'))
  }
}

function emptyAll() {
  showEmptyConfirm.value = true
}

function cancelDelete() {
  pendingDeleteId.value = ''
  showDeleteConfirm.value = false
}

async function confirmDelete() {
  const id = pendingDeleteId.value
  pendingDeleteId.value = ''
  showDeleteConfirm.value = false
  if (!id) return
  try {
    await store.deleteTrashItem(id)
  } catch (e) {
    console.error('[trash] delete failed:', e)
    showGlobalToast(t('toast.deleteFailed'))
  }
}

async function confirmEmptyAll() {
  showEmptyConfirm.value = false
  try {
    await store.emptyTrash()
  } catch (e) {
    console.error('[trash] empty trash failed:', e)
    showGlobalToast(t('toast.deleteFailed'))
  }
}
</script>

<style scoped>
.trash-page {
  background:
    radial-gradient(circle at top right, rgba(80, 120, 230, 0.12), transparent 24%),
    var(--app-bg);
}

.hero-section,
.action-section,
.list-section {
  margin-top: var(--section-gap);
  padding: 0 var(--page-padding);
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin-top: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.summary-card,
.trash-card {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.summary-card {
  padding: 18px;
  border-radius: var(--radius-card);
}

.summary-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.summary-value {
  display: block;
  margin-top: 10px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
}

.action-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-btn,
.trash-btn {
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
}

.action-btn {
  min-height: 48px;
}

.action-btn:disabled,
.trash-btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.action-btn--ghost,
.trash-btn--ghost {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: var(--app-shadow);
}

.action-btn--danger,
.trash-btn--danger {
  background: #141416;
  color: #ffffff;
}

.trash-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trash-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-card);
}

.trash-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 18px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 24px;
  font-weight: 700;
}

.trash-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.trash-body {
  flex: 1;
  min-width: 0;
}

.trash-name {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.trash-meta {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.trash-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.trash-chip {
  border-radius: 999px;
  padding: 5px 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
}

.trash-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.trash-btn {
  min-height: 38px;
  padding: 0 14px;
}

:global(html.theme-dark) .action-btn--danger,
:global(html.theme-dark) .trash-btn--danger {
  background: #f5f5f7;
  color: #141416;
}
</style>
