<template>
  <div class="page share-import-page">
    <NavBar title="导入分享" show-back @back="handleBack" />

    <main class="page-body">
      <!-- Code input (when no gistId from deep link) -->
      <section v-if="!gistId" class="input-section">
        <div class="input-card">
          <div class="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div class="input-body">
            <p class="input-hint">输入分享码，一键导入谷子</p>
            <div class="input-row">
              <input
                ref="codeInputRef"
                v-model="codeInput"
                type="text"
                class="code-input"
                placeholder="粘贴分享码或链接"
                autocapitalize="off"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                @keydown.enter.prevent="handleFetch"
              />
              <button class="btn-fetch" type="button" :disabled="fetching || !codeInput.trim()" @click="handleFetch">
                {{ fetching ? '获取中' : '获取' }}
              </button>
            </div>
            <p v-if="fetchError" class="fetch-error">{{ fetchError }}</p>
          </div>
        </div>

        <div class="qr-divider"><span>或</span></div>

        <div class="qr-scanner-card">
          <div class="qr-frame">
            <span class="qr-frame-corner qr-frame-corner--tl" />
            <span class="qr-frame-corner qr-frame-corner--tr" />
            <span class="qr-frame-corner qr-frame-corner--bl" />
            <span class="qr-frame-corner qr-frame-corner--br" />
            <svg class="qr-frame-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.2" />
              <rect x="14" y="3" width="7" height="7" rx="1.2" />
              <rect x="3" y="14" width="7" height="7" rx="1.2" />
              <rect x="14" y="14" width="7" height="7" rx="1.2" />
            </svg>
            <p class="qr-frame-hint">{{ scanning ? '正在识别...' : '将二维码对准框内' }}</p>
          </div>
          <div class="qr-actions">
            <button class="btn-qr btn-qr--camera" type="button" :disabled="fetching || scanning" @click="handleScan('camera')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2h-2" /><path d="M15 21h-2" /><path d="M5 21H3a2 2 0 0 1-2-2v-2" />
                <path d="M1 15v-2" /><path d="M1 9V7a2 2 0 0 1 2-2h2" /><path d="M9 3h2" />
                <path d="M15 3h2a2 2 0 0 1 2 2v2" /><path d="M21 9v2" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
              <span>拍照扫描</span>
            </button>
            <button class="btn-qr btn-qr--gallery" type="button" :disabled="fetching || scanning" @click="handleScan('gallery')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span>从相册选择</span>
            </button>
          </div>
          <p v-if="scanError" class="fetch-error">{{ scanError }}</p>
        </div>
      </section>

      <!-- Loading -->
      <section v-if="fetching" class="loading-section">
        <div class="load-card">
          <span class="load-spinner" />
          <p class="load-text">正在获取分享数据...</p>
        </div>
      </section>

      <!-- Preview -->
      <transition name="result-fade">
        <section v-if="payload && !fetching" class="preview-section">
          <div class="section-head">
            <p class="section-label">分享内容</p>
            <h2 class="section-title">{{ payload.goods.length }} 件谷子</h2>
            <p class="section-sub">分享于 {{ formatSharedAt(payload.sharedAt) }}</p>
          </div>

          <div class="goods-list">
            <div
              v-for="(item, idx) in payload.goods"
              :key="idx"
              class="goods-card"
              :class="{ 'goods-card--imported': importedIndexes.has(idx) }"
            >
              <div class="goods-thumb">
                <img
                  v-if="getItemCover(item)"
                  :src="getItemCover(item)"
                  class="goods-img"
                  loading="lazy"
                />
                <span v-else class="goods-initial">{{ (item.name || '?').charAt(0) }}</span>
              </div>
              <div class="goods-info">
                <p class="goods-name">{{ item.name }}</p>
                <div class="goods-meta">
                  <span v-if="item.ip" class="meta-tag ip-tag">{{ item.ip }}</span>
                  <span v-if="item.category" class="meta-tag">{{ item.category }}</span>
                  <span v-if="item.variant" class="meta-tag">{{ item.variant }}</span>
                  <span v-if="item.price" class="meta-tag meta-tag--price">¥{{ item.price }}</span>
                  <span v-if="item.quantity > 1" class="meta-tag">x{{ item.quantity }}</span>
                </div>
                <div v-if="item.characters?.length" class="goods-characters">
                  <span v-for="ch in item.characters" :key="ch" class="char-chip">{{ ch }}</span>
                </div>
              </div>
              <span v-if="importedIndexes.has(idx)" class="imported-badge">已导入</span>
            </div>
          </div>
        </section>
      </transition>

      <!-- Empty -->
      <div style="height: 120px" />
    </main>

    <!-- Import button -->
    <Teleport to="body">
      <div v-if="payload && !fetching && remainingCount > 0" class="float-footer">
        <button class="btn-primary btn-float" :disabled="importing" @click="handleImport">
          {{ importing ? '导入中...' : `导入全部 (${remainingCount})` }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import jsQR from 'jsqr'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/common/NavBar.vue'
import { getPublicGist } from '@/utils/githubGist'
import { validateSharePayload, extractSharePayloadFromGist } from '@/utils/shareGoods'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { runWithRouteTransition } from '@/utils/routeTransition'
import { formatDate } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const goodsStore = useGoodsStore()
import { extractIdsFromInput } from '@/utils/shareGoods'

const presets = usePresetsStore()
const syncStore = useSyncStore()

const gistId = computed(() => String(route.params.gistId || '').trim())
const shareId = computed(() => String(route.query.s || '').trim())

const codeInputRef = ref(null)
const codeInput = ref('')
const fetching = ref(false)
const fetchError = ref('')
const scanning = ref(false)
const payload = ref(null)
const importing = ref(false)
const importedIndexes = ref(new Set())

const remainingCount = computed(() => {
  if (!payload.value) return 0
  return payload.value.goods.filter((_, i) => !importedIndexes.value.has(i)).length
})

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


async function doFetch(gistIdValue, shareIdValue = '') {
  if (!gistIdValue) return

  fetching.value = true
  fetchError.value = ''
  payload.value = null

  try {
    const gist = await getPublicGist(gistIdValue, syncStore.token || '')
    if (!gist) {
      fetchError.value = '未找到该分享，请检查分享码是否正确'
      return
    }

    const data = extractSharePayloadFromGist(gist, shareIdValue)
    if (!data) {
      fetchError.value = '分享数据无效或已过期'
      return
    }

    const validation = validateSharePayload(data)
    if (!validation.valid) {
      fetchError.value = validation.reason
      return
    }

    payload.value = data
  } catch (e) {
    fetchError.value = e.message || '获取分享数据失败，请检查网络'
  } finally {
    fetching.value = false
  }
}

async function handleFetch() {
  const { gistId: id, shareId: sid } = extractIdsFromInput(codeInput.value)
  if (!id) {
    fetchError.value = '请输入有效的分享码或链接'
    return
  }
  await doFetch(id, sid)
}

function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('二维码图片加载失败'))
    img.src = src
  })
}

