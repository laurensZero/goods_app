<template>
  <Transition name="overlay-fade">
    <div v-if="showDialog" class="overlay" @click.self="announcementStore.dismissAnnouncement()">
      <div class="dialog announcement-dialog">
        <p class="announcement-kicker">Announcement</p>
        <h3 class="dialog-title">{{ activeAnnouncement?.title || t('common.announcement') }}</h3>
        <p class="dialog-desc">{{ activeAnnouncement?.message || '' }}</p>

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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnouncementStore } from '@/stores/announcement'

const { t } = useI18n()
const announcementStore = useAnnouncementStore()

const showDialog = computed(() => announcementStore.dialogVisible && !!announcementStore.activeAnnouncement)
const activeAnnouncement = computed(() => announcementStore.activeAnnouncement)
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
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
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
