<template>
  <Transition name="sheet-pop">
    <div v-if="visible" class="overlay" @click.self="dismiss">
      <div class="dialog survey-popup">
        <button type="button" class="survey-popup-close" @click="dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <!-- Progress dots -->
        <div class="survey-popup-progress">
          <span
            v-for="(_, idx) in totalSlides"
            :key="idx"
            class="survey-popup-dot"
            :class="{
              'survey-popup-dot--active': idx === currentIndex,
              'survey-popup-dot--done': idx < currentIndex
            }"
          />
        </div>

        <!-- Swipe area -->
        <div
          class="survey-popup-swipe"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
        >
          <div class="survey-popup-slide" :style="{ transform: slideTransform }">
            <!-- Slide 0: Intro -->
            <div class="survey-popup-question survey-popup-intro">
              <img v-if="activeSurvey.image" :src="activeSurvey.image" class="intro-image" alt="" />
              <div v-else class="intro-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <h3 class="intro-title">{{ activeSurvey.title }}</h3>
              <p v-if="activeSurvey.description" class="intro-desc">{{ activeSurvey.description }}</p>
              <div class="intro-meta">
                {{ activeSurvey.questions.length }} {{ t('survey.questions') }}
              </div>
            </div>

            <!-- Slides 1..N: Questions -->
            <div
              v-for="(q, idx) in activeSurvey.questions"
              :key="q.id"
              class="survey-popup-question"
            >
              <p class="survey-popup-qindex">{{ idx + 1 }} / {{ activeSurvey.questions.length }}</p>
              <h4 class="survey-popup-qtitle">
                {{ q.title }}
                <span v-if="q.required" class="survey-popup-required">*</span>
              </h4>
              <p v-if="q.description" class="survey-popup-qdesc">{{ q.description }}</p>
              <img v-if="q.image" :src="q.image" class="survey-popup-qimage" alt="" />

              <div class="survey-popup-qbody">
                <!-- Single Choice -->
                <template v-if="q.type === 'single_choice'">
                  <label
                    v-for="opt in q.options"
                    :key="opt.id"
                    class="popup-radio"
                    :class="{ 'popup-radio--checked': answers[q.id] === opt.id }"
                    @click="setAnswer(q.id, opt.id)"
                  >
                    <span class="popup-radio-dot" />
                    <span class="popup-radio-label">{{ opt.label }}</span>
                  </label>
                </template>

                <!-- Multiple Choice -->
                <template v-else-if="q.type === 'multiple_choice'">
                  <label
                    v-for="opt in q.options"
                    :key="opt.id"
                    class="popup-checkbox"
                    :class="{ 'popup-checkbox--checked': getMultiSelected(q.id).has(opt.id) }"
                    @click="toggleMulti(q.id, opt.id)"
                  >
                    <span class="popup-checkbox-box">
                      <svg v-if="getMultiSelected(q.id).has(opt.id)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span class="popup-checkbox-label">{{ opt.label }}</span>
                  </label>
                </template>

                <!-- Text -->
                <template v-else-if="q.type === 'text'">
                  <textarea
                    v-if="q.multiline"
                    class="popup-textarea"
                    :value="answers[q.id] || ''"
                    :placeholder="q.placeholder || ''"
                    :maxlength="q.maxLength || undefined"
                    rows="3"
                    @input="setAnswer(q.id, $event.target.value)"
                  />
                  <input
                    v-else
                    class="popup-input"
                    type="text"
                    :value="answers[q.id] || ''"
                    :placeholder="q.placeholder || ''"
                    :maxlength="q.maxLength || undefined"
                    @input="setAnswer(q.id, $event.target.value)"
                  />
                </template>

                <!-- Rating -->
                <template v-else-if="q.type === 'rating'">
                  <div class="popup-stars">
                    <div
                      v-for="star in (q.maxRating || 5)"
                      :key="star"
                      class="popup-star"
                      :class="{ 'popup-star--active': star <= (answers[q.id] || 0) }"
                      @click="setAnswer(q.id, star === (answers[q.id] || 0) ? 0 : star)"
                    >
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                  </div>
                </template>

                <!-- Matrix -->
                <template v-else-if="q.type === 'matrix'">
                  <div class="popup-matrix">
                    <div v-for="row in q.rows" :key="row.id" class="popup-matrix-row">
                      <span class="popup-matrix-label">{{ row.label }}</span>
                      <div class="popup-matrix-stars">
                        <div
                          v-for="(col, colIdx) in q.columns"
                          :key="col.id"
                          class="popup-matrix-star"
                          :class="{ 'popup-matrix-star--active': getMatrixStarIndex(q.id, row.id) >= colIdx }"
                          @click="setAnswer(q.id, { ...(answers[q.id] || {}), [row.id]: col.id })"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Validation error -->
        <div v-if="validationError" class="survey-popup-error">
          {{ validationError }}
        </div>

        <!-- Navigation -->
        <div class="survey-popup-nav">
          <button
            type="button"
            class="popup-nav-btn popup-nav-btn--prev"
            :disabled="currentIndex === 0"
            @click="prev"
          >
            {{ t('common.back') || 'Back' }}
          </button>
          <button
            v-if="isLastSlide"
            type="button"
            class="popup-nav-btn popup-nav-btn--submit"
            :disabled="isSubmitting"
            @click="handleSubmit"
          >
            {{ isSubmitting ? t('survey.submitting') : t('survey.submit') }}
          </button>
          <button
            v-else
            type="button"
            class="popup-nav-btn popup-nav-btn--next"
            @click="next"
          >
            {{ isIntro ? (t('survey.start') || 'Start') : (t('common.next') || 'Next') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSurveyStore } from '@/stores/survey'
import { submitSurveyResponse } from '@/services/surveyService'
import { useDialogBackButton } from '@/composables/useDialogBackButton'

const { t } = useI18n()
const surveyStore = useSurveyStore()

const visible = ref(false)

useDialogBackButton(dismiss, visible)
const activeSurvey = ref(null)
const currentIndex = ref(0)
const answers = reactive({})
const isSubmitting = ref(false)
const validationError = ref('')

const swipeContainer = ref(null)
const touchStartX = ref(0)
const touchDeltaX = ref(0)
const isSwiping = ref(false)

// totalSlides = 1 intro + N questions
const totalSlides = computed(() => {
  if (!activeSurvey.value) return 0
  return 1 + activeSurvey.value.questions.length
})

const isIntro = computed(() => currentIndex.value === 0)

const isLastSlide = computed(() => {
  return currentIndex.value >= totalSlides.value - 1
})

const slideTransform = computed(() => {
  if (isSwiping.value) {
    return `translateX(calc(-${currentIndex.value * 100}% + ${touchDeltaX.value}px))`
  }
  return `translateX(-${currentIndex.value * 100}%)`
})

async function checkPopup() {
  const pending = await surveyStore.getPopupSurveys()
  if (pending.length === 0) return
  openSurvey(pending[0])
}

function openSurvey(survey) {
  activeSurvey.value = survey
  currentIndex.value = 0
  for (const q of survey.questions) {
    if (q.type === 'multiple_choice') answers[q.id] = []
    else if (q.type === 'matrix') answers[q.id] = {}
    else if (q.type === 'rating') answers[q.id] = 0
    else answers[q.id] = ''
  }
  visible.value = true
}

function dismiss() {
  const surveyId = activeSurvey.value?.id
  visible.value = false
  activeSurvey.value = null
  currentIndex.value = 0
  validationError.value = ''
  if (surveyId) surveyStore.markPopupShown(surveyId)
}

function next() {
  if (!isLastSlide.value) currentIndex.value++
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}

function setAnswer(questionId, value) {
  answers[questionId] = value
  if (validationError.value) validationError.value = ''
}

function getMultiSelected(questionId) {
  return new Set(answers[questionId] || [])
}

function toggleMulti(questionId, optionId) {
  const current = [...(answers[questionId] || [])]
  const idx = current.indexOf(optionId)
  if (idx >= 0) current.splice(idx, 1)
  else current.push(optionId)
  answers[questionId] = current
  if (validationError.value) validationError.value = ''
}

function getMatrixStarIndex(questionId, rowId) {
  const val = (answers[questionId] || {})[rowId]
  if (!val) return -1
  const q = activeSurvey.value.questions.find(q => q.id === questionId)
  if (!q) return -1
  return q.columns.findIndex(c => c.id === val)
}

function onTouchStart(e) {
  touchStartX.value = e.touches[0].clientX
  touchDeltaX.value = 0
  isSwiping.value = true
}

function onTouchMove(e) {
  if (!isSwiping.value) return
  touchDeltaX.value = e.touches[0].clientX - touchStartX.value
}

function onTouchEnd() {
  isSwiping.value = false
  const threshold = 50
  if (touchDeltaX.value < -threshold && !isLastSlide.value) next()
  else if (touchDeltaX.value > threshold && currentIndex.value > 0) prev()
  touchDeltaX.value = 0
}

function validate() {
  if (!activeSurvey.value) return false
  validationError.value = ''
  for (const q of activeSurvey.value.questions) {
    if (!q.required) continue
    const val = answers[q.id]
    let isEmpty = false
    if (val === undefined || val === null || val === '') isEmpty = true
    else if (Array.isArray(val) && val.length === 0) isEmpty = true
    else if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) isEmpty = true
    if (isEmpty) {
      validationError.value = t('survey.requiredField', { title: q.title })
      return false
    }
  }
  return true
}

