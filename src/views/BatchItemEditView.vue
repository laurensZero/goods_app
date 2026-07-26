<template>
  <div class="batch-edit-page">
    <NavBar show-back @back="handleBack">
      <template #title>
        <span class="batch-edit-nav-title">{{ t('goods.batch.editIndex', { index: currentIndex + 1, total: totalCount }) }}</span>
      </template>
    </NavBar>

    <main v-if="currentItem" class="page-body">
      <div class="batch-edit-shell">
        <!-- 图片区 -->
        <div class="batch-edit-image-area">
          <div class="batch-edit-image-card">
            <LazyCachedImage
              v-if="currentItem.imageUri"
              :src="currentItem.imageUri"
              :lazy="false"
              class="batch-edit-image__img"
            />
            <span v-else class="batch-edit-image__placeholder">?</span>
          </div>
          <div class="batch-edit-image-btns">
            <button class="batch-edit-img-btn" type="button" @click="swapImage">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {{ t('common.replace') }}
            </button>
            <button class="batch-edit-img-btn" type="button" :disabled="!currentItem.imageUri" @click="openEditor">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {{ t('imageEditor.title') }}
            </button>
          </div>
        </div>

        <!-- 表单字段 -->
        <div class="batch-edit-fields">
          <label class="field">
            <span class="field-label">{{ t('common.name') }} <span class="required">*</span></span>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('goods.editor.namePlaceholder')"
              @blur="onFieldBlur('name')"
            />
          </label>

          <div class="field-row">
            <label class="field field-row__item">
              <span class="field-label">{{ t('common.price') }}</span>
              <input
                v-model="form.price"
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                @blur="onFieldBlur('price')"
              />
            </label>
            <label class="field field-row__item">
              <span class="field-label">{{ t('common.date') }}</span>
              <button class="date-field" type="button" @click="showDatePicker = true">
                <span>{{ form.date || t('common.selectDate') }}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
            </label>
          </div>

          <label class="field">
            <span class="field-label">IP</span>
            <AppSelect
              v-model="form.ip"
              :options="presetsStore.ips"
              :placeholder="t('goods.editor.ipPlaceholder')"
              @update:model-value="onFieldBlur('ip')"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ t('common.category') }}</span>
            <AppSelect
              v-model="form.category"
              :options="presetsStore.categories"
              :placeholder="t('goods.editor.categoryPlaceholder')"
              @update:model-value="onFieldBlur('category')"
            />
          </label>

          <label class="field">
            <span class="field-label">{{ t('common.character') }}</span>
            <input
              v-model="form.charactersText"
              type="text"
              :placeholder="t('common.tagPlaceholder')"
              @blur="onFieldBlur('charactersText')"
            />
          </label>
        </div>
      </div>
    </main>

    <div v-else class="batch-edit-empty">
      <p>{{ t('goods.batch.itemNotFound') }}</p>
    </div>

    <!-- 底部按钮组 - 使用项目标准 float-footer -->
    <div class="float-footer">
      <div class="float-footer__btns">
        <button class="btn-float btn-float--ghost" type="button" @click="saveAndBack">
          {{ t('goods.batch.saveAndBack') }}
        </button>
        <button class="btn-float btn-float--primary" type="button" @click="saveAndNext">
          {{ t('goods.batch.saveAndNext') }}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 日期选择器 -->
    <AppDatePicker
      v-model:show="showDatePicker"
      v-model="dateValue"
      :title="t('common.selectDate')"
      :min-date="minDate"
      :max-date="maxDate"
      :is-tablet="isTabletViewport"
      @confirm="onDateConfirm"
    />

    <!-- 图片编辑器 -->
    <QuickImageEditorDialog
      v-model:show="showEditor"
      :source-file="editorSourceFile"
      @save="onEditorSave"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppDatePicker from '@/components/common/AppDatePicker.vue'
