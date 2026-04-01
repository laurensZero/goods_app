<template>
  <div class="photo-grid">
    <button
      v-for="(photo, index) in photos"
      :key="photo.id || index"
      type="button"
      class="photo-grid__item"
      @click="$emit('preview', index)"
    >
      <img
        v-if="photo.uri"
        class="photo-grid__img"
        :src="photo.uri"
        :alt="photo.caption || `照片 ${index + 1}`"
        loading="lazy"
      />
      <div v-else class="photo-grid__placeholder">✦</div>
    </button>
  </div>
</template>

<script setup>
defineProps({
  photos: { type: Array, default: () => [] }
})

defineEmits(['preview'])
</script>

<style scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

@media (min-width: 600px) {
  .photo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.photo-grid__item {
  aspect-ratio: 1;
  border: none;
  background: none;
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.photo-grid__item:active {
  transform: scale(0.95);
  opacity: 0.85;
}

.photo-grid__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-grid__placeholder {
  width: 100%;
  height: 100%;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 14px;
}
</style>
