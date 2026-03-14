<template>
  <nav class="tab-bar">
    <RouterLink to="/home" class="tab-item" active-class="tab-item--active">
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="7" height="7" rx="2" />
        <rect x="13" y="5" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </svg>
      <span class="tab-label">收藏</span>
    </RouterLink>

    <RouterLink to="/wishlist" class="tab-item" active-class="tab-item--active">
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20s-6.8-4.3-9.2-8.2C.9 8.7 2 5.1 5.1 3.8c2.2-.9 4.3 0 5.6 1.7 1.3-1.7 3.4-2.6 5.6-1.7 3.1 1.3 4.2 4.9 2.3 8-2.4 3.9-9.2 8.2-9.2 8.2Z" />
      </svg>
      <span class="tab-label">心愿</span>
    </RouterLink>

    <RouterLink to="/leaderboard/characters" class="tab-item" active-class="tab-item--active">
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 20V11" />
        <path d="M12 20V4" />
        <path d="M18 20v-6" />
      </svg>
      <span class="tab-label">排行</span>
    </RouterLink>

    <RouterLink to="/manage" class="tab-item" active-class="tab-item--active">
      <svg class="tab-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
        <path d="M12 7h9" />
        <path d="M3 17h8" />
        <path d="M3 7H6" />
        <path d="M18 17h3" />
      </svg>
      <span class="tab-label">管理</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tab-bar {
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: min(calc(100vw - 24px), 430px);
  padding: 10px;
  border-radius: var(--radius-large);
  background: var(--app-glass-strong);
  border: 1px solid var(--app-glass-border);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  box-shadow: var(--app-shadow);
  transform: translateX(var(--tab-bar-shift-x, -50%)) translateY(var(--tab-bar-shift-y, 0)) scale(var(--tab-bar-scale, 1));
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease;
}

.tab-item {
  display: flex;
  width: 100%;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 18px;
  color: var(--app-text-tertiary);
  text-decoration: none;
  transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.tab-item--active {
  background: #141416;
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

@media (prefers-color-scheme: dark) {
  .tab-bar {
    background: var(--app-glass-strong);
    border-color: var(--app-glass-border);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42);
  }

  .tab-item--active {
    background: #f5f5f5;
    color: #141416;
  }
}
</style>

<style>
body.selection-active .tab-bar {
  --tab-bar-shift-y: calc(100% + 16px);
  opacity: 0;
  pointer-events: none;
}
</style>
