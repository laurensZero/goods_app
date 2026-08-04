<template>
  <div class="page survey-fill-page">
    <NavBar :title="survey?.title || t('survey.title')" show-back @back="handleBack" />

    <main class="page-body">
      <!-- Survey not found -->
      <section v-if="surveyStore.isLoaded && !survey" class="content-section">
        <van-empty :description="t('survey.notFound')" image="search" />
      </section>

      <!-- Loading -->
      <section v-else-if="!surveyStore.isLoaded" class="content-section">
        <div class="survey-loading">
          <van-loading type="spinner" color="var(--van-primary-color)" size="32" />
        </div>
      </section>

      <!-- Already completed -->
      <section v-else-if="alreadyCompleted" class="content-section">
        <div class="survey-completed-state">
          <div class="survey-completed-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 class="survey-completed-title">{{ t('survey.alreadyCompleted') }}</h2>
          <p class="survey-completed-desc">{{ t('survey.thankYouDesc') }}</p>
        </div>
      </section>

      <!-- Survey form -->
      <template v-else-if="survey && !submitSuccess">
        <!-- Description -->
        <section v-if="survey.description" class="content-section">
          <p class="survey-description">{{ survey.description }}</p>
        </section>

        <!-- Progress -->
        <section class="content-section survey-progress-section">
          <div class="survey-progress-bar">
            <div
              class="survey-progress-fill"
              :style="{ width: progressPercent + '%' }"
            />
          </div>
          <span class="survey-progress-text">
            {{ answeredCount }}/{{ survey.questions.length }}
          </span>
        </section>

        <!-- Questions -->
        <section class="content-section">
          <div
            v-for="(question, index) in survey.questions"
            :key="question.id"
            class="survey-question-wrapper"
            :class="{ 'survey-question-wrapper--error': validationErrors[question.id] }"
          >
            <div class="survey-question-index">{{ index + 1 }}</div>
            <div class="survey-question-body">
              <SurveyQuestionSingleChoice
                v-if="question.type === 'single_choice'"
                :question="question"
                :model-value="answers[question.id]"
                @update:model-value="setAnswer(question.id, $event)"
              />
              <SurveyQuestionMultipleChoice
                v-else-if="question.type === 'multiple_choice'"
                :question="question"
                :model-value="answers[question.id]"
                @update:model-value="setAnswer(question.id, $event)"
              />
              <SurveyQuestionText
                v-else-if="question.type === 'text'"
                :question="question"
                :model-value="answers[question.id]"
                @update:model-value="setAnswer(question.id, $event)"
              />
              <SurveyQuestionRating
                v-else-if="question.type === 'rating'"
                :question="question"
                :model-value="answers[question.id]"
                @update:model-value="setAnswer(question.id, $event)"
              />
              <SurveyQuestionMatrix
                v-else-if="question.type === 'matrix'"
                :question="question"
                :model-value="answers[question.id]"
                @update:model-value="setAnswer(question.id, $event)"
              />
              <p v-if="validationErrors[question.id]" class="survey-question-error">
                {{ validationErrors[question.id] }}
              </p>
            </div>
          </div>
        </section>

        <!-- Submit button -->
        <section class="content-section survey-submit-section">
          <van-button
            type="primary"
            block
            round
            size="large"
            :loading="isSubmitting"
            :disabled="isSubmitting"
            @click="handleSubmit"
          >
            {{ isSubmitting ? t('survey.submitting') : t('survey.submit') }}
          </van-button>
        </section>
      </template>

      <!-- Submit success -->
      <section v-else-if="submitSuccess" class="content-section">
        <div class="survey-success-state">
          <div class="survey-success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 class="survey-success-title">{{ t('survey.thankYou') }}</h2>
          <p class="survey-success-desc">{{ t('survey.thankYouDesc') }}</p>
          <van-button
            type="default"
            round
            size="large"
            class="survey-back-btn"
            @click="router.push('/manage/surveys')"
          >
            {{ t('survey.backToList') }}
          </van-button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSurveyStore } from '@/stores/survey'
import { submitSurveyResponse } from '@/services/surveyService'
import NavBar from '@/components/common/NavBar.vue'
import SurveyQuestionSingleChoice from '@/components/survey/SurveyQuestionSingleChoice.vue'
import SurveyQuestionMultipleChoice from '@/components/survey/SurveyQuestionMultipleChoice.vue'
import SurveyQuestionText from '@/components/survey/SurveyQuestionText.vue'
import SurveyQuestionRating from '@/components/survey/SurveyQuestionRating.vue'
import SurveyQuestionMatrix from '@/components/survey/SurveyQuestionMatrix.vue'

defineOptions({ name: 'SurveyFillView' })

const props = defineProps({
  id: { type: String, required: true }
})

const { t } = useI18n()
const router = useRouter()
const surveyStore = useSurveyStore()

const answers = reactive({})
const validationErrors = reactive({})
const isSubmitting = ref(false)
const submitSuccess = ref(false)

