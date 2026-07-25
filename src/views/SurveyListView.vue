<template>
  <div class="page survey-page">
    <NavBar :title="t('manage.surveys')" show-back />

    <main class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <div class="hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div class="hero-copy">
            <p class="hero-label">Survey</p>
            <h1 class="hero-title">{{ t('manage.surveys') }}</h1>
            <p class="hero-desc">{{ t('manage.surveyDesc') }}</p>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div v-if="surveyStore.isLoading && !surveyStore.isLoaded" class="survey-loading">
          <van-loading type="spinner" size="28" />
        </div>

        <div v-else-if="surveyStore.isLoaded && surveyStore.surveys.length === 0" class="survey-empty">
          <p class="empty-text">{{ t('survey.noSurveys') }}</p>
        </div>

        <template v-else>
          <div v-if="surveyStore.availableSurveys.length > 0" class="survey-list">
            <div
              v-for="survey in surveyStore.availableSurveys"
              :key="survey.id"
              class="survey-entry"
              @click="openSurveyPopup(survey)"
            >
              <div class="survey-entry-body">
                <div class="survey-entry-title">{{ survey.title }}</div>
                <div v-if="survey.description" class="survey-entry-desc">{{ survey.description }}</div>
                <div class="survey-entry-meta">
                  {{ survey.questions.length }} {{ t('survey.questions') }}
                  <template v-if="survey.showRule.endAt"> · {{ formatDeadline(survey.showRule.endAt) }}</template>
                </div>
              </div>
              <svg class="survey-entry-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>

          <div v-if="surveyStore.completedSurveys.length > 0" class="survey-list" style="margin-top: 20px;">
            <div class="section-head">
              <p class="section-label">{{ t('survey.completed') }}</p>
            </div>
            <div
              v-for="survey in surveyStore.completedSurveys"
              :key="survey.id"
              class="survey-entry survey-entry--done"
            >
              <div class="survey-entry-body">
                <div class="survey-entry-title">{{ survey.title }}</div>
                <div class="survey-entry-meta">{{ survey.questions.length }} {{ t('survey.questions') }}</div>
              </div>
              <svg class="survey-entry-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        </template>
      </section>
    </main>

    <SurveyPopupDialog ref="popupRef" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSurveyStore } from '@/stores/survey'
import NavBar from '@/components/common/NavBar.vue'
import SurveyPopupDialog from '@/components/app/SurveyPopupDialog.vue'

defineOptions({ name: 'SurveyListView' })

const { t } = useI18n()
const surveyStore = useSurveyStore()
const popupRef = ref(null)

onMounted(() => {
  if (!surveyStore.isLoaded) {
    surveyStore.loadSurveys()
  }
})

function openSurveyPopup(survey) {
  popupRef.value?.openSurvey(survey)
}

function formatDeadline(timestamp) {
  if (!timestamp) return ''
  const diff = timestamp - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return t('survey.expired')
  if (days <= 3) return t('survey.daysLeft', { days })
  const d = new Date(timestamp)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.survey-page {
  min-height: 100dvh;
}
.page-body {
  padding-bottom: 40px;
}
.hero-section,
.content-section {
  padding: 0 var(--page-padding);
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
  background: radial-gradient(circle, rgba(120, 100, 255, 0.18) 0%, rgba(120, 100, 255, 0) 72%);
  pointer-events: none;
}
.hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-card);
  background: rgba(120, 100, 255, 0.12);
  color: #7864ff;
}
.hero-icon svg {
  width: 32px;
  height: 32px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.hero-copy,
.section-head {
  position: relative;
  z-index: 1;
}
.hero-label,
.section-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hero-title,
.section-title {
  margin-top: 6px;
  color: var(--app-text);
  letter-spacing: -0.04em;
}
.hero-title {
  font-size: 30px;
  font-weight: 700;
}
.hero-desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}
.survey-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
.survey-empty {
  text-align: center;
  padding: 40px 0;
}
.empty-text {
  color: var(--app-text-tertiary);
  font-size: 14px;
  margin: 0;
}
.survey-list {
  display: grid;
  gap: 10px;
}
.survey-entry {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-card);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  cursor: pointer;
  transition: transform 0.15s ease;
  overflow: hidden;
  min-width: 0;
}
.survey-entry:active {
  transform: scale(var(--press-scale-card));
}
.survey-entry--done {
  opacity: 0.5;
  cursor: default;
  background: var(--app-surface-soft);
}
.survey-entry--done:active {
  transform: none;
}
.survey-entry-body {
  flex: 1;
  min-width: 0;
}
.survey-entry-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  line-height: 1.3;
}
.survey-entry-desc {
  font-size: 13px;
  color: var(--app-text-secondary);
  margin-top: 2px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.survey-entry-meta {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin-top: 4px;
}
.survey-entry-arrow,
.survey-entry-check {
  flex-shrink: 0;
  color: var(--app-text-tertiary);
}
.survey-entry-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.survey-entry-done-label {
  font-size: 12px;
  color: var(--app-text-tertiary);
  white-space: nowrap;
}
</style>
