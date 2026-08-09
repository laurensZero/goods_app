<template>
  <article class="sku-picker-card">
    <div class="sku-picker-card__head">
      <span class="sku-picker-thumb">
        <img v-if="entry.coverUrl" :src="entry.coverUrl" class="sku-picker-thumb-img" alt="" loading="lazy" />
        <span v-else class="sku-picker-thumb-fallback">{{ (entry.name || '谷').charAt(0) }}</span>
      </span>
      <div class="sku-picker-copy">
        <p class="sku-picker-label">{{ t('mihoyoStock.selectSku') }}</p>
        <h3 class="sku-picker-title">{{ entry.name }}</h3>
        <p v-if="entry.skuName" class="sku-picker-match">{{ entry.skuName }}</p>
      </div>
      <span v-if="counter" class="sku-picker-counter">{{ counter }}</span>
      <button
        v-if="showRemove"
        type="button"
        class="sku-picker-remove"
        :aria-label="t('mihoyoStock.remove')"
        @click="$emit('remove')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div v-if="entry.loading || !entry.variantsLoaded" class="sku-picker-loading">
      <span class="spinner" />
      <span>{{ t('common.loading') }}</span>
    </div>

    <template v-else>
      <!-- 自动选中后收起款式列表，明确提示选中的款式 + 修改入口（SKU 过多过长时可展开） -->
      <div v-if="!entry.expanded && entry.skuKey !== '' && entry.skuName" class="sku-collapsed">
        <span class="sku-collapsed__text">{{ t('mihoyoStock.skuAutoSelectedName', { name: entry.skuName }) }}</span>
        <button type="button" class="sku-collapsed__edit" @click="$emit('expand')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>{{ t('mihoyoStock.modifySku') }}</span>
        </button>
      </div>

      <div v-if="entry.expanded" class="sku-picker">
        <button
          type="button"
          class="sku-whole"
          :class="{ 'sku-whole--selected': entry.skuKey === '' }"
          @click="$emit('select-whole')"
        >
          {{ t('mihoyoStock.wholeGoods') }}
        </button>

        <div v-if="entry.variants.length > 0" class="sku-chips" :class="{ 'sku-chips--tablet': isTablet }">
          <button
            v-for="v in entry.variants"
            :key="v.key"
            type="button"
            class="sku-chip"
            :class="{ 'sku-chip--selected': entry.skuKey === v.key }"
            @click="$emit('select-sku', v)"
          >
            {{ v.text }}
          </button>
        </div>
      </div>

      <p v-if="entry.error" class="sku-picker-error">{{ entry.error }}</p>
    </template>
  </article>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'MihoyoSkuPickerCard' })

defineProps({
  entry: { type: Object, required: true },
  isTablet: { type: Boolean, default: false },
  showRemove: { type: Boolean, default: false },
  counter: { type: String, default: '' },
})

defineEmits(['select-sku', 'select-whole', 'expand', 'remove'])

const { t } = useI18n()
</script>

<style scoped>
.sku-picker-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sku-picker-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 18px;
}

.sku-picker-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sku-picker-thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.sku-picker-copy {
  flex: 1;
  min-width: 0;
}

.sku-picker-label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.sku-picker-title {
  margin-top: 3px;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.sku-picker-match {
  margin-top: 3px;
  color: var(--app-chip-accent-text);
  font-size: 12px;
}

.sku-picker-counter {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.sku-picker-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.sku-picker-remove svg {
  width: 15px;
  height: 15px;
  stroke: currentColor;
}

.sku-picker-remove:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: #ff3b30;
}

.sku-picker-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

/* 加载指示（span 形式的小转圈；@keyframes spin 为全局定义） */
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  flex-shrink: 0;
}

.sku-collapsed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-surface-soft);
}

.sku-collapsed__text {
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.sku-collapsed__edit {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-chip-accent-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.sku-collapsed__edit svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
}

.sku-picker {
  margin-top: 14px;
}

.sku-whole {
  width: 100%;
  padding: 10px 12px;
  border: 1px dashed var(--app-border);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}

.sku-whole--selected {
  border-style: solid;
  border-color: var(--app-chip-accent-text);
  background: color-mix(in srgb, var(--app-chip-accent-text) 12%, var(--app-surface-soft));
  color: var(--app-chip-accent-text);
}

.sku-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.sku-chip {
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.3;
  cursor: pointer;
}

.sku-chip--selected {
  border-color: var(--app-chip-accent-text);
  background: color-mix(in srgb, var(--app-chip-accent-text) 12%, var(--app-surface-soft));
  color: var(--app-chip-accent-text);
  font-weight: 600;
}

/* 平板：款式改为双栏卡片排列，方便核对/点选（长文案换行不截断） */
.sku-chips--tablet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sku-chips--tablet .sku-chip {
  text-align: left;
  white-space: normal;
}

.sku-picker-error {
  margin-top: 8px;
  color: #ff3b30;
  font-size: 12px;
  line-height: 1.4;
}
</style>
