<template>
  <div class="page ai-chat-page">
    <NavBar :title="t('nav.aiChat')" show-back />

    <main class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8a8.5 8.5 0 0 1-7.6 4.7a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8a8.5 8.5 0 0 1 4.7-7.6a8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">AI Assistant</p>
            <h1 class="hero-title">{{ t('nav.aiChat') }}</h1>
            <p class="hero-desc">{{ t('aiChat.description') }}</p>
          </div>
        </article>
      </section>

      <TransitionGroup
        name="chat-msg"
        tag="div"
        :class="['chat-area', { 'chat-area--filled': aiChat.messages.length > 0 }]"
      >
        <div v-if="aiChat.messages.length === 0" key="empty" class="chat-empty">
          <div class="chat-empty__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
              <path d="M19 15l.9 2.4L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.6L19 15z" />
            </svg>
          </div>
          <p class="chat-empty__title">{{ t('aiChat.emptyTitle') }}</p>
          <p class="chat-empty__hint">{{ t('aiChat.emptyHint') }}</p>
          <div class="chat-empty__examples">
            <button
              v-for="example in examples"
              :key="example"
              type="button"
              class="chat-example"
              @click="useExample(example)"
            >
              {{ example }}
            </button>
          </div>
        </div>

        <div
          v-for="msg in aiChat.messages"
          :key="msg.id"
          :class="['chat-msg', `chat-msg--${msg.role}`]"
        >
          <div v-if="msg.role === 'assistant'" class="chat-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            </svg>
          </div>
          <div :class="['chat-bubble', { 'chat-bubble--error': Boolean(msg.error) }]">
            <div v-if="msg.role === 'assistant' && msg.steps.length" class="chat-steps">
              <div v-for="(step, stepIndex) in msg.steps" :key="stepIndex" class="chat-step">
                <svg
                  :class="['chat-step__icon', { 'chat-step__icon--spin': step.ok === null }]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <template v-if="step.ok === null">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </template>
                  <template v-else-if="step.ok">
                    <path d="M20 6L9 17l-5-5" />
                  </template>
                  <template v-else>
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </template>
                </svg>
                <code>{{ step.name }}</code>
              </div>
            </div>
            <div
              v-if="msg.content && getRenderedMarkdown(msg)"
              class="chat-markdown note-body--markdown"
              v-html="getRenderedMarkdown(msg)"
            />
            <p v-else-if="msg.content" class="chat-text">{{ msg.content }}</p>
            <div
              v-if="msg.role === 'assistant' && msg.pending && !msg.content && msg.steps.length === 0"
              class="chat-typing"
              role="status"
              :aria-label="t('aiChat.thinking')"
            >
              <span /><span /><span />
            </div>
            <p v-if="msg.error" class="chat-error">{{ msg.error }}</p>
          </div>
        </div>
      </TransitionGroup>
      <div ref="bottomAnchorRef" class="chat-anchor" />

      <div class="chat-inputbar">
        <button
          class="chat-settings-btn"
          type="button"
          :aria-label="t('aiChat.history')"
          @click="openHistory"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
        </button>
        <button
          class="chat-settings-btn"
          type="button"
          :aria-label="t('aiChat.settingsTitle')"
          @click="openSettings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
        </button>
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="chat-input"
          rows="1"
          :placeholder="t('aiChat.inputPlaceholder')"
          :disabled="aiChat.sending"
          @input="autoGrow"
        />
        <button
          class="chat-send"
          type="button"
          :disabled="aiChat.sending || !inputText.trim()"
          :aria-label="t('aiChat.send')"
          @click="send"
        >
          <svg v-if="!aiChat.sending" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
          <svg v-else class="chat-send__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </button>
      </div>

      <AppToast :message="toastMsg" />
    </main>

    <Popup
      v-model:show="showSettings"
      :position="popupPosition"
      :round="!isTabletViewport"
      teleport="body"
      transition="sheet-pop"
      :class="['ai-settings-popup', { 'ai-settings-popup--center': isTabletViewport }]"
    >
      <div class="ai-settings-body">
        <div class="popup-handle" />
        <h3 class="ai-settings-body__title">{{ t('aiChat.settingsTitle') }}</h3>

        <label class="settings-field">
          <span class="settings-field__label">{{ t('aiChat.baseUrl') }}</span>
          <input v-model.trim="settingsDraft.baseUrl" type="url" autocomplete="off" spellcheck="false" />
        </label>
        <label class="settings-field">
          <span class="settings-field__label">{{ t('aiChat.model') }}</span>
          <input v-model.trim="settingsDraft.model" type="text" autocomplete="off" spellcheck="false" />
        </label>
        <label class="settings-field">
          <span class="settings-field__label">{{ t('aiChat.apiKey') }}</span>
          <input v-model.trim="settingsDraft.apiKey" type="password" autocomplete="off" spellcheck="false" />
        </label>

        <div class="ai-settings-body__actions">
          <button class="settings-clear" type="button" @click="clearChat">{{ t('aiChat.clearChat') }}</button>
          <button class="settings-save" type="button" @click="saveSettings">{{ t('aiChat.save') }}</button>
        </div>

        <p class="ai-settings-body__hint">{{ t('aiChat.apiKeyHint') }}</p>
        <p class="ai-settings-body__hint">{{ t('aiChat.writeNotice') }}</p>
      </div>
    </Popup>

    <Popup
      v-model:show="showHistory"
      :position="popupPosition"
      :round="!isTabletViewport"
      teleport="body"
      transition="sheet-pop"
      :class="['ai-history-popup', { 'ai-history-popup--center': isTabletViewport }]"
    >
      <div class="ai-history-body">
        <div class="popup-handle" />
        <h3 class="ai-history-body__title">{{ t('aiChat.history') }}</h3>

        <button class="history-new" type="button" @click="startNewChat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          {{ t('aiChat.newChat') }}
        </button>

        <div class="history-list">
          <div
            v-for="session in aiChat.sessions"
            :key="session.id"
            :class="['history-item', { 'history-item--active': session.id === aiChat.activeSessionId }]"
            role="button"
            tabindex="0"
            @click="selectSession(session.id)"
          >
            <div class="history-item__main">
              <p class="history-item__title">{{ session.title || t('aiChat.newChat') }}</p>
              <p class="history-item__meta">
                {{ formatSessionTime(session.updatedAt) }} · {{ t('aiChat.messagesCount', { count: session.messages.length }) }}
              </p>
            </div>
            <button
              class="history-item__delete"
              type="button"
              :aria-label="t('aiChat.deleteSession')"
              @click.stop="removeSession(session.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          </div>
          <p v-if="aiChat.sessions.length === 0" class="history-empty">{{ t('aiChat.emptySessions') }}</p>
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
// @ts-check
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAiChatStore } from '@/stores/aiChat'
import { normalizeBaseUrl } from '@/services/ai/chatClient'
import { detectMarkdownContent, renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'AiChatView' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const aiChat = useAiChatStore()

const inputText = ref('')
const inputRef = ref(null)
const bottomAnchorRef = ref(null)
const showSettings = ref(false)
const showHistory = ref(false)
const settingsDraft = reactive({ baseUrl: '', model: '', apiKey: '' })

// 平板（≥900px）弹窗居中展示，手机为底部弹层（与 ManageView 的 picker-popup 约定一致）
const windowWidth = ref(window.innerWidth)
const isTabletViewport = computed(() => windowWidth.value >= 900)
const popupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
function handleResize() { windowWidth.value = window.innerWidth }
onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true })
  // 从其他页面回来时（会话状态在 store 里持续更新），落底查看最新消息
  nextTick(() => bottomAnchorRef.value?.scrollIntoView({ block: 'end' }))
})
onBeforeUnmount(() => window.removeEventListener('resize', handleResize))

