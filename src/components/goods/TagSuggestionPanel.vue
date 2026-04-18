<template>
  <div v-if="hasSuggestions" class="tag-suggestion-panel">
    <div class="tag-suggestion-panel__header">
      <span class="tag-suggestion-panel__title">✨ 智能填写建议</span>
      <div class="tag-suggestion-panel__actions">
        <button class="btn btn--text btn--small tag-suggestion-panel__apply-all" @click="applyAll">应用全部</button>
      </div>
    </div>

    <!-- 类别建议 -->
    <div v-if="suggestions.categorySuggestion" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">分类:</span>
        <span class="suggestion-item__value">{{ suggestions.categorySuggestion.value }}</span>
        <span class="suggestion-item__confidence" :class="`confidence--${suggestions.categorySuggestion.confidence}`">
          {{ formatConfidence(suggestions.categorySuggestion.confidence) }}
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn btn--icon btn--small" @click="applyField('category', suggestions.categorySuggestion.value)" title="应用">➕</button>
        <button class="btn btn--icon btn--small btn--danger" @click="ignoreField('category')" title="忽略">❌</button>
      </div>
    </div>

    <!-- IP建议 -->
    <div v-if="suggestions.ipSuggestion" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">IP:</span>
        <span class="suggestion-item__value">{{ suggestions.ipSuggestion.value }}</span>
        <span class="suggestion-item__confidence" :class="`confidence--${suggestions.ipSuggestion.confidence}`">
          {{ formatConfidence(suggestions.ipSuggestion.confidence) }}
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn btn--icon btn--small" @click="applyField('ip', suggestions.ipSuggestion.value)" title="应用">➕</button>
        <button class="btn btn--icon btn--small btn--danger" @click="ignoreField('ip')" title="忽略">❌</button>
      </div>
    </div>

    <!-- 角色建议 -->
    <div v-if="suggestions.characterSuggestions && suggestions.characterSuggestions.length > 0" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">角色:</span>
        <span class="suggestion-item__value">
          <span v-for="(char, idx) in suggestions.characterSuggestions" :key="idx" class="tag">
            {{ char.value }}
          </span>
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn btn--icon btn--small" @click="applyField('characters', suggestions.characterSuggestions.map(c => c.value))" title="应用">➕</button>
        <button class="btn btn--icon btn--small btn--danger" @click="ignoreField('characters')" title="忽略">❌</button>
      </div>
    </div>

    <!-- 标签建议 -->
    <div v-if="suggestions.tagSuggestions && suggestions.tagSuggestions.length > 0" class="suggestion-item">
      <div class="suggestion-item__main">
        <span class="suggestion-item__label">标签:</span>
        <span class="suggestion-item__value">
          <span v-for="(tag, idx) in suggestions.tagSuggestions" :key="idx" class="tag">
            {{ tag.value }}
          </span>
        </span>
      </div>
      <div class="suggestion-item__actions">
        <button class="btn btn--icon btn--small" @click="applyField('tags', suggestions.tagSuggestions.map(t => t.value))" title="应用">➕</button>
        <button class="btn btn--icon btn--small btn--danger" @click="ignoreField('tags')" title="忽略">❌</button>
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
  background: var(--surface-2);
  border-radius: 12px;
  padding: 12px;
  margin-top: 16px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  animation: slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.tag-suggestion-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  border-bottom: 1px dashed var(--border-color);
  padding-bottom: 8px;
}

.tag-suggestion-panel__title {
  font-weight: 600;
  color: var(--primary-color);
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-suggestion-panel__apply-all {
  color: var(--primary-color);
  background: var(--primary-color-alpha);
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.85rem;
  cursor: pointer;
}

.suggestion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--surface-1);
}

.suggestion-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
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
  font-size: 0.9rem;
  width: 40px;
}

.suggestion-item__value {
  font-weight: 500;
  font-size: 0.9rem;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.suggestion-item__confidence {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.confidence--high { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.confidence--medium { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.confidence--low { background: rgba(142, 142, 147, 0.1); color: #8e8e93; }

.suggestion-item__actions {
  display: flex;
  gap: 8px;
  margin-left: 12px;
}

.btn--icon {
  background: var(--surface-1);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn--icon:hover {
  background: var(--border-color);
}

.btn--danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

/* 标签样式 */
.tag {
  background: var(--surface-1);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-primary);
}

@keyframes slideInDown {
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
