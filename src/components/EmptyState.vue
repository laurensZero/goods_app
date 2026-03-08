<template>
  <div class="empty-state">
    <div class="empty-icon-wrap">
      <span class="empty-icon">{{ icon }}</span>
    </div>
    <h2 class="empty-title">{{ resolvedTitle }}</h2>
    <p v-if="resolvedDescription" class="empty-description">{{ resolvedDescription }}</p>
    <button v-if="actionText" class="empty-action" type="button" @click="$emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  icon: { type: String, default: '✦' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  message: { type: String, default: '暂无数据' },
  actionText: { type: String, default: '' }
})

defineEmits(['action'])

const resolvedTitle = computed(() => props.title || props.message)
const resolvedDescription = computed(() => (props.title ? props.description : ''))
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  text-align: center;
  color: var(--app-text-tertiary);
}

.empty-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin-bottom: 18px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.42));
  box-shadow: var(--app-shadow);
}

.empty-icon {
  font-size: 34px;
  line-height: 1;
}

.empty-title {
  color: var(--app-text);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.empty-description {
  margin-top: 10px;
  max-width: 280px;
  color: var(--app-text-tertiary);
  font-size: 14px;
  line-height: 1.6;
}

.empty-action {
  min-width: 144px;
  height: 48px;
  margin-top: 20px;
  padding: 0 20px;
  border: none;
  border-radius: 16px;
  background: #141416;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  box-shadow: var(--app-shadow);
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.empty-action:active {
  transform: scale(0.96);
  opacity: 0.92;
}
</style>
