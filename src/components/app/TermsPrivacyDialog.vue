<template>
  <!-- Web/iOS 不同意后的阻断页 -->
  <div
    v-if="legalStore.gateBlocked"
    class="legal-blocked"
    role="alertdialog"
    aria-modal="true"
  >
    <div class="legal-blocked__card">
      <h2 class="legal-blocked__title">{{ t('manage.legalBlockedTitle') }}</h2>
      <p class="legal-blocked__desc">{{ t('manage.legalBlockedDesc') }}</p>
      <button type="button" class="legal-blocked__btn" @click="legalStore.reopenGate()">
        {{ t('manage.legalBlockedReopen') }}
      </button>
    </div>
  </div>

  <AppSheet
    :model-value="legalStore.dialogVisible"
    placement="center"
    size="wide"
    :z-index="1300"
    :close-on-overlay="!legalStore.isGateMode"
    sheet-class="legal-sheet"
    @update:model-value="onSheetUpdate"
  >
    <p class="legal-kicker">{{ legalStore.isGateMode ? t('manage.legalGateKicker') : t('manage.legalViewerKicker') }}</p>
    <h3 class="legal-title">
      {{ legalStore.isGateMode ? t('manage.legalGateTitle') : viewerTitle }}
    </h3>
    <p v-if="legalStore.isGateMode" class="legal-lead">{{ t('manage.legalGateLead') }}</p>

    <div class="legal-tabs" role="tablist">
      <button
        type="button"
        class="legal-tab"
        :class="{ 'legal-tab--active': legalStore.activeDocType === 'terms' }"
        role="tab"
        :aria-selected="legalStore.activeDocType === 'terms'"
        @click="legalStore.setDocType('terms')"
      >
        {{ t('manage.legalTabTerms') }}
      </button>
      <button
        type="button"
        class="legal-tab"
        :class="{ 'legal-tab--active': legalStore.activeDocType === 'privacy' }"
        role="tab"
        :aria-selected="legalStore.activeDocType === 'privacy'"
        @click="legalStore.setDocType('privacy')"
      >
        {{ t('manage.legalTabPrivacy') }}
      </button>
    </div>

    <div class="legal-body markdown-body" v-html="contentHtml" />

    <div class="legal-meta">
      <span>{{ t('manage.legalVersionLabel', { version: LEGAL_DOCS_VERSION }) }}</span>
    </div>

    <div v-if="legalStore.isGateMode" class="legal-actions">
      <button type="button" class="legal-btn legal-btn--secondary" @click="legalStore.disagree()">
        {{ t('manage.legalDecline') }}
      </button>
      <button type="button" class="legal-btn legal-btn--primary" @click="onAccept">
        {{ t('manage.legalAccept') }}
      </button>
    </div>
    <div v-else class="legal-actions legal-actions--viewer">
      <button type="button" class="legal-btn legal-btn--secondary" @click="legalStore.closeViewer()">
        {{ t('common.known') }}
      </button>
    </div>
  </AppSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSheet from '@/components/common/AppSheet.vue'
import { useDialogBackButton } from '@/composables/useDialogBackButton'
import { useLegalStore } from '@/stores/legal'
import { renderMarkdown } from '@/utils/markdown'
import { getLegalDoc } from '@/content/legal'
import { LEGAL_DOCS_VERSION } from '@/constants/legalConstants'

const { t, locale } = useI18n()
const legalStore = useLegalStore()

const contentHtml = ref('')

const viewerTitle = computed(() =>
  legalStore.activeDocType === 'privacy'
    ? t('manage.legalTabPrivacy')
    : t('manage.legalTabTerms')
)

watch(
  () => [legalStore.activeDocType, locale.value],
  async () => {
    const md = getLegalDoc(legalStore.activeDocType, locale.value)
    contentHtml.value = await renderMarkdown(md)
  },
  { immediate: true }
)

function onAccept() {
  void legalStore.acceptDocs()
}

function onSheetUpdate(visible) {
  if (visible) return
  if (legalStore.isGateMode) {
    legalStore.disagree()
    return
  }
  legalStore.closeViewer()
}

useDialogBackButton(
  () => {
    if (legalStore.gateVisible) {
      legalStore.disagree()
      return
    }
    if (legalStore.viewerVisible) legalStore.closeViewer()
  },
  () => legalStore.dialogVisible
)
</script>

<style scoped>
.legal-kicker {
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.legal-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.legal-lead {
  margin: 10px 0 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.legal-tabs {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.legal-tab {
  flex: 1;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.legal-tab--active {
  border-color: var(--app-text);
  background: var(--app-text);
  color: var(--app-bg);
}

.legal-body {
  margin-top: 12px;
  max-height: min(48vh, 420px);
  overflow-y: auto;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--app-text) 22%, transparent) transparent;
}

.legal-body::-webkit-scrollbar {
  width: 5px;
}

.legal-body::-webkit-scrollbar-track {
  display: none;
  background: transparent;
}

.legal-body::-webkit-scrollbar-thumb {
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-text) 22%, transparent);
}

.legal-body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--app-text) 32%, transparent);
}

.legal-body::-webkit-scrollbar-corner {
  background: transparent;
}

.legal-body :deep(h1) {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 1.25em;
  font-weight: 700;
  line-height: 1.3;
}

.legal-body :deep(h2) {
  margin: 16px 0 8px;
  color: var(--app-text);
  font-size: 1.1em;
  font-weight: 600;
  line-height: 1.35;
}

.legal-body :deep(p) {
  margin: 8px 0;
}

.legal-body :deep(ul),
.legal-body :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.legal-body :deep(li) {
  margin: 4px 0;
}

.legal-body :deep(table) {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
  font-size: 12px;
}

.legal-body :deep(th),
.legal-body :deep(td) {
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  text-align: left;
}

.legal-body :deep(th) {
  background: var(--app-surface-soft);
  font-weight: 600;
}

.legal-meta {
  margin-top: 10px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.legal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.legal-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 500;
}

.legal-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.legal-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

/* 阻断页：无法 exitApp 时的全屏占位 */
.legal-blocked {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-bg-gradient);
}

.legal-blocked__card {
  width: min(400px, 100%);
  padding: 28px 24px;
  border-radius: 16px;
  background: var(--app-surface, var(--app-bg));
  border: 1px solid var(--app-border);
  text-align: center;
}

.legal-blocked__title {
  margin: 0;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 700;
}

.legal-blocked__desc {
  margin: 12px 0 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.legal-blocked__btn {
  margin-top: 20px;
  min-height: 42px;
  width: 100%;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--app-text);
  color: var(--app-bg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 480px) {
  .legal-actions {
    flex-direction: column-reverse;
  }

  .legal-btn {
    width: 100%;
  }
}
</style>