const examples = computed(() => [
  t('aiChat.example1'),
  t('aiChat.example2'),
  t('aiChat.example3')
])

// ── 助手消息 Markdown 渲染缓存（v-html 内容需异步生成） ──
/** @type {Record<string, string>} */
const markdownCache = reactive({})

watch(() => aiChat.messages, async (list) => {
  for (const msg of list) {
    if (msg.role !== 'assistant' || !msg.content) continue
    const cacheKey = `${msg.id}:html`
    if (markdownCache[`${msg.id}:src`] === msg.content) continue
    if (!detectMarkdownContent(msg.content)) {
      markdownCache[cacheKey] = ''
    } else {
      try {
        markdownCache[cacheKey] = await renderMarkdown(msg.content)
      } catch {
        markdownCache[cacheKey] = ''
      }
    }
    markdownCache[`${msg.id}:src`] = msg.content
    if (import.meta.env.DEV) console.debug(`[ai-chat:view] markdown ready: ${msg.id}`)
  }
}, { deep: true, immediate: true })

/** @param {any} msg */
function getRenderedMarkdown(msg) {
  return markdownCache[`${msg.id}:html`] || ''
}

// 排查探针：视图是否感知到 store 消息变化（dev 控制台 [ai-chat:view]）
if (import.meta.env.DEV) {
  watch(() => {
    const list = aiChat.messages
    const last = list[list.length - 1]
    return last ? `${list.length}条; 末条 pending=${last.pending} contentLen=${last.content.length} steps=${last.steps.length}` : '空'
  }, (summary) => console.debug(`[ai-chat:view] ${summary}`), { immediate: true })
}

