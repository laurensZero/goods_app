<template>
  <div class="image-manager">
    <div class="image-manager__composer">
      <div class="image-manager__topline">
        <p class="image-manager__subtext">主图、局部图和开箱图统一管理，本地图仅当前设备可见。</p>
        <span v-if="images.length" class="image-manager__count">{{ images.length }} 张</span>
      </div>

      <div class="image-manager__kind-row">
        <button
          v-for="option in kindOptions"
          :key="option.value"
          type="button"
          :class="['image-manager__kind-chip', { 'image-manager__kind-chip--active': draftKind === option.value }]"
          @click="draftKind = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <MihoyoImagePicker
        ref="remotePickerRef"
        v-model="draftRemoteUrl"
        :hint="hint"
        :allow-local-upload="false"
      />

      <div class="image-manager__actions">
        <button type="button" class="image-manager__action-btn image-manager__action-btn--primary" @click="addRemoteImage">
          添加网络图
        </button>
        <button
          type="button"
          class="image-manager__action-btn"
          :disabled="isPickingLocal"
          @click="addLocalImage"
        >
          {{ isPickingLocal ? '读取中...' : '添加本地图' }}
        </button>
      </div>
    </div>

    <div v-if="images.length > 0" class="image-manager__gallery">
      <p class="image-manager__section-hint">点击缩略图切换当前编辑对象</p>

      <div class="image-manager__thumb-strip">
        <button
          v-for="image in images"
          :key="image.id"
          type="button"
          :class="['image-manager__thumb', { 'image-manager__thumb--active': image.id === activeImageId }]"
          @click="activeImageId = image.id"
        >
          <img :src="image.uri" :alt="image.label || getKindLabel(image.kind)" class="image-manager__thumb-img" />
          <span v-if="image.isPrimary" class="image-manager__thumb-badge">主图</span>
          <span class="image-manager__thumb-source">{{ getSourceLabel(image.storageMode) }}</span>
        </button>
      </div>

      <article v-if="activeImage" class="image-manager__editor">
        <div class="image-manager__editor-preview">
          <img :src="activeImage.uri" :alt="activeImage.label || getKindLabel(activeImage.kind)" class="image-manager__editor-img" />
        </div>

        <div class="image-manager__editor-body">
          <div class="image-manager__editor-meta">
            <span class="image-manager__meta-pill image-manager__meta-pill--dark">
              {{ activeImage.isPrimary ? '当前主图' : getKindLabel(activeImage.kind) }}
            </span>
            <span class="image-manager__meta-pill">{{ getSourceLabel(activeImage.storageMode) }}</span>
          </div>

          <div class="image-manager__editor-fields">
            <label class="image-manager__field">
              <span class="image-manager__field-label">图片分类</span>
              <AppSelect
                :model-value="activeImage.kind"
                :options="kindSelectOptions"
                placeholder="选择图片分类"
                @update:model-value="updateKind(activeImage.id, $event)"
              />
            </label>

            <label class="image-manager__field">
              <span class="image-manager__field-label">图片说明</span>
              <input
                :value="activeImage.label"
                type="text"
                maxlength="20"
                placeholder="可选，例如背面、侧面"
                @input="updateLabel(activeImage.id, $event)"
              />
            </label>
          </div>

          <div class="image-manager__editor-actions">
            <button
              type="button"
              class="image-manager__secondary-btn"
              :disabled="isPreparingEdit"
              @click="openQuickEdit(activeImage)"
            >
              {{ isPreparingEdit ? '准备编辑中...' : '快速编辑图片' }}
            </button>
            <button
              v-if="!activeImage.isPrimary"
              type="button"
              class="image-manager__secondary-btn"
              @click="setPrimary(activeImage.id)"
            >
              设为主图
            </button>
            <button type="button" class="image-manager__danger-btn" @click="removeImage(activeImage.id)">
              删除这张图
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="image-manager__empty">
      <p class="image-manager__empty-title">还没有图片</p>
      <p class="image-manager__empty-desc">先添加一张主图，之后再补局部图或开箱图。</p>
    </div>

    <QuickImageEditorDialog
      v-model:show="showQuickEditor"
      :source-file="editingSourceFile"
      @save="handleQuickEditSave"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppSelect from '@/components/AppSelect.vue'
import MihoyoImagePicker from '@/components/MihoyoImagePicker.vue'
import QuickImageEditorDialog from '@/components/QuickImageEditorDialog.vue'
import {
  GOODS_IMAGE_KIND_OPTIONS,
  createGoodsImageId,
  inferGoodsImageStorageMode,
  normalizeGoodsImageList
} from '@/utils/goodsImages'
import { pickLinkedLocalImage, readLocalImageAsDataUrl, saveLocalImage } from '@/utils/localImage'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  hint: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const remotePickerRef = ref(null)
const draftRemoteUrl = ref('')
const draftKind = ref('primary')
const isPickingLocal = ref(false)
const isPreparingEdit = ref(false)
const activeImageId = ref('')
const showQuickEditor = ref(false)
const editingSourceFile = ref(null)
const editingTargetId = ref('')

