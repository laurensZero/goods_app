<template>
  <Transition name="overlay-fade">
    <div v-if="modelValue" class="overlay" @click.self="close">
      <div class="fb-dialog">
        <div class="fb-dialog__handle" />
        <div class="fb-dialog__scroll">
          <!-- Close button -->
          <button type="button" class="fb-dialog__close" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>

          <template v-if="feedback">
            <!-- Header -->
            <div class="fb-detail-header">
              <div class="fb-detail-meta">
                <span class="fb-detail-id">#{{ feedback.id }}</span>
                <span class="fb-status-tag" :class="`fb-status-tag--${feedback.status}`">
                  {{ statusLabel(feedback.status) }}
                </span>
                <span class="fb-type-tag" :class="`fb-type-tag--${feedback.type}`">
                  {{ typeLabel(feedback.type) }}
                </span>
              </div>
              <h1 class="fb-detail-title">{{ feedback.title }}</h1>
              <p class="fb-detail-time">{{ formatTime(feedback.created_at) }}</p>
            </div>

            <!-- Content -->
            <div v-if="feedback.content" class="fb-detail-section">
              <h3 class="fb-detail-section__title">{{ t('about.feedbackContentLabel') }}</h3>
              <p class="fb-detail-body">{{ feedback.content }}</p>
            </div>

            <!-- Contact -->
            <div v-if="feedback.contact" class="fb-detail-section">
              <h3 class="fb-detail-section__title">{{ t('about.feedbackContactLabel') }}</h3>
              <p class="fb-detail-body">{{ feedback.contact }}</p>
            </div>

            <!-- Attachments -->
            <div v-if="feedback.attachments?.length" class="fb-detail-section">
              <h3 class="fb-detail-section__title">{{ t('about.feedbackAttachments') }} ({{ feedback.attachments.length }})</h3>
              <div class="fb-attach-list">
                <a
                  v-for="(att, idx) in feedback.attachments"
                  :key="idx"
                  :href="att.url"
                  target="_blank"
                  rel="noopener"
                  class="fb-attach-item"
                >
                  <img v-if="att.type?.startsWith('image/')" :src="att.url" class="fb-attach-thumb" />
                  <span v-else class="fb-attach-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                  </span>
                  <div class="fb-attach-info">
                    <span class="fb-attach-name">{{ att.name }}</span>
                    <span class="fb-attach-size">{{ formatSize(att.size) }}</span>
                  </div>
                  <svg class="fb-attach-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                </a>
              </div>
            </div>

            <!-- Admin reply -->
            <div v-if="feedback.admin_reply" class="fb-detail-section fb-admin-reply">
              <h3 class="fb-detail-section__title">
                <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.22 5.28a.75.75 0 00-1.06-1.06L7 8.38 5.84 7.22a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.63-3.69z"/></svg>
                {{ t('about.feedbackAdminReply') }}
              </h3>
              <p class="fb-detail-body">{{ feedback.admin_reply }}</p>
            </div>

            <!-- Follow-ups -->
            <div v-if="followups.length > 0" class="fb-detail-section">
              <h3 class="fb-detail-section__title">{{ t('about.feedbackFollowups') }} ({{ followups.length }})</h3>
              <div class="fb-followup-list">
                <article
                  v-for="(fu, idx) in followups"
                  :key="idx"
                  class="fb-followup-item"
                  :class="{ 'fb-followup-item--admin': fu.role === 'admin' }"
                >
                  <div class="fb-followup-header">
                    <span class="fb-followup-author" :class="{ 'fb-followup-author--admin': fu.role === 'admin' }">
                      {{ fu.role === 'admin' ? t('about.feedbackAdmin') : t('about.feedbackYou') }}
                    </span>
                    <span class="fb-followup-time">{{ formatTime(fu.created_at) }}</span>
                  </div>
                  <p class="fb-followup-content">{{ fu.content }}</p>
              <div v-if="fu.attachments?.length" class="fb-followup-attachments">
                <a
                  v-for="(att, aIdx) in fu.attachments"
                  :key="aIdx"
                  :href="att.url"
                  target="_blank"
                  rel="noopener"
                  class="fb-followup-att"
                >
                  <img v-if="att.type?.startsWith('image/')" :src="att.url" class="fb-followup-att-img" />
                  <span v-else class="fb-followup-att-file">{{ att.name }}</span>
                </a>
              </div>
                </article>
              </div>
            </div>

            <!-- Add follow-up -->
            <div v-if="feedback.status !== 'closed'" class="fb-detail-section fb-followup-input">
              <h3 class="fb-detail-section__title">{{ t('about.feedbackAddFollowup') }}</h3>
              <textarea
                v-model="newFollowup"
                class="fb-followup-textarea"
                :placeholder="t('about.feedbackFollowupPlaceholder')"
                rows="3"
                maxlength="1000"
              />
              <!-- Attachments for follow-up -->
              <div class="fb-followup-attach">
                <button type="button" class="fb-attach-btn-sm" @click="$refs.fuFileInput.click()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <label class="fb-log-toggle-sm">
                  <input v-model="fuCollectLog" type="checkbox" class="fb-log-checkbox" />
                  {{ t('about.feedbackCollectLog') }}
                </label>
              </div>
              <input
                ref="fuFileInput"
                type="file"
                multiple
                accept="image/*,video/*,.log,.txt,.json"
                class="fb-file-hidden"
                @change="handleFuFileSelect"
              />
              <div v-if="fuFiles.length > 0" class="fb-attach-previews-sm">
                <div v-for="(f, idx) in fuFiles" :key="idx" class="fb-attach-preview-sm">
                  <img v-if="f.type?.startsWith('image/')" :src="f.url" class="fb-attach-thumb-sm" />
                  <span v-else class="fb-attach-icon-sm">{{ f.name?.split('.').pop() }}</span>
                  <span class="fb-attach-name-sm">{{ f.name }}</span>
                  <button type="button" class="fb-attach-remove-sm" @click="removeFuFile(idx)">×</button>
                </div>
              </div>
              <div class="fb-followup-actions">
                <span class="fb-followup-count">{{ newFollowup.length }}/1000</span>
                <button
                  type="button"
                  class="fb-btn fb-btn--primary"
                  :disabled="(!newFollowup.trim() && fuFiles.length === 0 && !fuCollectLog) || isAddingFollowup"
                  @click="handleAddFollowup"
                >
                  <span v-if="isAddingFollowup" class="fb-btn__spinner" />
                  {{ t('about.feedbackSendFollowup') }}
                </button>
              </div>
            </div>
          </template>

          <!-- Loading -->
          <div v-else-if="loading" class="fb-detail-loading">
            <span class="fb-btn__spinner" style="width:24px;height:24px;" />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { getFeedback, addFollowup } from '@/services/feedbackService'
