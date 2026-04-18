<template>
  <header class="nav-bar">
    <div class="nav-bar__inner">
      <button v-if="showBack" class="nav-back" type="button" aria-label="返回" @click="handleBackClick">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 18L9 12L15 6" />
        </svg>
      </button>
      <div v-else class="nav-placeholder" />

      <h1 class="nav-title">{{ title }}</h1>

      <div class="nav-right">
        <slot name="right" />
      </div>
    </div>
  </header>
</template>

<script setup>
import { getCurrentInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { runManageBackNavigation, runWithRouteTransition } from '@/utils/routeTransition'

defineProps({
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: false }
})

const emit = defineEmits(['back'])
const router = useRouter()
const route = useRoute()
const instance = getCurrentInstance()

function isManageEntrySlideRoute(path) {
  if (!path) return false
  if (path === '/manage' || path === '/manage/') return false
  if (path.startsWith('/manage/')) return true
  return path === '/storage-locations' || path === '/trash'
}

function handleBackClick() {
  const hasBackListener = Boolean(instance?.vnode?.props?.onBack)
  if (hasBackListener) {
    emit('back')
    return
  }
  if (isManageEntrySlideRoute(route.path)) {
    runManageBackNavigation(() => router.back())
    return
  }
  runWithRouteTransition(() => router.back(), { direction: 'back' })
}
</script>

<style scoped>
.nav-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: calc(env(safe-area-inset-top) + 10px) var(--page-padding) 6px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--app-bg) 94%, transparent) 0%, color-mix(in srgb, var(--app-bg) 82%, transparent) 72%, rgba(245, 245, 247, 0) 100%);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}

.nav-bar__inner {
  display: grid;
  grid-template-columns: var(--icon-button-size) 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 40px;
}

.nav-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  padding: 0;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-muted) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  background-clip: padding-box;
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  transition: transform 0.16s ease, background 0.16s ease;
}

.nav-back svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-back:active {
  transform: scale(0.96);
  background: color-mix(in srgb, var(--app-surface-muted) 78%, transparent);
}

.nav-placeholder {
  width: var(--icon-button-size);
  height: var(--icon-button-size);
}

.nav-right {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  min-width: var(--icon-button-size);
}

:slotted(.add-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-button-size);
  height: var(--icon-button-size);
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-muted) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  background-clip: padding-box;
  box-shadow: var(--app-shadow);
  color: var(--app-text);
  transition: transform 0.16s ease;
}

:slotted(.add-btn):active {
  transform: scale(0.96);
}

:slotted(.add-btn) svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.02em;
}

:global(html.theme-dark) .nav-bar {
    background:
      linear-gradient(180deg, rgba(18, 18, 22, 0.82) 0%, rgba(18, 18, 22, 0.56) 72%, rgba(15, 15, 16, 0) 100%);
  }

:global(html.theme-dark) .nav-back,
  :global(html.theme-dark) :slotted(.add-btn) {
    background: color-mix(in srgb, var(--app-surface) 18%, transparent);
    border-color: color-mix(in srgb, var(--app-surface) 10%, transparent);
  }

:global(html.theme-dark) .nav-back:active,
  :global(html.theme-dark) :slotted(.add-btn):active {
    background: color-mix(in srgb, var(--app-surface) 26%, transparent);
  }
</style>
