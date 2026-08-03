<template>
  <Transition name="sheet-pop">
    <div v-if="modelValue" class="overlay" @click.self="closeDialog">
      <div class="fb-dialog">
        <div class="fb-dialog__scroll">
          <!-- Header -->
          <div class="fb-header">
            <span class="fb-header__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <h3 class="fb-header__title">{{ t('about.feedbackDialogTitle') }}</h3>
            <p class="fb-header__desc">{{ t('about.feedbackInAppDesc') }}</p>
          </div>

          <!-- Status messages -->
          <Transition name="fb-status-fade">
            <div v-if="submitError" class="fb-status fb-status--error">
              <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>
              {{ submitError }}
            </div>
          </Transition>
          <Transition name="fb-status-fade">
            <div v-if="submitSuccess" class="fb-status fb-status--success">
              <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.22 5.28a.75.75 0 00-1.06-1.06L7 8.38 5.84 7.22a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.63-3.69z"/></svg>
              {{ t('about.feedbackSuccess') }}
            </div>
          </Transition>

          <form class="fb-form" @submit.prevent="handleSubmit">
            <!-- Type segmented control -->
            <div class="fb-segment">
              <span class="fb-segment__label">{{ t('about.feedbackTypeLabel') }}</span>
              <div class="fb-segment__track">
                <button
                  v-for="opt in typeOptions"
                  :key="opt.value"
                  type="button"
                  class="fb-segment__btn"
                  :class="{ 'fb-segment__btn--active': feedbackType === opt.value }"
                  @click="feedbackType = opt.value"
                >
                  <span class="fb-segment__icon" v-html="opt.icon" />
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Title -->
            <div class="fb-field">
              <label class="fb-field__label" for="fb-title">{{ t('about.feedbackTitleLabel') }}</label>
              <input
                id="fb-title"
                v-model="feedbackTitle"
                class="fb-field__input"
                type="text"
                :placeholder="t('about.feedbackTitlePlaceholder')"
                required
                maxlength="100"
              />
            </div>

            <!-- Content -->
            <div class="fb-field">
              <div class="fb-field__row">
                <label class="fb-field__label" for="fb-content">{{ t('about.feedbackContentLabel') }}</label>
                <span class="fb-field__count">{{ feedbackContent.length }}/2000</span>
              </div>
              <textarea
                id="fb-content"
                v-model="feedbackContent"
                class="fb-field__input fb-field__textarea"
                :placeholder="t('about.feedbackContentPlaceholder')"
                rows="4"
                maxlength="2000"
              />
            </div>

            <!-- Contact -->
            <div class="fb-field">
              <label class="fb-field__label" for="fb-contact">
                {{ t('about.feedbackContactLabel') }}
              </label>
              <input
                id="fb-contact"
                v-model="feedbackContact"
                class="fb-field__input"
                type="text"
                :placeholder="t('about.feedbackContactPlaceholder')"
                maxlength="100"
              />
            </div>

            <!-- Attachments -->
            <div class="fb-field">
              <label class="fb-field__label">{{ t('about.feedbackAttachments') }}</label>
              <div class="fb-attach-row">
                <button type="button" class="fb-attach-btn" @click="$refs.fileInput.click()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  {{ t('about.feedbackPickFile') }}
                </button>
                <label class="fb-log-toggle">
                  <input v-model="collectLog" type="checkbox" class="fb-log-checkbox" />
                  {{ t('about.feedbackCollectLog') }}
                </label>
              </div>
              <input
                ref="fileInput"
                type="file"
                multiple
                accept="image/*,video/*,.log,.txt,.json"
                class="fb-file-hidden"
                @change="handleFileSelect"
              />
              <div v-if="selectedFiles.length > 0" class="fb-attach-previews">
                <div v-for="(f, idx) in selectedFiles" :key="idx" class="fb-attach-preview">
                  <img v-if="f.type.startsWith('image/')" :src="f.preview" class="fb-attach-thumb" />
                  <span v-else class="fb-attach-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                  </span>
                  <div class="fb-attach-info">
                    <span class="fb-attach-name">{{ f.name }}</span>
                    <span class="fb-attach-size">{{ formatSize(f.size) }}</span>
                  </div>
                  <button type="button" class="fb-attach-remove" @click="removeFile(idx)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <p v-if="!userId" class="fb-anon-note">
              <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>
              {{ t('about.feedbackAnonNote') }}
            </p>
            <div class="fb-actions">
              <button
                type="button"
                class="fb-btn fb-btn--ghost"
                :disabled="isSubmitting"
                @click="closeDialog"
              >
                {{ t('about.feedbackCancel') }}
              </button>
              <button
                type="submit"
                class="fb-btn fb-btn--primary"
                :disabled="isSubmitting || !feedbackTitle.trim()"
              >
                <span v-if="isSubmitting" class="fb-btn__spinner" />
                {{ isSubmitting ? t('about.feedbackSubmitting') : t('about.feedbackSubmit') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { submitFeedback } from '@/services/feedbackService'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { uploadAttachments, removeAttachments, collectDeviceLog } from '@/services/feedbackAttachmentService'
import { getDeviceId } from '@/utils/feedbackDevice'
import packageJson from '../../../package.json'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  userId: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'submitted'])

