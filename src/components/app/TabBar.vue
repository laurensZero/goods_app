<template>
  <nav class="tab-bar" aria-label="底部导航" :style="tabBarStyle">
    <span class="tab-bar__indicator" aria-hidden="true" />
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="tab-item"
      :class="{ 'tab-item--active': isTabActive(tab.key) }"
      :aria-current="isTabActive(tab.key) ? 'page' : undefined"
      @click="activateTab(tab.key)"
    >
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path v-for="(path, index) in tab.paths" :key="index" :d="path" />
      </svg>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const HOME_MODE_STORAGE_KEY = 'goods_home_mode_v1'
const HOME_MODE_EVENT = 'goods-app:home-mode-change'
const COLLECTION_TAB_STORAGE_KEY = 'goods_collection_tab_v1'
const COLLECTION_TAB_EVENT = 'goods-app:collection-tab-change'

const route = useRoute()
const router = useRouter()
const homeMode = ref('goods')
const collectionTab = ref(readStoredCollectionTab())

function readStoredCollectionTab() {
  const storedValue = localStorage.getItem(COLLECTION_TAB_STORAGE_KEY)
  return storedValue === 'wishlist' || storedValue === 'stats' ? storedValue : 'goods'
}

function syncHomeMode(nextMode) {
  homeMode.value = nextMode === 'recharge' ? 'recharge' : 'goods'
}

function syncCollectionTab(nextTab) {
  collectionTab.value = nextTab === 'wishlist' || nextTab === 'stats' ? nextTab : 'goods'
}

const firstTab = computed(() => {
  if (collectionTab.value === 'wishlist') {
    return {
      key: 'collection',
      label: '心愿',
      paths: [
        'M12 20s-6.8-4.3-9.2-8.2C.9 8.7 2 5.1 5.1 3.8c2.2-.9 4.3 0 5.6 1.7 1.3-1.7 3.4-2.6 5.6-1.7 3.1 1.3 4.2 4.9 2.3 8-2.4 3.9-9.2 8.2-9.2 8.2Z'
      ]
    }
  }

  if (collectionTab.value === 'stats') {
    return {
      key: 'collection',
      label: '统计',
      paths: [
        'M6 20V11',
        'M12 20V4',
        'M18 20v-6'
      ]
    }
  }

  return {
    key: 'collection',
    label: '收藏',
    paths: [
      'M4 5h7v7H4z',
      'M13 5h7v7h-7z',
      'M4 13h7v7H4z',
      'M13 13h7v7h-7z'
    ]
  }
})

const tabs = computed(() => [
  firstTab.value,
  {
    key: 'events',
    label: '活动',
    paths: [
      'M12 3v18',
      'M7 8h10',
      'M7 16h10',
      'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z'
    ]
  },
  {
    key: 'recharge',
    label: '充值',
    paths: [
      'M4 7h16',
      'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
      'M9 12h6',
      'M12 9v6'
    ]
  },
  {
    key: 'manage',
    label: '管理',
    paths: [
      'M12 3v4',
      'M12 17v4',
      'M4 12h4',
      'M16 12h4',
      'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z'
    ]
  }
])

const activeTabKey = computed(() => {
  if ((route.path === '/home' && homeMode.value !== 'recharge') || route.path.startsWith('/wishlist') || route.path.startsWith('/leaderboard')) {
    return 'collection'
  }
  if (route.path === '/home' && homeMode.value === 'recharge') return 'recharge'
  if (route.path.startsWith('/events')) return 'events'
  if (route.path.startsWith('/manage')) return 'manage'
  return 'collection'
})

const activeTabIndex = computed(() => {
  const index = tabs.value.findIndex((tab) => tab.key === activeTabKey.value)
  return index >= 0 ? index : 0
})

const tabBarStyle = computed(() => ({
  '--tab-bar-count': tabs.value.length || 1,
  '--tab-bar-index': activeTabIndex.value
}))

function handleHomeModeChange(event) {
  syncHomeMode(event?.detail?.mode)
}

