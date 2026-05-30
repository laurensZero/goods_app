<template>
  <Popup
    v-model:show="showProxy"
    teleport="body"
    :position="popupPosition"
    round
    :class="['group-sheet-popup', { 'group-sheet-popup--tablet': isTablet }]"
  >
    <div class="group-sheet">
      <div v-if="!isTablet" class="group-sheet__handle" />
      <p class="group-sheet__title">{{ t('goodsGroup.createGroup') }}</p>

      <div class="group-sheet__body">
        <label class="field">
          <span class="field-label">{{ t('goodsGroup.groupName') }}</span>
          <div class="field-card">
            <input
              v-model="groupName"
              class="field-input"
              type="text"
              :placeholder="t('goodsGroup.groupNamePlaceholder')"
              maxlength="50"
            />
          </div>
        </label>

        <button
          class="group-sheet__submit"
          type="button"
          :disabled="!groupName.trim()"
          @click="handleCreate"
        >
          {{ t('goodsGroup.createGroup') }}
        </button>
      </div>
    </div>
  </Popup>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import { useTabletViewport } from '@/composables/useTabletViewport'
import { useGoodsGroupStore } from '@/stores/goodsGroup'

const props = defineProps({
  show: { type: Boolean, default: false },
  groupType: { type: String, default: 'collection' },
  initialGoodsIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:show', 'created'])
const { t } = useI18n()
const goodsGroupStore = useGoodsGroupStore()
const { isTabletViewport: isTablet, updateViewport } = useTabletViewport()
onMounted(() => updateViewport())

const popupPosition = computed(() => isTablet.value ? 'center' : 'bottom')
const showProxy = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v)
})

const groupName = ref('')

async function handleCreate() {
  const name = groupName.value.trim()
  if (!name) return

  const group = await goodsGroupStore.addGroup({
    name,
    type: props.groupType
  })

  if (props.initialGoodsIds.length > 0) {
    await goodsGroupStore.addItemsToGroup(group.id, props.initialGoodsIds)
  }

  groupName.value = ''
  emit('update:show', false)
  emit('created', group)
}
</script>

<style scoped>
.group-sheet-popup {
  overflow: hidden;
}

:global(.group-sheet-popup.van-popup--bottom) {
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
}

:global(.group-sheet-popup.van-popup--center) {
  width: min(480px, calc(100vw - 48px)) !important;
  max-width: calc(100vw - 48px) !important;
  border-radius: 28px !important;
}

.group-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 90dvh;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--app-text) 5%, transparent), transparent 42%),
    var(--app-bg);
  color: var(--app-text);
}

.group-sheet__handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
}

.group-sheet__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary);
  text-align: center;
  margin: 0 0 16px;
}

.group-sheet__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  padding: 0 2px;
}

.field-card {
  background: color-mix(in srgb, var(--app-glass) 76%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-border) 78%, transparent);
  border-radius: var(--radius-card, 18px);
  padding: 0 14px;
}

.field-input {
  width: 100%;
  height: var(--input-height, 48px);
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--app-text);
  outline: none;
}

.field-input::placeholder {
  color: var(--app-placeholder);
}

.group-sheet__submit {
  height: var(--button-height, 52px);
  border: none;
  border-radius: var(--radius-small, 14px);
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.14s ease, opacity 0.14s ease;
}

.group-sheet__submit:active:not(:disabled) {
  transform: scale(var(--press-scale-button, 0.96));
}

.group-sheet__submit:disabled {
  opacity: 0.38;
  pointer-events: none;
}

:global(html.theme-dark) .group-sheet-popup.van-popup {
  --van-popup-background: var(--app-surface);
  background: var(--app-surface) !important;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.42);
  border: none;
}
</style>
