<template>
  <div class="step-progress">
    <div class="step-progress__track">
      <div
        class="step-progress__fill"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>

<script setup>
defineProps({
  progress: { type: Number, required: true },
})
</script>

<style scoped>
.step-progress {
  padding: 2px 0 0;
}

.step-progress__track {
  height: 6px;
  border-radius: 3px;
  background: var(--app-surface-soft);
  overflow: hidden;
}

.step-progress__fill {
  height: 100%;
  border-radius: 3px;
  background: var(--app-text);
  transition: width var(--motion-medium) var(--motion-ease-emphasis);
}
</style>
