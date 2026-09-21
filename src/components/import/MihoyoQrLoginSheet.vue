<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="mihoyo-qr-login-sheet"
    @update:model-value="(v) => { if (!v) close() }"
    @closed="stopPolling"
  >
    <p class="sheet-title">{{ t('import.qrLoginTitle') }}</p>
    <p class="sheet-sub">{{ t('import.qrLoginHint') }}</p>

    <div class="qr-box">
      <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" :alt="t('import.qrLoginTitle')" />
      <div v-else class="qr-placeholder">{{ preparing ? t('common.loading') : '…' }}</div>
    </div>

    <p class="qr-status">{{ statusText }}</p>
    <p v-if="error" class="qr-error">{{ error }}</p>

    <button
      v-if="canRefresh"
      class="sheet-secondary"
      type="button"
      :disabled="preparing"
      @click="restart"
    >
      {{ t('import.qrLoginRefresh') }}
    </button>

    <!-- 默认收起；需要时再手动展开粘贴 Cookie -->
    <button
      v-if="!pasteOpen"
      class="sheet-secondary"
      type="button"
      @click="pasteOpen = true"
    >
      {{ t('import.qrLoginUseCookie') }}
    </button>

    <div v-else class="paste-block">
      <p class="paste-label">{{ t('import.pasteCookie') }}</p>
      <textarea
        v-model="cookieText"
        class="cookie-textarea"
        :placeholder="t('import.cookiePlaceholder')"
        spellcheck="false"
        autocomplete="off"
        rows="4"
        autofocus
      />
      <p v-if="cookieText && !pasteValid" class="field-error">{{ t('import.cookieInvalid') }}</p>
      <button
        class="sheet-primary"
        type="button"
        :disabled="!pasteValid || submittingPaste"
        @click="submitPaste"
      >
        {{ submittingPaste ? t('common.loading') : t('import.loginNewAccountConfirm') }}
      </button>
      <button class="sheet-secondary" type="button" @click="pasteOpen = false">
        {{ t('import.qrLoginTitle') }}
      </button>
    </div>

    <button class="sheet-cancel" type="button" @click="close">{{ t('common.cancel') }}</button>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { validateMihoyoCookie } from '@/utils/mihoyo/index'
import {
  createMihoyoQrLogin,
  isQrLoginConfirmed,
  isQrLoginTerminalFailure,
  queryMihoyoQrLoginStatus,
  validateQrCookie,
} from '@/utils/mihoyo/qrLogin'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'success'])

const { t } = useI18n()
const qrDataUrl = ref('')
const preparing = ref(false)
const error = ref('')
const phase = ref('idle')
const ticket = ref('')
const deviceId = ref('')
const pasteOpen = ref(false)
const cookieText = ref('')
const submittingPaste = ref(false)

let pollTimer = null
let pollToken = 0

const canRefresh = computed(() => (
  phase.value === 'expired' || phase.value === 'failed' || phase.value === 'idle'
))

const pasteValid = computed(() => {
  const value = cookieText.value.trim()
  return value.length > 20 && validateMihoyoCookie(value)
})

const statusText = computed(() => {
  switch (phase.value) {
    case 'waiting':
      return t('import.qrLoginWaiting')
    case 'scanned':
      return t('import.qrLoginScanned')
    case 'confirmed':
      return t('import.qrLoginConfirmed')
    case 'expired':
      return t('import.qrLoginExpired')
    case 'failed':
      return t('import.qrLoginFailed')
    default:
      return t('import.qrLoginWaiting')
  }
})

useDialogBackButton(close, () => props.modelValue)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = ''
      cookieText.value = ''
      pasteOpen.value = false
      void restart()
    } else {
      stopPolling()
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  pollToken += 1
}

function emitSuccess(cookie) {
  stopPolling()
  emit('success', { cookie, remember: true })
  emit('update:modelValue', false)
}

async function submitPaste() {
  if (!pasteValid.value || submittingPaste.value) return
  submittingPaste.value = true
  try {
    emitSuccess(cookieText.value.trim())
  } finally {
    submittingPaste.value = false
  }
}

