<!--
  ImportSearchCard.vue
  导入页通用搜索卡：标题区 + 搜索输入行 + 错误提示 + 结果插槽。
  结果列表 / 工具条 / 加载更多等由使用方在默认插槽中渲染。
-->
<template>
  <section class="search-section">
    <div class="search-card">
      <div class="search-head">
        <p class="search-label">{{ label }}</p>
        <h2 class="search-title">{{ title }}</h2>
      </div>

      <div class="search-row">
        <input
          :value="modelValue"
          type="text"
          class="search-input"
          :placeholder="placeholder"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          @input="emit('update:modelValue', $event.target.value)"
          @keydown.enter.prevent="emit('search')"
        />
        <button class="search-btn" type="button" :disabled="searching" @click="emit('search')">
          {{ searching ? t('import.searching') : t('common.search') }}
        </button>
      </div>

      <p v-if="error" class="search-error">{{ error }}</p>

      <slot />
    </div>
  </section>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  searching: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'search'])

const { t } = useI18n()
</script>

<style scoped>
.search-section {
  margin-top: 8px;
}

.search-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.search-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.search-title {
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.search-row {
  display: flex;
  gap: 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  padding: 0 14px;
  outline: none;
}

/* 品牌色可由页面通过 --import-search-btn 定制（默认米游铺红）；
   深色下主色变近白时，页面需配套 --import-search-btn-text 反转文字色 */
.search-btn {
  flex-shrink: 0;
  min-width: 80px;
  min-height: 46px;
  border: none;
  border-radius: var(--radius-small);
  background: var(--import-search-btn, #c7375d);
  color: var(--import-search-btn-text, #ffffff);
  font-size: 14px;
  font-weight: 600;
}

.search-error {
  color: #c74444;
  font-size: 13px;
}

html.theme-dark .search-error {
  color: #ff8080;
}

html.theme-dark .search-input {
  border-color: rgba(255, 255, 255, 0.07);
  background: color-mix(in srgb, var(--app-surface) 92%, var(--app-glass));
}
</style>
