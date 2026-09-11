<template>
  <div class="ai-chat-panel">
    <!-- 顶栏：历史/设置挪出输入区，手机端给输入框更多宽度（参考 DeepSeek） -->
    <header class="chat-topbar">
      <button
        class="chat-topbar__btn"
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
      <div class="chat-topbar__actions">
        <button
          class="chat-topbar__btn"
          type="button"
          :aria-label="t('aiChat.settingsTitle')"
          @click="openSettings"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
        </button>
      </div>
    </header>

    <div
      :class="['chat-area', { 'chat-area--filled': aiChat.messages.length > 0 }]"
      @scroll.passive="onChatScroll"
    >
      <TransitionGroup name="chat-msg" tag="div" class="chat-messages">
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
          <div
            v-if="msg.role === 'user' && msg.attachments?.length"
            class="chat-attach-list"
          >
            <template v-for="(att, attIndex) in msg.attachments" :key="att.id">
              <div v-if="att.type === 'table'" class="chat-attach-table-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span>{{ att.filename || 'table' }}</span>
              </div>
              <img
                v-else
                class="chat-attach-thumb"
                :src="att.uri"
                alt=""
                loading="lazy"
                @click="previewImageList(msg.attachments, attIndex)"
              />
            </template>
          </div>
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
            @click="onMarkdownClick"
            v-html="getRenderedMarkdown(msg)"
          />
          <p v-else-if="msg.content" class="chat-text">{{ getMessageText(msg) }}</p>
          <!-- ask_user：选项一行一个，可试听；也可手动输入答案 -->
          <div v-if="msg.role === 'assistant' && msg.pendingAsk" class="chat-ask">
            <p class="chat-ask__question">{{ msg.pendingAsk.question }}</p>
            <div v-if="msg.pendingAsk.options?.length" class="chat-ask__options">
              <div
                v-for="option in msg.pendingAsk.options"
                :key="option.label"
                class="chat-ask__option-row"
              >
                <button
                  type="button"
                  class="chat-ask__option"
                  @click="aiChat.answerAskUser(option.label)"
                >
                  {{ option.label }}
                </button>
                <button
                  v-if="canPreviewAskOption(option)"
                  :class="[
                    'chat-ask__play',
                    {
                      'chat-ask__play--active': isAskPreviewActive(option),
                      'chat-ask__play--playing': isAskPreviewPlaying(option)
                    }
                  ]"
                  type="button"
                  :disabled="askPreviewBusy === previewKeyOf(option)"
                  :aria-label="isAskPreviewPlaying(option) ? t('aiChat.askPreviewPause') : t('aiChat.askPreviewPlay')"
                  :title="isAskPreviewPlaying(option) ? t('aiChat.askPreviewPause') : t('aiChat.askPreviewPlay')"
                  @click="playAskPreview(option)"
                >
                  <svg
                    v-if="askPreviewBusy === previewKeyOf(option)"
                    class="chat-ask__play-spinner"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                  >
                    <path d="M12 3a9 9 0 1 0 9 9" />
                  </svg>
                  <svg
                    v-else-if="isAskPreviewPlaying(option)"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="none"
                  >
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="chat-ask__manual">
              <input
                v-model="askDraft"
                class="chat-ask__input"
                type="text"
                :placeholder="t('aiChat.askManualPlaceholder')"
                @keydown.enter="submitAskManual(msg)"
              />
              <button
                type="button"
                class="chat-ask__manual-send"
                :disabled="!askDraft.trim()"
                :aria-label="t('aiChat.askManualSend')"
                @click="submitAskManual(msg)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
          <div
            v-if="msg.role === 'assistant' && msg.pending && !msg.content && msg.steps.length === 0 && !msg.reasoning && !msg.pendingAsk"
            class="chat-typing"
            role="status"
            :aria-label="t('aiChat.thinking')"
          >
            <span /><span /><span />
          </div>
          <p v-if="msg.error" class="chat-error">{{ msg.error }}</p>
          <button
            v-if="msg.role === 'assistant' && canUndo(msg)"
            class="chat-undo"
            type="button"
            :disabled="undoingId === msg.id || aiChat.sending"
            @click="onUndoWrite(msg)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
            </svg>
            {{ undoingId === msg.id ? t('aiChat.undoing') : t('aiChat.undoWrite') }}
          </button>
          <p v-else-if="msg.role === 'assistant' && isUndone(msg)" class="chat-undo-done">{{ t('aiChat.undoDone') }}</p>
        </div>
      </div>
      </TransitionGroup>
      <!-- 排队中的消息：半透明气泡挂在当前回复下方（仿 Codex），↵ 立即打断并发送 -->
      <div v-if="aiChat.sendQueue.length > 0" class="chat-queue">
        <div v-for="item in aiChat.sendQueue" :key="item.id" class="chat-queue__item">
          <div class="chat-queue__bubble">
            <span class="chat-queue__text">{{ item.content }}</span>
            <span v-if="item.attachments?.length" class="chat-queue__att" :title="t('aiChat.queuedWithAttachments')">
              <svg v-if="item.attachments[0]?.type === 'table'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {{ item.attachments.length }}
            </span>
          </div>
          <button
            class="chat-queue__send"
            type="button"
            :aria-label="t('aiChat.sendQueuedNow')"
            :title="t('aiChat.sendQueuedNow')"
            @click="sendQueuedNow(item.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 10L4 15l5 5" />
              <path d="M20 4v7a4 4 0 0 1-4 4H4" />
            </svg>
          </button>
        </div>
      </div>
      <!-- 滚动锚点：必须在消息与队列气泡之后，scrollIntoView 才能把气泡也滚进视口 -->
      <div ref="bottomAnchorRef" class="chat-anchor" />
    </div>

    <!-- 回到底部：用户上滑离开底部后出现，点击平滑回底并恢复流式跟随 -->
    <Transition name="chat-jump">
      <button
        v-if="aiChat.messages.length > 0 && !stickToBottom"
        class="chat-jump-bottom"
        type="button"
        :aria-label="t('aiChat.jumpToBottom')"
        @click="jumpToBottom"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12l7 7 7-7" />
        </svg>
      </button>
    </Transition>

    <!-- 输入卡片：候选图嵌在卡片内，下方一行 = 附加 + 输入 + 发送 -->
    <div class="chat-compose">
      <div v-if="aiChat.attachments.length" class="chat-compose__attachments">
        <div v-for="att in aiChat.attachments" :key="att.id" class="chat-compose__thumb">
          <template v-if="att.type === 'table'">
            <div class="chat-compose__thumb-table">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h8" />
                <path d="M8 9h2" />
              </svg>
              <span class="chat-compose__thumb-table-name">{{ att.filename || 'table' }}</span>
            </div>
          </template>
          <img v-else class="chat-compose__thumb-img" :src="att.uri" alt="" />
          <button
            class="chat-compose__thumb-remove"
            type="button"
            :aria-label="t('aiChat.removeAttachment')"
            @click="aiChat.removeAttachment(att.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="chat-compose__row">
        <div class="chat-compose__attach-wrap">
          <button
            class="chat-compose__attach"
            type="button"
            :aria-label="t('aiChat.attachImage')"
            :disabled="aiChat.attachments.length >= maxAttachments"
            @click="toggleAttachMenu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
          <div v-if="attachMenuOpen" class="chat-compose__attach-menu">
            <button type="button" class="chat-compose__attach-option" @click="pickAttachments">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {{ t('aiChat.attachImage') }}
            </button>
            <button type="button" class="chat-compose__attach-option" @click="pickTableFile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h3" />
                <path d="M8 17h8" />
              </svg>
              {{ t('aiChat.attachTable') }}
            </button>
          </div>
        </div>
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="chat-compose__input"
          rows="1"
          :placeholder="aiChat.sending ? t('aiChat.inputPlaceholderQueued') : t('aiChat.inputPlaceholder')"
          @input="autoGrow"
          @keydown.enter="handleEnterKey"
        />
        <!-- 流式中：有内容时可继续发送入队（触屏也能排队）；无内容时只保留停止键 -->
        <template v-if="aiChat.sending">
          <button
            v-if="!canQueueSend"
            class="chat-compose__send chat-compose__send--stop"
            type="button"
            :aria-label="t('aiChat.stopGeneration')"
            @click="aiChat.stopStreaming()"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          </button>
          <template v-else>
            <button
              class="chat-compose__send chat-compose__send--stop"
              type="button"
              :aria-label="t('aiChat.stopGeneration')"
              @click="aiChat.stopStreaming()"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              </svg>
            </button>
            <button
              class="chat-compose__send chat-compose__send--queue"
              type="button"
              :aria-label="t('aiChat.sendQueued')"
              :title="t('aiChat.sendQueued')"
              @click="send"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          </template>
        </template>
        <button
          v-else
          class="chat-compose__send"
          type="button"
          :disabled="!inputText.trim() && aiChat.attachments.length === 0"
          :aria-label="t('aiChat.send')"
          @click="send"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>

    <input
      ref="tableFileInputRef"
      type="file"
      class="chat-compose__file-input"
      accept=".csv,.xlsx,.xlsm,.tsv,.zip"
      @change="onTableFileChange"
    />

    <AppToast :message="toastMsg" />

    <PhotoPreviewViewer
      v-model:index="previewIndex"
      :photos="previewPhotos"
    />

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
          <span class="settings-field__label">{{ t('aiChat.visionModel') }}</span>
          <input v-model.trim="settingsDraft.visionModel" type="text" autocomplete="off" spellcheck="false" :placeholder="t('aiChat.visionModelPlaceholder')" />
        </label>
        <label class="settings-field">
          <span class="settings-field__label">{{ t('aiChat.apiKey') }}</span>
          <input v-model.trim="settingsDraft.apiKey" type="password" autocomplete="off" spellcheck="false" />
        </label>
        <label class="settings-field">
          <span class="settings-field__label">{{ t('aiChat.searchApiKey') }}</span>
          <input v-model.trim="settingsDraft.searchApiKey" type="password" autocomplete="off" spellcheck="false" :placeholder="t('aiChat.searchApiKeyPlaceholder')" />
        </label>

        <div class="ai-settings-body__actions">
          <button class="settings-clear" type="button" @click="clearChat">{{ t('aiChat.clearChat') }}</button>
          <button class="settings-save" type="button" @click="saveSettings">{{ t('aiChat.save') }}</button>
        </div>

        <p class="ai-settings-body__hint">{{ t('aiChat.apiKeyHint') }}</p>
        <p class="ai-settings-body__hint">{{ t('aiChat.searchNotice') }}</p>
        <p class="ai-settings-body__hint">{{ t('aiChat.visionNotice') }}</p>
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
import { useRouter } from 'vue-router'
import { Popup } from 'vant'
import PhotoPreviewViewer from '@/components/image/PhotoPreviewViewer.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useAiChatStore } from '@/stores/aiChat'
import { useMediaPlayerStore } from '@/stores/mediaPlayer'
import { normalizeBaseUrl } from '@/services/ai/chatClient'
import { detectMarkdownContent, renderMarkdownWithThumbs } from '@/utils/markdown'
import { parseJumpHref, parseMusicPreviewHref } from '@/utils/ai/jumpLinks'
import { pickLinkedLocalImages } from '@/utils/image/localImage'
import { isTableFilename } from '@/utils/table/parseTable'