import QuickImageEditorDialog from '@/components/image/QuickImageEditorDialog.vue'
import { usePresetsStore } from '@/stores/presets'
import { useBatchQueue } from '@/composables/batch/useBatchQueue'
import { pickLinkedLocalImages, readLocalImageAsDataUrl } from '@/utils/image/localImage'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { runWithRouteTransition } from '@/utils/routeTransition'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const presetsStore = usePresetsStore()
const { isTabletViewport } = useTabletViewport()

const {
  queue,
  totalCount,
  updateItem,
  markDirty,
  getItem,
  replaceItemImage,
  discardQueue
} = useBatchQueue()

const itemId = computed(() => route.params.id)
const currentItem = computed(() => getItem(itemId.value))
const currentIndex = computed(() => queue.value.findIndex((i) => i.id === itemId.value))

const form = reactive({
  name: '',
  price: '',
  date: '',
  ip: '',
  category: '',
  charactersText: ''
})

const showDatePicker = ref(false)
const dateValue = ref([])
const minDate = new Date(2000, 0, 1)
const maxDate = new Date(2100, 11, 31)

const showEditor = ref(false)
const editorSourceFile = ref(null)

onMounted(() => {
  if (currentItem.value) {
    syncFormFromItem(currentItem.value)
  }
})

// 从编辑页直接离开批量流程（如深链跳转）时同样清理队列；返回队列页或切换下一项不受影响
onBeforeRouteLeave((to) => {
  if (to.name !== 'batch-add' && to.name !== 'batch-edit') discardQueue()
})

function syncFormFromItem(item) {
  form.name = item.name || ''
  form.price = item.price || ''
  form.date = item.date || new Date().toISOString().split('T')[0]
  form.ip = item.ip || ''
  form.category = item.category || ''
  form.charactersText = item.charactersText || ''
  // 同步日期选择器的数组值
  const parts = form.date.split('-')
  dateValue.value = [parts[0] || '', parts[1] || '', parts[2] || '']
}

function onFieldBlur(field) {
  if (currentItem.value) {
    updateItem(itemId.value, { [field]: form[field] })
    markDirty(itemId.value, field)
  }
}

function onDateConfirm({ selectedValues }) {
  if (selectedValues?.length) {
    form.date = selectedValues.join('-')
    dateValue.value = [...selectedValues]
    showDatePicker.value = false
    onFieldBlur('date')
  }
}

function saveForm() {
  if (currentItem.value) {
    updateItem(itemId.value, {
      name: form.name,
      price: form.price,
      date: form.date,
      ip: form.ip,
      category: form.category,
      charactersText: form.charactersText
    })
    if (form.name) markDirty(itemId.value, 'name')
    if (form.price) markDirty(itemId.value, 'price')
    if (form.date) markDirty(itemId.value, 'date')
    if (form.ip) markDirty(itemId.value, 'ip')
    if (form.category) markDirty(itemId.value, 'category')
    if (form.charactersText) markDirty(itemId.value, 'charactersText')
  }
}

function handleBack() {
  saveForm()
  runWithRouteTransition(
    () => router.back(),
    { direction: 'back' }
  )
}

function saveAndBack() {
  saveForm()
  runWithRouteTransition(
    () => router.back(),
    { direction: 'back' }
  )
}

function saveAndNext() {
  saveForm()
  const nextIdx = currentIndex.value + 1
  if (nextIdx < totalCount.value) {
    const nextItem = queue.value[nextIdx]
    // 切换下一个时用 replace 但保持转场
    router.replace({ name: 'batch-edit', params: { id: nextItem.id } })
  } else {
    // 最后一个返回队列
    runWithRouteTransition(
      () => router.back(),
      { direction: 'back' }
    )
  }
}

async function swapImage() {
  const picked = await pickLinkedLocalImages(1)
  if (!picked.length) return
  // 替换时同步删除被替换的本地文件，避免孤儿文件
  replaceItemImage(itemId.value, picked[0].uri || picked[0].localPath)
  markDirty(itemId.value, 'imageUri')
}

