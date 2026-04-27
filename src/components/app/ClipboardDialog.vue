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
        <div v-if="shareFetching" class="share-loading">
          <span class="share-spinner" />
          <p class="share-loading-text">正在获取分享内容...</p>
        </div>

        <!-- 获取失败 -->
        <div v-else-if="shareError" class="share-error-box">
          <p class="share-error-desc">{{ shareError }}</p>
          <div class="share-error-actions">
            <button class="sheet-btn sheet-btn--cancel" type="button" @click="dismissImport">忽略</button>
            <button class="sheet-btn sheet-btn--retry" type="button" @click="doFetch">重试</button>
          </div>
        </div>

        <!-- 解析结果预览 & 导入 -->
        <template v-else-if="sharePayload">
          <div class="share-preview-head">
            <p class="share-preview-count">共 {{ sharePayload.goods?.length || 0 }} 件</p>
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
                  <span v-if="item.price" class="share-meta-tag share-meta-tag--price">¥{{ item.price }}</span>
                  <span v-if="item.quantity > 1" class="share-meta-tag">x{{ item.quantity }}</span>
                </div>
              </div>
              <span v-if="shareImportedIndexes.has(idx)" class="share-imported-badge">已导入</span>
            </div>
          </div>

          <div class="share-actions-footer">
            <button class="sheet-btn sheet-btn--cancel" type="button" @click="dismissImport">取消</button>
            <button 
              class="sheet-btn sheet-btn--confirm" 
              :disabled="shareImporting || shareRemainingCount === 0" 
              @click="handleImport"
            >
              {{ shareImporting ? '导入中...' : `导入全部 (${shareRemainingCount})` }}
            </button>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useClipboardImport } from '@/composables/useClipboardImport'
import { getPublicGist } from '@/utils/githubGist'
import { validateSharePayload, extractSharePayloadFromGist } from '@/utils/shareGoods'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { formatDate } from '@/utils/format'

const { showPrompt, incomingGistId, incomingShareId, dismissImport } = useClipboardImport()

const goodsStore = useGoodsStore()
const presets = usePresetsStore()
const syncStore = useSyncStore()

const shareFetching = ref(false)
const shareError = ref('')
const sharePayload = ref(null)
const shareImporting = ref(false)
const shareImportedIndexes = ref(new Set())

const shareRemainingCount = computed(() => {
  if (!sharePayload.value) return 0
  return sharePayload.value.goods.filter((_, i) => !shareImportedIndexes.value.has(i)).length
})

watch(showPrompt, (newVal) => {
  if (newVal) {
    // Reset state and fetch
    shareError.value = ''
    sharePayload.value = null
    shareImporting.value = false
    shareImportedIndexes.value = new Set()
    
    if (incomingGistId.value) {
      doFetch()
    } else {
      shareError.value = '无效的分享数据'
    }
  }
})

async function doFetch() {
  shareFetching.value = true
  shareError.value = ''
  sharePayload.value = null

  try {
    const gist = await getPublicGist(incomingGistId.value, syncStore.token || '')
    if (!gist) {
      shareError.value = '未找到该分享，请检查分享是否已取消'
      return
    }

    const data = extractSharePayloadFromGist(gist, incomingShareId.value)
    if (!data) {
      shareError.value = '分享数据无效或已过期'
      return
    }

    const validation = validateSharePayload(data)
    if (!validation.valid) {
      shareError.value = validation.reason
      return
    }

    sharePayload.value = data
  } catch (e) {
    shareError.value = e.message || '获取分享数据失败，请检查网络'
  } finally {
    shareFetching.value = false
  }
}

async function handleImport() {
  if (!sharePayload.value) return

  shareImporting.value = true

  for (let i = 0; i < sharePayload.value.goods.length; i++) {
    if (shareImportedIndexes.value.has(i)) continue

    try {
      const item = sharePayload.value.goods[i]

      if (item.ip && !presets.ips.includes(item.ip)) {
        presets.addIp(item.ip)
      }
      if (item.category && !presets.categories.includes(item.category)) {
        presets.addCategory(item.category)
      }
      if (item.characters?.length) {
        for (const ch of item.characters) {
          const exists = presets.characters.some(c =>
            (typeof c === 'string' ? c : c.name) === ch
          )
          if (!exists) {
            presets.addCharacter(ch, item.ip || '')
          }
        }
      }

      await goodsStore.addGoods({
        name: item.name,
        category: item.category || '',
        ip: item.ip || '',
        characters: item.characters || [],
        variant: item.variant || '',
        price: item.price,
        actualPrice: item.actualPrice,
        quantity: item.quantity || 1,
        source: item.source || '',
        images: item.images || [],
        note: item.note || '',
        purchaseDate: item.purchaseDate || Date.now(),
        isWishlist: false
      })

      shareImportedIndexes.value.add(i)
    } catch (err) {
      console.error('导入商品失败', err)
      alert(`导入 "${sharePayload.value.goods[i].name}" 失败: ` + err.message)
      break
    }
  }

  shareImporting.value = false

  if (shareImportedIndexes.value.size === sharePayload.value.goods.length) {
    dismissImport() // 关闭并在 useClipboardImport 记录 processed hash
  }
}

function getItemCover(item) {
  const images = item.images || []
  const primary = images.find((img) => img.isPrimary)
  return primary?.uri || images[0]?.uri || ''
}

function formatSharedAt(dateStr) {
  if (!dateStr) return ''
  try {
    return formatDate(new Date(dateStr), 'YYYY-MM-DD HH:mm')
  } catch {
    return dateStr
  }
}
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
