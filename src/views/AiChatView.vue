<template>
  <div class="page ai-chat-page">
    <NavBar :title="t('nav.aiChat')" show-back />

    <main class="page-body page-entry">
      <section :class="['hero-section', { 'hero-section--collapsed': heroCollapsed }]">
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

      <AiChatPanel />
    </main>
  </div>
</template>

<script setup>
// @ts-check
// AI 助手完整页面：聊天交互全部在 AiChatPanel（与全局下拉弹窗共用同一份会话状态）
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import AiChatPanel from '@/components/ai/AiChatPanel.vue'
import { useAiChatStore } from '@/stores/aiChat'

defineOptions({ name: 'AiChatView' })

const { t } = useI18n()
const aiChat = useAiChatStore()

// 手机端：已有对话内容时收起 hero 卡片，把纵向空间让给消息区（桌面端保持展示）
const heroCollapsed = computed(() => aiChat.messages.length > 0)
</script>

<style scoped>
.ai-chat-page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.page-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

/* ── Hero ── */
.hero-section {
  padding: 0 var(--page-padding);
  margin-top: var(--section-gap);
  animation: page-fade-up 0.4s ease backwards;
  /* 折叠用：高度变化走过渡，overflow 裁掉收起中的内容 */
  max-height: 420px;
  overflow: hidden;
  transition:
    max-height 0.35s ease,
    margin-top 0.35s ease,
    opacity 0.3s ease,
    transform 0.35s ease;
}

/* 手机端（<900px）已有对话内容时收起 hero，为消息区让出纵向空间 */
@media (max-width: 899px) {
  .hero-section--collapsed {
    max-height: 0;
    margin-top: 0;
    opacity: 0;
    transform: translateY(-12px);
    pointer-events: none;
  }
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

/* Responsive（高度分层与 base.css 的 app-wrapper 容器对齐） */
@media (min-width: 520px) {
  .ai-chat-page {
    height: calc(100dvh - 48px);
  }
}

@media (min-width: 900px) {
  .ai-chat-page {
    height: 100dvh;
  }
}

@media (max-width: 767px) {
  .hero-title {
    font-size: 22px;
  }
}
</style>
