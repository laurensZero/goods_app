<!--
  AddMethodSheet.vue
  底部弹出的"选择添加方式"操作面板
  用法：<AddMethodSheet v-model="showSheet" @manual="..." @import="..." />
-->
<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>

    <Transition name="sheet-slide" @after-leave="view = 'options'">
      <div v-if="modelValue" class="sheet-panel" role="dialog" aria-modal="true" :aria-label="view === 'share-import' ? '从分享码导入' : '选择添加方式'">
        <div class="sheet-handle" aria-hidden="true" />

        <!-- ============ 选项列表 ============ -->
        <template v-if="view === 'options'">
          <p class="sheet-title">选择添加方式</p>

          <div class="sheet-options">
            <!-- 手动添加 -->
            <button class="sheet-option" type="button" @click="onManual">
              <span class="option-icon option-icon--manual">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="3" />
                  <path d="M8 12H16" />
                  <path d="M12 8V16" />
                </svg>
              </span>
              <div class="option-body">
                <p class="option-title">手动添加</p>
                <p class="option-desc">自己填写名称、分类、价格等信息</p>
              </div>
              <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            <div class="sheet-divider" />

            <!-- 从米游铺导入 -->
            <button class="sheet-option" type="button" @click="onImport">
              <span class="option-icon option-icon--import">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v4l3 3" />
                </svg>
              </span>
              <div class="option-body">
                <p class="option-title">从米游铺导入</p>
                <p class="option-desc">粘贴商品链接，自动填充信息</p>
              </div>
              <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            <div class="sheet-divider" />

            <!-- 从分享码导入 -->
            <button class="sheet-option" type="button" @click="view = 'share-import'">
              <span class="option-icon option-icon--share">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor"
                  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </span>
              <div class="option-body">
                <p class="option-title">从分享码导入</p>
                <p class="option-desc">粘贴好友分享的谷子链接或分享码</p>
              </div>
              <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            <div v-if="props.showTaobaoImport" class="sheet-divider" />

            <!-- 从淘宝订单导入 -->
            <button v-if="props.showTaobaoImport" class="sheet-option" type="button" @click="onTaobaoImport">
              <span class="option-icon option-icon--taobao">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor"
                  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9h18M9 3v18M3 3h18v18H3z" stroke-width="1.6"/>
                  <path d="M15 13l2 2 4-4" stroke-width="2"/>
                </svg>
              </span>
              <div class="option-body">
                <p class="option-title">从淘宝订单导入</p>
                <p class="option-desc">导入淘宝导出的 .xlsx 订单文件</p>
              </div>
              <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          <button class="sheet-cancel" type="button" @click="close">取消</button>
        </template>

        <!-- ============ 分享码导入 ============ -->
        <template v-if="view === 'share-import'">
          <div class="share-header">
            <button class="share-back" type="button" @click="view = 'options'">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <p class="share-title">从分享码导入</p>
          </div>

          <!-- 输入区域 -->
          <div v-if="!sharePayload" class="share-input-area">
            <div class="share-input-card">
              <span class="share-input-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </span>
              <div class="share-input-body">
                <div class="share-input-row">
                  <input
                    ref="codeInputRef"
                    v-model="codeInput"
                    type="text"
                    class="share-code-input"
                    placeholder="粘贴分享码或链接"
                    autocapitalize="off"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    @keydown.enter.prevent="handleFetch"
                  />
                  <button class="share-fetch-btn" type="button" :disabled="shareFetching || !codeInput.trim()" @click="handleFetch">
                    {{ shareFetching ? '获取中' : '获取' }}
                  </button>
                </div>
                <p v-if="shareError" class="share-error">{{ shareError }}</p>
              </div>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="shareFetching" class="share-loading">
            <span class="share-spinner" />
            <p class="share-loading-text">正在获取分享数据...</p>
          </div>

          <!-- 预览 & 导入 -->
          <template v-if="sharePayload && !shareFetching">
            <div class="share-preview-head">
              <p class="share-preview-count">{{ sharePayload.goods.length }} 件谷子</p>
              <p v-if="sharePayload.sharedAt" class="share-preview-date">{{ formatSharedAt(sharePayload.sharedAt) }}</p>
            </div>

            <div class="share-goods-list">
              <div
                v-for="(item, idx) in sharePayload.goods"
                :key="idx"
                class="share-goods-card"
                :class="{ 'share-goods-card--imported': shareImportedIndexes.has(idx) }"
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
                <span v-if="shareImportedIndexes.has(idx)" class="share-imported-badge">已导入</span>
              </div>
            </div>

            <div class="import-target-switch" role="tablist" aria-label="导入目标">
              <div class="import-target-indicator" :class="{ right: importTarget === 'wishlist' }" />
              <button type="button" class="import-target-tab" :class="{ active: importTarget === 'collection' }" role="tab" :aria-selected="importTarget === 'collection'" @click="importTarget = 'collection'">导入收藏</button>
              <button type="button" class="import-target-tab" :class="{ active: importTarget === 'wishlist' }" role="tab" :aria-selected="importTarget === 'wishlist'" @click="importTarget = 'wishlist'">导入心愿</button>
            </div>

            <div v-if="shareRemainingCount > 0" class="share-import-footer">
              <button class="share-import-btn" :disabled="shareImporting" @click="handleImport">
                {{ shareImporting ? '导入中...' : `导入全部 (${shareRemainingCount})` }}
              </button>
            </div>
          </template>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { useShareImport } from '@/composables/share/useShareImport'