async function openEditor() {
  if (!currentItem.value?.imageUri) return
  try {
    const dataUrl = await readLocalImageAsDataUrl(currentItem.value.imageUri)
    if (!dataUrl) return
    // 转换为 File 对象
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return
    const mime = match[1]
    const base64 = match[2]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg')
    editorSourceFile.value = new File([bytes], `image_${Date.now()}.${ext}`, { type: mime })
    showEditor.value = true
  } catch (e) {
    console.error('[BatchItemEdit] openEditor failed', e)
  }
}

function onEditorSave(result) {
  if (result?.file) {
    // 保存编辑后的图片到本地
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const { saveLocalImage } = await import('@/utils/image/localImage')
        const saved = await saveLocalImage(result.file)
        if (saved?.uri) {
          // 编辑保存会生成新文件，需删除被替换的旧文件
          replaceItemImage(itemId.value, saved.uri)
          markDirty(itemId.value, 'imageUri')
        }
      } catch (e) {
        console.error('[BatchItemEdit] save edited image failed', e)
      }
    }
    reader.readAsDataURL(result.file)
  }
  showEditor.value = false
}
</script>

<style scoped>
.batch-edit-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--app-bg);
}

.batch-edit-nav-title {
  font-size: 15px;
  font-weight: 600;
}

.page-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  padding-bottom: 100px;
}

.page-body::-webkit-scrollbar {
  display: none;
}

.batch-edit-shell {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: 6px var(--page-padding) 32px;
  max-width: 600px;
  margin: 0 auto;
}

/* 图片区域容器 */
.batch-edit-image-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* 图片区 */
.batch-edit-image-card {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  max-width: 240px;
  margin: 0 auto;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.batch-edit-image__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.batch-edit-image__placeholder {
  font-size: 48px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.batch-edit-image__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s ease;
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.batch-edit-image-card:hover .batch-edit-image__overlay {
  opacity: 1;
}

/* 图片操作按钮组 */
.batch-edit-image-btns {
  display: flex;
  gap: 10px;
}

.batch-edit-img-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
}

.batch-edit-img-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.batch-edit-img-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 表单字段 */
.batch-edit-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.required {
  color: #ff3b30;
}

.field-row {
  display: flex;
  gap: 12px;
}

.field-row__item {
  flex: 1;
}

.field input {
  width: 100%;
  min-height: var(--input-height);
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input:focus {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
}

.field :deep(.app-select) {
  width: 100%;
}

.field input::placeholder {
  color: var(--app-placeholder);
}

.date-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--input-height);
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.date-field:empty,
.date-field span:empty {
  color: var(--app-placeholder);
}

.date-field:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

/* 底部按钮组 - 使用项目标准 float-footer */
.float-footer {
  position: fixed;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(calc(100vw - 32px), 420px);
  z-index: 40;
  pointer-events: none;
}

.float-footer__btns {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}

.btn-float {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 52px;
  border: none;
  border-radius: var(--radius-card);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  box-shadow: var(--app-shadow);
}

.btn-float:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-float--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.btn-float--ghost {
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.batch-edit-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
}

/* 平板端 */
@media (min-width: 900px) {
  .batch-edit-shell {
    display: flex;
    flex-direction: row;
    gap: 32px;
    max-width: 1000px;
    margin: 0 auto;
    padding-top: 24px;
    align-items: flex-start;
  }

  .batch-edit-image-area {
    flex: 0 0 clamp(280px, 38%, 440px);
    position: sticky;
    top: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .batch-edit-image-card {
    width: 100%;
    max-width: none;
    aspect-ratio: auto;
    min-height: 320px;
  }

  .batch-edit-fields {
    flex: 1;
    min-width: 0;
    padding: 24px;
    gap: 18px;
  }

  .field input,
  .field :deep(.app-select),
  .date-field {
    min-height: 52px;
    font-size: 17px;
  }

  .float-footer {
    width: min(calc(100vw - 48px), 520px);
  }

  .btn-float {
    height: 56px;
    font-size: 17px;
  }
}
</style>
