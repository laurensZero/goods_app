<template>
  <Transition name="sheet-pop">
    <div v-if="show" class="overlay" @click.self="close">
      <section class="dialog qq-dialog" role="dialog" aria-modal="true" :aria-label="t('my.qqBindingTitle')">
        <header class="qq-head">
          <div>
            <p class="dialog-label">QQ PUSH</p>
            <h3 class="dialog-title">{{ t('my.qqBindingTitle') }}</h3>
            <p class="dialog-desc">{{ t('my.qqBindingDesc') }}</p>
          </div>
          <button type="button" class="qq-close" :aria-label="t('common.close')" @click="close">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <!-- 已绑定 -->
        <div v-if="view === 'bound'" class="qq-body">
          <div class="qq-bound">
            <div class="qq-bound__avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <p class="qq-bound__label">
              {{ qqStore.qqNickname ? t('my.qqBoundWith', { name: qqStore.qqNickname }) : t('my.qqBound') }}
            </p>
            <p class="qq-bound__hint">{{ t('my.qqBoundHint') }}</p>
          </div>

          <div class="qq-toggle-row">
            <div class="qq-toggle-row__info">
              <span class="qq-toggle-row__title">{{ t('my.qqPushToggle') }}</span>
              <span class="qq-toggle-row__desc">{{ t('notifySettings.qqPushDesc') }}</span>
            </div>
            <label class="toggle-switch" :aria-label="t('my.qqPushToggle')">
              <input
                type="checkbox"
                :checked="qqStore.isEnabled"
                @change="onToggleChange"
              />
              <span class="toggle-slider" />
            </label>
          </div>

          <div class="dialog-actions">
            <button type="button" class="dialog-btn dialog-btn--danger" @click="confirmUnbind">
              {{ t('my.qqUnbind') }}
            </button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="close">
              {{ t('common.known') }}
            </button>
          </div>
        </div>

        <!-- 未绑定 -->
        <div v-else-if="view === 'unbound'" class="qq-body">
          <div class="qq-steps">
            <ol class="qq-steps__list">
              <li>{{ t('my.qqBindStep1') }} <span class="qq-bot-qq">{{ BOT_QQ }}</span></li>
              <li>{{ t('my.qqBindStep2') }}</li>
              <li>{{ t('my.qqBindStep3') }}</li>
            </ol>
          </div>

          <div class="dialog-actions">
            <button
              type="button"
              class="dialog-btn dialog-btn--primary"
              :disabled="qqStore.isLoading"
              @click="beginBinding"
            >
              {{ qqStore.isLoading ? '...' : t('my.qqBindNow') }}
            </button>
          </div>
        </div>

        <!-- 绑定中（pending）：展示绑定码 + 轮询等待 -->
        <div v-else class="qq-body">
          <div class="qq-steps">
            <ol class="qq-steps__list">
              <li>{{ t('my.qqBindStep1') }} <span class="qq-bot-qq">{{ BOT_QQ }}</span></li>
              <li>{{ t('my.qqBindStep2') }}</li>
              <li>{{ t('my.qqBindStep3') }}</li>
            </ol>
          </div>

          <div class="qq-code-card">
            <div class="qq-code-card__row">
              <span class="qq-code-card__label">{{ t('my.qqBotQQLabel') }}</span>
              <span class="qq-code-card__value">{{ BOT_QQ }}</span>
              <button type="button" class="qq-copy-btn" @click="copy(BOT_QQ)">{{ t('my.qqCopy') }}</button>
            </div>
            <div class="qq-code-card__row">
              <span class="qq-code-card__label">{{ t('my.qqBindCodeLabel') }}</span>
              <span class="qq-code-card__value qq-code-card__value--code">{{ qqStore.bindCode || '·····' }}</span>
              <button
                type="button"
                class="qq-copy-btn"
                :disabled="!qqStore.bindCode"
                @click="copy(qqStore.bindCode)"
              >
                {{ t('my.qqCopy') }}
              </button>
            </div>
          </div>

          <p class="qq-waiting">
            <span v-if="polling" class="qq-waiting__dot" />
            {{ polling ? t('my.qqWaiting') : t('my.qqWaitingTimeout') }}
          </p>

          <div class="dialog-actions">
            <button type="button" class="dialog-btn dialog-btn--secondary" :disabled="qqStore.isLoading" @click="refresh">
              {{ qqStore.isLoading ? '...' : t('my.qqRefresh') }}
            </button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="close">
              {{ t('common.close') }}
            </button>
          </div>
        </div>

        <AppToast :message="toastMsg" />
      </section>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import AppToast from '@/components/common/AppToast.vue'
