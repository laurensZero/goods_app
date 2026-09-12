<template>
  <div v-if="visible" class="collage-object-bar" role="toolbar" :aria-label="label">
    <div class="collage-object-bar__row">
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'left')" :title="t('collage.alignLeft')">
        {{ t('collage.alignLeft') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'centerH')" :title="t('collage.alignCenterH')">
        {{ t('collage.alignCenterH') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'right')" :title="t('collage.alignRight')">
        {{ t('collage.alignRight') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'top')" :title="t('collage.alignTop')">
        {{ t('collage.alignTop') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'centerV')" :title="t('collage.alignCenterV')">
        {{ t('collage.alignCenterV') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'bottom')" :title="t('collage.alignBottom')">
        {{ t('collage.alignBottom') }}
      </button>
      <button type="button" class="collage-object-bar__btn collage-object-bar__btn--primary" @click="emit('align', 'center')">
        {{ t('collage.alignCenter') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('align', 'fit')">
        {{ t('collage.fitCanvas') }}
      </button>
    </div>
    <div class="collage-object-bar__row">
      <button type="button" class="collage-object-bar__btn" @click="emit('action', 'down')">
        {{ t('collage.sendBackward') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('action', 'up')">
        {{ t('collage.bringForward') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('action', 'front')">
        {{ t('collage.bringFront') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('action', 'back')">
        {{ t('collage.sendBack') }}
      </button>
      <button type="button" class="collage-object-bar__btn" @click="emit('action', 'duplicate')">
        {{ t('collage.duplicate') }}
      </button>
      <button type="button" class="collage-object-bar__btn collage-object-bar__btn--danger" @click="emit('action', 'delete')">
        {{ t('collage.delete') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['action', 'align'])

const { t } = useI18n()
const label = computed(() => t('collage.objectActions'))
</script>

<style scoped>
.collage-object-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.collage-object-bar__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.collage-object-bar__btn {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
}

.collage-object-bar__btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.collage-object-bar__btn--danger {
  background: color-mix(in srgb, #c74444 14%, var(--app-surface));
  color: #c74444;
}

.collage-object-bar__btn:active {
  transform: scale(0.96);
}
</style>
