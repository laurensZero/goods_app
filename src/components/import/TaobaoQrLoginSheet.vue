<template>
  <AppSheet
    :model-value="modelValue"
    sheet-class="taobao-qr-login-sheet"
    @update:model-value="(v) => { if (!v) close() }"
    @closed="stopPolling"
  >
    <p class="sheet-title">{{ t('import.taobaoQrLoginTitle') }}</p>
    <p class="sheet-sub">{{ t('import.taobaoQrLoginHint') }}</p>

    <div class="qr-box">
      <img v-if="qrDataUrl" :src="qrDataUrl" class="qr-img" :alt="t('import.taobaoQrLoginTitle')" />
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
      {{ t('import.taobaoQrLoginRefresh') }}
    </button>

    <!-- 默认收起；需要时再手动展开粘贴 Cookie -->
    <button
      v-if="!pasteOpen"
      class="sheet-secondary"
      type="button"
      @click="pasteOpen = true"
    >
      {{ t('import.taobaoQrLoginUseCookie') }}
    </button>

    <div v-else class="paste-block">
      <p class="paste-label">{{ t('import.taobaoCookiePlaceholder') }}</p>
      <textarea
        v-model="cookieText"
        class="cookie-textarea"
        :placeholder="t('import.taobaoCookiePlaceholder')"
        spellcheck="false"
        autocomplete="off"
        rows="4"
        autofocus
      />
      <p v-if="cookieText && !pasteValid" class="field-error">{{ t('import.taobaoCookieInvalid') }}</p>
      <button
        class="sheet-primary"
        type="button"
        :disabled="!pasteValid || submittingPaste"
        @click="submitPaste"
      >
        {{ submittingPaste ? t('common.loading') : t('import.loginNewAccountConfirm') }}
      </button>
      <button class="sheet-secondary" type="button" @click="pasteOpen = false">
        {{ t('import.taobaoQrLoginTitle') }}
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
import { isTaobaoCookieReady, normalizeTaobaoCookie } from '@/utils/taobao/cookie'
import {
  QR_CODE_EXPIRED,
  QR_CODE_SCANNED,
  createTaobaoQrLoginSession,
  qrLoginErrorCode,
} from '@/utils/taobao/qrLogin'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'success'])

const { t } = useI18n()
const qrDataUrl = ref('')
const preparing = ref(false)
const error = ref('')
const phase = ref('idle') // idle | waiting | scanned | confirmed | expired | failed
const pasteOpen = ref(false)
const cookieText = ref('')
const submittingPaste = ref(false)

let session = null
let pollTimer = null
let pollToken = 0

const canRefresh = computed(() => (
  phase.value === 'expired' || phase.value === 'failed' || phase.value === 'idle'
))

const pasteValid = computed(() => isTaobaoCookieReady(normalizeTaobaoCookie(cookieText.value)))

const statusText = computed(() => {
  switch (phase.value) {
    case 'waiting':
      return t('import.taobaoQrLoginWaiting')
    case 'scanned':
      return t('import.taobaoQrLoginScanned')
    case 'confirmed':
      return t('import.taobaoQrLoginConfirmed')
    case 'expired':
      return t('import.taobaoQrLoginExpired')
    case 'failed':
      return t('import.taobaoQrLoginFailed')
    default:
      return t('import.taobaoQrLoginWaiting')
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
  session?.dispose()
  session = null
}

function emitSuccess(cookie) {
  stopPolling()
  emit('success', { cookie })
  emit('update:modelValue', false)
}

async function submitPaste() {
  if (!pasteValid.value || submittingPaste.value) return
  submittingPaste.value = true
  try {
    emitSuccess(normalizeTaobaoCookie(cookieText.value))
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
  const myToken = pollToken
  session = createTaobaoQrLoginSession()
  try {
    const created = await session.generate()
    if (myToken !== pollToken || !props.modelValue) return
    qrDataUrl.value = await QRCode.toDataURL(created.qrUrl, {
      margin: 1,
      width: 220,
      errorCorrectionLevel: 'M',
    })
    phase.value = 'waiting'
    schedulePoll(myToken)
  } catch (e) {
    if (myToken !== pollToken) return
    phase.value = 'failed'
    error.value = mapQrError(e)
  } finally {
    if (myToken === pollToken) preparing.value = false
  }
}

function mapQrError(e) {
  const code = qrLoginErrorCode(e)
  if (code === 'BLOCKED') return t('import.taobaoCookieBlocked')
  if (code === 'PARSE' || code === 'GENERATE' || code === 'POLL') {
    return t('import.taobaoQrLoginFailed')
  }
  if (code === 'NO_COOKIE') return t('import.taobaoQrLoginNoCookie')
  return String(e?.message || t('import.taobaoQrLoginFailed'))
}

function schedulePoll(token) {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    void pollOnce(token)
  }, 1500)
}

async function pollOnce(token) {
  if (token !== pollToken || !props.modelValue || !session) return

  try {
    const result = await session.poll()
    if (token !== pollToken || !props.modelValue) return

    if (result.status === 'success') {
      phase.value = 'confirmed'
      const cookie = await session.complete(result.shellUrl)
      if (token !== pollToken || !props.modelValue) return
      if (!isTaobaoCookieReady(cookie) && !/(?:^|;\s*)unb=/.test(cookie)) {
        phase.value = 'failed'
        error.value = t('import.taobaoQrLoginNoCookie')
        return
      }
      emitSuccess(cookie)
      return
    }

    if (result.status === 'expired' || result.code === QR_CODE_EXPIRED) {
      phase.value = 'expired'
      return
    }

    if (result.status === 'scanned' || result.code === QR_CODE_SCANNED) {
      phase.value = 'scanned'
    } else {
      phase.value = 'waiting'
    }
    schedulePoll(token)
  } catch (e) {
    if (token !== pollToken || !props.modelValue) return
    error.value = mapQrError(e)
    // 网络抖动继续轮询；风控/解析类失败停住等手动刷新
    const code = qrLoginErrorCode(e)
    if (code === 'NETWORK' || code === 'TIMEOUT') {
      schedulePoll(token)
    } else {
      phase.value = 'failed'
    }
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
