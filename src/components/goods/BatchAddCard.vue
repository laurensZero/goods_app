<template>
  <div class="batch-card">
    <div class="batch-card__image">
      <img v-if="card.imageUri" :src="card.imageUri" class="batch-card__img" />
      <span v-else class="batch-card__placeholder">?</span>
      <button class="batch-card__swap" type="button" @click.stop="$emit('swap')">更换</button>
      <button class="batch-card__delete" type="button" @click.stop="$emit('remove')">&times;</button>
    </div>

    <div class="batch-card__fields">
      <label class="field">
        <span class="field-label">名称 <span class="required">*</span></span>
        <input
          :value="card.name"
          type="text"
          placeholder="例如：甘雨手办"
          @input="updateField('name', $event)"
          @blur="markDirty('name')"
        />
      </label>

      <div class="field-row">
        <label class="field field-row__item">
          <span class="field-label">IP</span>
          <AppSelect
            :model-value="card.ip"
            :options="ipOptions"
            placeholder="选择 IP"
            @update:model-value="updateSelect('ip', $event)"
          />
        </label>
        <label class="field field-row__item">
          <span class="field-label">分类</span>
          <AppSelect
            :model-value="card.category"
            :options="categoryOptions"
            placeholder="选择分类"
            @update:model-value="updateSelect('category', $event)"
          />
        </label>
      </div>

      <div class="field-row">
        <label class="field field-row__item">
          <span class="field-label">角色</span>
          <input
            :value="card.charactersText"
            type="text"
            placeholder="逗号分隔"
            @input="updateField('charactersText', $event)"
            @blur="markDirty('charactersText')"
          />
        </label>
        <label class="field field-row__item">
          <span class="field-label">价格</span>
          <input
            :value="card.price"
            type="text"
            inputmode="decimal"
            placeholder="0.00"
            @input="updateField('price', $event)"
            @blur="markDirty('price')"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import AppSelect from '@/components/common/AppSelect.vue'

defineProps({
  card: { type: Object, required: true },
  ipOptions: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] }
})

const emit = defineEmits(['update', 'mark-dirty', 'swap', 'remove'])

function updateField(field, event) {
  emit('update', { field, value: event.target.value })
}

function updateSelect(field, value) {
  emit('update', { field, value })
  emit('mark-dirty', field)
}

function markDirty(field) {
  emit('mark-dirty', field)
}
</script>

<style scoped>
.batch-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card, 18px);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.batch-card__image {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 14px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.batch-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.batch-card__placeholder {
  font-size: 28px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.batch-card__swap {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: color-mix(in srgb, var(--app-surface) 85%, transparent);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
  cursor: pointer;
  transition: transform 0.16s ease;
}

.batch-card__swap:active {
  transform: scale(0.94);
}

.batch-card__delete {
  position: absolute;
  top: 6px;
  right: 6px;
  background: color-mix(in srgb, var(--app-surface) 85%, transparent);
  border: 1px solid var(--app-border);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--app-text-secondary);
  cursor: pointer;
  line-height: 1;
  transition: transform 0.16s ease;
}

.batch-card__delete:active {
  transform: scale(0.9);
}

.batch-card__fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-row {
  display: flex;
  gap: 8px;
}

.field-row__item {
  flex: 1;
  min-width: 0;
}

.field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-small, 14px);
  background: var(--app-surface-soft);
}

.field-label {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 600;
}

.required {
  color: #c74444;
}

.field input {
  width: 100%;
  height: 36px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  padding: 0 12px;
  outline: none;
  transition: border-color 0.16s ease, background 0.16s ease;
  box-sizing: border-box;
}

.field input::placeholder {
  color: var(--app-placeholder, rgba(142, 142, 147, 0.6));
}

.field input:focus {
  border-color: color-mix(in srgb, var(--app-text) 16%, transparent);
  background: var(--app-surface);
}

/* AppSelect inside field - compact variant */
.field :deep(.app-select__trigger) {
  height: 36px;
  border-radius: 10px;
  border-color: transparent;
  background: var(--app-surface);
  font-size: 14px;
  padding: 0 10px;
}

.field :deep(.app-select__value) {
  font-size: 14px;
}

:global(html.theme-dark) .batch-card {
  background: color-mix(in srgb, var(--app-glass-strong) 94%, var(--app-surface));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

:global(html.theme-dark) .field {
  background: color-mix(in srgb, var(--app-surface) 60%, var(--app-glass));
}

:global(html.theme-dark) .field input {
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass));
}

:global(html.theme-dark) .batch-card__swap,
:global(html.theme-dark) .batch-card__delete {
  background: color-mix(in srgb, var(--app-surface) 80%, transparent);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--app-text);
}

:global(html.theme-dark) .field :deep(.app-select__trigger) {
  background: color-mix(in srgb, var(--app-surface) 94%, var(--app-glass)) !important;
}
</style>
