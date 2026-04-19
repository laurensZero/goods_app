<template>
  <div v-if="hasSuggestions" class="tag-suggestion-panel">
    <div class="tag-suggestion-panel__header">
      <span class="tag-suggestion-panel__title">✨ 智能填写建议</span>
      <button class="tag-suggestion-panel__apply-all" @click="applyAll">应用全部</button>
    </div>

    <!-- 类别建议 -->
    <div v-if="suggestions.categorySuggestion" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">分类</span>
        <span class="suggestion-item__value">{{ suggestions.categorySuggestion.value }}</span>
        <span class="suggestion-item__confidence" :class="`confidence--${suggestions.categorySuggestion.confidence}`">
          {{ formatConfidence(suggestions.categorySuggestion.confidence) }}
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn-action" @click="applyField('category', suggestions.categorySuggestion.value)">应用</button>
        <button class="btn-action btn-action--danger" @click="ignoreField('category')">忽略</button>
      </div>
    </div>

    <!-- IP建议 -->
    <div v-if="suggestions.ipSuggestion" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">IP</span>
        <span class="suggestion-item__value">{{ suggestions.ipSuggestion.value }}</span>
        <span class="suggestion-item__confidence" :class="`confidence--${suggestions.ipSuggestion.confidence}`">
          {{ formatConfidence(suggestions.ipSuggestion.confidence) }}
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn-action" @click="applyField('ip', suggestions.ipSuggestion.value)">应用</button>
        <button class="btn-action btn-action--danger" @click="ignoreField('ip')">忽略</button>
      </div>
    </div>

    <!-- 角色建议 -->
    <div v-if="suggestions.characterSuggestions && suggestions.characterSuggestions.length > 0" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">角色</span>
        <span class="suggestion-item__value">
          <span v-for="(char, idx) in suggestions.characterSuggestions" :key="idx" class="tag">
            {{ char.value }}
          </span>
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn-action" @click="applyField('characters', suggestions.characterSuggestions.map(c => c.value))">应用</button>
        <button class="btn-action btn-action--danger" @click="ignoreField('characters')">忽略</button>
      </div>
    </div>

    <!-- 标签建议 -->
    <div v-if="suggestions.tagSuggestions && suggestions.tagSuggestions.length > 0" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">标签</span>
        <span class="suggestion-item__value">
          <span v-for="(tag, idx) in suggestions.tagSuggestions" :key="idx" class="tag">
            {{ tag.value }}
          </span>
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn-action" @click="applyField('tags', suggestions.tagSuggestions.map(t => t.value))">应用</button>
        <button class="btn-action btn-action--danger" @click="ignoreField('tags')">忽略</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  suggestions: {
    type: Object,
    required: true,
    default: () => ({
      categorySuggestion: null,
      ipSuggestion: null,
      characterSuggestions: [],
      tagSuggestions: []
    })
  }
})

const emit = defineEmits(['apply', 'ignore', 'apply-all'])

const hasSuggestions = computed(() => {
  return props.suggestions.categorySuggestion ||
         props.suggestions.ipSuggestion ||
         (props.suggestions.characterSuggestions && props.suggestions.characterSuggestions.length > 0) ||
         (props.suggestions.tagSuggestions && props.suggestions.tagSuggestions.length > 0)
})

const formatConfidence = (level) => {
  const map = {
    'high': '极高',
    'medium': '较好',
    'low': '一般'
  }
  return map[level] || '未知'
}

const applyField = (field, value) => {
  emit('apply', { field, value })
}

const ignoreField = (field) => {
  emit('ignore', { field })
}

const applyAll = () => {
  emit('apply-all')
}
</script>

<style scoped>
.tag-suggestion-panel {
  background: var(--app-surface);
  border-radius: var(--radius-large, 14px);
  padding: 16px;
  margin-top: 16px;
  border: 1px solid var(--app-surface-muted, var(--border-color));
  box-shadow: var(--app-shadow, 0 4px 16px rgba(0, 0, 0, 0.08));
  animation: suggest-slide-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-suggestion-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border, var(--border-color));
}

.tag-suggestion-panel__title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-suggestion-panel__apply-all {
  color: var(--primary-btn-bg, var(--primary-color));
  background: transparent;
  padding: 4px 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--radius-small, 6px);
  transition: opacity 0.2s;
  border: none;
}

.tag-suggestion-panel__apply-all:active {
  opacity: 0.6;
}

.suggestion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.suggestion-item__main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.suggestion-item__label {
  color: var(--text-secondary);
  font-size: 0.85rem;
  width: 40px;
}

.suggestion-item__value {
  font-weight: 500;
  font-size: 0.9rem;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--text-primary);
}

.suggestion-item__confidence {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 12px;
  white-space: nowrap;
  font-weight: 600;
}

.confidence--high { background: color-mix(in srgb, var(--success-color, #34c759) 15%, transparent); color: var(--success-color, #34c759); }
.confidence--medium { background: color-mix(in srgb, var(--warning-color, #ff9500) 15%, transparent); color: var(--warning-color, #ff9500); }
.confidence--low { background: color-mix(in srgb, var(--text-secondary, #8e8e93) 15%, transparent); color: var(--text-secondary, #8e8e93); }

.suggestion-item__actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.btn-action {
  background: var(--app-surface-muted, var(--surface-1));
  color: var(--primary-color);
  border: none;
  border-radius: var(--radius-small, 6px);
  padding: 4px 10px;
  font-size: 0.8rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}

.btn-action:active {
  transform: scale(0.95);
  opacity: 0.7;
}

.btn-action--danger {
  color: var(--text-secondary);
}

/* 标签样式 */
.tag {
  background: var(--app-surface-muted, var(--surface-1));
  padding: 3px 10px;
  border-radius: var(--radius-small, 6px);
  font-size: 0.8rem;
  color: var(--text-primary);
}

@keyframes suggest-slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