import { useQQBindingStore } from '@/stores/qqBinding'
import { BOT_QQ } from '@/services/qqService'

defineOptions({ name: 'QQBindingSheet' })

const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'bound'])

const { t } = useI18n()
const { toastMsg, showToast } = useToast()

const qqStore = useQQBindingStore()

function close() {
  emit('close')
}

// unbound → 未绑定；pending → 绑定中；bound → 已绑定
const view = computed(() => {
  if (qqStore.isBound) return 'bound'
  if (qqStore.isPending) return 'pending'
  return 'unbound'
})

const polling = ref(false)
const POLL_INTERVAL = 5000
const POLL_MAX = 24 // 最长轮询 2 分钟
let pollTimer = null
let pollCount = 0

async function startPolling() {
  stopPolling()
  polling.value = true
  pollCount = 0
  pollTimer = setInterval(async () => {
    pollCount++
    try {
      await qqStore.refreshBinding()
    } catch {
      // 单次轮询失败忽略，等下次
    }
    if (qqStore.isBound) {
      stopPolling()
      showToast(t('my.qqBindSuccess'))
      emit('bound')
    } else if (pollCount >= POLL_MAX) {
      stopPolling()
    }
  }, POLL_INTERVAL)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  polling.value = false
}

async function beginBinding() {
  try {
    await qqStore.startBinding()
    startPolling()
  } catch (e) {
    showToast(e.message || t('my.qqBindFailed'))
  }
}

async function refresh() {
  try {
    await qqStore.refreshBinding()
    if (qqStore.isBound) {
      stopPolling()
      showToast(t('my.qqBindSuccess'))
      emit('bound')
    } else if (view.value === 'pending') {
      startPolling()
    }
  } catch (e) {
    showToast(e.message || t('my.qqBindFailed'))
  }
}

function confirmUnbind() {
  if (!window.confirm(t('my.qqUnbindConfirm'))) return
  doUnbind()
}

async function doUnbind() {
  try {
    await qqStore.doUnbind()
    showToast(t('my.qqUnbindSuccess'))
  } catch (e) {
    showToast(e.message || t('my.qqUnbindFailed'))
  }
}

async function onToggleChange(e) {
  const enabled = e.target.checked
  try {
    await qqStore.toggleEnabled(enabled)
  } catch (err) {
    e.target.checked = !enabled
    showToast(err.message || t('my.qqBindFailed'))
  }
}

async function copy(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    showToast(t('my.qqCopied'))
  } catch {
    showToast(t('common.copyFailed'))
  }
}

// 打开时初始化并进入对应视图
watch(
  () => props.show,
  async (visible) => {
    if (!visible) {
      stopPolling()
      return
    }
    if (!qqStore.isInitialized) {
      await qqStore.init().catch(() => {})
    }
    if (qqStore.isBound) {
      // 已绑定：不重新生成绑定码，保持现有绑定
      return
    }
    if (!qqStore.isPending) {
      // 未绑定：生成新绑定码开始流程
      await beginBinding()
    } else {
      // 之前 pending 未完成：继续等
      startPolling()
    }
  },
  { immediate: true }
)

onUnmounted(stopPolling)
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog-high);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