async function decodeQrTextFromImage(src) {
  const image = await loadImageFromSrc(src)
  const maxEdge = 1600
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
  const width = Math.max(1, Math.floor(image.width * scale))
  const height = Math.max(1, Math.floor(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('当前设备不支持扫码识别')

  ctx.drawImage(image, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth'
  })

  return String(result?.data || '').trim()
}

async function handleScan() {
  scanning.value = true
  fetchError.value = ''

  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Uri,
      quality: 92,
      promptLabelHeader: '扫码导入',
      promptLabelPhoto: '从相册选择',
      promptLabelPicture: '拍摄二维码'
    })

    const src = String(photo?.webPath || photo?.path || '').trim()
    if (!src) throw new Error('未获取到二维码图片')

    const text = await decodeQrTextFromImage(src)
    if (!text) {
      fetchError.value = '未识别到二维码，请重试或手动输入'
      return
    }

    codeInput.value = text
    await handleFetch()
  } catch (e) {
    const message = String(e?.message || '')
    if (message && /cancel|canceled|cancelled/i.test(message)) {
      return
    }
    fetchError.value = e?.message || '扫码失败，请稍后重试'
  } finally {
    scanning.value = false
  }
}

async function handleImport() {
  if (!payload.value) return

  importing.value = true
  const remaining = payload.value.goods.filter((_, i) => !importedIndexes.value.has(i))

  for (let i = 0; i < payload.value.goods.length; i++) {
    if (importedIndexes.value.has(i)) continue

    try {
      const item = payload.value.goods[i]

      // Auto-add IP and category to presets
      if (item.ip && !presets.ips.includes(item.ip)) {
        presets.addIp(item.ip)
      }
      if (item.category && !presets.categories.includes(item.category)) {
        presets.addCategory(item.category)
      }
      // Auto-add characters
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
        acquiredAt: item.acquiredAt,
        note: item.note || '',
        quantity: item.quantity || 1,
        tracks: item.tracks || [],
        images: item.images || [],
        isWishlist: item.isWishlist || false
      })

      importedIndexes.value = new Set([...importedIndexes.value, i])
    } catch {
      // skip failed imports
    }
  }

  importing.value = false

  if (importedIndexes.value.size === payload.value.goods.length) {
    // All imported, go back
    runWithRouteTransition(() => router.replace('/home'), {
      direction: 'back',
      fallbackTransitionKind: 'detail-fade'
    })
  }
}

