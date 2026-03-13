<!--
  AddMethodSheet.vue
  底部弹出的"选择添加方式"操作面板
  用法：<AddMethodSheet v-model="showSheet" @manual="..." @import="..." />
-->
<template>
  <Teleport to="body">
    <Transition name="sheet-backdrop">
      <div v-if="modelValue" class="sheet-backdrop" @click="close" />
    </Transition>

    <Transition name="sheet-slide">
      <div v-if="modelValue" class="sheet-panel" role="dialog" aria-modal="true" aria-label="选择添加方式">
        <div class="sheet-handle" aria-hidden="true" />

        <p class="sheet-title">选择添加方式</p>

        <div class="sheet-options">
          <!-- 手动添加 -->
          <button class="sheet-option" type="button" @click="onManual">
            <span class="option-icon option-icon--manual">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 12H16" />
                <path d="M12 8V16" />
              </svg>
            </span>
            <div class="option-body">
              <p class="option-title">手动添加</p>
              <p class="option-desc">自己填写名称、分类、价格等信息</p>
            </div>
            <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <div class="sheet-divider" />

          <!-- 从米游铺导入 -->
          <button class="sheet-option" type="button" @click="onImport">
            <span class="option-icon option-icon--import">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 3" />
              </svg>
            </span>
            <div class="option-body">
              <p class="option-title">从米游铺导入</p>
              <p class="option-desc">粘贴商品链接，自动填充信息</p>
            </div>
            <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <div v-if="props.showTaobaoImport" class="sheet-divider" />

          <!-- 从淘宝订单导入 -->
          <button v-if="props.showTaobaoImport" class="sheet-option" type="button" @click="onTaobaoImport">
            <span class="option-icon option-icon--taobao">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9h18M9 3v18M3 3h18v18H3z" stroke-width="1.6"/>
                <path d="M15 13l2 2 4-4" stroke-width="2"/>
              </svg>
            </span>
            <div class="option-body">
              <p class="option-title">从淘宝订单导入</p>
              <p class="option-desc">导入淘宝导出的 .xlsx 订单文件</p>
            </div>
            <svg class="option-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <button class="sheet-cancel" type="button" @click="close">取消</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  showTaobaoImport: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'manual', 'import', 'account-import', 'taobao-import'])

function close() {
  emit('update:modelValue', false)
}

function onManual() {
  close()
  emit('manual')
}

function onImport() {
  close()
  emit('import')
}

function onAccountImport() {
  close()
  emit('account-import')
}

function onTaobaoImport() {
  close()
  emit('taobao-import')
}
</script>

<style scoped>
/* ---- 遮罩 ---- */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--app-overlay);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
}

/* ---- 面板 ---- */
.sheet-panel {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(100vw, 480px);
  z-index: 90;
  background: color-mix(in srgb, var(--app-surface) 94%, transparent);
  border: 1px solid var(--app-glass-border);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
  border-radius: 24px 24px 0 0;
  padding: 12px 16px max(24px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 顶部手柄 */
.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: rgba(142, 142, 147, 0.28);
  margin: 0 auto 16px;
  flex-shrink: 0;
}

/* 标题 */
.sheet-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text-tertiary, #8e8e93);
  text-align: center;
  margin: 0 0 14px;
}

/* ---- 选项卡片 ---- */
.sheet-options {
  background: color-mix(in srgb, var(--app-bg) 88%, var(--app-glass));
  border-radius: 18px;
  overflow: hidden;
  margin-bottom: 10px;
}

.sheet-divider {
  height: 1px;
  margin: 0 16px;
  background: rgba(142, 142, 147, 0.15);
}

.sheet-option {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 14px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  text-align: left;
  transition: background 0.14s ease;
}

.sheet-option:active {
  background: rgba(142, 142, 147, 0.12);
}

/* 选项图标 */
.option-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-icon--manual {
  background: rgba(90, 120, 250, 0.12);
}

.option-icon--manual svg {
  width: 22px;
  height: 22px;
  stroke: #5a78fa;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--import {
  background: rgba(50, 200, 140, 0.12);
}

.option-icon--import svg {
  width: 22px;
  height: 22px;
  stroke: #28c880;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--account {
  background: rgba(255, 149, 0, 0.12);
}

.option-icon--account svg {
  width: 22px;
  height: 22px;
  stroke: #ff9500;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--account {
  background: rgba(255, 149, 0, 0.12);
}

.option-icon--account svg {
  width: 22px;
  height: 22px;
  stroke: #ff9500;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.option-icon--taobao {
  background: rgba(255, 70, 0, 0.10);
}

.option-icon--taobao svg {
  width: 22px;
  height: 22px;
  stroke: #ff4600;
  stroke-width: 1.6;
}

/* 选项文本 */
.option-body {
  flex: 1;
  min-width: 0;
}

.option-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  margin: 0 0 2px;
}

.option-desc {
  font-size: 13px;
  color: var(--app-text-tertiary, #8e8e93);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 选项箭头 */
.option-arrow {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  stroke: var(--app-text-tertiary, #8e8e93);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---- 取消按钮 ---- */
.sheet-cancel {
  height: 54px;
  width: 100%;
  border: none;
  border-radius: 18px;
  background: var(--app-bg, #f5f5f7);
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #141416);
  transition: background 0.14s ease;
}

.sheet-cancel:active {
  background: rgba(142, 142, 147, 0.18);
}

/* ---- 过渡动画 ---- */
.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
  transition: opacity 0.28s ease;
}

.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active {
  transition: transform 0.32s cubic-bezier(0.34, 1.1, 0.64, 1), opacity 0.22s ease;
}

.sheet-slide-leave-active {
  transition: transform 0.24s ease, opacity 0.18s ease;
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
  opacity: 0.6;
}

/* ── 平板：居中对话框替代底部抽屉 ── */
@media (min-width: 900px) {
  .sheet-panel {
    bottom: auto;
    top: 50%;
    transform: translateX(-50%) translateY(-50%);
    border-radius: 24px;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .sheet-handle {
    display: none;
  }

  .sheet-cancel {
    display: none;
  }

  /* 弹出动画改为缩放代替上滑 */
  .sheet-slide-enter-from,
  .sheet-slide-leave-to {
    transform: translateX(-50%) translateY(-50%) scale(0.94);
    opacity: 0;
  }
}

@media (prefers-color-scheme: dark) {
  .sheet-panel {
    background: rgba(24, 24, 28, 0.8);
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.42);
  }

  .sheet-options,
  .sheet-cancel {
    background: rgba(255, 255, 255, 0.05);
  }

  .sheet-option:active {
    background: rgba(255, 255, 255, 0.06);
  }
}
</style>