function handleCollectionTabChange(event) {
  syncCollectionTab(event?.detail?.tab)
}

function handleStorage(event) {
  if (event.key === HOME_MODE_STORAGE_KEY) {
    syncHomeMode(event.newValue)
    return
  }

  if (event.key === COLLECTION_TAB_STORAGE_KEY) {
    syncCollectionTab(event.newValue)
  }
}

function persistHomeMode(mode) {
  const normalizedMode = mode === 'recharge' ? 'recharge' : 'goods'
  syncHomeMode(normalizedMode)
  localStorage.setItem(HOME_MODE_STORAGE_KEY, normalizedMode)
  window.dispatchEvent(new CustomEvent(HOME_MODE_EVENT, {
    detail: { mode: normalizedMode }
  }))
}

function isTabActive(key) {
  return activeTabKey.value === key
}

function activateTab(key) {
  if (key === 'collection') {
    if (collectionTab.value === 'wishlist') {
      router.push('/wishlist')
      return
    }

    if (collectionTab.value === 'stats') {
      router.push('/leaderboard/characters')
      return
    }

    persistHomeMode('goods')
    if (route.path !== '/home') router.push('/home')
    return
  }

  if (key === 'recharge') {
    persistHomeMode('recharge')
    if (route.path !== '/home') router.push('/home')
    return
  }

  if (key === 'events') {
    router.push('/events')
    return
  }

  if (key === 'manage') {
    router.push('/manage')
  }
}

onMounted(() => {
  syncHomeMode(localStorage.getItem(HOME_MODE_STORAGE_KEY))
  window.addEventListener(HOME_MODE_EVENT, handleHomeModeChange)
  window.addEventListener(COLLECTION_TAB_EVENT, handleCollectionTabChange)
  window.addEventListener('storage', handleStorage)
})

onBeforeUnmount(() => {
  window.removeEventListener(HOME_MODE_EVENT, handleHomeModeChange)
  window.removeEventListener(COLLECTION_TAB_EVENT, handleCollectionTabChange)
  window.removeEventListener('storage', handleStorage)
})
</script>

<style scoped>
.tab-bar {
  --tab-bar-gap: 6px;
  --tab-bar-pad: 10px;
  --tab-item-height: 56px;
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--tab-bar-gap);
  width: min(calc(100vw - 24px), 430px);
  padding: var(--tab-bar-pad);
  border-radius: var(--radius-large);
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  box-shadow: var(--app-shadow);
  transform: translateX(var(--tab-bar-shift-x, -50%)) translateY(var(--tab-bar-shift-y, 0)) scale(var(--tab-bar-scale, 1));
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease;
}

.tab-bar__indicator {
  position: absolute;
  top: var(--tab-bar-pad);
  left: var(--tab-bar-pad);
  width: calc(
    (100% - (var(--tab-bar-gap) * (var(--tab-bar-count) - 1)) - (var(--tab-bar-pad) * 2))
    / var(--tab-bar-count)
  );
  height: var(--tab-item-height);
  border-radius: 18px;
  background: #141416;
  transform: translateX(calc((100% + var(--tab-bar-gap)) * var(--tab-bar-index)));
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s ease;
  z-index: 0;
  pointer-events: none;
}

.tab-item {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  min-height: var(--tab-item-height);
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: var(--app-text-tertiary);
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.tab-item--active {
  background: transparent;
  color: #ffffff;
}

.tab-item:active {
  transform: scale(0.96);
}

.tab-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tab-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

:global(html.theme-dark) .tab-bar {
  background: var(--app-glass-strong);
  border-color: var(--app-glass-border);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42);
}

:global(html.theme-dark) .tab-item--active {
  background: transparent;
  color: #141416;
}

:global(html.theme-dark) .tab-bar__indicator {
  background: #f5f5f5;
  color: #141416;
}
</style>

<style>
body.selection-active .tab-bar {
  --tab-bar-shift-y: calc(100% + 16px);
  opacity: 0;
  pointer-events: none;
}
</style>
