<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="showPrompt" class="sheet-backdrop" @click="dismissImport" />
    </Transition>

    <Transition name="sheet-slide">
      <div v-if="showPrompt" class="sheet-panel" role="dialog" aria-modal="true" aria-label="从分享码导入">
        <div class="sheet-handle" aria-hidden="true" />
        
        <div class="share-header">
          <p class="share-title">发现分享的谷子</p>
        </div>

        <!-- 正在加载 -->
        <div v-if="fetching" class="share-loading">
          <span class="share-spinner" />
          <p class="share-loading-text">正在获取分享内容...</p>
        </div>

        <!-- 获取失败 -->
        <div v-else-if="fetchError" class="share-error-box">
          <p class="share-error-desc">{{ fetchError }}</p>
          <div class="share-error-actions">
            <button class="sheet-btn sheet-btn--cancel" type="button" @click="dismissImport">忽略</button>
            <button class="sheet-btn sheet-btn--retry" type="button" @click="retryFetch">重试</button>
          </div>
        </div>

        <!-- 解析结果预览 & 导入 -->
        <template v-else-if="payload">
          <div class="share-preview-head">
            <p class="share-preview-count">共 {{ payload.goods?.length || 0 }} 件</p>
            <p v-if="payload.sharedAt" class="share-preview-date">{{ formatSharedAt(payload.sharedAt) }}</p>
          </div>

          <div class="share-goods-list">
            <div
              v-for="(item, idx) in payload.goods"
              :key="idx"
              class="share-goods-card"
              :class="{ 'share-goods-card--imported': importedIndexes.has(idx) }"
            >
              <div class="share-goods-thumb">
                <img
                  v-if="getItemCover(item)"
                  :src="getItemCover(item)"
                  class="share-goods-img"
                  loading="lazy"
                />
                <span v-else class="share-goods-initial">{{ (item.name || '?').charAt(0) }}</span>
              </div>
              <div class="share-goods-info">
                <p class="share-goods-name">{{ item.name }}</p>
                <div class="share-goods-meta">
                  <span v-if="item.ip" class="share-meta-tag share-meta-tag--ip">{{ item.ip }}</span>
                  <span v-if="item.category" class="share-meta-tag">{{ item.category }}</span>
                  <span v-if="item.variant" class="share-meta-tag">{{ item.variant }}</span>
                  <span v-if="item.price" class="share-meta-tag share-meta-tag--price">{{ formatCurrency(item.price, item.currency) }}</span>
                  <span v-if="item.actualPrice" class="share-meta-tag share-meta-tag--price">{{ formatCurrency(item.actualPrice, item.actualPriceCurrency || item.currency) }}</span>
                  <span v-if="item.quantity > 1" class="share-meta-tag">x{{ item.quantity }}</span>
                </div>
              </div>
              <span v-if="importedIndexes.has(idx)" class="share-imported-badge">已导入</span>
            </div>
          </div>

          <div class="import-target-switch" role="tablist" aria-label="导入目标">
            <div class="import-target-indicator" :class="{ right: importTarget === 'wishlist' }" />
            <button
              type="button"
              class="import-target-tab"
              :class="{ active: importTarget === 'collection' }"
              role="tab"
              :aria-selected="importTarget === 'collection'"
              @click="importTarget = 'collection'"
            >
              导入收藏
            </button>
            <button
              type="button"
              class="import-target-tab"
              :class="{ active: importTarget === 'wishlist' }"
              role="tab"
              :aria-selected="importTarget === 'wishlist'"
              @click="importTarget = 'wishlist'"
            >
              导入心愿
            </button>
          </div>

          <div class="share-actions-footer">
            <button class="sheet-btn sheet-btn--cancel" type="button" @click="dismissImport">取消</button>
            <button
              class="sheet-btn sheet-btn--confirm"
              :disabled="importing || remainingCount === 0"
              @click="handleImport"
            >
              {{ importing ? '导入中...' : `导入全部 (${remainingCount})` }}
            </button>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { watch } from 'vue'
import { useClipboardImport } from '@/composables/useClipboardImport'
import { useShareImport } from '@/composables/share/useShareImport'
import { formatCurrency } from '@/utils/format'

const { showPrompt, incomingGistId, incomingShareId, dismissImport } = useClipboardImport()