const survey = computed(() => surveyStore.getSurveyById(props.id))

// 预初始化所有问题的答案，确保 Vue 响应式系统能追踪到每个 key
watch(survey, (s) => {
  if (!s) return
  for (const q of s.questions) {
    if (!(q.id in answers)) {
      if (q.type === 'multiple_choice') answers[q.id] = []
      else if (q.type === 'matrix') answers[q.id] = {}
      else if (q.type === 'rating') answers[q.id] = 0
      else answers[q.id] = ''
    }
  }
}, { immediate: true })

const alreadyCompleted = computed(() => surveyStore.isCompleted(props.id))

const answeredCount = computed(() => {
  if (!survey.value) return 0
  let count = 0
  for (const q of survey.value.questions) {
    const val = answers[q.id]
    if (val !== undefined && val !== '' && val !== null) {
      if (Array.isArray(val)) {
        if (val.length > 0) count++
      } else if (typeof val === 'object') {
        if (Object.keys(val).length > 0) count++
      } else {
        count++
      }
    }
  }
  return count
})

const progressPercent = computed(() => {
  if (!survey.value || survey.value.questions.length === 0) return 0
  return Math.round((answeredCount.value / survey.value.questions.length) * 100)
})

function setAnswer(questionId, value) {
  answers[questionId] = value
  if (validationErrors[questionId]) {
    delete validationErrors[questionId]
  }
}

function validate() {
  if (!survey.value) return false
  const errors = {}
  let valid = true

  for (const q of survey.value.questions) {
    if (!q.required) continue
    const val = answers[q.id]

    let isEmpty = false
    if (val === undefined || val === null || val === '') {
      isEmpty = true
    } else if (Array.isArray(val) && val.length === 0) {
      isEmpty = true
    } else if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) {
      isEmpty = true
    }

    if (isEmpty) {
      errors[q.id] = t('survey.required')
      valid = false
    }
  }

  Object.keys(validationErrors).forEach(k => delete validationErrors[k])
  Object.assign(validationErrors, errors)
  return valid
}

async function handleSubmit() {
  if (isSubmitting.value) return
  if (!validate()) return

  isSubmitting.value = true
  try {
    const answerList = survey.value.questions.map(q => ({
      questionId: q.id,
      value: answers[q.id] !== undefined ? answers[q.id] : null
    }))

    await submitSurveyResponse(props.id, answerList)
    surveyStore.markCompleted(props.id)
    submitSuccess.value = true
  } catch (e) {
    console.error('[survey] submit failed:', e)
  } finally {
    isSubmitting.value = false
  }
}

function handleBack() {
  router.back()
}

onMounted(() => {
  if (!surveyStore.isLoaded) {
    surveyStore.loadSurveys()
  }
})
</script>

<style scoped>
.survey-fill-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--van-background);
}
.page-body {
  flex: 1;
  padding-bottom: 100px;
}
.content-section {
  padding: 0 20px 16px;
}

/* Loading */
.survey-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

/* Description */
.survey-description {
  font-size: 14px;
  color: var(--van-text-color-2);
  line-height: 1.6;
  margin: 12px 0 0;
  padding: 12px 16px;
  background: var(--van-background-2);
  border-radius: 10px;
}

/* Progress */
.survey-progress-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
}
.survey-progress-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--van-background-2);
  overflow: hidden;
}
.survey-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--van-primary-color);
  transition: width 0.3s ease;
}
.survey-progress-text {
  font-size: 13px;
  color: var(--van-text-color-2);
  font-weight: 500;
  white-space: nowrap;
}

/* Questions */
.survey-question-wrapper {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--van-border-color-light);
}
.survey-question-wrapper:last-child {
  border-bottom: none;
}
.survey-question-wrapper--error {
  background: rgba(var(--van-danger-color-rgb, 238, 10, 36), 0.04);
  border-radius: 8px;
  margin: 0 -8px;
  padding: 4px 8px;
}
.survey-question-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--van-primary-color-light);
  color: var(--van-primary-color);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 18px;
}
.survey-question-body {
  flex: 1;
  min-width: 0;
}
.survey-question-error {
  font-size: 12px;
  color: var(--van-danger-color);
  margin: 4px 0 0;
}

/* Submit */
.survey-submit-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 20px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--van-background);
  border-top: 1px solid var(--van-border-color-light);
  z-index: 10;
}

/* Success */
.survey-success-state,
.survey-completed-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 60px 20px 40px;
}
.survey-success-icon,
.survey-completed-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--van-primary-color-light);
  color: var(--van-primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}
.survey-success-icon svg,
.survey-completed-icon svg {
  width: 40px;
  height: 40px;
}
.survey-success-title,
.survey-completed-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--van-text-color);
  margin: 0 0 8px;
}
.survey-success-desc,
.survey-completed-desc {
  font-size: 14px;
  color: var(--van-text-color-2);
  margin: 0 0 24px;
  line-height: 1.5;
}
.survey-back-btn {
  width: 100%;
  max-width: 280px;
}
</style>
