<template>
  <div class="batch-queue-item" :class="{ 'is-edited': isEdited }" @click="$emit('edit')">
    <button class="batch-queue-item__delete" type="button" @click.stop="$emit('remove')">&times;</button>

    <div class="batch-queue-item__image">
      <LazyCachedImage v-if="item.imageUri" :src="item.imageUri" :lazy="false" class="batch-queue-item__img" />
      <span v-else class="batch-queue-item__placeholder">?</span>
    </div>

    <div class="batch-queue-item__info">
      <div class="batch-queue-item__name">{{ item.name || t('common.unnamed') }}</div>
      <div class="batch-queue-item__price" v-if="item.price">¥{{ item.price }}</div>
    </div>

    <div class="batch-queue-item__status">
      <span v-if="isEdited" class="status-edited">{{ t('common.done') }}</span>
      <span v-else class="status-pending">{{ t('common.pending') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LazyCachedImage from '@/components/image/LazyCachedImage.vue'

const { t } = useI18n()

const props = defineProps({
  item: { type: Object, required: true }
})

defineEmits(['edit', 'remove'])

const isEdited = computed(() => props.item.dirtyFields?.size > 0)
</script>

<style scoped>
.batch-queue-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  box-shadow: var(--app-shadow-sm);
  cursor: pointer;
  position: relative;
  transition: transform var(--motion-fast) var(--motion-ease-default);
}

.batch-queue-item:active {
  transform: scale(var(--press-scale-card));
}

.batch-queue-item.is-edited {
  background: var(--app-surface);
}

.batch-queue-item__delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--app-surface-soft);
  color: var(--app-text-tertiary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}

.batch-queue-item__delete:active {
  transform: scale(0.9);
}

.batch-queue-item__image {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-small);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--app-surface-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.batch-queue-item__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.batch-queue-item__placeholder {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-tertiary);
}

.batch-queue-item__info {
  flex: 1;
  min-width: 0;
  padding-right: 60px;
}

.batch-queue-item__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-queue-item__price {
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-secondary);
  margin-top: 2px;
}

.batch-queue-item__status {
  flex-shrink: 0;
}

.status-edited {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #34c759;
  background: rgba(52, 199, 89, 0.12);
}

.status-pending {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  background: var(--app-surface-soft);
}

/* 平板端 */
@media (min-width: 900px) {
  .batch-queue-item {
    padding: 16px;
  }

  .batch-queue-item__image {
    width: 72px;
    height: 72px;
  }
}
</style>