/** 单条消息最多附带的附件数（与 store MAX_ATTACHMENTS 对齐） */
const MAX_ATTACHMENTS = 3
/** 表格文件大小上限：8MB（官方 zip 多表包可能稍大） */
const MAX_TABLE_FILE_BYTES = 8 * 1024 * 1024

defineOptions({ name: 'AiChatPanel' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const aiChat = useAiChatStore()
const playerStore = useMediaPlayerStore()

const inputText = ref('')
const inputRef = ref(null)
const bottomAnchorRef = ref(null)
const showSettings = ref(false)
const showHistory = ref(false)
const settingsDraft = reactive({ baseUrl: '', model: '', apiKey: '', visionModel: '', searchApiKey: '' })
const maxAttachments = MAX_ATTACHMENTS
/** 流式中输入区是否已有可入队内容（文字或附件） */
const canQueueSend = computed(() => Boolean(inputText.value.trim()) || aiChat.attachments.length > 0)
const attachMenuOpen = ref(false)
const tableFileInputRef = ref(null)
/** 正在撤回中的消息 id */
const undoingId = ref('')
/** 是否贴近底部（流式输出时才自动跟随滚动） */
const stickToBottom = ref(true)

/** 该消息是否还有可撤回的写操作 */
function canUndo(msg) {
  if (msg.pending) return false
  const journal = msg.undoJournal
  if (!journal || journal.undone) return false
  return Array.isArray(journal.entries) && journal.entries.length > 0
}

function isUndone(msg) {
  return Boolean(msg.undoJournal?.undone)
}

async function onUndoWrite(msg) {
  if (!canUndo(msg) || undoingId.value) return
  undoingId.value = msg.id
  try {
    const result = await aiChat.undoWrite(msg.id)
    if (result.ok) showToast(t('aiChat.undoSuccess'))
    else if (result.error === 'sending') showToast(t('aiChat.undoSending'))
    else showToast(t('aiChat.undoFailed'))
  } finally {
    undoingId.value = ''
  }
}

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
  stickToBottom.value = true
  bottomAnchorRef.value?.scrollIntoView({ block: 'end', behavior })
}

/** 距底部多少像素内算「贴近底部」（自动跟随阈值） */
const BOTTOM_STICK_THRESHOLD = 80

/**
 * 消息区滚动：判断用户是否主动上滑。
 * 贴近底部 → stickToBottom=true（流式输出继续跟随）；
 * 上滑离开底部 → stickToBottom=false（停止跟随，显示回到底部按钮）。
 * @param {Event} event
 */
function onChatScroll(event) {
  const el = /** @type {HTMLElement | null} */ (event.currentTarget)
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = distance <= BOTTOM_STICK_THRESHOLD
}

/** 回到底部按钮点击 */
function jumpToBottom() {
  scrollToBottom('smooth')
}

let bottomFallbackTimer = 0

/** 附件菜单：点击面板外关闭 */
function onDocumentPointerDown(event) {
  if (!attachMenuOpen.value) return
  const target = event.target instanceof Element ? event.target : null
  if (!target) return
  if (!target.closest('.chat-compose__attach-wrap')) {
    attachMenuOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true })
  document.addEventListener('pointerdown', onDocumentPointerDown, { passive: true })
  // 打开面板/从其他页面回来时（会话状态在 store 里持续更新），落底查看最新消息。
  // 助手消息的 Markdown 是异步渲染的，首滚后稍等再补一次，兜底长内容变高
  nextTick(() => scrollToBottom())
  bottomFallbackTimer = window.setTimeout(() => scrollToBottom(), 400)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
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
/** 聊天内嵌照片的缩略图最长边；点击看原图走详情页，聊天里只做预览 */
const AI_CHAT_THUMB_SIZE = 480
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
        markdownCache[cacheKey] = await renderMarkdownWithThumbs(msg.content, { maxSize: AI_CHAT_THUMB_SIZE })
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

// ── app:// 跳转按钮：事件委托拦截，用户点击才跳 ──
const router = useRouter()

/** 共享照片查看器：照片列表 + 当前索引（-1 关闭） */
const previewPhotos = ref([])
const previewIndex = ref(-1)

/** 打开全屏照片查看（与活动详情同一套缩放/滑动交互）；表格附件不参与预览 */
function previewImageList(list, startIndex = 0) {
  const photos = (Array.isArray(list) ? list : [])
    .filter((item) => !(item && typeof item === 'object' && item.type === 'table'))
    .map((item) => (typeof item === 'string' ? { uri: String(item || '').trim() } : {
      uri: String(item?.uri || '').trim(),
      caption: String(item?.caption || '')
    }))
    .filter((item) => item.uri)
  if (photos.length === 0) return
  previewPhotos.value = photos
  // 原 startIndex 可能指向表格附件，换算到过滤后的图片列表
  const imageItems = (Array.isArray(list) ? list : [])
    .filter((item) => !(item && typeof item === 'object' && item.type === 'table') && (typeof item === 'string' ? item : item?.uri))
  const raw = imageItems[startIndex]
  const rawUri = typeof raw === 'string' ? raw : String(raw?.uri || '')
  const mapped = photos.findIndex((p) => p.uri === rawUri)
  previewIndex.value = mapped >= 0 ? mapped : 0
}

/**
 * markdown 区域点击：图片放大预览优先于 app:// 跳转。
 * 缩略图的 data-full-src 是渲染时写入的原图地址（见 renderMarkdownWithThumbs）。
 * @param {MouseEvent} event
 */
function onMarkdownClick(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target) return

  const img = target.closest('img')
  if (img) {
    const root = img.closest('.chat-markdown') || img.parentElement
    const list = root
      ? Array.from(root.querySelectorAll('img')).map((el) => (
        el.getAttribute('data-full-src') || el.getAttribute('src') || ''
      )).filter(Boolean)
      : []
    const full = img.getAttribute('data-full-src') || img.getAttribute('src') || ''
    const startIndex = list.indexOf(full) >= 0 ? list.indexOf(full) : 0
    const nextList = list.length > 0 ? list : [full]
    if (nextList[0]) {
      event.preventDefault()
      previewImageList(nextList, startIndex)
    }
    return
  }

  const anchor = target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  // 试听链接：app://play_music/<source>/<id>，点一下直接播，不跳路由
  const musicPreview = parseMusicPreviewHref(href)
  if (musicPreview) {
    event.preventDefault()
    void playMusicPreviewHref(musicPreview.source, musicPreview.id, anchor.textContent || '')
    return
  }
  const jump = parseJumpHref(href)
  if (!jump) return
  event.preventDefault()
  router.push(jump).catch(() => {
    showToast(t('aiChat.jumpFailed'))
  })
}