const kindOptions = GOODS_IMAGE_KIND_OPTIONS
const kindSelectOptions = GOODS_IMAGE_KIND_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value
}))
const images = computed(() => normalizeGoodsImageList(props.modelValue))
const activeImage = computed(() =>
  images.value.find((image) => image.id === activeImageId.value)
  || images.value.find((image) => image.isPrimary)
  || images.value[0]
  || null
)

watch(
  () => images.value,
  (nextImages) => {
    if (nextImages.length === 0) {
      activeImageId.value = ''
      return
    }

    if (nextImages.some((image) => image.id === activeImageId.value)) return
    activeImageId.value = nextImages.find((image) => image.isPrimary)?.id || nextImages[0].id
  },
  { immediate: true, deep: true }
)

function emitImages(nextImages) {
  emit('update:modelValue', normalizeGoodsImageList(nextImages))
}

function appendImage(nextImage) {
  const existing = images.value.find((image) => image.uri === nextImage.uri)
  if (existing) {
    activeImageId.value = existing.id
    emitImages(images.value.map((image) => (
      image.id === existing.id
        ? {
            ...image,
            kind: nextImage.kind,
            label: nextImage.label || image.label
          }
        : image
    )))
    return
  }

  activeImageId.value = nextImage.id
  emitImages([
    ...images.value,
    {
      ...nextImage,
      isPrimary: images.value.length === 0
    }
  ])
}

function addRemoteImage() {
  const resolvedUrl = String(remotePickerRef.value?.resolvedUrl || draftRemoteUrl.value || '').trim()
  if (!resolvedUrl) return

  appendImage({
    id: createGoodsImageId(),
    uri: resolvedUrl,
    kind: images.value.length === 0 ? 'primary' : draftKind.value,
    label: '',
    storageMode: inferGoodsImageStorageMode(resolvedUrl),
    localPath: '',
    isPrimary: images.value.length === 0
  })

  draftRemoteUrl.value = ''
}

async function addLocalImage() {
  isPickingLocal.value = true

  try {
    const pickedImage = await pickLinkedLocalImage()
    if (!pickedImage?.uri) return

    appendImage({
      id: createGoodsImageId(),
      uri: pickedImage.uri,
      kind: images.value.length === 0 ? 'primary' : draftKind.value,
      label: '',
      storageMode: pickedImage.storageMode,
      localPath: pickedImage.localPath || '',
      isPrimary: images.value.length === 0
    })
  } finally {
    isPickingLocal.value = false
  }
}

async function openQuickEdit(image) {
  if (!image?.id || !image?.uri || isPreparingEdit.value) return

  isPreparingEdit.value = true
  try {
    const dataUrl = await readLocalImageAsDataUrl(image.uri, image.localPath || '')
    if (!dataUrl?.startsWith('data:image/')) {
      throw new Error('当前图片暂不支持编辑')
    }

    const sourceFile = dataUrlToFile(dataUrl, image.id)
    editingTargetId.value = image.id
    editingSourceFile.value = sourceFile
    showQuickEditor.value = true
  } catch (error) {
    console.error('[image-manager] 打开图片编辑失败', error)
  } finally {
    isPreparingEdit.value = false
  }
}

async function handleQuickEditSave(result) {
  if (!result?.file || !editingTargetId.value) return

  try {
    const localUri = await saveLocalImage(result.file)
    emitImages(images.value.map((image) => {
      if (image.id !== editingTargetId.value) return image
      return {
        ...image,
        uri: localUri,
        storageMode: inferGoodsImageStorageMode(localUri),
        localPath: ''
      }
    }))
  } catch (error) {
    console.error('[image-manager] 保存编辑图片失败', error)
  } finally {
    editingSourceFile.value = null
    editingTargetId.value = ''
  }
}

function dataUrlToFile(dataUrl, fileSeed = 'image') {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) throw new Error('图片数据格式无效')

  const mime = match[1]
  const base64 = match[2]
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)

  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  const ext = mime.includes('png') ? 'png' : (mime.includes('webp') ? 'webp' : 'jpg')
  return new File([bytes], `${fileSeed || 'image'}_${Date.now()}.${ext}`, {
    type: mime,
    lastModified: Date.now()
  })
}