async function restart() {
  stopPolling()
  error.value = ''
  preparing.value = true
  phase.value = 'idle'
  qrDataUrl.value = ''
  ticket.value = ''
  deviceId.value = ''
  const myToken = pollToken
  try {
    const created = await createMihoyoQrLogin()
    if (myToken !== pollToken || !props.modelValue) return
    ticket.value = created.ticket
    deviceId.value = created.deviceId
    qrDataUrl.value = await QRCode.toDataURL(created.url, {
      margin: 1,
      width: 220,
      errorCorrectionLevel: 'M',
    })
    phase.value = 'waiting'
    schedulePoll(myToken)
  } catch (e) {
    if (myToken !== pollToken) return
    phase.value = 'failed'
    error.value = String(e?.message || t('import.qrLoginFailed'))
  } finally {
    if (myToken === pollToken) preparing.value = false
  }
}

function schedulePoll(token) {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    void pollOnce(token)
  }, 2000)
}

async function pollOnce(token) {
  if (token !== pollToken || !props.modelValue) return
  if (!ticket.value) return

  try {
    const result = await queryMihoyoQrLoginStatus(ticket.value, deviceId.value)
    if (token !== pollToken || !props.modelValue) return

    if (isQrLoginConfirmed(result.status)) {
      const cookie = validateQrCookie(result.cookie)
      if (!cookie) {
        phase.value = 'failed'
        error.value = t('import.qrLoginNoCookie')
        return
      }
      phase.value = 'confirmed'
      emitSuccess(cookie)
      return
    }

    if (isQrLoginTerminalFailure(result.status)) {
      phase.value = 'expired'
      return
    }

    if (String(result.status).toLowerCase() === 'scanned') {
      phase.value = 'scanned'
    } else if (result.retcode != null && Number(result.retcode) !== 0 && !result.status) {
      phase.value = 'failed'
      error.value = result.message || t('import.qrLoginFailed')
      return
    } else {
      phase.value = 'waiting'
    }
    schedulePoll(token)
  } catch (e) {
    if (token !== pollToken || !props.modelValue) return
    error.value = String(e?.message || '')
    schedulePoll(token)
  }
}
</script>

<style scoped>
.sheet-title {
  margin: 0 0 4px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.sheet-sub {
  margin: 0 0 14px;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: var(--app-text-secondary, #8e8e93);
}

.qr-box {
  width: 220px;
  height: 220px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--app-border, rgba(142, 142, 147, 0.28));
}

.qr-img {
  width: 200px;
  height: 200px;
  display: block;
}

.qr-placeholder {
  font-size: 13px;
  color: var(--app-text-secondary, #8e8e93);
}

.qr-status {
  margin: 0 0 6px;
  text-align: center;
  font-size: 13px;
  color: var(--app-text);
}

.qr-error {
  margin: 0 0 8px;
  text-align: center;
  font-size: 12px;
  color: #c74444;
}

.sheet-secondary {
  width: 100%;
  margin-top: 8px;
  padding: 12px 14px;
  border: none;
  border-radius: 12px;
  background: var(--app-fill, rgba(120, 120, 128, 0.12));
  color: var(--app-text);
  font-size: 14px;
}

.sheet-secondary:disabled {
  opacity: 0.55;
}

.paste-block {
  margin-top: 8px;
}

.paste-label {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--app-text-secondary);
}

.cookie-textarea {
  width: 100%;
  min-height: 88px;
  border: 1px solid var(--app-border, rgba(142, 142, 147, 0.28));
  border-radius: 12px;
  background: var(--app-surface, #fff);
  color: var(--app-text);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #c74444;
}

.sheet-primary {
  width: 100%;
  margin-top: 10px;
  padding: 12px 14px;
  border: none;
  border-radius: 12px;
  background: var(--app-primary);
  color: var(--app-surface);
  font-size: 14px;
  font-weight: 600;
}

.sheet-primary:disabled {
  opacity: 0.45;
}

.sheet-cancel {
  width: 100%;
  margin-top: 8px;
  padding: 12px 14px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary, #8e8e93);
  font-size: 14px;
}
</style>
