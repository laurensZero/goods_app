<template>
  <Transition name="overlay-fade">
    <div v-if="showDialog" class="overlay" @click.self="updateStore.dismissDialog()">
      <div class="dialog update-dialog">
        <p class="update-kicker">Update Available</p>
        <h3 class="dialog-title">发现新版本 v{{ updateStore.latestVersion }}</h3>
        <p class="dialog-desc">
          当前版本 v{{ updateStore.currentVersion }}，GitHub Release 最新版本为 v{{ updateStore.latestVersion }}。
          <template v-if="publishedAtLabel">发布于 {{ publishedAtLabel }}。</template>
        </p>

        <div class="version-row">
          <div class="version-pill">
            <span class="version-pill__label">当前</span>
            <strong class="version-pill__value">v{{ updateStore.currentVersion }}</strong>
          </div>
          <div class="version-pill version-pill--accent">
            <span class="version-pill__label">最新</span>
            <strong class="version-pill__value">v{{ updateStore.latestVersion }}</strong>
          </div>
        </div>

        <section v-if="updateStore.releaseNotesPreview" class="release-notes">
          <p class="release-notes__label">更新说明</p>
          <pre class="release-notes__body">{{ updateStore.releaseNotesPreview }}</pre>
        </section>

        <p class="update-tip">更新页面会在浏览器中打开 GitHub Release，你可以自行决定是否下载安装。</p>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn dialog-btn--secondary" @click="updateStore.dismissDialog()">稍后再说</button>
          <button type="button" class="dialog-btn dialog-btn--primary" @click="updateStore.openReleasePage()">前往更新</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useAppUpdateStore } from '@/stores/appUpdate'

const updateStore = useAppUpdateStore()

const showDialog = computed(() => updateStore.dialogVisible && updateStore.hasUpdate)
const publishedAtLabel = computed(() => {
  const value = updateStore.latestRelease?.published_at
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.update-dialog {
  width: min(100%, 480px);
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.update-kicker {
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

.dialog-desc,
.update-tip {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.version-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.version-pill {
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--app-surface-soft);
}

.version-pill--accent {
  background: color-mix(in srgb, #5a78fa 12%, var(--app-surface-soft));
}

.version-pill__label {
  display: block;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.version-pill__value {
  display: block;
  margin-top: 6px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.release-notes {
  margin-top: 18px;
  padding: 16px;
  border-radius: 16px;
  background: var(--app-surface-soft);
}

.release-notes__label {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 600;
}

.release-notes__body {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
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

.overlay-fade-enter-active .update-dialog,
.overlay-fade-leave-active .update-dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .update-dialog,
.overlay-fade-leave-to .update-dialog {
  transform: scale(0.95) translateY(8px);
}

@media (max-width: 768px) {
  .version-row {
    grid-template-columns: 1fr;
  }

  .dialog-actions {
    flex-direction: column;
  }

  .dialog-btn {
    width: 100%;
  }
}
</style>