function handleBack() {
  runWithRouteTransition(() => router.back(), {
    direction: 'back',
    fallbackTransitionKind: 'detail-fade'
  })
}

onMounted(async () => {
  if (gistId.value) {
    await doFetch(gistId.value, shareId.value)
  }
  await nextTick()
  codeInputRef.value?.focus()
})
</script>

<style scoped>
.share-import-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
}

.page-body {
  flex: 1;
  padding: 0 var(--page-padding, 16px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Input section */
.input-section {
  margin-top: 16px;
}

.input-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  border-radius: 18px;
  padding: 16px;
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.input-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(90, 120, 250, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-icon svg {
  width: 22px;
  height: 22px;
  stroke: var(--app-text);
}

.input-body {
  flex: 1;
  min-width: 0;
}

.input-hint {
  font-size: 14px;
  color: var(--app-text-tertiary, #8e8e93);
  margin: 0 0 10px;
  letter-spacing: -0.01em;
}

.input-row {
  display: flex;
  gap: 8px;
}

.code-input {
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

.code-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 18%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.btn-fetch {
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

.btn-fetch:disabled {
  opacity: 0.4;
}

.input-actions {
  margin-top: 8px;
}

.btn-scan {
  width: 100%;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-surface-soft) 78%, var(--app-surface));
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.btn-scan:disabled {
  opacity: 0.45;
}

.fetch-error {
  font-size: 13px;
  color: var(--app-danger, #e53e3e);
  margin: 8px 0 0;
}

/* Loading */
.load-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 0;
}

.load-spinner {
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

.load-text {
  font-size: 14px;
  color: var(--app-text-tertiary);
  margin: 0;
}

/* Section head */
.section-head {
  margin: 24px 0 12px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 4px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--app-text);
  margin: 0;
}

.section-sub {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 4px 0 0;
}

/* Goods list */
.goods-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.goods-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid var(--app-glass-border);
  border-radius: 14px;
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  transition: opacity 0.2s ease;
}

.goods-card--imported {
  opacity: 0.45;
}

.goods-thumb {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(142, 142, 147, 0.15);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.goods-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.goods-initial {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.goods-info {
  flex: 1;
  min-width: 0;
}

.goods-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goods-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.meta-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(142, 142, 147, 0.12);
  color: var(--app-text-secondary);
}

.meta-tag--price {
  color: var(--app-text);
}

.ip-tag {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text);
}

.goods-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.char-chip {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(40, 200, 128, 0.1);
  color: #28c880;
}

.imported-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #28c880;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(40, 200, 128, 0.1);
}

/* Float footer */
.float-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  z-index: 60;
}

.btn-float {
  width: 100%;
  max-width: 400px;
  height: 50px;
  border: none;
  border-radius: 14px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.btn-float:disabled {
  opacity: 0.4;
}

/* Transitions */
.result-fade-enter-active,
.result-fade-leave-active {
  transition: opacity 0.26s ease, transform 0.26s ease;
}

.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (min-width: 600px) {
  .float-footer {
    left: 50%;
    right: auto;
    bottom: max(12px, env(safe-area-inset-bottom));
    width: min(100vw, 430px);
    transform: translateX(-50%);
    border: 1px solid var(--app-glass-border);
    border-radius: 22px;
  }
}

:global(html.theme-dark) .share-import-page {
  background: var(--app-bg);
}

:global(html.theme-dark) .input-card,
:global(html.theme-dark) .goods-card,
:global(html.theme-dark) .load-card {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .float-footer {
  background: rgba(24, 24, 28, 0.82);
}

:global(html.theme-dark) .code-input {
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .btn-scan {
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
}

:global(html.theme-dark) .btn-fetch,
:global(html.theme-dark) .btn-float {
  background: #f5f5f7;
  color: #141416;
}
</style>
