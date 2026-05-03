<template>
  <div v-if="showPreview" class="markdown-preview-card">
    <div class="markdown-preview-card__head">
      <p v-if="title" class="markdown-preview-card__label">{{ title }}</p>
      <button v-if="normalizedContent" class="markdown-preview-card__copy" type="button" @click="copyMarkdown">
        {{ copied ? '已复制 markdown' : '复制 markdown' }}
      </button>
    </div>
    <div class="markdown-preview-card__body" v-html="previewHtml" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { detectMarkdownContent, renderMarkdown } from '@/utils/markdown'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: '实时预览'
  }
})

const normalizedContent = computed(() => String(props.content || '').trim())
const showPreview = computed(() => detectMarkdownContent(normalizedContent.value))
const previewHtml = computed(() => (showPreview.value ? renderMarkdown(normalizedContent.value) : ''))
const copied = ref(false)

async function copyMarkdown() {
  const text = normalizedContent.value
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1200)
  } catch {
    copied.value = false
  }
}
</script>

<style scoped>
.markdown-preview-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding: 14px;
  border-radius: 16px;
  background: var(--app-surface-soft);
  border: 1px solid rgba(20, 20, 22, 0.08);
}

.markdown-preview-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.markdown-preview-card__label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.markdown-preview-card__copy {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  background: rgba(20, 20, 22, 0.08);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 8px 12px;
}

.markdown-preview-card__body {
  color: var(--app-text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.markdown-preview-card__body :deep(ul),
.markdown-preview-card__body :deep(ol) {
  padding-left: 20px;
  margin: 0 0 10px;
}

.markdown-preview-card__body :deep(ul) {
  list-style: disc;
  list-style-position: outside;
}

.markdown-preview-card__body :deep(ol) {
  list-style: decimal;
  list-style-position: outside;
}

.markdown-preview-card__body :deep(li) {
  display: list-item;
}

.markdown-preview-card__body :deep(li.task-list-item) {
  list-style: none;
}

.markdown-preview-card__body :deep(li + li) {
  margin-top: 4px;
}

.markdown-preview-card__body :deep(p),
.markdown-preview-card__body :deep(blockquote),
.markdown-preview-card__body :deep(pre),
.markdown-preview-card__body :deep(h1),
.markdown-preview-card__body :deep(h2),
.markdown-preview-card__body :deep(h3),
.markdown-preview-card__body :deep(h4),
.markdown-preview-card__body :deep(h5),
.markdown-preview-card__body :deep(h6),
.markdown-preview-card__body :deep(hr) {
  margin: 0 0 10px;
}

.markdown-preview-card__body :deep(code) {
  padding: 0.15em 0.35em;
  border-radius: 6px;
  background: rgba(20, 20, 22, 0.08);
  font-size: 0.95em;
}

.markdown-preview-card__body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-preview-card__body :deep(blockquote) {
  padding: 10px 12px;
  border-left: 3px solid rgba(20, 20, 22, 0.14);
  border-radius: 0 12px 12px 0;
  background: rgba(20, 20, 22, 0.04);
}

.markdown-preview-card__body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(20, 20, 22, 0.12);
}

.markdown-preview-card__body :deep(a) {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 2px;
}

:global(html.theme-dark) .markdown-preview-card {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

:global(html.theme-dark) .markdown-preview-card__copy {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
}
</style>