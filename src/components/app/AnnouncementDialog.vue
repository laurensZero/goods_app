<template>
  <Transition name="sheet-pop">
    <div v-if="showDialog" class="overlay" @click.self="announcementStore.dismissAnnouncement()">
      <div class="dialog announcement-dialog">
        <p class="announcement-kicker">Announcement</p>
        <h3 class="dialog-title">{{ activeAnnouncement?.title || t('common.announcement') }}</h3>

        <img
          v-if="activeAnnouncement?.imageUrl"
          :src="activeAnnouncement.imageUrl"
          :alt="activeAnnouncement.title || 'Announcement'"
          class="announcement-image"
          loading="lazy"
        />

        <div
          v-if="isMarkdown"
          class="announcement-body markdown-body"
          v-html="contentHtml"
        />
        <p v-else class="dialog-desc">{{ contentText }}</p>

        <div class="announcement-meta">
          <span v-if="updatedAtLabel" class="announcement-meta__item">{{ t('common.updatedAt', { date: updatedAtLabel }) }}</span>
        </div>

        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-btn dialog-btn--secondary"
            @click="announcementStore.dismissAnnouncement()"
          >
            {{ t('common.known') }}
          </button>
          <button
            v-if="showPrimaryButton"
            type="button"
            class="dialog-btn dialog-btn--primary"
            @click="announcementStore.handlePrimaryAction()"
          >
            {{ primaryButtonText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnouncementStore } from '@/stores/announcement'
import { renderMarkdown, detectMarkdownContent } from '@/utils/markdown'

const { t } = useI18n()
const announcementStore = useAnnouncementStore()

const showDialog = computed(() => announcementStore.dialogVisible && !!announcementStore.activeAnnouncement)
const activeAnnouncement = computed(() => announcementStore.activeAnnouncement)

const contentHtml = ref('')
const isMarkdown = computed(() => detectMarkdownContent(activeAnnouncement.value?.message))

let customStyleElement = null

const contentText = computed(() => {
  const announcement = activeAnnouncement.value
  if (!announcement) return ''
  return announcement.message || ''
})

function injectCustomCss(css) {
  removeCustomCss()
  if (!css) return
  customStyleElement = document.createElement('style')
  customStyleElement.setAttribute('data-announcement-css', '')
  customStyleElement.textContent = css
  document.head.appendChild(customStyleElement)
}

function removeCustomCss() {
  if (customStyleElement) {
    customStyleElement.remove()
    customStyleElement = null
  }
}

watch(
  () => activeAnnouncement.value,
  async (announcement) => {
    if (!announcement) {
      contentHtml.value = ''
      removeCustomCss()
      return
    }
    if (detectMarkdownContent(announcement.message)) {
      contentHtml.value = await renderMarkdown(announcement.message || '')
    } else {
      contentHtml.value = ''
    }
    injectCustomCss(announcement.customCss)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  removeCustomCss()
})

const showPrimaryButton = computed(() => {
  const cta = activeAnnouncement.value?.cta || null
  const action = String(cta?.action || '').trim().toLowerCase()
  return (action === 'open_url' || action === 'navigate') && !!String(cta?.url || '').trim()
})
const primaryButtonText = computed(() => {
  const text = String(activeAnnouncement.value?.cta?.text || '').trim()
  return text || t('common.viewDetail')
})
const updatedAtLabel = computed(() => {
  const value = String(activeAnnouncement.value?.showRule?.startAt || '').trim()
  if (!value) return ''

  const timestamp = typeof activeAnnouncement.value?.showRule?.startAt === 'number'
    ? activeAnnouncement.value.showRule.startAt
    : new Date(value).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''

  const date = new Date(timestamp)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.announcement-dialog {
  width: min(100%, 480px);
  max-height: 80vh;
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow-y: auto;
  scrollbar-width: none;
}

.announcement-dialog::-webkit-scrollbar {
  display: none;
}

.announcement-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dialog-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.announcement-image {
  display: block;
  width: 100%;
  margin-top: 16px;
  border-radius: 12px;
}

.announcement-body {
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 16px;
  margin-bottom: 8px;
  color: var(--app-text);
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body :deep(h1) { font-size: 1.5em; }
.markdown-body :deep(h2) { font-size: 1.3em; }
.markdown-body :deep(h3) { font-size: 1.15em; }

.markdown-body :deep(p) {
  margin: 8px 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-body :deep(li) {
  margin: 4px 0;
}

.markdown-body :deep(a) {
  color: var(--app-text-link, #1677ff);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--app-surface-soft, rgba(0, 0, 0, 0.06));
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--app-surface-soft, rgba(0, 0, 0, 0.06));
  overflow-x: auto;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--app-text-tertiary, #ccc);
  color: var(--app-text-secondary);
  background: var(--app-surface-soft, rgba(0, 0, 0, 0.03));
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--app-border, rgba(0, 0, 0, 0.08));
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--app-surface-soft, rgba(0, 0, 0, 0.04));
  font-weight: 600;
}

.markdown-body :deep(hr) {
  margin: 16px 0;
  border: none;
  border-top: 1px solid var(--app-border, rgba(0, 0, 0, 0.08));
}

.dialog-desc {
  margin-top: 12px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.announcement-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 12px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
}

.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