async function handleSubmit() {
  if (isSubmitting.value || !activeSurvey.value) return
  if (!validate()) return
  isSubmitting.value = true
  try {
    const answerList = activeSurvey.value.questions.map(q => ({
      questionId: q.id,
      value: answers[q.id] !== undefined ? answers[q.id] : null
    }))
    await submitSurveyResponse(activeSurvey.value.id, answerList)
    surveyStore.markCompleted(activeSurvey.value.id)
    visible.value = false
    activeSurvey.value = null
    validationError.value = ''
  } catch (e) {
    console.error('[survey-popup] submit failed:', e)
  } finally {
    isSubmitting.value = false
  }
}

defineExpose({ checkPopup, openSurvey })
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-dialog-high) + 50);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
  -webkit-backdrop-filter: blur(var(--app-frost-soft-blur)) saturate(var(--app-frost-saturate));
}
.survey-popup {
  position: relative;
  width: min(100%, 420px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.survey-popup-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}

/* Progress */
.survey-popup-progress {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 16px 20px 8px;
}
.survey-popup-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-border);
  transition: all 0.3s;
}
.survey-popup-dot--active {
  width: 18px;
  border-radius: 3px;
  background: var(--app-text);
}
.survey-popup-dot--done {
  background: var(--app-text);
  opacity: 0.4;
}

