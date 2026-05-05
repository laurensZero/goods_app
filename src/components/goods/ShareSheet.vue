<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="show" class="sheet-backdrop" @click="handleClose" />
    </Transition>

    <Transition name="sheet-slide">
      <div v-if="show" class="sheet-panel" role="dialog" aria-modal="true" aria-label="分享谷子">
        <div class="sheet-handle" aria-hidden="true" />

        <p class="sheet-title">分享{{ goodsItems.length > 1 ? ` ${goodsItems.length} 件` : '' }}谷子</p>

        <div v-if="shareResult" class="share-mode-switch" role="tablist" aria-label="分享形式切换">
          <button
            type="button"
            class="share-mode-tab"
            :class="{ active: shareMode === 'link' }"
            role="tab"
            :aria-selected="shareMode === 'link'"
            @click="shareMode = 'link'"
          >
            链接分享
          </button>
          <button
            type="button"
            class="share-mode-tab"
            :class="{ active: shareMode === 'image' }"
            role="tab"
            :aria-selected="shareMode === 'image'"
            @click="shareMode = 'image'"
          >
            图片分享
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="sheet-loading">
          <span class="load-spinner" />
          <p class="load-text">正在生成分享链接...</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="sheet-error">
          <p class="error-text">{{ error }}</p>
          <button class="sheet-retry-btn" type="button" @click="generateShare">重试</button>
        </div>

        <!-- Result -->
        <template v-else-if="shareResult">
          <!-- Preview -->
          <div class="share-preview">
            <div class="preview-thumbs">
              <div
                v-for="item in goodsItems.slice(0, 4)"
                :key="item.id"
                class="preview-thumb"
              >
                <img
                  v-if="getGoodsCover(item)"
                  :src="getGoodsCover(item)"
                  class="preview-img"
                  loading="lazy"
                />
                <span v-else class="preview-fallback">{{ (item.name || '?').charAt(0) }}</span>
              </div>
              <div v-if="goodsItems.length > 4" class="preview-more">
                +{{ goodsItems.length - 4 }}
              </div>
            </div>
            <p class="preview-name">{{ goodsItems[0]?.name }}{{ goodsItems.length > 1 ? ` 等 ${goodsItems.length} 件` : '' }}</p>
          </div>

          <div v-if="shareMode === 'link'" class="share-card">
            <!-- URL (https landing page, clickable in chat apps) -->
            <div class="share-field" v-if="shareResult.url">
              <label class="share-field-label">分享链接（可在聊天中点击打开）</label>
              <div class="share-field-row">
                <code class="share-field-value">{{ shareResult.url }}</code>
                <button class="share-copy-btn" type="button" @click="copyLink">
                  {{ linkCopied ? '已复制' : '复制' }}
                </button>
              </div>
            </div>

            <!-- Code (always present) -->
            <div class="share-field">
              <label class="share-field-label">分享码</label>
              <div class="share-field-row">
                <code class="share-field-value share-code">{{ shareResult.code }}</code>
                <button class="share-copy-btn" type="button" @click="copyCode">
                  {{ codeCopied ? '已复制' : '复制' }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="poster-card">
            <div class="poster-head">
              <p class="poster-title">二维码分享图</p>
              <button class="poster-generate-btn" type="button" :disabled="posterGenerating" @click="regeneratePoster">
                {{ posterGenerating ? '生成中...' : (posterDataUrl ? '重新生成' : '生成图片') }}
              </button>
            </div>

            <div v-if="posterGenerating" class="poster-loading">正在绘制二维码海报...</div>
            <p v-else-if="posterError" class="poster-error">{{ posterError }}</p>

            <img
              v-else-if="posterDataUrl"
              :src="posterDataUrl"
              class="poster-preview"
              alt="分享二维码海报"
              loading="lazy"
            />

            <div class="poster-actions">
              <button class="poster-action-btn" type="button" :disabled="posterGenerating || !shareResult" @click="savePosterImage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {{ posterSaved ? '已保存' : '保存图片' }}
              </button>
              <button class="poster-action-btn" type="button" :disabled="posterGenerating || !shareResult" @click="sharePosterImage">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                {{ posterShared ? '已分享' : '分享图片' }}
              </button>
            </div>
          </div>

          <button v-if="shareMode === 'link'" class="sheet-share-btn" type="button" @click="systemShare">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            分享到其他应用
          </button>
        </template>

        <button class="sheet-cancel" type="button" @click="handleClose">关闭</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getPrimaryGoodsImageUrl } from '@/utils/goodsImages'
