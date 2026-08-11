<script setup>
import AppIcon from '../ui/AppIcon.vue'

defineProps({
  isDark: { type: Boolean, default: false },
  activeSection: { type: Object, required: true }
})

defineEmits(['toggle-theme'])
</script>

<template>
  <header class="card admin-header">
    <div class="admin-header__inner">
      <div>
        <p class="card-kicker">Dashboard</p>
        <h1 class="card-title">Goods APP 管理台</h1>
        <p class="card-desc">
          
        </p>
      </div>

      <button
        class="icon-btn"
        type="button"
        :aria-label="isDark ? '切换到浅色' : '切换到深色'"
        :title="isDark ? '切换到浅色' : '切换到深色'"
        @click="$emit('toggle-theme')"
      >
        <AppIcon :name="isDark ? 'sun' : 'moon'" :size="16" />
      </button>
    </div>

    <div class="admin-header__chips">
      <span class="chip">当前分区：{{ activeSection.label }}</span>
      <span class="chip chip--accent">{{ activeSection.short }}</span>
    </div>

    <p class="tip tip--warn admin-header__note">
      <strong>安全提示：</strong>管理凭据由管理员登录接口下发，仅保存在本机浏览器 localStorage。请勿在公共设备上使用。
    </p>
  </header>
</template>

<style scoped>
.admin-header {
  gap: 12px;
}

.admin-header__inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.admin-header__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  border: 1px solid var(--app-border);
}

.chip--accent {
  color: var(--app-text);
  font-weight: 500;
}

.admin-header__note {
  margin-top: 2px;
}
</style>