import { uploadAttachments, collectDeviceLog } from '@/services/feedbackAttachmentService'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  feedbackId: { type: [Number, String], default: 0 }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const authStore = useAuthStore()

const feedback = ref(null)
const followups = ref([])
const loading = ref(false)
const newFollowup = ref('')
const fuFiles = ref([])
const fuCollectLog = ref(false)
const isAddingFollowup = ref(false)

const statusMap = {
  pending: 'about.feedbackStatusPending',
  reviewing: 'about.feedbackStatusReviewing',
  resolved: 'about.feedbackStatusResolved',
  closed: 'about.feedbackStatusClosed'
}

function statusLabel(status) {
  return t(statusMap[status] || status)
}

function typeLabel(type) {
  const map = { bug: 'about.feedbackTypeBug', feature: 'about.feedbackTypeFeature', other: 'about.feedbackTypeOther' }
  return t(map[type] || type)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function close() {
  emit('update:modelValue', false)
}

async function loadFeedback() {
  if (!props.feedbackId) return
  loading.value = true
  feedback.value = null
  try {
    feedback.value = await getFeedback(props.feedbackId)
    followups.value = feedback.value?.followups || []
  } catch (e) {
    showToast(e.message || 'Failed to load feedback')
  } finally {
    loading.value = false
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function handleFuFileSelect(e) {
  const files = Array.from(e.target.files || [])
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) continue
    fuFiles.value.push({ file: f, name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f) })
  }
  e.target.value = ''
}

function removeFuFile(idx) {
  const removed = fuFiles.value.splice(idx, 1)[0]
  if (removed?.url) URL.revokeObjectURL(removed.url)
}

async function handleAddFollowup() {
  const hasContent = newFollowup.value.trim()
  const hasFiles = fuFiles.value.length > 0 || fuCollectLog.value
  if (!hasContent && !hasFiles) return
  if (!authStore.user?.id) return

  isAddingFollowup.value = true
  try {
    // Upload attachments first
    let attachments = []
    const filesToUpload = fuFiles.value.map(f => f.file)
    if (fuCollectLog.value) filesToUpload.push(await collectDeviceLog())
    if (filesToUpload.length > 0) {
      attachments = await uploadAttachments(filesToUpload, props.feedbackId)
    }

    const updated = await addFollowup({
      feedbackId: Number(props.feedbackId),
      userId: authStore.user.id,
      content: hasContent ? newFollowup.value.trim() : '',
      attachments: attachments.length > 0 ? attachments : undefined
    })
    followups.value = Array.isArray(updated) ? updated : (updated?.followups || [])
    newFollowup.value = ''
    fuFiles.value = []
    fuCollectLog.value = false
    showToast(t('about.feedbackFollowupSent'))
  } catch (e) {
    showToast(e.message || t('about.feedbackError'))
  } finally {
    isAddingFollowup.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) loadFeedback()
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-overlay-blur));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur));
}

.fb-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100%, 480px);
  max-height: min(calc(100dvh - 40px), 88vh);
  overflow: hidden;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-lg);
}

.fb-dialog__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px;
  -webkit-overflow-scrolling: touch;
}

.fb-dialog__handle {
  display: none;
}

@media (max-width: 767px) {
  .fb-dialog__handle {
    display: block;
    width: 36px;
    height: 4px;
    margin: 10px auto 0;
    border-radius: 2px;
    background: color-mix(in srgb, var(--app-text) 15%, transparent);
  }
}

