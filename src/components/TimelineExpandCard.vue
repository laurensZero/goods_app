<template>
  <div class="tl-expand-card">
    <div class="tl-expand-inner">
      <div class="tl-expand-left">
        <LazyCachedImage
          v-if="item.coverImage"
          class="tl-expand-img"
          :src="item.coverImage"
          :alt="item.name"
          root-margin="48px 0px"
        />
        <div v-else class="tl-expand-img-empty">&#10022;</div>
      </div>

      <div class="tl-expand-body">
        <p class="tl-expand-name">{{ item.name }}</p>

        <div class="tl-expand-chips">
          <span v-if="item.category" class="tl-expand-chip">{{ item.category }}</span>
          <span v-if="item.ip" class="tl-expand-chip tl-expand-chip--ip">{{ item.ip }}</span>
          <span
            v-for="character in item.characters || []"
            :key="character"
            class="tl-expand-chip tl-expand-chip--char"
          >
            {{ character }}
          </span>
          <span v-if="item.variant" class="tl-expand-chip tl-expand-chip--variant">{{ item.variant }}</span>
        </div>

        <div class="tl-expand-meta">
          <span v-if="item.acquiredAt" class="tl-expand-date">{{ item.acquiredAt }}</span>
          <span v-if="item.price !== ''" class="tl-expand-price">{{ totalPrice }}</span>
        </div>

        <p v-if="item.note" class="tl-expand-note">{{ item.note }}</p>

        <button class="tl-expand-detail-btn" type="button" @click="$emit('open-detail')">查看详情</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatPrice } from '@/utils/format'
import LazyCachedImage from '@/components/LazyCachedImage.vue'

const props = defineProps({
  item: { type: Object, required: true }
})

defineEmits(['open-detail'])

const totalPrice = computed(() =>
  formatPrice(Number(props.item.price || 0) * Number(props.item.quantity || 1))
)
</script>

<style scoped>
.tl-expand-card {
  margin-top: 12px;
  background: var(--app-surface);
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 4px 20px rgba(17, 20, 22, 0.08);
  border: 1px solid color-mix(in srgb, var(--app-text-tertiary) 10%, transparent);
  overflow: hidden;
}

.tl-expand-inner {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.tl-expand-left {
  flex-shrink: 0;
  width: 88px;
}

.tl-expand-img {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
  background: var(--app-surface-soft);
}

.tl-expand-img-empty {
  width: 88px;
  height: 88px;
  border-radius: 12px;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-tertiary);
  font-size: 18px;
}

.tl-expand-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.tl-expand-name {
  margin: 0;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tl-expand-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tl-expand-chip {
  padding: 3px 8px;
  border-radius: 99px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.tl-expand-chip--ip {
  background: rgba(74, 122, 236, 0.12);
  color: #4a7aec;
}

.tl-expand-chip--char {
  background: rgba(93, 226, 160, 0.14);
  color: #2a9361;
}

.tl-expand-chip--variant {
  background: rgba(255, 180, 0, 0.12);
  color: #9a6c00;
}

.tl-expand-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tl-expand-date {
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.tl-expand-price {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
}

.tl-expand-note {
  margin: 0;
  color: var(--app-text-secondary);
  font-size: 12px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tl-expand-detail-btn {
  align-self: flex-start;
  padding: 6px 14px;
  border: none;
  border-radius: 20px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.tl-expand-detail-btn:active {
  opacity: 0.65;
}

:deep(.tl-expand-enter-active),
:deep(.tl-expand-leave-active) {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

:deep(.tl-expand-enter-from),
:deep(.tl-expand-leave-to) {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

@media (prefers-color-scheme: dark) {
  .tl-expand-card {
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.32);
  }

  .tl-expand-chip--ip {
    color: #7da4f5;
    background: rgba(74, 122, 236, 0.18);
  }

  .tl-expand-chip--char {
    color: #4fd69b;
    background: rgba(93, 226, 160, 0.14);
  }

  .tl-expand-chip--variant {
    color: #f5c842;
    background: rgba(255, 180, 0, 0.14);
  }

  .tl-expand-detail-btn {
    background: rgba(255, 255, 255, 0.08);
    color: var(--app-text-secondary);
  }
}
</style>