// 新消息 / 工具步骤 / 内容更新时滚到底部
const scrollSignal = computed(() => {
  const list = aiChat.messages
  if (list.length === 0) return 0
  const last = list[list.length - 1]
  return list.length * 1000 + last.steps.length * 10 + last.content.length
})

watch(scrollSignal, () => {
  nextTick(() => {
    bottomAnchorRef.value?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  })
})

function autoGrow() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

function useExample(example) {
  inputText.value = example
  nextTick(() => {
    autoGrow()
    inputRef.value?.focus()
  })
}

function send() {
  const text = inputText.value.trim()
  if (!text || aiChat.sending) return
  if (!aiChat.config.baseUrl || !aiChat.config.model || !aiChat.config.apiKey) {
    showToast(t('aiChat.errorNoConfig'))
    openSettings()
    return
  }
  aiChat.send(text)
  inputText.value = ''
  nextTick(autoGrow)
}

function openSettings() {
  settingsDraft.baseUrl = aiChat.config.baseUrl
  settingsDraft.model = aiChat.config.model
  settingsDraft.apiKey = aiChat.config.apiKey
  showSettings.value = true
}

function saveSettings() {
  aiChat.updateConfig({
    baseUrl: normalizeBaseUrl(settingsDraft.baseUrl),
    model: settingsDraft.model,
    apiKey: settingsDraft.apiKey
  })
  showSettings.value = false
  showToast(t('aiChat.saved'))
}

function clearChat() {
  aiChat.clearMessages()
  showSettings.value = false
  showToast(t('aiChat.cleared'))
}

function openHistory() {
  showHistory.value = true
}

function formatSessionTime(timestamp) {
  const d = new Date(Number(timestamp) || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startNewChat() {
  aiChat.newSession()
  showHistory.value = false
}

function selectSession(id) {
  if (aiChat.switchSession(id)) {
    showHistory.value = false
    nextTick(() => bottomAnchorRef.value?.scrollIntoView({ block: 'end' }))
  }
}

function removeSession(id) {
  aiChat.deleteSession(id)
  showToast(t('aiChat.deleted'))
}
</script>

<style scoped>
.ai-chat-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.page-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

/* ── Hero ── */
.hero-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
  animation: chat-fade-up 0.4s ease backwards;
}

.hero-card {
  position: relative;
  display: grid;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  overflow: hidden;
}

.hero-card::before {
  content: '';
  position: absolute;
  inset: auto -70px -90px auto;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(52, 199, 89, 0.16) 0%, rgba(52, 199, 89, 0) 72%);
  pointer-events: none;
}

.hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-card);
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
}

.hero-icon svg {
  width: 26px;
  height: 26px;
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
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin-top: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

/* ── Chat area ── */
/* 空状态：整组内容垂直居中（输入框跟随其下，构成居中构图）；
   有消息后：消息区自然高度从顶部排列，输入框由 margin-top:auto 吸到底部 */
.chat-area {
  flex: 1;
  justify-content: center;
  padding: 16px var(--page-padding) 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-area--filled {
  flex: 0 0 auto;
  justify-content: flex-start;
}

.chat-anchor {
  height: 1px;
}

/* 空状态 */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  text-align: center;
  animation: chat-fade-up 0.45s ease backwards 0.08s;
}

.chat-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 4px;
  border-radius: 22px;
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
  animation: chat-float 3.2s ease-in-out infinite;
}