function setPrimary(targetId) {
  activeImageId.value = targetId
  emitImages(images.value.map((image) => ({
    ...image,
    isPrimary: image.id === targetId,
    kind: image.id === targetId ? 'primary' : (image.kind === 'primary' ? 'custom' : image.kind)
  })))
}

function removeImage(targetId) {
  const nextImages = images.value.filter((image) => image.id !== targetId)
  if (nextImages.length === 0) {
    activeImageId.value = ''
    emitImages([])
    return
  }

  if (!nextImages.some((image) => image.isPrimary)) {
    nextImages[0] = {
      ...nextImages[0],
      isPrimary: true,
      kind: 'primary'
    }
  }

  activeImageId.value = nextImages[0].id
  emitImages(nextImages)
}

function updateKind(targetId, nextKind) {
  emitImages(images.value.map((image) => {
    if (image.id !== targetId) return image
    return {
      ...image,
      kind: image.isPrimary ? 'primary' : String(nextKind || 'custom')
    }
  }))
}

function updateLabel(targetId, event) {
  const nextLabel = String(event?.target?.value || '').trim()
  emitImages(images.value.map((image) => (
    image.id === targetId
      ? { ...image, label: nextLabel }
      : image
  )))
}

function getKindLabel(kind) {
  return kindOptions.find((option) => option.value === kind)?.label || '图片'
}

function getSourceLabel(storageMode) {
  if (storageMode === 'linked-local') return '本地'
  if (storageMode === 'inline-local') return '本地临时'
  return '网络'
}
</script>

<style scoped>
.image-manager {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.image-manager__composer,
.image-manager__gallery,
.image-manager__empty {
  padding: 14px;
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.image-manager__composer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.image-manager__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.image-manager__empty-title {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.image-manager__subtext,
.image-manager__section-hint,
.image-manager__empty-desc {
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.image-manager__count {
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 28px;
}

.image-manager__kind-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-manager__kind-chip {
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.image-manager__kind-chip--active {
  background: #141416;
  color: #ffffff;
}

.image-manager__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.image-manager__action-btn {
  min-height: 42px;
  border: none;
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.image-manager__action-btn--primary {
  background: #141416;
  color: #ffffff;
}

.image-manager__action-btn:disabled {
  opacity: 0.5;
}

.image-manager__thumb-strip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 2px;
  scrollbar-width: none;
}

.image-manager__thumb-strip::-webkit-scrollbar {
  display: none;
}

.image-manager__thumb {
  position: relative;
  display: block;
  flex: none;
  width: 86px;
  min-width: 86px;
  max-width: 86px;
  padding: 6px;
  border: none;
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.image-manager__thumb--active {
  box-shadow: inset 0 0 0 1px rgba(20, 20, 22, 0.08), var(--app-shadow);
}

.image-manager__thumb-img {
  display: block;
  width: 74px;
  min-width: 74px;
  max-width: 74px;
  height: 74px;
  min-height: 74px;
  max-height: 74px;
  border-radius: 12px;
  object-fit: cover;
}

.image-manager__thumb-badge,
.image-manager__thumb-source {
  position: absolute;
  left: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.image-manager__thumb-badge {
  top: 10px;
  background: rgba(20, 20, 22, 0.84);
  color: #ffffff;
}

.image-manager__thumb-source {
  bottom: 10px;
  background: rgba(255, 255, 255, 0.92);
  color: #141416;
}

.image-manager__editor {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 14px;
  margin-top: 12px;
  padding: 14px;
  border-radius: 16px;
  background: var(--app-surface-soft);
}

.image-manager__editor-preview {
  align-self: start;
}

.image-manager__editor-img {
  display: block;
  width: 116px;
  height: 116px;
  border-radius: 16px;
  object-fit: cover;
  background: var(--app-surface);
}

.image-manager__editor-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.image-manager__editor-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-manager__meta-pill {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 28px;
}

.image-manager__meta-pill--dark {
  background: #141416;
  color: #ffffff;
}

.image-manager__editor-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.image-manager__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-manager__field-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.image-manager__field input {
  width: 100%;
  min-height: 48px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 16px;
  padding: 0 14px;
  outline: none;
}

.image-manager__editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.image-manager__secondary-btn,
.image-manager__danger-btn {
  min-height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
}

.image-manager__secondary-btn {
  background: var(--app-surface);
  color: var(--app-text);
}

.image-manager__danger-btn {
  background: rgba(199, 68, 68, 0.1);
  color: #c74444;
}

@media (max-width: 760px) {
  .image-manager__actions,
  .image-manager__editor-fields {
    grid-template-columns: 1fr;
  }

  .image-manager__editor {
    grid-template-columns: 1fr;
  }

  .image-manager__editor-img {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }

  .image-manager__editor-actions {
    flex-direction: column;
  }
}
</style>