// 新消息 / 工具步骤 / 内容（含流式思维链）/ 排队气泡更新时滚到底部；
// 但用户主动上滑阅读历史时停止跟随（stickToBottom=false），避免被拉回底部
const scrollSignal = computed(() => {
  const list = aiChat.messages
  const queueLen = aiChat.sendQueue.length
  if (list.length === 0 && queueLen === 0) return 0
  const last = list[list.length - 1]
  return list.length * 1000 + (last ? last.steps.length * 10 + last.content.length + (last.reasoning?.length || 0) : 0) + queueLen
})

watch(scrollSignal, () => {
  if (!stickToBottom.value) return
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
  // 允许「只发附件 + 一句话」；纯附件无文字时引导用户补一句要求
  if (!text && aiChat.attachments.length === 0) return
  if (!aiChat.config.baseUrl || !aiChat.config.model || !aiChat.config.apiKey) {
    showToast(t('aiChat.errorNoConfig'))
    openSettings()
    return
  }
  if (!text && aiChat.attachments.length > 0) {
    showToast(t('aiChat.attachNeedText'))
    return
  }
  inputText.value = ''
  nextTick(autoGrow)
  // 排队时不再 toast——气泡本身就是反馈
  void aiChat.send(text)
}

/** 排队气泡旁的 ↵：打断当前生成并立即发送该条 */
function sendQueuedNow(id) {
  aiChat.sendQueuedNow(id)
}

/** ask_user 手动输入草稿 */
const askDraft = ref('')
/** @param {any} msg */
function submitAskManual(msg) {
  const text = askDraft.value.trim()
  if (!text || !msg?.pendingAsk) return
  askDraft.value = ''
  aiChat.answerAskUser(text)
}

/** 正在拉起试听的选项 key（用于转圈反馈） */
const askPreviewBusy = ref('')

/** 音源展示名：出现在「歌名 · 歌手 · 音源 · 时长」里，解析时丢弃 */
const PREVIEW_SOURCE_LABELS = new Set([
  '网易云', '网易', 'netease',
  'QQ', 'qq', 'QQ音乐', 'qq音乐',
  'B站', 'bilibili', 'Bilibili',
  'manual', '手动'
])

/**
 * 把试听文案拆成 title/artist：兼容 AI 把「歌名 · 歌手 · 音源 · 时长」整段塞进 title 的情况。
 * @param {string} rawTitle
 * @param {string} [rawArtist]
 */
function normalizePreviewTrackMeta(rawTitle, rawArtist = '') {
  let title = String(rawTitle || '').replace(/^▶\s*/, '').trim()
  let artist = String(rawArtist || '').trim()
  if (!title) return { title: '', artist: '' }
  const isNoise = (/** @type {string} */ part) =>
    PREVIEW_SOURCE_LABELS.has(part)
    || /^\d{1,2}:\d{2}(:\d{2})?$/.test(part)
    || /^\d+\s*ms$/i.test(part)

  if (!artist && /[·•]/.test(title)) {
    const parts = title.split(/[·•]/).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      title = parts[0]
      artist = parts.slice(1).find((p) => !isNoise(p)) || ''
    }
  }
  return { title, artist }
}