import { buildSharePayload, buildShareGistFiles, findMatchingShareInGist, generateShareId, toggleShareDisabled } from '@/utils/shareGoods'
import { buildShareDescription, findOrCreateShareGist, getShareGist, updateGist } from '@/utils/githubGist'
import { buildShareUrl } from '@/config/share'
import { useSyncStore } from '@/stores/sync'
import { buildSharePosterDataUrl } from '@/utils/sharePoster'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  goodsItems: {
    type: Array,
    default: () => []
  },
  // optional initial share object: { url, code, gistId, shareId }
  initialShare: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const syncStore = useSyncStore()

const loading = ref(false)
const error = ref('')
const shareResult = ref(null)
const shareMode = ref('link')
const linkCopied = ref(false)
const codeCopied = ref(false)
const posterGenerating = ref(false)
const posterDataUrl = ref('')
const posterError = ref('')
const posterSaved = ref(false)
const posterShared = ref(false)

function getGoodsCover(item) {
  return getPrimaryGoodsImageUrl(item?.images, item?.coverImage || item?.image || '')
}

function handleClose() {
  emit('close')
}

function currentShareTarget() {
  if (!shareResult.value) return ''
  const { url, gistId, shareId, code } = shareResult.value
  return url || (gistId ? `goodsapp://share/${gistId}?s=${shareId || ''}` : code)
}

function buildPosterFilename() {
  const id = shareResult.value?.shareId || 'share'
  return `goods_share_${id}_${Date.now()}.png`
}

function dataUrlToBase64(dataUrl) {
  const value = String(dataUrl || '')
  const marker = value.indexOf(',')
  return marker >= 0 ? value.slice(marker + 1) : ''
}

async function ensurePoster() {
  if (!shareResult.value) return ''
  if (posterDataUrl.value) return posterDataUrl.value

  posterGenerating.value = true
  posterError.value = ''

  try {
    const nextDataUrl = await buildSharePosterDataUrl({
      goodsItems: props.goodsItems,
      shareUrl: shareResult.value.url,
      shareCode: shareResult.value.code
    })
    posterDataUrl.value = nextDataUrl
    return nextDataUrl
  } catch (e) {
    posterError.value = e?.message || '生成分享图片失败'
    return ''
  } finally {
    posterGenerating.value = false
  }
}

async function regeneratePoster() {
  posterDataUrl.value = ''
  await ensurePoster()
}