import { extractIdsFromInput } from '@/utils/shareGoods'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  showTaobaoImport: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'manual', 'import', 'account-import', 'taobao-import'])

// ---- view state ----
const view = ref('options')

// ---- share import state ----
const {
  fetching: shareFetching,
  fetchError: shareError,
  payload: sharePayload,
  importing: shareImporting,
  importedIndexes: shareImportedIndexes,
  importTarget,
  remainingCount: shareRemainingCount,
  doFetch,
  handleImport: doImport,
  getItemCover,
  formatSharedAt,
  resetState
} = useShareImport({
  onAllImported: close
})

const codeInputRef = ref(null)
const codeInput = ref('')

function handleFetch() {
  const { gistId: id, shareId: sid } = extractIdsFromInput(codeInput.value)
  if (!id) {
    shareError.value = '请输入有效的分享码或链接'
    return
  }
  doFetch(id, sid)
}

function handleImport() {
  doImport()
}

// Reset share state when switching to share-import view
watch(view, (next) => {
  if (next === 'share-import') {
    codeInput.value = ''
    resetState()
    nextTick(() => codeInputRef.value?.focus())
  }
})

function close() {
  emit('update:modelValue', false)
}

function onManual() {
  emit('manual')
}

function onImport() {
  emit('import')
}

function onAccountImport() {
  close()
  emit('account-import')
}

function onTaobaoImport() {
  emit('taobao-import')
}
</script>

<style scoped>
/* ---- 遮罩 ---- */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

/* ---- 面板 ---- */
.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 90;
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
  overflow-y: auto;
}

/* 顶部手柄 */
.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
}

/* 标题 */
.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 14px;
}

/* ---- 选项卡片 ---- */
.sheet-options {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 10px;
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.15);
}

.sheet-option {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 14px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  text-align: left;
  transition: background 0.14s ease;
}

.sheet-option:active {
  background: rgba(142, 142, 147, 0.12);
}

/* 选项图标 */
.option-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-icon--manual {
  background: rgba(90, 120, 250, 0.12);
}

.option-icon--manual svg {
  width: 22px;
  height: 22px;
  stroke: #5a78fa;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--import {
  background: rgba(50, 200, 140, 0.12);
}

.option-icon--import svg {
  width: 22px;
  height: 22px;
  stroke: #28c880;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--account {
  background: rgba(255, 149, 0, 0.12);
}

