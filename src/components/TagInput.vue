<template>
  <div class="tag-input">
    <div class="tag-list" :class="{ 'tag-list--empty': modelValue.length === 0 }">
      <span v-for="tag in modelValue" :key="tag" class="tag-chip">
        {{ tag }}
        <button
          class="tag-chip__remove"
          type="button"
          :aria-label="`移除标签 ${tag}`"
          @click="removeTag(tag)"
        >
          ×
        </button>
      </span>

      <input
        v-model="draft"
        class="tag-input__field"
        type="text"
        :placeholder="modelValue.length === 0 ? placeholder : ''"
        @keydown.enter.prevent="commitDraft"
        @keydown="handleKeydown"
        @blur="commitDraft"
      />
    </div>

    <p class="tag-input__hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: '输入标签后回车'
  },
  hint: {
    type: String,
    default: '按回车或英文逗号添加，可添加多个标签'
  }
})

const emit = defineEmits(['update:modelValue'])

const draft = ref('')

watch(
  () => props.modelValue,
  (value) => {
    if (!Array.isArray(value)) {
      emit('update:modelValue', [])
    }
  },
  { immediate: true }
)

function normalizeTag(tag) {
  return String(tag || '').replace(/[,，]+$/g, '').trim()
}

function commitDraft() {
  const nextTag = normalizeTag(draft.value)
  draft.value = ''
  if (!nextTag) return
  if (props.modelValue.includes(nextTag)) return
  emit('update:modelValue', [...props.modelValue, nextTag])
}

function handleKeydown(event) {
  if (event.key !== ',' && event.key !== '，') return
  event.preventDefault()
  commitDraft()
}

function removeTag(tag) {
  emit('update:modelValue', props.modelValue.filter((item) => item !== tag))
}
</script>

<style scoped>
.tag-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: var(--input-height);
  padding: 10px 12px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
}

.tag-list--empty {
  align-items: center;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
}

.tag-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(20, 20, 22, 0.12);
  color: var(--app-text-secondary);
  font-size: 12px;
  line-height: 1;
}

.tag-input__field {
  flex: 1 1 120px;
  min-width: 120px;
  min-height: 30px;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 16px;
  outline: none;
  padding: 0;
}

.tag-input__field::placeholder {
  color: var(--app-placeholder);
}

.tag-input__hint {
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  .tag-list {
    border-color: rgba(255, 255, 255, 0.07);
  }

  .tag-chip {
    background: rgba(255, 255, 255, 0.08);
  }

  .tag-chip__remove {
    background: rgba(255, 255, 255, 0.1);
  }
}
</style>
