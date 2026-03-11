<!--
  MihoyoImagePicker.vue
  图片 URL 输入 + 米游铺链接自动检测 + 款式图片选择器
  用法：<MihoyoImagePicker v-model="form.image" :hint="form.characters[0] || form.variant || ''" />
-->
<template>
  <div class="mhpicker-input-row">
    <input
      ref="inputRef"
      :value="modelValue"
      type="text"
      inputmode="url"
      autocapitalize="off"
      autocomplete="off"
      spellcheck="false"
      placeholder="https://..."
      @input="onNativeInput"
      @blur="onNativeInput"
      @change="onNativeInput"
      @compositionend="onNativeInput"
      @paste="onNativePaste"
    />
    <!-- 从相册/文件选择图片 -->
    <button class="mhpicker-upload-btn" type="button" :disabled="uploading" @click="triggerUpload">
      <svg v-if="!uploading" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <svg v-else class="mhpicker-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    </button>
    <input ref="fileInputRef" type="file" accept="image/*" class="mhpicker-hidden-input" @change="onFileChange" />
  </div>

  <div v-if="fetchState === 'loading'" class="mhpicker-hint">
    正在解析米游铺商品…
  </div>
  <div v-else-if="fetchState === 'error'" class="mhpicker-hint mhpicker-hint--error">
    解析失败，请检查链接
  </div>

  <div v-if="variants.length > 0" class="mhpicker-scroll">
    <button
      v-for="v in variants"
      :key="v.key"
      :class="['mhpicker-item', selectedKey === v.key && 'mhpicker-item--active']"
      type="button"
      @click="pickVariant(v)"
    >
      <div class="mhpicker-thumb">
        <img :src="v.cover_url" class="mhpicker-img" loading="lazy" />
        <svg v-if="selectedKey === v.key" class="mhpicker-check" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="12" fill="#4a7aec"/>
          <polyline points="6 12 10 16 18 8" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="mhpicker-label">{{ v.text }}</span>
    </button>
  </div>
  <p v-if="variants.length > 0" class="mhpicker-save-hint">点击选择款式，保存时自动写入图片链接</p>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { isMihoyoGiftUrl, parseMihoyoUrl, fetchGoodsDetail } from '@/utils/mihoyo'
import { saveLocalImage } from '@/utils/localImage'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 角色/款式提示词，用于自动匹配默认款式 */
  hint: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const inputRef = ref(null)
const fileInputRef = ref(null)
const fetchState = ref('') // '' | 'loading' | 'done' | 'error'
const variants = ref([])
const selectedKey = ref('')
const pickedCover = ref('') // 当前选中款式的 cover_url（不立即写回 v-model）
const uploading = ref(false)

let lastParsedUrl = ''
let fetchTimer = null

/** 供父组件保存时读取解析后的图片 URL（= 已选款式封面，否则为 modelValue 原值） */
const resolvedUrl = computed(() => pickedCover.value || props.modelValue || '')

/** 供父组件通过 ref 读取 input DOM，用于 Android 输入兜底同步 */
defineExpose({ inputRef, resolvedUrl })

function onNativeInput(e) {
  const url = e?.target?.value ?? ''
  emit('update:modelValue', url)
  // 不在此处清空 pickedCover，由 tryFetch 在 URL 不是米游铺链接时清空
  scheduleFetch(url)
}

function onNativePaste(e) {
  const text = e?.clipboardData?.getData('text') ?? ''
  if (!text) return
  requestAnimationFrame(() => {
    const url = inputRef.value?.value ?? text
    emit('update:modelValue', url)
    scheduleFetch(url)
  })
}

function scheduleFetch(url) {
  clearTimeout(fetchTimer)
  fetchTimer = setTimeout(() => tryFetch(url), 350)
}

// ── 本地图片上传 ─────────────────────────────────────────────
function triggerUpload() {
  fileInputRef.value?.click()
}

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = '' // 允许再次选同一文件
  uploading.value = true
  try {
    const localUri = await saveLocalImage(file)
    // 清除米游铺款式选择状态（本地图片不需要）
    variants.value = []
    fetchState.value = ''
    selectedKey.value = ''
    pickedCover.value = ''
    lastParsedUrl = ''
    emit('update:modelValue', localUri)
  } catch (err) {
    console.error('[localImage] 图片保存失败', err)
  } finally {
    uploading.value = false
  }
}