.option-icon--account svg {
  width: 22px;
  height: 22px;
  stroke: #ff9500;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--taobao {
  background: rgba(255, 70, 0, 0.10);
}

.option-icon--taobao svg {
  width: 22px;
  height: 22px;
  stroke: #ff4600;
  stroke-width: 1.6;
}

.option-icon--share {
  background: rgba(90, 120, 250, 0.12);
}

.option-icon--share svg {
  width: 22px;
  height: 22px;
  stroke: #5a78fa;
}

/* 选项文本 */
.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  margin: 0 0 2px;
}

.option-desc {
  font-size: 13px;
  color: var(--app-text-tertiary, #8e8e93);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 选项箭头 */
.option-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary, #8e8e93);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- 取消按钮 ---- */
.sheet-cancel {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  transition: background 0.14s ease;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

/* ============ 分享码导入视图 ============ */
.share-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.share-back {
  width: 36px;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-glass) 80%, var(--app-surface));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.share-back svg {
  width: 20px;
  height: 20px;
  stroke: var(--app-text-secondary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.share-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
  margin: 0;
}

/* 输入区 */
.share-input-area {
  margin-bottom: 12px;
}

.share-input-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  padding: 14px;
}

.share-input-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(90, 120, 250, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.share-input-icon svg {
  width: 22px;
  height: 22px;
  stroke: var(--app-text);
}

.share-input-body {
  flex: 1;
  min-width: 0;
}

.share-input-row {
  display: flex;
  gap: 8px;
}

.share-code-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-surface-soft) 86%, var(--app-surface));
  font-size: 15px;
  font-family: 'SF Pro Display', 'PingFang SC', 'Avenir Next', 'Helvetica Neue', sans-serif;
  color: var(--app-text);
  outline: none;
  letter-spacing: -0.01em;
}

.share-code-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.share-fetch-btn {
  flex-shrink: 0;
  height: 44px;
  padding: 0 20px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.share-fetch-btn:disabled {
  opacity: 0.4;
}

.share-error {
  font-size: 13px;
  color: var(--app-danger, #e53e3e);
  margin: 8px 0 0;
}

/* Loading */
.share-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 0;
}

.share-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(142, 142, 147, 0.2);
  border-top-color: var(--app-text);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.share-loading-text {
  font-size: 14px;
  color: var(--app-text-tertiary);
  margin: 0;
}

/* 预览头 */
.share-preview-head {
  margin-bottom: 12px;
}

.share-preview-count {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
  margin: 0;
}

.share-preview-date {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 2px 0 0;
}

/* 商品列表 */
.share-goods-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.share-goods-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 14px;
  transition: opacity 0.2s ease;
}

.share-goods-card--imported {
  opacity: 0.4;
}

.share-goods-thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(142, 142, 147, 0.15);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.share-goods-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.share-goods-initial {
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.share-goods-info {
  flex: 1;
  min-width: 0;
}

.share-goods-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-goods-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.share-meta-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(142, 142, 147, 0.12);
  color: var(--app-text-secondary);
}

.share-meta-tag--price {
  color: var(--app-text);
}

.share-meta-tag--ip {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text);
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

/* 导入按钮 */
.share-import-footer {
  padding: 4px 0 0;
}

.share-import-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 14px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.share-import-btn:disabled {
  opacity: 0.4;
}

/* ---- 过渡动画 ---- */
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

/* ── 平板：居中对话框替代底部抽屉 ── */
@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .sheet-handle {
    display: none;
  }

  .sheet-cancel {
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

:global(html.theme-dark) .sheet-options,
:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .sheet-option:active {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.theme-dark) .share-input-card,
:global(html.theme-dark) .share-goods-card {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .share-back {
  background: color-mix(in srgb, var(--app-glass) 62%, var(--app-surface));
}

:global(html.theme-dark) .share-code-input {
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .share-fetch-btn,
:global(html.theme-dark) .share-import-btn {
  background: #f5f5f7;
  color: #141416;
}
</style>