/* Swipe */
.survey-popup-swipe {
  flex: 1;
  overflow: hidden;
  touch-action: pan-y;
}
.survey-popup-slide {
  display: flex;
  transition: transform 0.3s ease;
  height: 100%;
}
.survey-popup-question {
  flex: 0 0 100%;
  width: 100%;
  padding: 8px 20px 16px;
  min-height: 200px;
  max-height: 50vh;
  overflow-y: auto;
  box-sizing: border-box;
}

/* Intro slide */
.survey-popup-intro {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 24px;
}
.intro-icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: var(--app-surface-soft);
  color: var(--app-text);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}
.intro-image {
  width: 100%;
  max-width: 280px;
  border-radius: 16px;
  margin-bottom: 20px;
}
.survey-popup-qimage {
  width: 100%;
  border-radius: var(--radius-xs);
  margin: 8px 0 12px;
}
.intro-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
  margin: 0 0 8px;
  line-height: 1.3;
}
.intro-desc {
  font-size: 14px;
  color: var(--app-text-secondary);
  margin: 0 0 16px;
  line-height: 1.6;
}
.intro-meta {
  font-size: 13px;
  color: var(--app-text-tertiary);
}

/* Question */
.survey-popup-qindex {
  font-size: 12px;
  color: var(--app-text-tertiary);
  margin: 0 0 4px;
}
.survey-popup-qtitle {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0 0 4px;
  line-height: 1.4;
}
.survey-popup-required {
  color: var(--van-danger-color);
}
.survey-popup-qdesc {
  font-size: 13px;
  color: var(--app-text-secondary);
  margin: 0 0 12px;
  line-height: 1.5;
}
.survey-popup-qbody {
  margin-top: 12px;
}