async function downloadPoster(dataUrl) {
  if (!dataUrl) return
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = buildPosterFilename()
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

async function savePosterImage() {
  if (!shareResult.value) return

  const dataUrl = await ensurePoster()
  if (!dataUrl) return

  try {
    if (Capacitor.isNativePlatform()) {
      const base64 = dataUrlToBase64(dataUrl)
      const filename = buildPosterFilename()
      const folder = 'Pictures/GoodsApp'

      // ExternalStorage → shared public storage root, visible to gallery
      try {
        await Filesystem.writeFile({
          path: `${folder}/${filename}`,
          data: base64,
          directory: Directory.ExternalStorage,
          recursive: true
        })
      } catch {
        // Fallback: Documents app-private but accessible via file manager
        await Filesystem.writeFile({
          path: `GoodsApp/${filename}`,
          data: base64,
          directory: Directory.Documents,
          recursive: true
        })
      }
    } else {
      await downloadPoster(dataUrl)
    }

    posterSaved.value = true
    window.setTimeout(() => {
      posterSaved.value = false
    }, 2000)
  } catch {
    if (!Capacitor.isNativePlatform()) {
      await downloadPoster(dataUrl)
    }
    posterSaved.value = true
    window.setTimeout(() => {
      posterSaved.value = false
    }, 2000)
  }
}

async function sharePosterImage() {
  if (!shareResult.value) return

  const dataUrl = await ensurePoster()
  if (!dataUrl) return

  const target = currentShareTarget()
  const text = target
    ? `来收谷子！扫码图片二维码即可导入\n${target}`
    : `来收谷子！分享码：${shareResult.value.code}`

  try {
    if (Capacitor.isNativePlatform()) {
      const path = `share-poster/${buildPosterFilename()}`
      await Filesystem.writeFile({
        path,
        data: dataUrlToBase64(dataUrl),
        directory: Directory.Cache,
        recursive: true
      })
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
      await Share.share({
        title: '分享谷子二维码',
        text,
        dialogTitle: '分享谷子二维码',
        files: [uri]
      })
    } else {
      await downloadPoster(dataUrl)
    }

    posterShared.value = true
    window.setTimeout(() => {
      posterShared.value = false
    }, 2000)
  } catch {
    if (!Capacitor.isNativePlatform()) {
      await downloadPoster(dataUrl)
    }
  }
}

async function generateShare() {
  if (!props.goodsItems.length) return

  loading.value = true
  error.value = ''
  shareResult.value = null

  try {
    const payload = await buildSharePayload(props.goodsItems)
    const token = syncStore.token || ''
    const existingGist = token ? await getShareGist(token, buildShareDescription()) : null
    const existingShare = findMatchingShareInGist(existingGist, payload)

    if (existingGist?.id && existingShare?.shareId) {
      if (existingShare.disabled) {
        const newContent = toggleShareDisabled(existingGist, existingShare.filename, false)
        if (newContent) {
          await updateGist(token, existingGist.id, {
            [existingShare.filename]: { content: newContent }
          })
        }
      }

      shareResult.value = {
        gistId: existingGist.id,
        shareId: existingShare.shareId,
        code: `${existingGist.id}-${existingShare.shareId}`,
        url: buildShareUrl(existingGist.id, existingShare.shareId)
      }
      return
    }

    const shareId = generateShareId()
    const files = buildShareGistFiles(payload, shareId)
    const gist = await findOrCreateShareGist(token, buildShareDescription(), files)

    shareResult.value = {
      gistId: gist.id,
      shareId,
      code: `${gist.id}-${shareId}`,
      url: buildShareUrl(gist.id, shareId)
    }
  } catch (e) {
    error.value = e.message || '生成分享链接失败'
  } finally {
    loading.value = false
  }
}

async function copyLink() {
  if (!shareResult.value) return
  try {
    await navigator.clipboard.writeText(shareResult.value.url || shareResult.value.code)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {
    // clipboard write may fail in some contexts
  }
}

async function copyCode() {
  if (!shareResult.value) return
  try {
    await navigator.clipboard.writeText(shareResult.value.code)
    codeCopied.value = true
    setTimeout(() => { codeCopied.value = false }, 2000)
  } catch {
    // clipboard write may fail in some contexts
  }
}

async function systemShare() {
  if (!shareResult.value) return
  const { code } = shareResult.value
  const target = currentShareTarget()
  const text = target
    ? `来收谷子！点击链接一键导入：${target}\n分享码：${code}`
    : `来收谷子！复制分享码到App导入：${code}`
  try {
    await Share.share({
      title: '分享谷子',
      text,
      dialogTitle: '分享谷子'
    })
  } catch {
    // Share.share failed or user cancelled; fall back to clipboard
    try {
      await navigator.clipboard.writeText(target || code)
    } catch {
      // clipboard write may also fail
    }
  }
}

watch(() => props.show, (val) => {
  if (val) {
    linkCopied.value = false
    codeCopied.value = false
    shareMode.value = 'link'
    posterDataUrl.value = ''
    posterError.value = ''
    posterSaved.value = false
    posterShared.value = false
    // if initialShare was provided by caller (e.g. ShareManage), use it
    if (props.initialShare) {
      shareResult.value = props.initialShare
      void ensurePoster()
    } else {
      generateShare()
    }
  } else {
    // clear only transient state; keep shareResult if it is from initialShare
    if (!props.initialShare) shareResult.value = null
    error.value = ''
    posterDataUrl.value = ''
    posterError.value = ''
    posterSaved.value = false
    posterShared.value = false
  }
})

watch(() => shareResult.value?.code, (value) => {
  if (!value || !props.show) return
  if (posterDataUrl.value || posterGenerating.value) return
  void ensurePoster()
})
</script>

<style scoped>
/* Backdrop */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

/* Panel */
.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  max-height: 90dvh;
  overflow-y: auto;
  z-index: 90;
  display: flex;
  flex-direction: column;
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
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
}

.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 14px;
}

