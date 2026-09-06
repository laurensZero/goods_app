<template>
  <div class="page mcp-settings-page">
    <NavBar :title="t('nav.mcpService')" show-back />

    <main class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v4" />
              <path d="M12 18v4" />
              <path d="M4.9 4.9l2.8 2.8" />
              <path d="M16.3 16.3l2.8 2.8" />
              <path d="M2 12h4" />
              <path d="M18 12h4" />
              <path d="M4.9 19.1l2.8-2.8" />
              <path d="M16.3 7.7l2.8-2.8" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">MCP Server</p>
            <h1 class="hero-title">{{ t('mcp.title') }}</h1>
            <p class="hero-desc">{{ t('mcp.description') }}</p>
          </div>
        </article>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">SERVICE</p>
            <h2 class="settings-card__title">{{ t('mcp.serviceTitle') }}</h2>
          </div>

          <div class="settings-list">
            <div class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--main">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4" />
                    <path d="M12 18v4" />
                    <circle cx="12" cy="12" r="3.2" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('mcp.enableService') }}</span>
                  <span class="settings-item__desc">{{ t('mcp.enableServiceDesc') }}</span>
                </div>
              </div>
              <label class="toggle-switch" :aria-label="t('mcp.enableService')">
                <input
                  :checked="settings.enabled"
                  type="checkbox"
                  @change="saveSetting('enabled', $event.target.checked)"
                />
                <span class="toggle-slider" />
              </label>
            </div>

            <div v-if="isNative" class="settings-item">
              <div class="settings-item__info">
                <span class="settings-item__icon settings-item__icon--url">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 7h16" />
                    <path d="M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
                    <path d="M10 11h4" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ t('mcp.port') }}</span>
                  <span class="settings-item__desc">{{ t('mcp.portHint') }}</span>
                </div>
              </div>
              <input
                class="port-input"
                type="number"
                inputmode="numeric"
                min="1024"
                max="65535"
                :value="settings.port"
                :aria-label="t('mcp.port')"
                @change="savePort"
              />
            </div>

            <div class="settings-item">
              <div class="settings-item__info">
                <span :class="['settings-item__icon', serviceRunning ? 'settings-item__icon--success' : 'settings-item__icon--idle']">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8 12.5l2.5 2.5L16 9.5" />
                  </svg>
                </span>
                <div>
                  <span class="settings-item__title">{{ statusText }}</span>
                  <span v-if="statusDetailText" class="settings-item__desc">{{ statusDetailText }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Transition name="fade-slide">
        <div v-if="showConnection" class="mcp-extra">
          <section class="settings-section">
            <div class="settings-card">
              <div class="settings-card__header">
                <p class="settings-card__label">CONNECT</p>
                <h2 class="settings-card__title">{{ t('mcp.connectionTitle') }}</h2>
              </div>

            <div class="settings-list">
              <div class="settings-item settings-item--column">
                <div class="settings-item__info">
                  <span class="settings-item__icon settings-item__icon--url">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </span>
                  <div>
                    <span class="settings-item__title">{{ t('mcp.serverUrl') }}</span>
                  </div>
                </div>
                <div class="value-row">
                  <code class="value-code">{{ serverUrl }}</code>
                  <button class="copy-btn" type="button" @click="copyText(serverUrl, 'url')">
                    {{ copiedKey === 'url' ? t('common.copied') : t('common.copy') }}
                  </button>
                </div>
              </div>

              <div class="settings-item settings-item--column">
                <div class="settings-item__info">
                  <span class="settings-item__icon settings-item__icon--token">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <div>
                    <span class="settings-item__title">{{ t('mcp.token') }}</span>
                  </div>
                </div>
                <div class="value-row">
                  <code class="value-code">{{ tokenDisplay }}</code>
                  <button class="copy-btn" type="button" :disabled="!tokenValue" @click="copyText(tokenValue, 'token')">
                    {{ copiedKey === 'token' ? t('common.copied') : t('common.copy') }}
                  </button>
                </div>
                <p class="value-hint">{{ t('mcp.tokenHint') }}</p>
              </div>

              <div v-if="qrDataUrl" class="settings-item settings-item--column qr-item">
                <div class="qr-box">
                  <img :src="qrDataUrl" :alt="t('mcp.qrAlt')" />
                </div>
                <p class="value-hint value-hint--center">{{ t('mcp.qrHint') }}</p>
              </div>

              <div class="settings-item settings-item--column">
                <div class="settings-item__info">
                  <span class="settings-item__icon settings-item__icon--config">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 6l-5 6 5 6" />
                      <path d="M16 6l5 6-5 6" />
                    </svg>
                  </span>
                  <div>
                    <span class="settings-item__title">{{ t('mcp.configExample') }}</span>
                  </div>
                </div>
                <div class="value-row">
                  <pre class="value-pre">{{ configExample }}</pre>
                  <button class="copy-btn" type="button" @click="copyText(configExample, 'config')">
                    {{ copiedKey === 'config' ? t('common.copied') : t('common.copy') }}
                  </button>
                </div>
              </div>

              <div class="settings-item settings-item--column">
                <div class="settings-item__info">
                  <span class="settings-item__icon settings-item__icon--usb">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="4" y="3" width="16" height="12" rx="2" />
                      <path d="M9 21h6" />
                      <path d="M12 15v6" />
                    </svg>
                  </span>
                  <div>
                    <span class="settings-item__title">{{ t('mcp.adbReverse') }}</span>
                  </div>
                </div>
                <div class="value-row">
                  <pre class="value-pre">adb reverse tcp:{{ servicePort }} tcp:{{ servicePort }}</pre>
                  <button class="copy-btn" type="button" @click="copyText(`adb reverse tcp:${servicePort} tcp:${servicePort}`, 'adb')">
                    {{ copiedKey === 'adb' ? t('common.copied') : t('common.copy') }}
                  </button>
                </div>
                <p class="value-hint">{{ t('mcp.adbReverseHint', { port: servicePort }) }}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-card">
            <div class="settings-card__header">
              <p class="settings-card__label">TOOLS</p>
              <h2 class="settings-card__title">{{ t('mcp.toolsTitle', { count: toolDefinitions.length }) }}</h2>
            </div>

            <div class="settings-list">
              <div v-for="tool in toolDefinitions" :key="tool.name" class="settings-item">
                <div class="settings-item__info">
                  <span class="settings-item__icon settings-item__icon--tool">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 7l4 4-4 4" />
                      <path d="M12 17h7" />
                    </svg>
                  </span>
                  <div>
                    <span class="settings-item__title"><code class="tool-name">{{ tool.name }}</code></span>
                    <span class="settings-item__desc">{{ tool.description }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="security-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <p>{{ t('mcp.securityNote') }}</p>
            </div>
          </div>
        </section>
        </div>
      </Transition>

      <p class="page-footnote">{{ isNative ? t('mcp.nativeNotice') : t('mcp.devNotice') }}</p>

      <AppToast :message="toastMsg" />
    </main>
  </div>
</template>

<script setup>
// @ts-check
import { computed, onMounted, ref, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import QRCode from 'qrcode'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useMcpSettingsStore, MCP_DEFAULT_PORT } from '@/stores/mcpSettings'
import { mcpBridgeState } from '@/services/mcp/bridgeClient'
import { mcpNativeState } from '@/services/mcp/nativeServer'
import { MCP_TOOL_DEFINITIONS } from '@/services/mcp/toolDefinitions'

defineOptions({ name: 'McpSettingsView' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()

// 平板设置分屏时由 ManageView provide；MCP 页无子页面，仅保留约定
const openManageSubPage = inject('openManageSubPage', null)
void openManageSubPage

const isNative = Capacitor.isNativePlatform()
const settingsStore = useMcpSettingsStore()
const settings = computed(() => settingsStore.settings)

const toolDefinitions = MCP_TOOL_DEFINITIONS

const bridgeToken = ref('')
const qrDataUrl = ref('')
const copiedKey = ref('')

/** 访问端口：原生用设置端口，dev 用 dev server 端口 */
const servicePort = computed(() => {
  if (isNative) return Number(settings.value.port) || MCP_DEFAULT_PORT
  return window.location.port || '5173'
})

/** 服务地址：原生端给 127.0.0.1（供 adb reverse / 同机 AI 客户端使用） */
const serverUrl = computed(() => {
  if (isNative) return `http://127.0.0.1:${servicePort.value}/mcp`
  return `${window.location.protocol}//${window.location.host}/mcp`
})

const tokenValue = computed(() => (isNative ? String(settings.value.token || '') : bridgeToken.value))

const serviceRunning = computed(() => {
  if (!settings.value.enabled) return false
  return isNative ? mcpNativeState.running : mcpBridgeState.connected
})

const statusText = computed(() => {
  if (!settings.value.enabled) return t('mcp.statusDisabled')
  return serviceRunning.value ? t('mcp.statusRunning') : t('mcp.statusWaiting')
})

const statusDetailText = computed(() => {
  if (!settings.value.enabled) return ''
  if (serviceRunning.value) {
    return isNative ? t('mcp.statusRunningNative') : t('mcp.statusRunningDesc')
  }
  if (isNative) return mcpNativeState.lastError || t('mcp.statusWaitingNative')
  return mcpBridgeState.lastError || t('mcp.statusWaitingDesc')
})

const showConnection = computed(() => settings.value.enabled)

const configExample = computed(() => JSON.stringify({
  mcpServers: {
    'goods-app': {
      type: 'http',
      url: serverUrl.value,
      headers: { Authorization: `Bearer ${tokenValue.value || '<token>'}` }
    }
  }
}, null, 2))

const tokenDisplay = computed(() => tokenValue.value || '…')

async function copyText(text, key = 'url') {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    showToast(t('common.copied'))
    setTimeout(() => {
      copiedKey.value = ''
    }, 1600)
  } catch {
    showToast(t('mcp.copyFailed'))
  }
}

function saveSetting(key, value) {
  settingsStore.updateSetting(key, value)
}

/** @param {Event} event */
function savePort(event) {
  const port = Number.parseInt(/** @type {HTMLInputElement} */ (event.target).value, 10)
  if (!Number.isFinite(port) || port < 1024 || port > 65535) return
  settingsStore.updateSetting('port', port)
}

onMounted(async () => {
  if (isNative) return
  try {
    const response = await fetch('/__mcp-bridge/config')
    if (response.ok) {
      const config = await response.json()
      bridgeToken.value = String(config?.token || '')
    }
  } catch {
    // dev server 插件未启用时静默：状态区会显示等待连接
  }
  try {
    qrDataUrl.value = await QRCode.toDataURL(serverUrl.value, { margin: 1, width: 180 })
  } catch {
    qrDataUrl.value = ''
  }
})
</script>

<style scoped>
.mcp-settings-page {
  min-height: 100dvh;
}

.page-body {
  padding-bottom: 40px;
}

.hero-section,
.settings-section {
  padding: 0 var(--page-padding);
}

.hero-section {
  margin-top: var(--section-gap);
}

.hero-card {
  position: relative;
  display: grid;
  gap: 18px;
  padding: 22px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.hero-card::before {
  content: '';
  position: absolute;
  inset: auto -70px -90px auto;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(138, 122, 255, 0.2) 0%, rgba(138, 122, 255, 0) 72%);
  pointer-events: none;
}

.hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-card);
  background: rgba(138, 122, 255, 0.14);
  color: #8a7aff;
}

.hero-icon svg {
  width: 32px;
  height: 32px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.hero-copy {
  position: relative;
  z-index: 1;
}

.hero-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 6px;
  color: var(--app-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

/* Settings Sections */
.settings-section {
  margin-top: 16px;
  animation: mcp-fade-up 0.4s ease backwards 0.07s;
}

.hero-section {
  animation: mcp-fade-up 0.4s ease backwards;
}

.mcp-extra .settings-section + .settings-section {
  animation-delay: 0.15s;
}

/* 服务开关切换时，连接信息与工具卡片展开过渡 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@keyframes mcp-fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.settings-card {
  padding: 20px;
  border-radius: 24px;
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  box-shadow: var(--app-shadow);
}

.settings-card__header {
  margin-bottom: 16px;
}

.settings-card__label {
  color: var(--app-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-card__title {
  margin: 4px 0 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

/* Settings List */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
}

.settings-item--column {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.settings-item__info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.settings-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  flex-shrink: 0;
}

.settings-item__icon svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.settings-item__icon--main {
  background: rgba(138, 122, 255, 0.14);
  color: #8a7aff;
}

.settings-item__icon--success {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.settings-item__icon--idle {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-tertiary);
}

.settings-item__icon--url {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}

.settings-item__icon--token {
  background: rgba(255, 149, 0, 0.12);
  color: #ff9500;
}

.settings-item__icon--config {
  background: rgba(175, 82, 222, 0.12);
  color: #af52de;
}

.settings-item__icon--usb {
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.settings-item__icon--tool {
  background: rgba(138, 122, 255, 0.12);
  color: #8a7aff;
}

.settings-item__title {
  display: block;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.settings-item__desc {
  display: block;
  margin-top: 2px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.tool-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13.5px;
  color: #8a7aff;
}

/* Value Rows (URL / Token / Code) */
.value-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-item--column .value-row {
  align-items: stretch;
}

.value-code {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  word-break: break-all;
}

.value-pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
}

.copy-btn {
  flex-shrink: 0;
  align-self: center;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-btn:not(:disabled):active {
  transform: scale(0.96);
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
}

.copy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.port-input {
  flex-shrink: 0;
  width: 96px;
  padding: 9px 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  color: var(--app-text);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  outline: none;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}

.port-input::-webkit-outer-spin-button,
.port-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.port-input:focus {
  border-color: color-mix(in srgb, var(--app-text) 35%, transparent);
}

.value-hint {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.value-hint--center {
  text-align: center;
}

/* QR */
.qr-item {
  align-items: center;
}

.qr-box {
  align-self: center;
  padding: 10px;
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--app-shadow);
}

.qr-box img {
  display: block;
  width: 168px;
  height: 168px;
}

/* Security Note */
.security-note {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 149, 0, 0.1);
}

.security-note svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  stroke: #ff9500;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.security-note p {
  margin: 0;
  color: #ff9500;
  font-size: 12.5px;
  line-height: 1.55;
}

.page-footnote {
  margin: 18px var(--page-padding) 0;
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

/* Toggle Switch */
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

/* Responsive */
@media (min-width: 768px) {
  .settings-card {
    padding: 24px;
  }

  .settings-item {
    padding: 16px;
  }
}

@media (max-width: 767px) {
  .page-body {
    padding-bottom: calc(154px + env(safe-area-inset-bottom));
  }

  .hero-title {
    font-size: 24px;
  }

  .settings-card {
    padding: 16px;
  }

  .settings-item {
    padding: 12px;
  }
}
</style>