/* Radio */
.popup-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1.5px solid var(--app-border);
  cursor: pointer;
  transition: all 0.2s;
}
.popup-radio--checked {
  border-color: var(--app-text);
  background: rgba(0,0,0,0.03);
}
.popup-radio-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--app-border);
  flex-shrink: 0;
  position: relative;
  transition: border-color 0.2s;
}
.popup-radio--checked .popup-radio-dot {
  border-color: var(--app-text);
}
.popup-radio--checked .popup-radio-dot::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-text);
}
.popup-radio-label {
  font-size: 14px;
  color: var(--app-text);
}

/* Checkbox */
.popup-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1.5px solid var(--app-border);
  cursor: pointer;
  transition: all 0.2s;
}
.popup-checkbox--checked {
  border-color: var(--app-text);
  background: rgba(0,0,0,0.03);
}
.popup-checkbox-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--app-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  color: var(--app-surface);
}
.popup-checkbox--checked .popup-checkbox-box {
  border-color: var(--app-text);
  background: var(--app-text);
}
.popup-checkbox-label {
  font-size: 14px;
  color: var(--app-text);
}

/* Text */
.popup-input,
.popup-textarea {
  width: 100%;
  padding: 11px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--app-border);
  background: var(--app-surface);
  font-size: 14px;
  color: var(--app-text);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}
.popup-input:focus,
.popup-textarea:focus {
  border-color: var(--app-text);
}
.popup-textarea {
  resize: vertical;
  min-height: 60px;
  line-height: 1.5;
}

/* Rating */
.popup-stars {
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 12px 0;
}
.popup-star {
  color: var(--app-border);
  cursor: pointer;
  transition: color 0.15s;
  display: flex;
  -webkit-tap-highlight-color: transparent;
}
.popup-star--active {
  color: #f5a623 !important;
}
.popup-star:active {
  transform: scale(0.9);
}

/* Matrix */
.popup-matrix {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.popup-matrix-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.popup-matrix-label {
  font-size: 13px;
  color: var(--app-text);
  flex-shrink: 0;
}
.popup-matrix-stars {
  display: flex;
  gap: 2px;
}
.popup-matrix-star {
  color: var(--app-border);
  cursor: pointer;
  transition: color 0.15s;
  display: flex;
  -webkit-tap-highlight-color: transparent;
}
.popup-matrix-star--active {
  color: #f5a623 !important;
}

/* Error */
.survey-popup-error {
  padding: 8px 20px 0;
  font-size: 13px;
  color: var(--van-danger-color);
  text-align: center;
}

/* Nav */
.survey-popup-nav {
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--app-border);
}
.popup-nav-btn {
  flex: 1;
  height: 44px;
  border-radius: var(--radius-xs);
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.popup-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.popup-nav-btn--prev {
  flex: 0 0 auto;
  width: 80px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}
.popup-nav-btn--next {
  background: var(--app-text);
  color: var(--app-surface);
}
.popup-nav-btn--submit {
  background: var(--app-text);
  color: var(--app-surface);
}

/* Transition */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

/* Tablet */
@media (min-width: 768px) {
  .overlay {
    padding: 24px;
  }
  .survey-popup {
    width: min(100%, 560px);
    max-height: 80vh;
    border-radius: var(--radius-large);
  }
  .survey-popup-question {
    padding: 12px 32px 20px;
  }
  .survey-popup-intro {
    padding: 40px 32px;
  }
  .intro-image {
    max-width: 360px;
  }
  .survey-popup-nav {
    padding: 16px 32px;
  }
}
</style>
