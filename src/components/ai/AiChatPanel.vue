<template>
  <div class="ai-chat-panel">
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
          <button
            v-if="msg.role === 'assistant' && msg.reasoning"
            :class="['chat-think-toggle', { 'chat-think-toggle--open': isThinkOpen(msg) }]"
            type="button"
            :aria-expanded="isThinkOpen(msg)"
            @click="toggleReasoning(msg)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
            {{ isThinkStreaming(msg) ? t('aiChat.thinking') : t('aiChat.reasoning') }}
          </button>
          <div
            v-if="msg.role === 'assistant' && msg.reasoning && isThinkOpen(msg)"
            class="chat-think"
          >
            <p class="chat-think__text">{{ msg.reasoning }}</p>
          </div>
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
          <!-- TODO: 谷子图片/活动照片点击放大——复用活动详情同款查看器。
               photo-preview 查看器（双击缩放/滑动切换/左右箭头）目前内联在
               EventDetailView.vue（photo-preview 区块，含配套 CSS），工作量大暂搁置；
               需抽成共享组件后，在这里对 markdown 里的 <img> 做点击代理打开。 -->
          <p v-else-if="msg.content" class="chat-text">{{ getMessageText(msg) }}</p>
          <div
            v-if="msg.role === 'assistant' && msg.pending && !msg.content && msg.steps.length === 0 && !msg.reasoning"
            class="chat-typing"
            role="status"
            :aria-label="t('aiChat.thinking')"
          >
            <span /><span /><span />
          </div>
          <p v-if="msg.error" class="chat-error">{{ msg.error }}</p>
        </div>
      </div>
      <!-- 锚点必须在滚动容器 .chat-area 内部，scrollIntoView 才能滚动消息区 -->
      <div key="chat-anchor" ref="bottomAnchorRef" class="chat-anchor" />
    </TransitionGroup>

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
        @keydown.enter="handleEnterKey"
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
              <input
                v-if="editingSessionId === session.id"
                ref="renameInputRef"
                v-model="renameDraft"
                class="history-item__rename-input"
                type="text"
                maxlength="50"
                @keydown.enter.prevent="confirmRename(session.id)"
                @keydown.esc.prevent="cancelRename"
                @blur="confirmRename(session.id)"
              />
              <p v-else class="history-item__title">{{ session.title || t('aiChat.newChat') }}</p>
              <p class="history-item__meta">
                {{ formatSessionTime(session.updatedAt) }} · {{ t('aiChat.messagesCount', { count: session.messages.length }) }}
              </p>
            </div>
            <button
              class="history-item__action"
              type="button"
              :aria-label="t('aiChat.rename')"
              @click.stop="startRename(session)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5L2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
            <button
              class="history-item__action history-item__action--danger"
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
// AI 聊天核心面板：消息区 + 输入栏 + 设置/历史弹窗。
// 被两个宿主复用：AiChatView（完整页面）与 AiAssistantPopup（全局下拉弹窗），
// 聊天状态全部在 useAiChatStore，两个宿主看到同一份对话。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popup } from 'vant'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAiChatStore } from '@/stores/aiChat'
import { normalizeBaseUrl } from '@/services/ai/chatClient'
import { detectMarkdownContent, renderMarkdown } from '@/utils/markdown'

defineOptions({ name: 'AiChatPanel' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const aiChat = useAiChatStore()

const inputText = ref('')
const inputRef = ref(null)
const bottomAnchorRef = ref(null)
const showSettings = ref(false)
const showHistory = ref(false)
const settingsDraft = reactive({ baseUrl: '', model: '', apiKey: '' })

// 会话重命名（内联编辑，同一时间只有一个条目处于编辑态）
const editingSessionId = ref('')
const renameDraft = ref('')
const renameInputRef = ref(null)

// 思维链折叠：默认收起；消息还在生成（pending）且有思维链流出时自动展开实时展示，
// 用户手动开合的意图优先于自动行为（回答完成后恢复默认收起）
const manualThinkState = reactive(new Map())
/** @param {any} msg */
function isThinkOpen(msg) {
  if (manualThinkState.has(msg.id)) return Boolean(manualThinkState.get(msg.id))
  return Boolean(msg.pending && msg.reasoning)
}
/** @param {any} msg */
function isThinkStreaming(msg) {
  return Boolean(msg.pending && msg.reasoning && !manualThinkState.has(msg.id))
}
/** @param {any} msg */
function toggleReasoning(msg) {
  manualThinkState.set(msg.id, !isThinkOpen(msg))
}

// 平板（≥900px）弹窗居中展示，手机为底部弹层（与 ManageView 的 picker-popup 约定一致）
const windowWidth = ref(window.innerWidth)
const isTabletViewport = computed(() => windowWidth.value >= 900)
const popupPosition = computed(() => (isTabletViewport.value ? 'center' : 'bottom'))
function handleResize() { windowWidth.value = window.innerWidth }

// 桌面端回车发送；触屏设备保留换行。Shift+Enter 始终换行
const isTouchDevice = window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches ?? false

/**
 * @param {KeyboardEvent} event
 */
function handleEnterKey(event) {
  // isComposing：中文等输入法选词的回车确认，不能当成发送
  if (event.shiftKey || event.isComposing || event.keyCode === 229 || isTouchDevice) return
  event.preventDefault()
  send()
}
/** 滚动到消息区底部（锚点在 .chat-area 内，scrollIntoView 生效） */
function scrollToBottom(behavior = 'auto') {
  bottomAnchorRef.value?.scrollIntoView({ block: 'end', behavior })
}

let bottomFallbackTimer = 0
onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true })
  // 打开面板/从其他页面回来时（会话状态在 store 里持续更新），落底查看最新消息。
  // 助手消息的 Markdown 是异步渲染的，首滚后稍等再补一次，兜底长内容变高
  nextTick(() => scrollToBottom())
  bottomFallbackTimer = window.setTimeout(() => scrollToBottom(), 400)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (bottomFallbackTimer) {
    clearTimeout(bottomFallbackTimer)
    bottomFallbackTimer = 0
  }
})

