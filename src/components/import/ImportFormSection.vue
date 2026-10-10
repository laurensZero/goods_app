<!--
  ImportFormSection.vue
  导入表单分区：小标题 + 大标题 + 表单内容插槽（内容由使用方渲染）。
-->
<template>
  <section class="form-section">
    <div class="section-head">
      <p class="section-label">{{ label }}</p>
      <h2 class="section-title">{{ title }}</h2>
    </div>
    <slot />
  </section>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.form-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-head {
  margin-bottom: 14px;
}

.section-label {
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.section-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.03em;
}
</style>