/**
 * 选项是否有可在线试听的音源 id。
 * @param {any} option
 */
function canPreviewAskOption(option) {
  if (!option || typeof option !== 'object') return false
  return Boolean(
    String(option.neteaseSongId || '').trim()
    || String(option.qqSongId || '').trim()
    || String(option.bilibiliVideoId || '').trim()
  )
}

/**
 * @param {any} option
 */
function previewKeyOf(option) {
  if (!option || typeof option !== 'object') return ''
  return String(
    option.neteaseSongId || option.qqSongId || option.bilibiliVideoId || option.label || ''
  ).trim()
}

/** 该选项是否正在播放器里播放/加载 */
function isAskPreviewActive(option) {
  const key = previewKeyOf(option)
  return Boolean(key) && String(playerStore.currentTrackId || '') === key
}

/** 正在播放的选项：按钮显示暂停 */
function isAskPreviewPlaying(option) {
  return isAskPreviewActive(option) && Boolean(playerStore.isPlaying)
}

/**
 * 试听 ask_user 选项：用选中候选的音源 id 直接拉起应用内播放器（不写库）。
 * 已在播的同一首 → 暂停/继续。
 * @param {any} option
 */
async function playAskPreview(option) {
  if (!canPreviewAskOption(option)) return
  const key = previewKeyOf(option)
  if (!key || askPreviewBusy.value === key) return

  // 当前已在播这一首：点按钮切换暂停/继续
  if (isAskPreviewActive(option)) {
    try {
      await playerStore.toggleTrackPlayback(playerStore.currentTrack || { id: key })
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e))
    }
    return
  }

  askPreviewBusy.value = key
  try {
    const neteaseSongId = String(option.neteaseSongId || '').trim()
    const qqSongId = String(option.qqSongId || '').trim()
    const bilibiliVideoId = String(option.bilibiliVideoId || '').trim()
    const source =
      String(option.source || '').trim()
      || (neteaseSongId ? 'netease' : qqSongId ? 'qq' : bilibiliVideoId ? 'bilibili' : '')
    const meta = normalizePreviewTrackMeta(
      String(option.title || '').trim() || String(option.label || '').trim(),
      String(option.artist || '').trim()
    )
    const track = {
      id: key,
      title: meta.title || key,
      artist: meta.artist,
      album: String(option.album || '').trim(),
      coverUrl: String(option.coverUrl || '').trim(),
      durationMs: Math.max(0, Number(option.durationMs) || 0),
      source,
      neteaseSongId,
      qqSongId,
      bilibiliVideoId
    }
    // 超时兜底：网络卡住时不要让按钮永远停在禁用/灰态
    await Promise.race([
      playerStore.playTrack(track),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('试听加载超时，请稍后重试')), 20000)
      })
    ])
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e))
  } finally {
    askPreviewBusy.value = ''
  }
}