async function tryFetch(url) {
  if (!isMihoyoGiftUrl(url)) {
    if (variants.value.length || fetchState.value) {
      variants.value = []
      fetchState.value = ''
      selectedKey.value = ''
      pickedCover.value = ''
      lastParsedUrl = ''
    }
    return
  }
  if (url === lastParsedUrl) return
  lastParsedUrl = url
  fetchState.value = 'loading'
  variants.value = []
  selectedKey.value = ''
  pickedCover.value = ''
  try {
    const result = await parseMihoyoUrl(url)
    if (!result?.variants?.length) {
      fetchState.value = 'done'
      return
    }
    // 并行获取 SKU 封面图（sale_attrs.content 里的 cover_url/img_url 通常为空）
    const { skuCovers, coverUrl: mainCover } = await fetchGoodsDetail(result.goodsId).catch(() => ({ skuCovers: {}, coverUrl: '' }))
    // 合并封面：skuCovers[key] > cover_url > img_url > 商品主图
    const fallback = mainCover || result.image || ''
    variants.value = result.variants.map(v => ({
      ...v,
      cover_url: skuCovers[v.key] || v.cover_url || v.img_url || fallback,
    }))
    // 自动匹配与 hint 相关的款式（只设高亮，不 emit）
    const hint = props.hint?.trim().toLowerCase()
    let matched = null
    if (hint) {
      matched = variants.value.find(v => {
        const t = (v.text ?? '').toLowerCase()
        return t.includes(hint) || hint.includes(t)
      })
    }
    const picked = matched ?? variants.value[0]
    selectedKey.value = picked.key
    pickedCover.value = picked.cover_url || ''
    // 不立即 emit，等用户保存时由父组件读 resolvedUrl
    fetchState.value = 'done'
  } catch {
    fetchState.value = 'error'
    lastParsedUrl = ''
  }
}

function pickVariant(v) {
  selectedKey.value = v.key
  pickedCover.value = v.cover_url || ''
  // 用户主动点击款式 → 立即 emit，让父组件大图预览实时更新
  emit('update:modelValue', v.cover_url || props.modelValue)
}

// 当 modelValue 从外部变化时（比如打开编辑不同商品），重新尝试解析
watch(
  () => props.modelValue,
  (url) => {
    if (url !== lastParsedUrl) scheduleFetch(url)
  },
  { immediate: true }
)
</script>

<style scoped>
/* input 外观匹配父页面 .field input 样式 */
input {
  width: 100%;
  min-height: var(--input-height, 48px);
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface, #ffffff);
  color: var(--app-text, #1a1a1a);
  font-size: 16px;
  padding: 0 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.16s ease, background 0.16s ease;
  font-family: inherit;
}
input::placeholder {
  color: var(--app-placeholder, #b0b0b0);
}

/* ── 输入行布局 ── */
.mhpicker-input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.mhpicker-input-row input {
  flex: 1;
  min-width: 0;
  width: auto; /* override width:100% */
}

/* ── 上传按钮 ── */
.mhpicker-upload-btn {
  flex-shrink: 0;
  width: 44px;
  height: var(--input-height, 48px);
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface, #ffffff);
  color: var(--app-text-secondary, #666);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  padding: 0;
}
.mhpicker-upload-btn:active {
  background: var(--color-primary-light, #e9f0ff);
  color: var(--color-primary, #4a7aec);
}
.mhpicker-upload-btn svg {
  width: 22px;
  height: 22px;
}
.mhpicker-upload-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mhpicker-spin {
  animation: mhpicker-spin 0.8s linear infinite;
}
@keyframes mhpicker-spin {
  to { transform: rotate(360deg); }
}
.mhpicker-hidden-input {
  display: none;
}

.mhpicker-hint {
  font-size: 12px;
  color: var(--app-text-tertiary, #aaa);
  padding: 2px 0;
  line-height: 1.4;
}
.mhpicker-hint--error {
  color: #e04040;
}

.mhpicker-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px 6px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.mhpicker-scroll::-webkit-scrollbar {
  display: none;
}

.mhpicker-item {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 5px;
  border-radius: 10px;
  border: 2px solid transparent;
  background: var(--app-surface-soft, #f4f4f6);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.mhpicker-item--active {
  border-color: var(--color-primary, #4a7aec);
  background: var(--color-primary-light, #e9f0ff);
}

.mhpicker-thumb {
  position: relative;
  width: 60px;
  height: 60px;
}

.mhpicker-img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 7px;
  display: block;
}

.mhpicker-check {
  position: absolute;
  bottom: -5px;
  right: -5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
}

.mhpicker-label {
  font-size: 10px;
  color: var(--app-text-secondary, #666);
  max-width: 68px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.mhpicker-save-hint {
  font-size: 11px;
  color: var(--app-text-tertiary, #aaa);
  margin: 0;
  padding: 0 2px;
}

@media (prefers-color-scheme: dark) {
  input {
    border-color: rgba(255, 255, 255, 0.07);
    background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.02);
  }

  .mhpicker-upload-btn {
    border-color: rgba(255, 255, 255, 0.07);
    background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
    color: var(--app-text-secondary);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.02);
  }

  .mhpicker-upload-btn:active {
    background: rgba(255, 255, 255, 0.08);
    color: var(--app-text);
  }

  .mhpicker-item {
    background: rgba(255, 255, 255, 0.05);
  }

  .mhpicker-item--active {
    background: rgba(74, 122, 236, 0.18);
  }
}
</style>
