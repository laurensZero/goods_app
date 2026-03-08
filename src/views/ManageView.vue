<template>
  <div class="page manage-page">
    <header class="manage-header">
      <h1 class="manage-title">管理</h1>
    </header>

    <main class="page-body">
      <section class="hub-section">
        <RouterLink class="entry-card" to="/manage/categories">
          <span class="entry-icon cat-icon">◈</span>
          <div class="entry-body">
            <p class="entry-kicker">预设 · 分类</p>
            <h2 class="entry-name">分类管理</h2>
            <p class="entry-desc">管理收藏分类标签</p>
            <p class="entry-count">{{ presets.categories.length }} 项</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </RouterLink>

        <RouterLink class="entry-card" to="/manage/ips">
          <span class="entry-icon ip-icon">✦</span>
          <div class="entry-body">
            <p class="entry-kicker">预设 · 作品</p>
            <h2 class="entry-name">IP 管理</h2>
            <p class="entry-desc">管理所属 IP / 作品名称</p>
            <p class="entry-count">{{ presets.ips.length }} 项</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </RouterLink>

        <RouterLink class="entry-card" to="/manage/characters">
          <span class="entry-icon char-icon">◎</span>
          <div class="entry-body">
            <p class="entry-kicker">预设 · 角色</p>
            <h2 class="entry-name">角色名管理</h2>
            <p class="entry-desc">管理谷子关联的角色名</p>
            <p class="entry-count">{{ presets.characters.length }} 项</p>
          </div>
          <svg class="entry-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </RouterLink>
      </section>
    </main>
  </div>
</template>

<script setup>
import { usePresetsStore } from '@/stores/presets'
const presets = usePresetsStore()
</script>

<style scoped>
.manage-page {
  background: var(--app-bg);
  min-height: 100dvh;
}

.manage-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 56px var(--page-padding) 12px;
  background: rgba(245, 245, 247, 0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.manage-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--app-text);
  margin: 0;
}

.page-body {
  padding: var(--section-gap) var(--page-padding) 120px;
}

.hub-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entry-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--app-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--app-shadow);
  text-decoration: none;
  color: var(--app-text);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.entry-card:active {
  transform: scale(0.97);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.entry-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.cat-icon  { background: rgba(90, 120, 250, 0.12); color: #5a78fa; }
.ip-icon   { background: rgba(250, 149, 90, 0.12); color: #fa9040; }
.char-icon { background: rgba(50, 200, 140, 0.12); color: #28c880; }

.entry-body {
  flex: 1;
  min-width: 0;
}

.entry-kicker {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: var(--app-text-tertiary);
  margin: 0 0 2px;
  text-transform: uppercase;
}

.entry-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 2px;
  color: var(--app-text);
}

.entry-desc {
  font-size: 13px;
  color: var(--app-text-tertiary);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-count {
  font-size: 12px;
  font-weight: 500;
  color: #5a78fa;
  margin: 0;
}

.entry-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