/**
 * 回复正文里的试听链接 app://play_music/<source>/<id>。
 * @param {'netease' | 'qq' | 'bilibili'} source
 * @param {string} id
 * @param {string} label 链接文案，可含「歌名 · 歌手」等
 */
async function playMusicPreviewHref(source, id, label) {
  const trackId = String(id || '').trim()
  const src = String(source || '').trim()
  if (!trackId || !src) return
  const meta = normalizePreviewTrackMeta(label, '')
  try {
    await Promise.race([
      playerStore.playTrack({
        id: trackId,
        title: meta.title || trackId,
        artist: meta.artist,
        album: '',
        coverUrl: '',
        durationMs: 0,
        source: src,
        neteaseSongId: src === 'netease' ? trackId : '',
        qqSongId: src === 'qq' ? trackId : '',
        bilibiliVideoId: src === 'bilibili' ? trackId : ''
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('试听加载超时，请稍后重试')), 20000)
      })
    ])
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e))
  }
}

/**
 * 从相册选图：仅挂到待发附件区，不自动触发视觉分析。
 * 用户明确要求「看看这张」后，模型才会调用 vision_analyze。
 */
async function pickAttachments() {
  attachMenuOpen.value = false
  if (aiChat.attachments.length >= MAX_ATTACHMENTS) {
    showToast(t('aiChat.attachLimit', { count: MAX_ATTACHMENTS }))
    return
  }
  try {
    const room = MAX_ATTACHMENTS - aiChat.attachments.length
    const picked = await pickLinkedLocalImages(room)
    if (!picked?.length) return
    aiChat.addAttachments(
      picked.map((item) => ({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: item.uri,
        localPath: item.localPath || '',
        type: 'image'
      }))
    )
  } catch (e) {
    console.warn('[ai-chat:view] pick attachment failed', e)
    showToast(t('aiChat.attachFailed'))
  }
}

