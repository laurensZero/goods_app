<script setup>
// 类型徽章：封装 base.css 的 .badge/.badge--*
// tone: 'default' | 'ok' | 'warn' | 'error' | 'info'
defineProps({
  tone: { type: String, default: 'default' },
  label: { type: String, required: true }
})
</script>

<template>
  <span class="badge" :class="tone !== 'default' ? `badge--${tone}` : ''">{{ label }}</span>
</template>