.fb-dialog__close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background 0.15s ease;
}

.fb-dialog__close:hover {
  background: color-mix(in srgb, var(--app-text) 10%, transparent);
}

/* Header */
.fb-detail-header {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 20px;
  padding-right: 32px;
}

.fb-detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.fb-detail-id {
  color: var(--app-text-tertiary);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fb-status-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.fb-status-tag--pending {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
}

.fb-status-tag--reviewing {
  background: color-mix(in srgb, #3b82f6 12%, transparent);
  color: #3b82f6;
}

.fb-status-tag--resolved {
  background: color-mix(in srgb, #28c880 12%, transparent);
  color: #28c880;
}

.fb-status-tag--closed {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
}

.fb-type-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.fb-type-tag--bug {
  background: color-mix(in srgb, #e5484d 12%, transparent);
  color: #e5484d;
}

.fb-type-tag--feature {
  background: color-mix(in srgb, #3b82f6 12%, transparent);
  color: #3b82f6;
}

.fb-type-tag--other {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-secondary);
}

.fb-detail-title {
  margin: 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.3;
}

.fb-detail-time {
  margin: 6px 0 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

/* Sections */
.fb-detail-section {
  margin-bottom: 18px;
}

.fb-detail-section__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.fb-detail-body {
  margin: 0;
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Admin reply */
.fb-admin-reply {
  padding: 12px;
  border-radius: var(--radius-small);
  background: color-mix(in srgb, #3b82f6 5%, transparent);
  border: 1px solid color-mix(in srgb, #3b82f6 10%, transparent);
}

.fb-admin-reply .fb-detail-section__title {
  color: #3b82f6;
}

/* Follow-ups */
.fb-followup-list {
  display: grid;
  gap: 8px;
}

.fb-followup-item {
  padding: 10px 12px;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
}

.fb-followup-item--admin {
  background: color-mix(in srgb, #3b82f6 5%, transparent);
  border: 1px solid color-mix(in srgb, #3b82f6 10%, transparent);
}

.fb-followup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.fb-followup-author {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.fb-followup-author--admin {
  color: #3b82f6;
}

.fb-followup-time {
  font-size: 10px;
  color: var(--app-text-tertiary);
}

.fb-followup-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text);
  white-space: pre-wrap;
  word-break: break-word;
}

/* Follow-up attachments */
.fb-followup-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.fb-followup-att {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.fb-followup-att:hover {
  opacity: 0.8;
}

.fb-followup-att-img {
  width: 64px;
  height: 64px;
  object-fit: cover;
}

.fb-followup-att-file {
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Detail attachments */
.fb-attach-list {
  display: grid;
  gap: 6px;
}

.fb-attach-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--app-border);
  text-decoration: none;
  color: var(--app-text);
  transition: background 0.15s ease;
}

.fb-attach-item:hover {
  background: var(--app-surface-soft);
}

.fb-attach-thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.fb-attach-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  flex-shrink: 0;
}

.fb-attach-info {
  flex: 1;
  min-width: 0;
}

.fb-attach-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-attach-size {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.fb-attach-arrow {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}

/* Follow-up input */
.fb-followup-textarea {
  width: 100%;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid var(--app-input-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.fb-followup-textarea::placeholder {
  color: var(--app-placeholder);
}

.fb-followup-textarea:focus {
  border-color: var(--app-input-focus-border);
  box-shadow: 0 0 0 3px var(--app-input-focus-ring);
}

/* Follow-up file upload */
.fb-file-hidden {
  display: none;
}

.fb-followup-attach {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.fb-attach-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px dashed var(--app-input-border);
  border-radius: 8px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.fb-attach-btn-sm:hover {
  border-color: var(--app-input-focus-border);
}

.fb-log-toggle-sm {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--app-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  user-select: none;
}

.fb-log-checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--app-text);
}

.fb-attach-previews-sm {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.fb-attach-preview-sm {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--app-surface-soft);
  font-size: 11px;
}

.fb-attach-thumb-sm {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  object-fit: cover;
}

.fb-attach-icon-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
}

.fb-attach-name-sm {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-secondary);
}

.fb-attach-remove-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text-tertiary);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
}

.fb-attach-remove-sm:hover {
  background: color-mix(in srgb, #e5484d 10%, transparent);
  color: #e5484d;
}

.fb-followup-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.fb-followup-count {
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* Button */
.fb-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 13px;
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

.fb-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.fb-btn__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: fb-spin 0.6s linear infinite;
}

@keyframes fb-spin {
  to { transform: rotate(360deg); }
}

/* Loading */
.fb-detail-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

/* Transitions */
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

/* Mobile: bottom sheet */
@media (max-width: 767px) {
  .overlay {
    align-items: flex-end;
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .fb-dialog {
    width: 100%;
    max-height: 88vh;
    border-radius: 20px 20px 0 0;
  }

  .fb-dialog__scroll {
    padding: 8px 20px 20px;
  }

  .fb-dialog__close {
    top: 12px;
    right: 12px;
  }
}

@media (min-width: 768px) {
  .fb-dialog {
    border: 1px solid var(--app-border);
  }
}
</style>
