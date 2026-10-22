<template>
  <div ref="rootRef" class="app-select" :class="{ 'app-select--open': open, 'app-select--disabled': disabled }">
    <button ref="triggerRef" class="app-select__trigger" type="button" :disabled="disabled" @pointerdown="flushActiveInput" @click="toggle">
      <span class="app-select__value" :class="{ 'app-select__value--placeholder': !displayLabel }">
        {{ displayLabel || placeholder || t('common.selectPlaceholder') }}
      </span>

      <svg class="app-select__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10L12 15L17 10" />
      </svg>
    </button>

    <Teleport to="body" :disabled="!teleport">
      <transition name="select-panel">
        <div
          v-if="open"
          ref="panelRef"
          class="app-select__panel"
          :class="{
            'app-select__panel--teleported': teleport,
            'app-select__panel--above': teleport && panelPosition.above
          }"
          :style="panelStyle"
        >
          <button
            v-for="option in normalizedOptions"
            :key="option.value"
            class="app-select__option"
            :class="{ 'app-select__option--active': option.value === modelValue }"
            type="button"
            @click="selectOption(option.value)"
          >
            <span>{{ option.label }}</span>

            <svg
              v-if="option.value === modelValue"
              class="app-select__check"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M5 13L9 17L19 7" />
            </svg>
          </button>

          <div v-if="normalizedOptions.length === 0" class="app-select__empty">{{ t('common.noOptions') }}</div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { commitActiveInput, flushActiveInput } from '@/utils/commitActiveInput'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  /**
   * 把面板 Teleport 到 body 并用 fixed 定位，避免被 AppSheet 等
   * overflow 容器裁剪。默认关闭，保持既有调用方行为不变。
   */
  teleport: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const rootRef = ref(null)
const triggerRef = ref(null)
const panelRef = ref(null)
const open = ref(false)
const panelPosition = ref({ top: 0, bottom: 0, left: 0, width: 0, maxHeight: 280, above: false })
let positionListenersBound = false

const normalizedOptions = computed(() =>
  props.options.map((item) => {
    if (typeof item === 'string') {
      return { label: item, value: item }
    }

    return {
      label: item.label ?? item.text ?? item.value ?? '',
      value: item.value ?? item.label ?? item.text ?? ''
    }
  })
)

const displayLabel = computed(() => {
  const matched = normalizedOptions.value.find((item) => item.value === props.modelValue)
  return matched?.label ?? ''
})

const panelStyle = computed(() => {
  if (!props.teleport) return {}
  const p = panelPosition.value
  return {
    top: p.above ? 'auto' : `${p.top}px`,
    bottom: p.above ? `${p.bottom}px` : 'auto',
    left: `${p.left}px`,
    width: `${p.width}px`,
    maxHeight: `${p.maxHeight}px`
  }
})

function updatePanelPosition() {
  if (!props.teleport) return
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect) return

  const gap = 8
  const margin = 12
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const spaceBelow = viewportHeight - rect.bottom - gap - margin
  const spaceAbove = rect.top - gap - margin
  const above = spaceBelow < 180 && spaceAbove > spaceBelow
  const maxHeight = Math.max(140, Math.min(300, above ? spaceAbove : spaceBelow))
  const width = Math.min(rect.width, viewportWidth - margin * 2)
  const left = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin)

  panelPosition.value = {
    top: rect.bottom + gap,
    bottom: viewportHeight - rect.top + gap,
    left,
    width,
    maxHeight,
    above
  }
}

function bindPositionListeners() {
  if (!props.teleport || positionListenersBound) return
  positionListenersBound = true
  window.addEventListener('resize', updatePanelPosition)
  document.addEventListener('scroll', updatePanelPosition, true)
}

function unbindPositionListeners() {
  if (!positionListenersBound) return
  positionListenersBound = false
  window.removeEventListener('resize', updatePanelPosition)
  document.removeEventListener('scroll', updatePanelPosition, true)
}

async function toggle() {
  if (props.disabled) return
  await commitActiveInput()
  if (open.value) {
    close()
    return
  }
  if (props.teleport) {
    updatePanelPosition()
    bindPositionListeners()
  }
  open.value = true
}

function close() {
  open.value = false
  unbindPositionListeners()
}

