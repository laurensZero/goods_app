<template>
  <div class="batch-queue-page">
    <NavBar :title="t('goods.batch.addTitle')" show-back>
      <template #right>
        <button class="nav-icon-btn" type="button" @click="addMoreImages">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button class="nav-icon-btn" type="button" @click="showDefaults = true">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </template>
    </NavBar>

    <main class="page-body">
      <div class="batch-queue-shell">
        <!-- Hero 进度区 -->
        <div class="batch-hero">
          <div class="batch-hero__top">
            <span class="batch-hero__title">{{ t('goods.batch.completedCount', { done: completedCount, total: totalCount }) }}</span>
            <span class="batch-hero__percent">{{ progressPercent }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>

        <!-- 队列列表 -->
        <div v-if="totalCount > 0" class="batch-queue-list">
          <div
            v-for="item in queue"
            :key="item.id"
            class="batch-queue-item"
            @click="editItem(item.id)"
          >
            <div class="batch-queue-item__image">
              <LazyCachedImage v-if="item.imageUri" :src="item.imageUri" :lazy="false" class="batch-queue-item__img" />
              <span v-else class="batch-queue-item__placeholder">?</span>
            </div>
            <div class="batch-queue-item__info">
              <span class="batch-queue-item__name">{{ item.name || t('common.unnamed') }}</span>
              <span v-if="item.price" class="batch-queue-item__price">¥{{ item.price }}</span>
            </div>
            <span v-if="item.dirtyFields?.size > 0" class="batch-queue-item__tag">{{ t('common.done') }}</span>
            <button class="batch-queue-item__delete" type="button" @click.stop="removeItem(item.id)">&times;</button>
          </div>
        </div>

        <div v-else class="batch-empty">
          <p>{{ t('goods.batch.noImage') }}</p>
        </div>
      </div>
    </main>

    <!-- 底部保存按钮 - 使用项目标准 float-footer -->
    <div class="float-footer">
      <button
        class="btn-float btn-primary"
        type="button"
        :disabled="!canSaveAll || saving"
        @click="handleSave"
      >
        {{ saving ? t('goods.batch.saving') : t('goods.batch.saveAll', { count: totalCount }) }}
      </button>
    </div>

    <BatchDefaultsSheet
      v-model="showDefaults"
      :ip-options="presetsStore.ips"
      :category-options="presetsStore.categories"
      :defaults="defaults"
      @apply="applyDefaults"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import BatchDefaultsSheet from '@/components/goods/BatchDefaultsSheet.vue'
import { usePresetsStore } from '@/stores/presets'
import { useGoodsStore } from '@/stores/goods'
import { pickLinkedLocalImages } from '@/utils/image/localImage'
import { useBatchQueue } from '@/composables/batch/useBatchQueue'
import { runWithRouteTransition } from '@/utils/routeTransition'

const router = useRouter()
const { t } = useI18n()
const presetsStore = usePresetsStore()
const goodsStore = useGoodsStore()

const showDefaults = ref(false)
const saving = ref(false)
const isWishlist = ref(false)

const {
  queue,
  defaults,
  completedCount,
  totalCount,
  canSaveAll,
  initQueue,
  removeItem,
  appendImages,
  applyDefaults,
  saveAll
} = useBatchQueue()

const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((completedCount.value / totalCount.value) * 100)
})

onMounted(() => {
  isWishlist.value = history.state?.isWishlist === true
  const raw = history.state?.batchImages
  if (raw) {
    try {
      const images = JSON.parse(raw)
      initQueue(images)
    } catch (e) {
      console.warn('[BatchAddQueueView] failed to parse batchImages from state', e)
    }
  }
})

function editItem(id) {
  runWithRouteTransition(
    () => router.push({ name: 'batch-edit', params: { id } }),
    { direction: 'forward' }
  )
}

async function addMoreImages() {
  const picked = await pickLinkedLocalImages(10)
  if (!picked.length) return
  appendImages(picked)
}

async function handleSave() {
  if (!canSaveAll.value || saving.value) return
  saving.value = true
  try {
    await saveAll(goodsStore, isWishlist.value)
    router.replace(isWishlist.value ? '/wishlist' : '/')
  } catch (e) {
    console.error('[BatchAddQueueView] save failed', e)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.batch-queue-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--app-bg);
}

.page-body {
  flex: 1;
  padding-bottom: 100px;
  overflow-y: auto;
  scrollbar-width: none;
}

.page-body::-webkit-scrollbar {
  display: none;
}

.batch-queue-shell {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: 6px var(--page-padding) 32px;
  max-width: 680px;
  margin: 0 auto;
}

/* Nav 按钮 */
.nav-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text);
  transition: transform 0.16s ease;
}

.nav-icon-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-icon-btn:active {
  transform: scale(0.96);
}

/* Hero 进度区 */
.batch-hero {
  padding: 18px 22px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.batch-hero__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}

.batch-hero__title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--app-text);
}

.batch-hero__percent {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--app-surface-soft);
  overflow: hidden;
}

.progress-bar__fill {
  height: 100%;
  border-radius: 3px;
  background: var(--app-text);
  transition: width 0.3s var(--motion-ease-default);
}

/* 队列列表 - 紧凑条状 */
.batch-queue-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.batch-queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--app-surface);
  cursor: pointer;
  transition: background 0.16s ease;
}

.batch-queue-item:active {
  background: var(--app-surface-soft);
}

.batch-queue-item + .batch-queue-item {
  border-top: 1px solid var(--app-border);
}

.batch-queue-item__image {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface-soft);
}

.batch-queue-item__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.batch-queue-item__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.batch-queue-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.batch-queue-item__name {
  font-size: 15px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-queue-item__price {
  font-size: 13px;
  color: var(--app-text-secondary);
}

.batch-queue-item__tag {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: #34c759;
  background: rgba(52, 199, 89, 0.12);
  flex-shrink: 0;
}

.batch-queue-item__delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 14px;
  flex-shrink: 0;
}

.batch-queue-item__delete:active {
  transform: scale(0.9);
}

.batch-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: var(--app-text-tertiary);
  font-size: 14px;
}

/* 底部悬浮按钮 - 使用项目标准样式 */
.float-footer {
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  z-index: 40;
  pointer-events: none;
}

.btn-float {
  pointer-events: auto;
  width: 100%;
  height: 52px;
  border: none;
  border-radius: var(--radius-card);
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  box-shadow: var(--app-shadow);
}

.btn-float:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-float:active:not(:disabled) {
  transform: scale(0.98);
}

/* 平板端 */
@media (min-width: 900px) {
  .batch-queue-shell {
    max-width: 800px;
    padding-top: 24px;
    gap: 24px;
  }

  .batch-hero {
    padding: 24px 28px;
  }

  .batch-hero__title {
    font-size: 24px;
  }

  .batch-queue-item {
    padding: 14px 18px;
    gap: 14px;
  }

  .batch-queue-item__image {
    width: 56px;
    height: 56px;
  }

  .batch-queue-item__name {
    font-size: 16px;
  }

  .float-footer {
    width: min(calc(100vw - 48px), 480px);
  }

  .btn-float {
    height: 56px;
    font-size: 17px;
  }
}
</style>
