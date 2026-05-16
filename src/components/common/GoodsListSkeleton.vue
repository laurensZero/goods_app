<template>
  <div class="goods-list-skeleton">
    <div v-for="i in 8" :key="i" class="skeleton-card">
      <div class="skeleton-cover skeleton-pulse" />
      <div class="skeleton-body">
        <div class="skeleton-line skeleton-title skeleton-pulse" />
        <div class="skeleton-meta">
          <div class="skeleton-tag skeleton-pulse" />
          <div class="skeleton-tag skeleton-pulse" />
        </div>
        <div class="skeleton-bottom">
          <div class="skeleton-price skeleton-pulse" />
          <div class="skeleton-days skeleton-pulse" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.goods-list-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: var(--card-gap, 12px);
  padding: 0 var(--page-padding, 16px);
}

.skeleton-card {
  background: color-mix(in srgb, var(--app-surface, #fff) 80%, transparent);
  border-radius: var(--radius-card, 18px);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 12px;
  height: 100%;
}

.skeleton-cover {
  width: 100%;
  aspect-ratio: 1;
  background: var(--app-surface-soft, #f0f3fa);
}

.skeleton-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.skeleton-line {
  height: 14px;
  background: var(--app-surface-soft, #f0f3fa);
  border-radius: 6px;
}

.skeleton-title {
  width: 70%;
  min-height: 2.6em;
}

.skeleton-meta {
  display: flex;
  gap: 6px;
  min-height: 28px;
}

.skeleton-tag {
  height: 18px;
  width: 36px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft, #f0f3fa) 60%, transparent);
}

.skeleton-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  margin-top: auto;
}

.skeleton-price {
  width: 42%;
  height: 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft, #f0f3fa) 70%, transparent);
}

.skeleton-days {
  width: 24%;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft, #f0f3fa) 58%, transparent);
}

.skeleton-pulse {
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.5;
  }
}

:global(html.theme-dark) .skeleton-card {
  background: var(--app-surface);
  box-shadow: none;
}

:global(html.theme-dark) .skeleton-title,
:global(html.theme-dark) .skeleton-cover,
:global(html.theme-dark) .skeleton-tag {
  background: var(--app-surface-muted, #1a202c);
}
</style>