.share-mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 6px;
  margin: 0 0 12px;
  background: color-mix(in srgb, var(--app-glass) 74%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 74%, transparent);
  border-radius: 16px;
}

.share-mode-tab {
  height: 40px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-tertiary, #8e8e93);
  font-size: 14px;
  font-weight: 600;
}

.share-mode-tab.active {
  background: var(--app-text);
  color: var(--app-surface);
}

/* Loading */
.sheet-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
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
  color: var(--app-text-tertiary, #8e8e93);
  margin: 0;
}

/* Error */
.sheet-error {
  text-align: center;
  padding: 24px 0;
}

.error-text {
  font-size: 14px;
  color: var(--app-danger, #e53e3e);
  margin: 0 0 12px;
}

.sheet-retry-btn {
  height: 40px;
  padding: 0 24px;
  border: none;
  border-radius: 12px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
}

/* Preview */
.share-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 14px;
  margin-bottom: 12px;
}

.preview-thumbs {
  display: flex;
  gap: -6px;
}

.preview-thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--app-surface) 90%, transparent);
  background: rgba(142, 142, 147, 0.15);
  flex-shrink: 0;
}

.preview-thumb + .preview-thumb {
  margin-left: -12px;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.preview-more {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  border: 2px solid color-mix(in srgb, var(--app-surface) 90%, transparent);
  background: rgba(142, 142, 147, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
  margin-left: -12px;
  flex-shrink: 0;
}

.preview-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Share card */
.share-card {
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 10px;
}

.share-field {
  padding: 14px 16px;
}

.share-field + .share-field {
  border-top: 1px solid rgba(142, 142, 147, 0.15);
}

.share-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-tertiary, #8e8e93);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  display: block;
}

.share-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share-field-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
  color: var(--app-text-secondary, #636366);
  background: color-mix(in srgb, var(--app-surface-soft) 86%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 12px;
  padding: 10px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: all;
}

.share-field-value.share-code {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--app-text, #141416);
}

.share-copy-btn {
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.share-copy-btn:active {
  opacity: 0.88;
  transform: scale(0.97);
}

.poster-card {
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: 18px;
  padding: 12px;
  margin-bottom: 10px;
}

.poster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.poster-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.poster-generate-btn {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-surface);
  background: var(--app-text);
}

.poster-generate-btn:disabled {
  opacity: 0.45;
}

.poster-loading,
.poster-error {
  font-size: 13px;
  margin: 0 0 10px;
}

.poster-loading {
  color: var(--app-text-tertiary, #8e8e93);
}

.poster-error {
  color: var(--app-danger, #e53e3e);
}

.poster-preview {
  width: 100%;
  max-height: 50dvh;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  display: block;
  margin-bottom: 10px;
}

/* System share button */
.sheet-share-btn {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.sheet-share-btn--sub {
  height: 46px;
  font-size: 14px;
  border-radius: 14px;
  margin-bottom: 0;
  background: color-mix(in srgb, var(--app-text) 92%, #ffffff);
}

.poster-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.poster-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.02em;
  transition: background 0.16s ease;
}

.poster-action-btn:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.poster-action-btn:disabled {
  opacity: 0.45;
}

.poster-action-btn svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
}

.sheet-share-btn:active {
  opacity: 0.88;
  transform: scale(0.985);
}

.sheet-share-btn svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

/* Cancel */
.sheet-cancel {
  height: 54px;
  width: 100%;
  margin-top: 12px;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--app-border) 72%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface));
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  transition: background 0.14s ease;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

/* Transitions */
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

/* Tablet */
@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
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

:global(html.theme-dark) .share-preview,
:global(html.theme-dark) .share-card,
:global(html.theme-dark) .poster-card,
:global(html.theme-dark) .sheet-cancel {
  background: color-mix(in srgb, var(--app-glass) 58%, var(--app-surface));
}

:global(html.theme-dark) .share-field-value {
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .share-copy-btn,
:global(html.theme-dark) .sheet-retry-btn,
:global(html.theme-dark) .sheet-share-btn {
  background: #f5f5f7;
  color: #141416;
}
</style>
