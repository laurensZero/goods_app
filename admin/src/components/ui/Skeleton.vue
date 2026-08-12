<script setup>
/**
 * 通用骨架屏。
 *
 * metrics:
 *  - rows        骨架块数量
 *  - rowsPerItem 每个块内条数
 *  - variant     list 列表行 / card 卡片 / meta 键值行 / form 表单项
 */
defineProps({
  variant: { type: String, default: 'list' },
  count: { type: Number, default: 4 },
  rows: { type: Number, default: 2 }
})

function titleW(n) {
  return `${32 + ((n * 13) % 16)}%`
}

function metaW(n) {
  return `${54 + ((n * 11) % 30)}%`
}

function valueW(n) {
  return `${58 + ((n * 9) % 30)}%`
}
</script>

<template>
  <div class="skel" :class="`skel--${variant}`" aria-hidden="true">
    <!-- 列表行 -->
    <div v-if="variant === 'list'" class="skel-list">
      <div v-for="n in count" :key="n" class="skel-row">
        <div class="skel-row-main">
          <div class="skel-bar" :style="{ width: titleW(n) }"></div>
          <div v-if="rows > 1" class="skel-bar" :style="{ width: metaW(n) }"></div>
        </div>
        <div class="skel-pill"></div>
      </div>
    </div>

    <!-- 卡片 -->
    <div v-else-if="variant === 'card'" class="skel-list">
      <div v-for="n in count" :key="n" class="skel-card">
        <div class="skel-row">
          <div class="skel-bar" :style="{ width: '32%' }"></div>
          <div class="skel-pill"></div>
        </div>
        <div class="skel-bar" style="width: 100%"></div>
        <div class="skel-bar" :style="{ width: valueW(n) }"></div>
        <div class="skel-bar" :style="{ width: metaW(n) }"></div>
      </div>
    </div>

    <!-- 键值行（dt/dd） -->
    <div v-else-if="variant === 'meta'" class="skel-meta">
      <div v-for="n in count" :key="n" class="skel-meta-row">
        <div class="skel-bar skel-label"></div>
        <div class="skel-bar" :style="{ width: valueW(n) }"></div>
      </div>
    </div>

    <!-- 表单 -->
    <div v-else class="skel-form">
      <div v-for="n in count" :key="n" class="skel-field">
        <div class="skel-bar skel-label" :style="{ width: titleW(n * 2) }"></div>
        <div class="skel-box"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skel {
  display: grid;
  gap: 8px;
  animation: skel-pulse 1.6s ease-in-out infinite;
}

.skel-list,
.skel-meta,
.skel-form {
  display: grid;
  gap: 8px;
}

/* ── 基础条 ── */
.skel-bar {
  height: 13px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  max-width: 100%;
}

.skel-label {
  width: 72px;
  height: 11px;
  flex-shrink: 0;
}

.skel-pill {
  width: 52px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  flex-shrink: 0;
}

.skel-box {
  height: var(--input-height);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  border: 1px solid var(--app-border);
}

/* ── 列表行（对齐 .list-item）── */
.skel-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.skel-row-main {
  display: grid;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

/* ── 卡片 ── */
.skel-card {
  display: grid;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
}

/* ── 键值行 ── */
.skel-meta-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* ── 表单 ── */
.skel-field {
  display: grid;
  gap: 6px;
}

@keyframes skel-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skel {
    animation: none;
  }
}
</style>