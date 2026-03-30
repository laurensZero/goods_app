<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>

    <Transition name="sheet-slide">
      <div
        v-if="modelValue"
        class="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="充值记录操作"
      >
        <div class="sheet-handle" aria-hidden="true" />
        <p class="sheet-title">充值记录操作</p>
        <p class="sheet-record">{{ record?.itemName || '未命名项目' }}</p>

        <div class="sheet-options">
          <button class="sheet-option" type="button" @click="onEdit">
            <span class="option-icon">编</span>
            <div class="option-body">
              <p class="option-title">编辑记录</p>
              <p class="option-desc">修改项目、金额、日期和备注</p>
            </div>
          </button>

          <div class="sheet-divider" />

          <button class="sheet-option sheet-option--danger" type="button" @click="onDelete">
            <span class="option-icon option-icon--danger">删</span>
            <div class="option-body">
              <p class="option-title">移至回收站</p>
              <p class="option-desc">长按后再执行删除，避免误触</p>
            </div>
          </button>
        </div>

        <button class="sheet-cancel" type="button" @click="close">取消</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'edit', 'delete'])

function close() {
  emit('update:modelValue', false)
}

function onEdit() {
  emit('edit')
  close()
}

function onDelete() {
  emit('delete')
  close()
}
</script>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--app-overlay);
}

.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 110;
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--app-surface) 94%, transparent);
  border: 1px solid var(--app-glass-border);
}

.sheet-handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: rgba(142, 142, 147, 0.28);
}

.sheet-title {
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.sheet-record {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.sheet-options {
  margin-top: 14px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--app-surface-soft);
}

.sheet-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  text-align: left;
}

.sheet-option--danger .option-title,
.sheet-option--danger .option-desc {
  color: #cc3d3d;
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.2);
}

.option-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
}

.option-icon--danger {
  background: color-mix(in srgb, #e05454 16%, transparent);
  color: #cc3d3d;
}

.option-title {
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.option-desc {
  color: var(--app-text-tertiary);
  font-size: 12px;
  margin-top: 3px;
}

.sheet-cancel {
  margin-top: 10px;
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 16px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: transform 0.24s ease, opacity 0.2s ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0;
}
</style>
