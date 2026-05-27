<template>
  <div class="language-switcher">
    <button
      v-for="locale in localeOptions"
      :key="locale.value"
      type="button"
      :class="['lang-option', { 'lang-option--active': currentLocale === locale.value }]"
      @click="switchLocale(locale.value)"
    >
      <span class="lang-option__label">{{ locale.label }}</span>
      <span class="lang-option__check" v-if="currentLocale === locale.value">✓</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale, SUPPORTED_LOCALES } from '@/locales'

const { locale } = useI18n()

const currentLocale = computed(() => locale.value)

const localeOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' }
]

async function switchLocale(newLocale) {
  if (newLocale === currentLocale.value) return
  await setLocale(newLocale)
}
</script>

<style scoped>
.language-switcher {
  display: flex;
  gap: 8px;
}

.lang-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--app-glass-border);
  border-radius: 14px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}

.lang-option--active {
  background: var(--app-text);
  color: var(--app-surface);
  border-color: var(--app-text);
}

.lang-option__check {
  font-weight: 700;
}
</style>