function selectOption(value) {
  emit('update:modelValue', value)
  close()
}

function handleClickOutside(event) {
  // Teleport 后面板不在 rootRef 内，需要单独判断，否则点击选项会被提前关闭
  if (panelRef.value?.contains(event.target)) return
  if (!rootRef.value?.contains(event.target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
})

onBeforeUnmount(() => {
  unbindPositionListeners()
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
})
</script>

<style scoped>
.app-select {
  position: relative;
  width: 100%;
}

.app-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1px solid rgba(20, 20, 22, 0.08);
  border-radius: 16px;
  background: var(--app-surface);
  color: var(--app-text);
  text-align: left;
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 68%, transparent);
  transition: border-color 0.18s ease, transform 0.16s ease, box-shadow 0.18s ease;
}

.app-select__trigger:active {
  transform: scale(0.98);
}

.app-select--disabled .app-select__trigger {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select--disabled .app-select__trigger:active {
  transform: none;
}

.app-select--open .app-select__trigger,
.app-select__trigger:focus-visible {
  border-color: rgba(20, 20, 22, 0.16);
  box-shadow: 0 0 0 3px rgba(20, 20, 22, 0.04);
  outline: none;
}

.app-select__value {
  overflow: hidden;
  color: var(--app-text);
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select__value--placeholder {
  color: var(--app-placeholder);
}

.app-select__arrow {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.app-select--open .app-select__arrow {
  transform: rotate(180deg);
}

.app-select__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 50;
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(20, 20, 22, 0.05);
  border-radius: 18px;
  background: var(--app-surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.app-select__panel--teleported {
  position: fixed;
  z-index: 1000;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-select__panel--teleported::-webkit-scrollbar {
  display: none;
}

.app-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  text-align: left;
  transition: background 0.16s ease, transform 0.16s ease, color 0.16s ease;
}

.app-select__option:hover,
.app-select__option:active {
  background: var(--app-surface-soft);
}

.app-select__option--active {
  background: rgba(20, 20, 22, 0.06);
  color: var(--app-text);
  font-weight: 600;
}

.app-select__check {
  width: 16px;
  height: 16px;
  margin-left: 10px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-select__empty {
  padding: 14px 12px;
  color: var(--app-text-tertiary);
  font-size: 14px;
  text-align: center;
}

.select-panel-enter-active,
.select-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
  transform-origin: top center;
}

.select-panel-enter-from,
.select-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.app-select__panel--above.select-panel-enter-active,
.app-select__panel--above.select-panel-leave-active {
  transform-origin: bottom center;
}

.app-select__panel--above.select-panel-enter-from,
.app-select__panel--above.select-panel-leave-to {
  transform: translateY(6px);
}

html.theme-dark .app-select__trigger {
    border-color: rgba(255, 255, 255, 0.05) !important;
    background: color-mix(in srgb, var(--app-surface) 96%, var(--app-glass)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
  }

html.theme-dark .app-select__value--placeholder {
    color: rgba(245, 245, 247, 0.72) !important;
  }

html.theme-dark .app-select__arrow {
    stroke: rgba(245, 245, 247, 0.72) !important;
  }

html.theme-dark .app-select--open .app-select__trigger,
  html.theme-dark .app-select__trigger:focus-visible {
    border-color: rgba(118, 148, 210, 0.28) !important;
    box-shadow:
      0 0 0 2px rgba(118, 148, 210, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
  }

html.theme-dark .app-select__panel {
    border-color: rgba(255, 255, 255, 0.06);
    background: rgba(24, 24, 28, 0.96);
    backdrop-filter: blur(20px) saturate(140%);
    -webkit-backdrop-filter: blur(20px) saturate(140%);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.34);
  }

html.theme-dark .app-select__option {
    color: #f5f5f7 !important;
  }

html.theme-dark .app-select__option:hover,
  html.theme-dark .app-select__option:active,
  html.theme-dark .app-select__option--active {
    background: rgba(255, 255, 255, 0.10) !important;
    color: #f5f5f7 !important;
  }

html.theme-dark .app-select__check {
    stroke: #f5f5f7 !important;
  }

html.theme-dark .app-select__empty {
    color: rgba(245, 245, 247, 0.68) !important;
  }
</style>
