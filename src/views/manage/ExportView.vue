<template>
  <div class="page data-transfer-page data-transfer-page--export">
    <NavBar :title="t('manage.export')" show-back />

    <main class="page-body page-entry">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8L12 3L7 8" />
              <path d="M12 3V15" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">{{ t('manage.exportKicker') }}</p>
            <h1 class="hero-title">{{ t('manage.export') }}</h1>
            <p class="hero-desc">{{ t('manage.exportDetail') }}</p>
            <div class="hero-meta">
              <span class="hero-chip">{{ exportSummaryText }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">FORMAT</p>
            <h2 class="settings-card__title">{{ t('manage.exportFormat') }}</h2>
          </div>

          <div class="transfer-options transfer-options--grid" role="radiogroup" :aria-label="t('manage.exportFormat')">
            <button
              v-for="format in formatOptions"
              :key="format.key"
              type="button"
              role="radio"
              :aria-checked="exportFormat === format.key"
              :class="['transfer-option', { 'transfer-option--active': exportFormat === format.key }]"
              @click="setExportFormat(format.key)"
            >
              <span class="transfer-option__body">
                <span class="transfer-option__name">{{ format.title }}</span>
                <span class="transfer-option__desc">{{ format.desc }}</span>
                <span class="transfer-option__meta">{{ format.meta }}</span>
              </span>
              <span class="transfer-option__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header settings-card__header--row">
            <div>
              <p class="settings-card__label">CONTENT</p>
              <h2 class="settings-card__title">{{ t('manage.exportSelectData') }}</h2>
            </div>
            <button class="transfer-toggle-all" type="button" @click="toggleExportAll">
              {{ allExportSectionsSelected ? t('common.deselectAll') : t('common.selectAll') }}
            </button>
          </div>

          <div class="transfer-options">
            <button
              v-for="option in exportSectionOptions"
              :key="option.key"
              type="button"
              :class="['transfer-option', { 'transfer-option--active': exportSelection[option.key] }]"
              @click="toggleExportSection(option.key)"
            >
              <span class="transfer-option__body">
                <span class="transfer-option__name">{{ option.label }}</span>
                <span class="transfer-option__desc">{{ option.desc }}</span>
              </span>
              <span class="transfer-option__check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">FINE EXPORT</p>
            <h2 class="settings-card__title">{{ t('manage.fineExportTitle') }}</h2>
          </div>

          <p class="transfer-hint">{{ t('manage.fineExportDesc') }}</p>

          <button class="transfer-action transfer-action--secondary" type="button" @click="showFineExport = true">
            {{ t('manage.fineExportOpen') }}
          </button>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-card">
          <div class="settings-card__header">
            <p class="settings-card__label">ACTIONS</p>
            <h2 class="settings-card__title">{{ t('manage.exportStart') }}</h2>
          </div>

          <p class="transfer-hint">{{ exportHint }}</p>

          <button class="transfer-action" type="button" @click="confirmExportSelection">
            {{ exportFormat === 'csv' ? t('manage.exportStartCsv') : t('manage.exportStartJson') }}
          </button>
        </div>
      </section>

      <AppToast :message="toastMsg" />
    </main>

    <FineExportSheet v-model="showFineExport" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import FineExportSheet from '@/components/manage/FineExportSheet.vue'
import { useToast } from '@/composables/useToast'
import { useManageExport, exportSectionOptions } from '@/composables/manage/useManageExport'
import { useManageEntries } from '@/config/manageEntries'

defineOptions({ name: 'ExportView' })

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const { exportSummaryText } = useManageEntries()
const showFineExport = ref(false)

const {
  exportSelection,
  exportFormat,
  allExportSectionsSelected,
  setExportFormat,
  toggleExportSection,
  toggleExportAll,
  confirmExportSelection
} = useManageExport({ showToast })

const formatOptions = computed(() => [
  {
    key: 'csv',
    title: t('manage.exportFormatCsv'),
    desc: t('manage.exportFormatCsvDesc'),
    meta: t('manage.exportFormatCsvMeta')
  },
  {
    key: 'json',
    title: t('manage.exportFormatJson'),
    desc: t('manage.exportFormatJsonDesc'),
    meta: t('manage.exportFormatJsonMeta')
  }
])

const exportHint = computed(() =>
  exportFormat.value === 'csv' ? t('manage.exportCsvHint') : t('manage.exportRecommendation')
)
</script>

<style scoped src="@/assets/views/DataTransferView.css"></style>
