<template>
  <header class="nav-bar">
    <div class="nav-bar__inner">
      <button v-if="showBack" class="nav-back" type="button" aria-label="返回" @click="router.back()">
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
import { useRouter } from 'vue-router'

defineProps({
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: false }
})

const router = useRouter()
</script>

<style scoped>
.nav-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: calc(env(safe-area-inset-top) + 10px) var(--page-padding) 6px;
  background:
    linear-gradient(180deg, rgba(245, 245, 247, 0.94) 0%, rgba(245, 245, 247, 0.78) 70%, rgba(245, 245, 247, 0) 100%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
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
  background: rgba(255, 255, 255, 0.78);
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
  background: rgba(255, 255, 255, 0.92);
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
  background: rgba(255, 255, 255, 0.78);
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
</style>