useDialogBackButton(closeDialog, () => props.modelValue)

const { t } = useI18n()

const feedbackType = ref('bug')
const feedbackTitle = ref('')
const feedbackContent = ref('')
const feedbackContact = ref('')
const selectedFiles = ref([])
const collectLog = ref(false)
const isSubmitting = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

const typeOptions = computed(() => [
  {
    value: 'bug',
    label: t('about.feedbackTypeBug'),
    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" width="14" height="14"><circle cx="8" cy="8" r="6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/></svg>'
  },
  {
    value: 'feature',
    label: t('about.feedbackTypeFeature'),
    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" width="14" height="14"><path d="M8 2v12M2 8h12"/></svg>'
  },
  {
    value: 'other',
    label: t('about.feedbackTypeOther'),
    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" width="14" height="14"><circle cx="8" cy="4" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="12" r="1.2"/></svg>'
  }
])

const fallbackVersion = import.meta.env.VITE_APP_VERSION || packageJson.version || ''

const appVersion = ref(fallbackVersion)
const bundleVersion = ref('')

/** Fetch real native app version and OTA bundle version at dialog open. */
async function refreshVersions() {
  // 1) Native app version (Android)
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await CapacitorApp.getInfo()
      const ver = String(info?.version || '').trim()
      if (ver) appVersion.value = ver
    } catch { /* keep fallback */ }
  }

  // 2) OTA bundle version (Capacitor Updater)
  try {
    const result = await CapacitorUpdater.current()
    const bv = result?.bundle?.version || ''
    if (bv) bundleVersion.value = bv
  } catch { /* non-native / updater unavailable */ }
}

function closeDialog() {
  emit('update:modelValue', false)
  resetForm()
}

function resetForm() {
  feedbackType.value = 'bug'
  feedbackTitle.value = ''
  feedbackContent.value = ''
  feedbackContact.value = ''
  selectedFiles.value = []
  collectLog.value = false
  isSubmitting.value = false
  submitError.value = ''
  submitSuccess.value = false
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files || [])
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) continue // skip >10MB
    const entry = { file: f, name: f.name, size: f.size, type: f.type, preview: '' }
    if (f.type.startsWith('image/')) {
      entry.preview = URL.createObjectURL(f)
    }
    selectedFiles.value.push(entry)
  }
  e.target.value = '' // reset input
}

function removeFile(idx) {
  const removed = selectedFiles.value.splice(idx, 1)[0]
  if (removed?.preview) URL.revokeObjectURL(removed.preview)
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function handleSubmit() {
  if (!feedbackTitle.value.trim()) return

  isSubmitting.value = true
  submitError.value = ''
  submitSuccess.value = false

  let attachments = []
  try {
    // 1. Upload attachments first (need feedbackId for path, use temp id)
    const filesToUpload = [...selectedFiles.value.map(f => f.file)]
    if (collectLog.value) {
      filesToUpload.push(await collectDeviceLog())
    }
    if (filesToUpload.length > 0) {
      // Use userId (or device id for anonymous) as temp path prefix
      const tempId = props.userId ? props.userId.slice(0, 8) : `anon-${getDeviceId().slice(0, 8)}`
      attachments = await uploadAttachments(filesToUpload, tempId)
    }

    // 2. Submit feedback with attachments
    const created = await submitFeedback({
      userId: props.userId,
      type: feedbackType.value,
      title: feedbackTitle.value.trim(),
      content: feedbackContent.value.trim(),
      contact: feedbackContact.value.trim(),
      appVersion: appVersion.value,
      bundleVersion: bundleVersion.value,
      attachments: attachments.length > 0 ? attachments : undefined
    })

    submitSuccess.value = true
    emit('submitted', created)
    setTimeout(() => closeDialog(), 1500)
  } catch (e) {
    // 提交失败时补偿删除已上传的附件，避免孤儿文件
    if (attachments.length > 0) {
      await removeAttachments(attachments.map(a => a.path))
    }
    submitError.value = e.message || t('about.feedbackError')
  } finally {
    isSubmitting.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    resetForm()
    refreshVersions()
  }
})
</script>