function toggleAttachMenu() {
  if (aiChat.sending) return
  attachMenuOpen.value = !attachMenuOpen.value
}

function pickTableFile() {
  attachMenuOpen.value = false
  if (aiChat.attachments.length >= MAX_ATTACHMENTS) {
    showToast(t('aiChat.attachLimit', { count: MAX_ATTACHMENTS }))
    return
  }
  tableFileInputRef.value?.click()
}

/**
 * 读取选中的表格文件，挂到待发附件区。
 * 内容只进内存 registry（store.addAttachments 的 content），不写 localStorage。
 * @param {Event} event
 */
async function onTableFileChange(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isTableFilename(file.name)) {
    showToast(t('aiChat.attachTableUnsupported'))
    return
  }
  if (file.size > MAX_TABLE_FILE_BYTES) {
    showToast(t('aiChat.attachTableTooLarge', { size: '8MB' }))
    return
  }
  try {
    const isText = /\.(csv|tsv)$/i.test(file.name)
    const content = isText ? await file.text() : await file.arrayBuffer()
    aiChat.addAttachments([
      {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: '',
        localPath: '',
        type: 'table',
        filename: file.name,
        content
      }
    ])
  } catch (e) {
    console.warn('[ai-chat:view] read table file failed', e)
    showToast(t('aiChat.attachTableFailed'))
  }
}

function openSettings() {
  settingsDraft.baseUrl = aiChat.config.baseUrl
  settingsDraft.model = aiChat.config.model
  settingsDraft.visionModel = aiChat.config.visionModel || ''
  settingsDraft.apiKey = aiChat.config.apiKey
  settingsDraft.searchApiKey = aiChat.config.searchApiKey || ''
  showSettings.value = true
}