.dialog {
  width: min(100%, 400px);
  padding: 24px;
  overflow: hidden;
  border-radius: var(--radius-large);
  border: 1px solid var(--app-glass-border);
  background: color-mix(in srgb, var(--app-glass-strong) 92%, var(--app-surface));
  box-shadow: var(--app-shadow);
}

.dialog-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: uppercase;
}

.dialog-title {
  margin: 6px 0 0;
  color: var(--app-text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0;
}

.dialog-desc {
  margin: 6px 0 0;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.qq-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 4px;
}

.qq-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-surface-soft) 88%, transparent);
  color: var(--app-text-secondary);
  flex-shrink: 0;
}

.qq-close svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.qq-body {
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 已绑定 */
.qq-bound {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 0 8px;
  text-align: center;
}

.qq-bound__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: color-mix(in srgb, #12b7f5 16%, transparent);
  color: #12b7f5;
  margin-bottom: 4px;
}

.qq-bound__avatar svg {
  width: 28px;
  height: 28px;
}

.qq-bound__label {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
}

.qq-bound__hint {
  color: var(--app-text-secondary);
  font-size: 13px;
}

.qq-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
}

.qq-toggle-row__title {
  display: block;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
}

.qq-toggle-row__desc {
  display: block;
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

/* 绑定步骤 */
.qq-steps {
  padding: 4px 2px;
}

.qq-steps__list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.qq-steps__list li::marker {
  color: #12b7f5;
  font-weight: 700;
}

.qq-bot-qq {
  color: var(--app-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-left: 2px;
}

/* 绑定码卡片 */
.qq-code-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
}

.qq-code-card__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.qq-code-card__label {
  flex-shrink: 0;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.qq-code-card__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.qq-code-card__value--code {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #12b7f5;
}

.qq-copy-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.qq-copy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.qq-copy-btn:not(:disabled):active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

/* 等待提示 */
.qq-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

.qq-waiting__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #12b7f5;
  animation: qq-pulse 1.2s ease-in-out infinite;
}

@keyframes qq-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

/* Toggle Switch（复用设置页样式） */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 31px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--app-surface-muted, #e5e5ea);
  transition: background-color 0.25s ease;
  border-radius: 31px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.08);
}

.toggle-slider::before {
  position: absolute;
  content: '';
  height: 27px;
  width: 27px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.08);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--app-chip-accent-text);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.toggle-switch input:disabled + .toggle-slider {
  opacity: 0.4;
  cursor: not-allowed;
}

:global(html.theme-dark) .toggle-slider {
  background-color: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

:global(html.theme-dark) .toggle-slider::before {
  background-color: #f5f5f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Dialog 动作区与按钮（与其它 dialog 组件同款样式） */
.dialog-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 20px;
}

.dialog-btn {
  min-height: 44px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-small);
  font-size: 14px;
  font-weight: 600;
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-surface);
}

.dialog-btn--secondary {
  background: color-mix(in srgb, var(--app-glass) 78%, var(--app-surface-soft));
  color: var(--app-text-secondary);
}

.dialog-btn--danger {
  background: color-mix(in srgb, #ff3b30 14%, transparent);
  color: #ff3b30;
}

.dialog-btn:disabled {
  opacity: 0.5;
}

.dialog-btn:active,
.qq-close:active {
  transform: scale(0.96);
}

@media (max-width: 767px) {
  .overlay {
    align-items: flex-end;
    padding: 16px;
    padding-bottom: calc(var(--tabbar-height) + 24px + env(safe-area-inset-bottom));
  }

  .dialog {
    width: 100%;
    padding: 20px;
    border-bottom-left-radius: var(--radius-large);
    border-bottom-right-radius: var(--radius-large);
  }

  .dialog-actions {
    margin-inline: -20px;
    padding: 14px 20px calc(4px + max(env(safe-area-inset-bottom), 0px));
  }
}
</style>
