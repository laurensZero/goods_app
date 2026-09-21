<template>
  <Transition name="apk-promo">
    <aside
      v-if="visible"
      class="apk-promo"
      role="region"
      :aria-label="t('common.apkPromo.title')"
    >
      <div class="apk-promo__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M7 7.5 5.2 4.6M17 7.5l1.8-2.9" />
          <rect x="5" y="8" width="14" height="11" rx="2.5" />
          <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
        </svg>
      </div>

      <div class="apk-promo__copy">
        <p class="apk-promo__title">{{ t('common.apkPromo.title') }}</p>
        <p class="apk-promo__desc">{{ t('common.apkPromo.desc') }}</p>
      </div>

      <button
        type="button"
        class="apk-promo__download"
        @click="handleDownload"
      >
        {{ t('common.apkPromo.action') }}
      </button>

      <button
        type="button"
        class="apk-promo__close"
        :aria-label="t('common.apkPromo.dismiss')"
        @click="handleDismiss"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </aside>
  </Transition>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  dismissWebApkPromo,
  isWebAndroidPromoTarget,
  isWebApkPromoDismissed
} from '@/utils/platform/webAndroidPromo'
import { fetchLatestApkDownloadUrl } from '@/utils/updateHelpers'
import { showGlobalToast } from '@/utils/globalToast'

const { t } = useI18n()
const SHOW_DELAY_MS = 1200

const visible = ref(false)
const downloadUrl = ref('')
let delayTimer = null

function setPromoOpen(open) {
  try {
    document.documentElement.classList.toggle('apk-promo-open', !!open)
  } catch {
    /* ignore */
  }
}

function handleDismiss() {
  visible.value = false
  dismissWebApkPromo()
}

async function handleDownload() {
  if (!downloadUrl.value) {
    downloadUrl.value = await fetchLatestApkDownloadUrl()
  }
  const url = downloadUrl.value
  if (!url) {
    showGlobalToast(t('common.apkPromo.failed'))
    return
  }
  // 同窗跳转触发下载，避免新开页与旧更新页同时出现
  window.location.href = url
}

watch(visible, (value) => {
  setPromoOpen(value)
})

onMounted(() => {
  if (!isWebAndroidPromoTarget(globalThis.navigator?.userAgent)) return
  if (isWebApkPromoDismissed()) return

  delayTimer = setTimeout(() => {
    delayTimer = null
    visible.value = true
  }, SHOW_DELAY_MS)

  void fetchLatestApkDownloadUrl().then((url) => {
    downloadUrl.value = url || ''
  })
})

onBeforeUnmount(() => {
  if (delayTimer) clearTimeout(delayTimer)
  delayTimer = null
  setPromoOpen(false)
})
</script>

<style scoped>
/* 固定在页面最顶部（安全区下方），与 FAB / 添加按钮错开 */
.apk-promo {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 8px);
  left: 12px;
  right: 12px;
  z-index: var(--z-float);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 10px 10px 12px;
  border-radius: var(--radius-card);
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow: var(--app-shadow-lg);
  backdrop-filter: blur(20px) saturate(130%);
  -webkit-backdrop-filter: blur(20px) saturate(130%);
}

.apk-promo__icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text);
}

.apk-promo__icon svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.apk-promo__copy {
  min-width: 0;
}

.apk-promo__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--app-text);
}

.apk-promo__desc {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--app-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.apk-promo__download {
  border: none;
  border-radius: 999px;
  padding: 9px 12px;
  min-height: 34px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-bg);
  background: var(--app-text);
  cursor: pointer;
  white-space: nowrap;
}

.apk-promo__close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.apk-promo__close svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.apk-promo-enter-active,
.apk-promo-leave-active {
  transition: opacity var(--motion-medium) var(--motion-ease-default),
    transform var(--motion-medium) var(--motion-ease-emphasis);
}

.apk-promo-enter-from,
.apk-promo-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 380px) {
  .apk-promo {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'icon copy close'
      'download download download';
  }

  .apk-promo__icon { grid-area: icon; }
  .apk-promo__copy { grid-area: copy; }
  .apk-promo__close { grid-area: close; }
  .apk-promo__download {
    grid-area: download;
    width: 100%;
  }
}
</style>