function saveSettings() {
  aiChat.updateConfig({
    baseUrl: normalizeBaseUrl(settingsDraft.baseUrl),
    model: settingsDraft.model,
    visionModel: settingsDraft.visionModel,
    apiKey: settingsDraft.apiKey,
    searchApiKey: settingsDraft.searchApiKey
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
  position: relative;
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
  padding: 16px var(--page-padding) 8px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 空状态：内容垂直居中；有消息后从顶部排列 */
.chat-area:not(.chat-area--filled) {
  justify-content: center;
}

/* 空态时让消息列撑满可用高度并居中，避免整块内容偏下 */
.chat-area:not(.chat-area--filled) .chat-messages {
  flex: 1;
  justify-content: center;
}

.chat-area--filled {
  justify-content: flex-start;
}

/* 消息列表：TransitionGroup 容器，负责消息间距 */
.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-anchor {
  height: 1px;
}

/* ── 回到底部浮动按钮 ── */
.chat-jump-bottom {
  position: absolute;
  right: var(--page-padding);
  /* 悬在输入卡上方，不挡住发送按钮 */
  bottom: calc(72px + max(12px, env(safe-area-inset-bottom)));
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface);
  color: var(--app-text);
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.chat-jump-bottom:active {
  transform: scale(0.94);
}

.chat-jump-bottom svg {
  width: 20px;
  height: 20px;
}

.chat-jump-enter-active,
.chat-jump-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.chat-jump-enter-from,
.chat-jump-leave-to {
  opacity: 0;
  transform: translateY(6px);
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

/* 本轮写操作一键撤回 */
.chat-undo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.chat-undo:active:not(:disabled) {
  transform: scale(0.96);
}

.chat-undo:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-undo svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-undo-done {
  margin: 8px 0 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
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

/* ── ask_user 提问：选项一行一个 + 手动输入 ── */
.chat-ask {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--app-border);
}

.chat-ask__question {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.45;
}

.chat-ask__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-ask__option-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.chat-ask__option {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.chat-ask__option:hover {
  border-color: color-mix(in srgb, var(--app-text) 30%, transparent);
}

.chat-ask__option:active {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

/* 试听键：与选项等高，仅在有音源 id 时出现 */
.chat-ask__play {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  border: 1px solid color-mix(in srgb, var(--app-text) 12%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-text) 4%, transparent);
  color: var(--app-text);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
}

.chat-ask__play svg {
  width: 16px;
  height: 16px;
}

.chat-ask__play:not(:disabled):hover,
.chat-ask__play:not(:disabled):active {
  border-color: color-mix(in srgb, var(--app-text) 28%, transparent);
  background: color-mix(in srgb, var(--app-text) 10%, transparent);
  color: var(--app-text);
}

.chat-ask__play:not(:disabled):active {
  transform: scale(0.94);
}

.chat-ask__play:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* 正在试听：深色高亮，区分未播放的灰三角 */
.chat-ask__play--active {
  border-color: color-mix(in srgb, var(--app-text) 35%, transparent);
  background: var(--app-text);
  color: var(--app-surface);
  opacity: 1;
}

.chat-ask__play--playing {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 12%, transparent);
}

.chat-ask__play-spinner {
  animation: spin 0.7s linear infinite;
}

.chat-ask__manual {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.chat-ask__input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
}

.chat-ask__input:focus {
  border-color: color-mix(in srgb, var(--app-text) 40%, transparent);
}

.chat-ask__input::placeholder {
  color: var(--app-text-tertiary);
}

.chat-ask__manual-send {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: #141416;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
}

.chat-ask__manual-send:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.chat-ask__manual-send:not(:disabled):active {
  transform: scale(0.92);
}

.chat-ask__manual-send svg {
  width: 16px;
  height: 16px;
}

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

/* app:// 跳转按钮：胶囊样式，与其他链接区分 */
.chat-markdown :deep(a.chat-jump-btn) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 4px 6px 2px 0;
  padding: 5px 14px;
  border: 1px solid var(--app-chip-accent-border, var(--app-border));
  border-radius: 999px;
  background: var(--app-chip-accent-bg, transparent);
  color: var(--app-chip-accent-text, #2070c0);
  font-size: 13px;
  line-height: 1.3;
  word-break: keep-all;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.chat-markdown :deep(a.chat-jump-btn:active) {
  opacity: 0.6;
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

/* ── Attachments ── */
.chat-attach-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.chat-attach-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--app-surface) 30%, transparent);
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  cursor: zoom-in;
}

.chat-msg--user .chat-attach-thumb {
  border-color: color-mix(in srgb, var(--app-surface) 35%, transparent);
}

/* ── Top bar（历史/设置） ── */
.chat-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px var(--page-padding) 0;
}

.chat-topbar__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.chat-topbar__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.chat-topbar__btn:active {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

.chat-topbar__btn svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ── Compose card（参考 DeepSeek：圆角卡片 + 内嵌附件 + 一行操作） ── */
.chat-compose {
  flex-shrink: 0;
  margin: 8px var(--page-padding) max(12px, env(safe-area-inset-bottom));
  padding: 6px 6px 6px 4px;
  border: 1px solid var(--app-border);
  border-radius: 22px;
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.chat-compose:focus-within {
  border-color: rgba(52, 199, 89, 0.5);
  box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.1);
}

.chat-compose__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 6px 8px 40px;
}

.chat-compose__thumb {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.chat-compose__thumb:has(.chat-compose__thumb-table) {
  width: auto;
  min-width: 52px;
  max-width: 160px;
  height: 52px;
}

.chat-compose__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

.chat-compose__thumb-remove {
  position: absolute;
  top: -5px;
  right: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--app-text);
  color: var(--app-surface);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16);
}

.chat-compose__thumb-remove svg {
  width: 10px;
  height: 10px;
}

.chat-compose__row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 44px;
}