const {
  fetching,
  fetchError,
  payload,
  importing,
  importedIndexes,
  importTarget,
  remainingCount,
  doFetch,
  handleImport: doImport,
  getItemCover,
  formatSharedAt,
  resetState
} = useShareImport({
  onImportError(itemName, err) {
    alert(`导入 "${itemName}" 失败: ` + err.message)
  },
  onAllImported: dismissImport
})

function retryFetch() {
  doFetch(incomingGistId.value, incomingShareId.value)
}

function handleImport() {
  doImport()
}

watch(showPrompt, (newVal) => {
  if (newVal) {
    resetState()
    doFetch(incomingGistId.value, incomingShareId.value)
  }
})
</script>

<style scoped>
/* 遮罩 */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

/* 面板 */
.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 1110;
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  box-shadow:
    0 22px 54px color-mix(in srgb, var(--app-text) 14%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 4%, transparent);
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 90dvh;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
}

.share-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.share-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: -0.01em;
  margin: 0;
}

/* 加载中 */
.share-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: var(--app-text-tertiary);
}

.share-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--app-text-tertiary) 20%, transparent);
  border-top-color: var(--app-text-secondary);
  border-radius: 50%;
  animation: sheet-spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes sheet-spin {
  to { transform: rotate(360deg); }
}

.share-loading-text {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

/* 错误 */
.share-error-box {
  padding: 32px 16px;
  text-align: center;
}

.share-error-desc {
  color: var(--app-danger);
  font-size: 15px;
  margin: 0 0 24px;
  line-height: 1.5;
}

.share-error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* 解析结果 */
.share-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 12px;
  border-bottom: 1px solid rgba(142, 142, 147, 0.15);
  margin-bottom: 12px;
  flex-shrink: 0;
}

.share-preview-count {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.share-preview-date {
  font-size: 13px;
  color: var(--app-text-tertiary);
  margin: 0;
}

/* 商品列表（带滚动） */
.share-goods-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 -8px 16px;
  padding: 0 8px;
  max-height: 50vh;
}

.share-goods-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface) 60%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border) 40%, transparent);
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.share-goods-card--imported {
  opacity: 0.5;
  filter: grayscale(1);
}

.share-goods-thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--app-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(0,0,0,0.06);
}

.share-goods-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.share-goods-initial {
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text-tertiary);
}

.share-goods-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.share-goods-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-goods-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.share-meta-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--app-overlay);
  color: var(--app-text-secondary);
  line-height: 1.2;
}

.share-meta-tag--ip {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text);
}

.share-meta-tag--price {
  color: #ff6b00;
  background: rgba(255, 107, 0, 0.1);
}

.share-imported-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: #28c880;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(40, 200, 128, 0.1);
}

/* 导入目标切换 */
.import-target-switch {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 6px;
  margin: 0 0 12px;
  background: color-mix(in srgb, var(--app-glass) 74%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 74%, transparent);
  border-radius: 16px;
  isolation: isolate;
  flex-shrink: 0;
}

.import-target-indicator {
  position: absolute;
  top: 6px;
  left: 6px;
  width: calc(50% - 10px);
  height: 40px;
  border-radius: 12px;
  background: var(--app-text);
  transition: transform 0.32s cubic-bezier(0.34, 1.3, 0.64, 1);
  z-index: 0;
}

.import-target-indicator.right {
  transform: translateX(calc(100% + 8px));
}

.import-target-tab {
  position: relative;
  z-index: 1;
  height: 40px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-tertiary, #8e8e93);
  font-size: 14px;
  font-weight: 600;
  transition: color 0.2s ease;
}

.import-target-tab.active {
  color: var(--app-surface);
}

/* 底部按钮 */
.share-actions-footer {
  display: flex;
  gap: 12px;
  padding-top: 8px;
  flex-shrink: 0;
}

.sheet-btn {
  flex: 1;
  height: 48px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}

.sheet-btn:active {
  transform: scale(0.96);
}

.sheet-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sheet-btn--cancel, .sheet-btn--retry {
  background: var(--app-surface-muted);
  color: var(--app-text-secondary);
}

.sheet-btn--confirm {
  background: var(--app-text);
  color: var(--app-bg);
}

/* 过渡动画 */
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

@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
    max-height: 80dvh;
  }

  .sheet-handle {
    display: none;
  }

  .sheet-slide-enter-from,
  .sheet-slide-leave-to {
    transform: translateX(-50%) translateY(-50%) scale(0.94);
    opacity: 0;
  }
}

:global(html.theme-dark) .sheet-panel {
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .share-goods-card {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .sheet-btn--confirm {
  background: #f5f5f7;
  color: #141416;
}
</style>
