<template>
  <article class="sku-picker-card">
    <div class="sku-picker-card__head">
      <span class="sku-picker-thumb" :class="{ 'sku-picker-thumb--large': props.largeThumb }">
        <img v-if="displayCover" :src="displayCover" class="sku-picker-thumb-img" alt="" loading="lazy" />
        <span v-else class="sku-picker-thumb-fallback">{{ (entry.name || '谷').charAt(0) }}</span>
      </span>
      <div class="sku-picker-copy">
        <p class="sku-picker-label">{{ props.label || t('mihoyoStock.selectSku') }}</p>
        <h3 class="sku-picker-title">{{ entry.name }}</h3>
        <p v-if="selectedSkus.length > 0" class="sku-picker-match">{{ selectionSummary }}</p>
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
      <!-- 收起状态：明确提示当前款式 + 修改（展开）入口 -->
      <div v-if="!entry.expanded" class="sku-collapsed">
        <span class="sku-collapsed__text">{{ selectionSummary }}</span>
        <button type="button" class="sku-collapsed__edit" @click="$emit('expand')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>{{ t('mihoyoStock.modifySku') }}</span>
        </button>
      </div>

      <div v-if="entry.expanded" class="sku-picker">
        <div class="sku-picker__toolbar">
          <span class="sku-picker__hint">{{ props.multiSelect ? t('mihoyoStock.skuMultiSelectHint') : t('import.skuSingleSelectHint') }}</span>
          <button type="button" class="sku-picker__collapse" @click="$emit('collapse')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 15 12 9 18 15" />
            </svg>
            <span>{{ t('mihoyoStock.collapse') }}</span>
          </button>
        </div>

        <button
          v-if="props.showWhole"
          type="button"
          class="sku-whole"
          :class="{ 'sku-whole--selected': selectedSkus.length === 0 }"
          @click="$emit('select-whole')"
        >
          {{ t('mihoyoStock.wholeGoods') }}
        </button>

        <div v-if="entry.variants.length > 0" class="sku-cards" :class="{ 'sku-cards--tablet': isTablet }">
          <button
            v-for="v in entry.variants"
            :key="v.key"
            type="button"
            class="sku-card"
            :class="{ 'sku-card--selected': isSkuSelected(v.key) }"
            @click="$emit('select-sku', v)"
          >
            <span class="sku-card__img-wrap">
              <img v-if="v.cover_url" :src="v.cover_url" :alt="v.text" class="sku-card__img" loading="lazy" />
              <span v-else class="sku-card__fallback">{{ (v.text || '款').charAt(0) }}</span>
            </span>
            <span class="sku-card__text">{{ v.text }}</span>
            <span v-if="isSkuSelected(v.key)" class="sku-card__check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <p v-if="entry.error" class="sku-picker-error">{{ entry.error }}</p>
      <button
        v-if="entry.variantLoadFailed"
        type="button"
        class="sku-picker-retry"
        @click="$emit('retry')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
        <span>{{ t('mihoyoStock.retry') }}</span>
      </button>
    </template>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'MihoyoSkuPickerCard' })

const props = defineProps({
  entry: { type: Object, required: true },
  isTablet: { type: Boolean, default: false },
  showRemove: { type: Boolean, default: false },
  counter: { type: String, default: '' },
  // 顶部提示文案（监控页=选择要监控的款式；导入页=选择款式）
  label: { type: String, default: '' },
  // 是否多选款式（有货监控多选；导入页单选）
  multiSelect: { type: Boolean, default: true },
  // 导入页要求明确选择 SKU；有货监控仍保留「整件商品」
  showWhole: { type: Boolean, default: true },
  // 是否放大顶部款式图（导入队列里让选中的款式图更醒目；有货监控保持原尺寸）
  largeThumb: { type: Boolean, default: false },
})

defineEmits(['select-sku', 'select-whole', 'expand', 'collapse', 'remove', 'retry'])

const { t } = useI18n()

// 多选款式：selectedSkus = [{ key, text, cover_url }]，空数组 = 整件商品
const selectedSkus = computed(() => props.entry?.selectedSkus || [])
const isSkuSelected = (key) => selectedSkus.value.some((s) => s.key === key)

// 摘要文案：整件 / 单款式 / 多款式（已选 N 款）
const selectionSummary = computed(() => {
  const list = selectedSkus.value
  if (list.length === 0) return t('mihoyoStock.wholeGoods')
  if (list.length === 1) return t('mihoyoStock.skuAutoSelectedName', { name: list[0].text || list[0].key })
  return t('mihoyoStock.skuSelectedCount', { count: list.length })
})

// 封面：仅选中单个款式时展示该款式的专属封面（角色立牌等），未选/多选时回退商品封面
const displayCover = computed(() => {
  const list = selectedSkus.value
  if (list.length === 1 && list[0].cover_url) return list[0].cover_url
  return props.entry?.coverUrl || ''
})
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

/* 导入队列：放大选中的款式图 */
.sku-picker-thumb--large {
  width: 80px;
  height: 80px;
  border-radius: 14px;
  font-size: 24px;
  box-shadow: 0 0 0 1px var(--app-border);
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

.sku-picker__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.sku-picker__hint {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.sku-picker__collapse {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.sku-picker__collapse svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
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

/* 款式选择：带图的款式卡片网格（导入与有货监控共用） */
.sku-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.sku-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}

.sku-card:active {
  transform: scale(0.96);
}

.sku-card--selected {
  border-color: var(--app-chip-accent-text);
  background: color-mix(in srgb, var(--app-chip-accent-text) 12%, var(--app-surface-soft));
}

.sku-card__img-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--app-surface);
  color: var(--app-text-tertiary);
  font-size: 20px;
}

.sku-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sku-card__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.sku-card__text {
  min-height: 32px;
  font-size: 12px;
  line-height: 1.3;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sku-card--selected .sku-card__text {
  color: var(--app-chip-accent-text);
  font-weight: 600;
}

.sku-card__check {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--app-chip-accent-text);
  color: #fff;
}

.sku-card__check svg {
  width: 10px;
  height: 10px;
  stroke: currentColor;
}

/* 平板：双栏更宽卡片，方便核对/点选 */
.sku-cards--tablet {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sku-picker-error {
  margin-top: 8px;
  color: #ff3b30;
  font-size: 12px;
  line-height: 1.4;
}

.sku-picker-retry {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  padding: 7px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-soft);
  color: var(--app-chip-accent-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.sku-picker-retry svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
}
</style>