.chat-empty__icon svg {
  width: 30px;
  height: 30px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-empty__title {
  margin: 0;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
}

.chat-empty__hint {
  margin: 0 0 6px;
  color: var(--app-text-tertiary);
  font-size: 12.5px;
}

.chat-empty__examples {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: min(100%, 320px);
}

.chat-example {
  padding: 11px 16px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  animation: chat-fade-up 0.4s ease backwards;
}

.chat-example:nth-child(1) { animation-delay: 0.12s; }
.chat-example:nth-child(2) { animation-delay: 0.2s; }
.chat-example:nth-child(3) { animation-delay: 0.28s; }

.chat-example:active {
  transform: scale(0.97);
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

/* 消息 */
.chat-msg {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.chat-msg--user {
  justify-content: flex-end;
}

.chat-msg--assistant {
  justify-content: flex-start;
}

.chat-msg-enter-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.chat-msg-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.chat-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
  box-shadow: var(--app-shadow);
}

.chat-avatar svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-bubble {
  max-width: 82%;
  padding: 11px 14px;
  border-radius: 18px;
  font-size: 14.5px;
  line-height: 1.65;
  word-break: break-word;
  /* 对话内容可长按选中复制 */
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.chat-msg--user .chat-bubble {
  background: var(--app-text);
  color: var(--app-surface);
  border-bottom-right-radius: 6px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-text) 14%, transparent);
}

.chat-msg--assistant .chat-bubble {
  background: var(--app-surface);
  color: var(--app-text);
  border: 1px solid var(--app-border);
  border-bottom-left-radius: 6px;
  box-shadow: var(--app-shadow);
}

.chat-bubble--error {
  background: rgba(255, 59, 48, 0.08);
  border-color: rgba(255, 59, 48, 0.25);
}

.chat-text {
  margin: 0;
  white-space: pre-wrap;
}

.chat-error {
  margin: 0;
  color: #ff3b30;
  font-size: 13px;
  line-height: 1.5;
}

/* 打字中三点动画 */
.chat-typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 0;
}

.chat-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-text-tertiary);
  animation: chat-bounce 1.2s ease-in-out infinite;
}

.chat-typing span:nth-child(2) { animation-delay: 0.15s; }
.chat-typing span:nth-child(3) { animation-delay: 0.3s; }

/* 工具步骤胶囊 */
.chat-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.chat-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
  font-size: 11.5px;
  color: var(--app-text-tertiary);
}

.chat-step code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--app-text-secondary);
}

.chat-step__icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-step__icon--spin {
  color: #34c759;
  animation: spin 0.7s linear infinite;
}

.chat-step__icon:not(.chat-step__icon--spin) {
  color: var(--app-text-tertiary);
}

/* Markdown 内容（v-html 节点需 :deep 穿透） */
.chat-markdown {
  font-size: 14px;
  line-height: 1.65;
}

.chat-markdown :deep(p) {
  margin: 0 0 8px;
}

.chat-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) {
  margin: 10px 0 6px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.chat-markdown :deep(h1) { font-size: 16px; }
.chat-markdown :deep(h2) { font-size: 15px; }
.chat-markdown :deep(h3) { font-size: 14.5px; }
.chat-markdown :deep(h4) { font-size: 14px; }

.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}

.chat-markdown :deep(li) {
  margin: 3px 0;
}

.chat-markdown :deep(a) {
  color: var(--app-chip-accent-text, #2070c0);
  word-break: break-all;
}

.chat-markdown :deep(strong) {
  font-weight: 700;
}

.chat-markdown :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--app-border);
  color: var(--app-text-secondary);
}

.chat-markdown :deep(code) {
  padding: 1px 5px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-text) 7%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.chat-markdown :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  overflow-x: auto;
}

.chat-markdown :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 12px;
  line-height: 1.55;
}

.chat-markdown :deep(hr) {
  margin: 10px 0;
  border: none;
  border-top: 1px solid var(--app-border);
}

.chat-markdown :deep(table) {
  display: block;
  margin: 8px 0;
  border-collapse: collapse;
  font-size: 12.5px;
  overflow-x: auto;
  max-width: 100%;
}

.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--app-border);
  text-align: left;
  white-space: nowrap;
}

.chat-markdown :deep(th) {
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  font-weight: 600;
}

/* ── Input bar ── */
.chat-inputbar {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px var(--page-padding) max(12px, env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--app-bg) 72%, transparent);
}

.chat-settings-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  cursor: pointer;
  box-shadow: var(--app-shadow);
  transition: transform 0.15s ease;
}

.chat-settings-btn:active {
  transform: scale(0.9) rotate(-30deg);
}