// 示例问题池：空状态每次出现（进入页面 / 新建对话 / 清空）随机轮换 3 条
const examplePool = computed(() => [
  t('aiChat.example1'),
  t('aiChat.example2'),
  t('aiChat.example3'),
  t('aiChat.example4'),
  t('aiChat.example5'),
  t('aiChat.example6'),
  t('aiChat.example7'),
  t('aiChat.example8'),
  t('aiChat.example9'),
  t('aiChat.example10')
])
const exampleRound = ref(0)
watch(
  () => aiChat.messages.length === 0,
  (isEmpty) => {
    if (isEmpty) exampleRound.value += 1
  },
  { immediate: true }
)

const examples = computed(() => {
  exampleRound.value // 依赖轮次：空状态每次出现重新抽取
  const pool = [...examplePool.value]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 3)
})

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

/**
 * 纯文本分支展示用：剥掉模型在正文开头带的空行（思维链模型的 content
 * 常以 \n\n 起头，pre-wrap 下会渲染成两行空白）。
 * @param {any} msg
 */
function getMessageText(msg) {
  return String(msg.content || '').replace(/^\s+/, '')
}

// 新消息 / 工具步骤 / 内容（含流式思维链）更新时滚到底部
const scrollSignal = computed(() => {
  const list = aiChat.messages
  if (list.length === 0) return 0
  const last = list[list.length - 1]
  return list.length * 1000 + last.steps.length * 10 + last.content.length + (last.reasoning?.length || 0)
})

watch(scrollSignal, () => {
  nextTick(() => scrollToBottom('smooth'))
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
    nextTick(() => scrollToBottom())
  }
}

function startRename(session) {
  editingSessionId.value = session.id
  renameDraft.value = session.title || ''
  nextTick(() => renameInputRef.value?.focus())
}

function confirmRename(id) {
  // Enter 先 confirm 再触发 blur、或 Esc 取消后 input 卸载带出的 blur，都用它挡掉
  if (editingSessionId.value !== id) return
  editingSessionId.value = ''
  const next = renameDraft.value.trim()
  if (next && aiChat.renameSession(id, next)) showToast(t('aiChat.renameSuccess'))
}

function cancelRename() {
  editingSessionId.value = ''
  renameDraft.value = ''
}

function removeSession(id) {
  aiChat.deleteSession(id)
  if (editingSessionId.value === id) cancelRename()
  showToast(t('aiChat.deleted'))
}
</script>

<style scoped>
.ai-chat-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ── Chat area ── */
/* 空状态：整组内容垂直居中（输入框跟随其下，构成居中构图）；
   有消息后：消息区自然高度从顶部排列，输入框由 margin-top:auto 吸到底部 */
/* 消息区独立滚动：输入框永远固定在底部，不会被对话顶走 */
.chat-area {
  flex: 1;
  min-height: 0;
  justify-content: center;
  padding: 16px var(--page-padding) 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.chat-area--filled {
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
  animation: page-fade-up 0.45s ease backwards 0.08s;
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
  animation: page-fade-up 0.4s ease backwards;
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

/* 思维链折叠块（默认收起，点击展开） */
.chat-think-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  padding: 3px 10px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-soft) 72%, transparent);
  color: var(--app-text-tertiary);
  font-size: 11.5px;
  cursor: pointer;
}

.chat-think-toggle svg {
  width: 12px;
  height: 12px;
  transition: transform 0.2s ease;
}

.chat-think-toggle--open svg {
  transform: rotate(180deg);
}

.chat-think {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-left: 3px solid color-mix(in srgb, var(--app-text) 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-text) 4%, transparent);
}

.chat-think__text {
  margin: 0;
  max-height: 240px;
  overflow-y: auto;
  color: var(--app-text-tertiary);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

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

/* AI 嵌入的谷子图片/活动照片按缩略图展示，避免撑大气泡 */
.chat-markdown :deep(img) {
  display: block;
  width: auto;
  height: auto;
  max-width: min(150px, 60%);
  max-height: 150px;
  margin: 6px 0;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  /* 点击放大暂未实现（见模板 TODO），先给视觉提示 */
  cursor: zoom-in;
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
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px var(--page-padding) max(12px, env(safe-area-inset-bottom));
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
  overflow-y: hidden;
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

.chat-input::-webkit-scrollbar {
  display: none;
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

.history-item__action {
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

.history-item__action:active {
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text);
}

.history-item__action--danger:active {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.history-item__action svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.history-item__rename-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid rgba(52, 199, 89, 0.5);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  outline: none;
}

.history-empty {
  margin: 8px 0;
  text-align: center;
  color: var(--app-text-tertiary);
  font-size: 13px;
}

/* ── Keyframes（进场动画统一由全局 .page-entry / page-fade-up 处理） ── */
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
</style>
