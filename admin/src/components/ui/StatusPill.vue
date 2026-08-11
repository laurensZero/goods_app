<script setup>
// 状态胶囊：封装 base.css 的 .state/.state--*
// status: 'default' | 'ok' | 'warn' | 'error' | 'info'
defineProps({
  status: { type: String, default: 'default' },
  label: { type: String, required: true }
})
</script>

<template>
  <span class="state" :class="status !== 'default' ? `state--${status}` : ''">{{ label }}</span>
</template>