.chat-settings-btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-input {
  flex: 1;
  min-width: 0;
  resize: none;
  padding: 11px 15px;
  border: 1px solid var(--app-border);
  border-radius: 21px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14.5px;
  line-height: 1.5;
  font-family: inherit;
  outline: none;
  box-shadow: var(--app-shadow);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.chat-input:focus {
  border-color: rgba(52, 199, 89, 0.55);
  box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.12);
}

.chat-input:disabled {
  opacity: 0.6;
}

.chat-send {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #34c759 0%, #28a745 100%);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(52, 199, 89, 0.35);
  transition: transform 0.15s ease, opacity 0.2s ease, box-shadow 0.2s ease;
}

.chat-send:not(:disabled):active {
  transform: scale(0.9);
  box-shadow: 0 2px 6px rgba(52, 199, 89, 0.3);
}

.chat-send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: none;
}

.chat-send svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-send__spinner {
  animation: spin 0.7s linear infinite;
}

/* ── Settings popup（与 ManageView picker-popup 同一套视觉约定） ── */
.ai-settings-popup {
  overflow: hidden;
}

:global(.ai-settings-popup.van-popup),
:global(.ai-settings-popup.van-popup--bottom) {
  --van-popup-background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

:global(.ai-settings-popup--center.van-popup--center) {
  width: min(520px, calc(100vw - 40px));
  border-radius: 28px !important;
  overflow: hidden;
  box-shadow:
    0 28px 80px color-mix(in srgb, var(--app-text) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.ai-settings-body {
  width: 100%;
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
  color: var(--app-text);
  background: transparent;
}

:global(.ai-settings-popup--center.van-popup--center) .ai-settings-body {
  padding: 22px;
}

.popup-handle {
  width: 36px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 16%, transparent);
}

.ai-settings-body__title {
  margin: 0 0 14px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.settings-field {
  display: block;
  margin-bottom: 12px;
}

.settings-field__label {
  display: block;
  margin-bottom: 6px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.settings-field input {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-text) 5%, transparent);
  color: var(--app-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.settings-field input:focus {
  border-color: color-mix(in srgb, var(--app-text) 35%, transparent);
}

.ai-settings-body__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.settings-save {
  min-height: 46px;
  border: none;
  border-radius: 16px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.settings-save:active,
.settings-clear:active {
  transform: scale(0.98);
}

.settings-clear {
  min-height: 46px;
  border: none;
  border-radius: 16px;
  background: color-mix(in srgb, var(--app-surface-soft) 94%, transparent);
  color: #ff3b30;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.ai-settings-body__hint {
  margin: 10px 0 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
  line-height: 1.55;
}

/* ── History popup（与设置弹层同一套视觉约定） ── */
.ai-history-popup {
  overflow: hidden;
}

:global(.ai-history-popup.van-popup),
:global(.ai-history-popup.van-popup--bottom) {
  --van-popup-background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  background: color-mix(in srgb, var(--app-surface) 88%, transparent);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}

:global(.ai-history-popup--center.van-popup--center) {
  width: min(520px, calc(100vw - 40px));
  border-radius: 28px !important;
  overflow: hidden;
  box-shadow:
    0 28px 80px color-mix(in srgb, var(--app-text) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--app-text) 8%, transparent);
}

.ai-history-body {
  width: 100%;
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
  color: var(--app-text);
  background: transparent;
}

:global(.ai-history-popup--center.van-popup--center) .ai-history-body {
  padding: 22px;
}

.ai-history-body__title {
  margin: 0 0 12px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.history-new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  margin-bottom: 12px;
  border: none;
  border-radius: 14px;
  background: var(--app-text);
  color: var(--app-surface);
  font-size: 14.5px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.history-new:active {
  transform: scale(0.98);
}

.history-new svg {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.history-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--app-surface-soft) 60%, transparent);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
}

.history-item:active {
  transform: scale(0.98);
}

.history-item--active {
  border-color: rgba(52, 199, 89, 0.5);
  background: rgba(52, 199, 89, 0.08);
}

.history-item__main {
  flex: 1;
  min-width: 0;
}

.history-item__title {
  margin: 0;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item__meta {
  margin: 3px 0 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.history-item__delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-tertiary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-item__delete:active {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.history-item__delete svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.history-empty {
  margin: 8px 0;
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

/* ── Keyframes ── */
@keyframes chat-fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@keyframes chat-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

@keyframes chat-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

/* Responsive */
@media (max-width: 767px) {
  .hero-title {
    font-size: 22px;
  }
}
</style>