.chat-compose__attach {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0 0 0 2px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.chat-compose__attach:not(:disabled):active {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text);
}

.chat-compose__attach:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.chat-compose__attach svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chat-compose__attach-wrap {
  position: relative;
  flex-shrink: 0;
}

.chat-compose__attach-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 148px;
  padding: 4px;
  border-radius: 12px;
  background: var(--app-surface, #fff);
  border: 1px solid color-mix(in srgb, var(--app-text) 8%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.chat-compose__attach-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.chat-compose__attach-option:active {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}

.chat-compose__attach-option svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--app-text-secondary);
}

.chat-compose__thumb-table {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 0 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  color: var(--app-text-secondary);
  overflow: hidden;
}

.chat-compose__thumb-table svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.chat-compose__thumb-table-name {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 96px;
}

.chat-compose__file-input {
  display: none;
}

.chat-attach-table-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 6px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-secondary);
  font-size: 12px;
}

.chat-attach-table-chip svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.chat-attach-table-chip span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-compose__input {
  flex: 1;
  min-width: 0;
  resize: none;
  overflow-y: hidden;
  max-height: 120px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--app-text);
  font-size: 15px;
  line-height: 1.45;
  font-family: inherit;
  outline: none;
  min-height: 36px;
  box-sizing: border-box;
}

/* 空输入：占位左对齐，单行在输入框内垂直居中 */
.chat-compose__input:placeholder-shown {
  padding-top: 0;
  padding-bottom: 0;
  line-height: 36px;
}

/* 有内容：恢复正常上下内边距，多行滚动 */
.chat-compose__input:not(:placeholder-shown) {
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: 1.45;
}

.chat-compose__input::-webkit-scrollbar {
  display: none;
}

.chat-compose__input:disabled {
  opacity: 0.55;
}

.chat-compose__send {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0 2px 0 0;
  border: none;
  border-radius: 50%;
  background: #141416;
  color: #fff;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.2s ease, background-color 0.2s ease;
}

.chat-compose__send:not(:disabled):active {
  transform: scale(0.92);
}

.chat-compose__send:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.chat-compose__send svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 流式生成中的停止键：深色底上的白色方块 */
.chat-compose__send--stop {
  background: #e5484d;
}

.chat-compose__send--stop:active {
  transform: scale(0.92);
}

.chat-compose__send--stop svg {
  stroke: none;
}

/* 流式中继续排队发送：蓝色区分于停止键 */
.chat-compose__send--queue {
  background: #3b82f6;
}

.chat-compose__send--queue:active {
  transform: scale(0.92);
}

.chat-compose__spinner {
  animation: spin 0.7s linear infinite;
}

/* ── 排队气泡（仿 Codex：半透明挂在回复下方，↵ 立即发送） ── */
.chat-queue {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding: 0 0 4px;
}

.chat-queue__item {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(85%, 480px);
  animation: page-fade-up 0.25s ease backwards;
}

.chat-queue__bubble {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 18px 18px 4px 18px;
  background: color-mix(in srgb, var(--app-text) 10%, transparent);
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.45;
  opacity: 0.55;
  /* 最多 4 行，超出省略 */
}

.chat-queue__text {
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}

.chat-queue__att {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 12%, transparent);
  font-size: 11px;
  color: var(--app-text-secondary);
}

.chat-queue__att svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.chat-queue__send {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface);
  color: var(--app-text-secondary);
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 0.15s ease, transform 0.15s ease, color 0.15s ease;
}

.chat-queue__send:hover,
.chat-queue__send:active {
  opacity: 1;
  color: var(--app-text);
  transform: scale(0.94);
}

.chat-queue__send svg {
  width: 14px;
  height: 14px;
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
