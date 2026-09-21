<template>
  <button
    v-if="label || accountsCount > 0"
    type="button"
    class="nav-account-btn"
    :aria-label="label || $t('checkout.pickAccount')"
    @click="$emit('click')"
  >
    <img
      v-if="avatar"
      :src="avatar"
      :alt="label"
      class="nav-account-btn__avatar"
    />
    <span v-else class="nav-account-btn__fallback">{{ (label || '?').charAt(0) }}</span>
    <span class="nav-account-btn__label">{{ label || $t('import.accountManager') }}</span>
  </button>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  avatar: { type: String, default: '' },
  accountsCount: { type: Number, default: 0 },
})
defineEmits(['click'])
</script>

<style scoped>
.nav-account-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 132px;
  margin-right: 2px;
  padding: 4px 8px 4px 4px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  cursor: pointer;
}

.nav-account-btn:active {
  transform: scale(0.97);
}

.nav-account-btn__avatar,
.nav-account-btn__fallback {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.nav-account-btn__fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(90, 120, 250, 0.16);
  color: #4c7dff;
  font-size: 12px;
  font-weight: 700;
}

.nav-account-btn__label {
  min-width: 0;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}
</style>
