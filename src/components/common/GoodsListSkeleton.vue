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
      </div>
    </div>
  </div>
</template>

<style scoped>
.goods-list-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: var(--card-gap, 12px);
  padding: 16px var(--page-padding, 16px);
}

.skeleton-card {
  background: color-mix(in srgb, var(--app-surface, #fff) 80%, transparent);
  border-radius: var(--radius-card, 18px);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
}

.skeleton-cover {
  width: 100%;
  aspect-ratio: 1;
  background: var(--app-surface-soft, #f0f3fa);
}

.skeleton-body {
  padding: 10px 12px 14px;
}

.skeleton-line {
  height: 14px;
  background: var(--app-surface-soft, #f0f3fa);
  border-radius: 6px;
}

.skeleton-title {
  width: 70%;
  margin-bottom: 8px;
}

.skeleton-meta {
  display: flex;
  gap: 6px;
}

.skeleton-tag {
  height: 18px;
  width: 36px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft, #f0f3fa) 60%, transparent);
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
