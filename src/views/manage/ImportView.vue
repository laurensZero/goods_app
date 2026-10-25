<template>
  <div class="page data-transfer-page data-transfer-page--import">
    <NavBar :title="t('manage.import')" show-back />

    <main class="page-body page-entry">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10L12 15L17 10" />
              <path d="M12 15V3" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">{{ t('manage.importKicker') }}</p>
            <h1 class="hero-title">{{ t('manage.import') }}</h1>
            <p class="hero-desc">{{ t('manage.importDetail') }}</p>
          </div>
        </article>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">SOURCE</p>
            <h2 class="settings-card__title">{{ t('manage.statSupportedFormat') }}</h2>
          </div>

          <p class="transfer-hint">{{ t('manage.importDescText') }}</p>

          <div class="transfer-formats">
            <span v-for="format in supportedFormats" :key="format" class="transfer-format">{{ format }}</span>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">ACTIONS</p>
            <h2 class="settings-card__title">{{ t('manage.import') }}</h2>
          </div>

          <p class="transfer-hint">{{ t('manage.importRecommendation') }}</p>

          <button class="transfer-action" type="button" @click="triggerImport">
            {{ t('manage.importSelectFile') }}
          </button>
        </div>
      </section>

      <input ref="importFileRef" type="file" accept=".json,.csv,.tsv,.xlsx,.xlsm,.zip" hidden @change="handleImport" />

      <AppToast :message="toastMsg" />
    </main>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import { useToast } from '@/composables/useToast'
import { useManageExport } from '@/composables/manage/useManageExport'

defineOptions({ name: 'ImportView' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const { importFileRef, triggerImport, handleImport } = useManageExport({ showToast })

const supportedFormats = ['JSON', 'CSV', 'TSV', 'XLSX', 'CSV · ZIP']
</script>

<style scoped src="@/assets/views/DataTransferView.css"></style>