<style scoped>
/* ── Overlay ── */
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

/* ── Dialog shell ── */
.fb-dialog {
  width: min(100%, 460px);
  max-height: min(calc(100dvh - 40px), 88vh);
  overflow: hidden;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-lg);
}

.fb-dialog__scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;
}

/* ── Header ── */
.fb-header {
  margin-bottom: 24px;
}

.fb-header__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text);
}

.fb-header__icon svg {
  width: 20px;
  height: 20px;
}

.fb-header__title {
  margin: 12px 0 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.3;
}

.fb-header__desc {
  margin: 4px 0 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
  line-height: 1.5;
}

/* ── Status banners ── */
.fb-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-weight: 500;
}

.fb-status--error {
  background: color-mix(in srgb, #e5484d 8%, transparent);
  color: #c74444;
}

.fb-status--success {
  background: color-mix(in srgb, #28c880 8%, transparent);
  color: #1a8a5a;
}

/* ── Form layout ── */
.fb-form {
  display: grid;
  gap: 18px;
}

/* ── Segmented type selector ── */
.fb-segment {
  display: grid;
  gap: 8px;
}

.fb-segment__label {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.fb-segment__track {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.fb-segment__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: calc(var(--radius-small) - 4px);
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s var(--motion-ease-default);
}

.fb-segment__btn--active {
  background: var(--app-surface);
  color: var(--app-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}

.fb-segment__icon {
  display: inline-flex;
  flex-shrink: 0;
}

/* ── Fields ── */
.fb-field {
  display: grid;
  gap: 6px;
}

.fb-field__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fb-field__label {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.fb-field__count {
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.fb-field__input {
  width: 100%;
  height: var(--input-height);
  padding: 0 14px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.fb-field__input::placeholder {
  color: var(--app-placeholder);
}

.fb-field__input:focus {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
}

.fb-field__textarea {
  height: auto;
  min-height: 100px;
  padding: 12px 14px;
  resize: vertical;
  line-height: 1.6;
}

/* ── Attachments ── */
.fb-file-hidden {
  display: none;
}

.fb-attach-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fb-attach-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1px dashed var(--app-input-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.fb-attach-btn:hover {
  border-color: var(--app-input-focus-border);
  background: var(--app-surface);
}

.fb-log-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.fb-log-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--app-text);
}

.fb-attach-previews {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.fb-attach-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.fb-attach-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.fb-attach-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  flex-shrink: 0;
}

.fb-attach-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.fb-attach-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-attach-size {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.fb-attach-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}

.fb-attach-remove:hover {
  background: color-mix(in srgb, #e5484d 10%, transparent);
  color: #e5484d;
}

/* ── Actions ── */
.fb-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 4px;
}

.fb-anon-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.fb-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 42px;
  padding: 0 20px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.fb-btn:active {
  transform: scale(0.97);
}

.fb-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.fb-btn--ghost {
  background: transparent;
  color: var(--app-text-secondary);
}

.fb-btn--ghost:hover:not(:disabled) {
  background: var(--app-surface-soft);
}

.fb-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.fb-btn--primary:hover:not(:disabled) {
  opacity: 0.88;
}

/* Spinner */
.fb-btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ── Transitions ── */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-fade-enter-active .fb-dialog,
.overlay-fade-leave-active .fb-dialog {
  transition: transform 0.25s var(--motion-ease-emphasis), opacity 0.2s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
.overlay-fade-enter-from .fb-dialog,
.overlay-fade-leave-to .fb-dialog {
  transform: scale(0.96) translateY(6px);
  opacity: 0;
}

.fb-status-fade-enter-active,
.fb-status-fade-leave-active {
  transition: all 0.2s ease;
}
.fb-status-fade-enter-from,
.fb-status-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── Mobile: bottom sheet ── */
@media (max-width: 767px) {
  .overlay {
    align-items: flex-end;
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .fb-dialog {
    width: 100%;
    max-height: 85vh;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .fb-dialog__scroll {
    padding: 24px 20px 20px;
  }
}

@media (min-width: 768px) {
  .fb-dialog {
    border: 1px solid var(--app-border);
  }
}
</style>
