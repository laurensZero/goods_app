<template>
  <div class="page fb-page">
    <NavBar :title="t('about.feedback')" show-back />

    <main ref="pageBodyRef" class="page-body">
      <!-- Hero -->
      <section class="hero-section">
        <div class="hero-copy">
          <p class="hero-label">Feedback</p>
          <h1 class="hero-title">{{ t('about.feedback') }}</h1>
          <p class="hero-desc">{{ t('about.feedbackInAppDesc') }}</p>
        </div>
      </section>

      <!-- Submit actions -->
      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Submit</p>
          <h2 class="section-title">{{ t('about.submitFeedback') }}</h2>
        </div>

        <div class="fb-actions-grid">
          <button
            type="button"
            class="fb-action-card"
            @click="showFeedbackDialog = true"
          >
            <span class="fb-action-icon fb-action-icon--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div class="fb-action-body">
              <h3 class="fb-action-title">{{ t('about.submitFeedback') }}</h3>
              <p class="fb-action-desc">{{ t('about.feedbackInAppDesc') }}</p>
            </div>
            <svg class="fb-action-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <a
            :href="`https://github.com/${FEEDBACK_REPO_OWNER}/${FEEDBACK_REPO_NAME}/issues/new`"
            target="_blank"
            rel="noopener"
            class="fb-action-card"
          >
            <span class="fb-action-icon fb-action-icon--secondary">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </span>
            <div class="fb-action-body">
              <h3 class="fb-action-title">GitHub Issues</h3>
              <p class="fb-action-desc">{{ t('about.feedbackGithubDesc') }}</p>
            </div>
            <svg class="fb-action-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </section>

      <!-- My Feedbacks List (login required) -->
      <section v-if="authStore.isLoggedIn && myFeedbacks.length > 0" class="content-section">
        <div class="section-head">
          <p class="section-label">History</p>
          <h2 class="section-title">{{ t('about.feedbackMyFeedbacks') }}</h2>
        </div>

        <div class="fb-list">
          <button
            v-for="fb in myFeedbacks"
            :key="fb.id"
            type="button"
            class="fb-list-item"
            :class="{ 'fb-list-item--updated': isRecentlyUpdated(fb) }"
            @click="detailFbId = fb.id; showFeedbackDetail = true"
          >
            <div class="fb-list-header">
              <span class="fb-type-tag" :class="`fb-type-tag--${fb.type}`">
                {{ typeLabel(fb.type) }}
              </span>
              <span class="fb-status-tag" :class="`fb-status-tag--${fb.status}`">
                {{ statusLabel(fb.status) }}
              </span>
            </div>
            <div class="fb-list-row">
              <h4 class="fb-list-title">{{ fb.title }}</h4>
              <svg class="fb-list-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>
            <div class="fb-list-meta">
              <span>{{ t('about.feedbackSubmittedAt', { time: formatTime(fb.created_at) }) }}</span>
            </div>
          </button>
        </div>
      </section>

      <!-- Empty state -->
      <section v-if="authStore.isLoggedIn && myFeedbacks.length === 0 && !loading" class="content-section">
        <div class="fb-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p class="fb-empty-text">{{ t('about.feedbackNoFeedbacks') }}</p>
        </div>
      </section>
    </main>

    <FeedbackDialog v-model="showFeedbackDialog" :user-id="authStore.user?.id || ''" @submitted="onFeedbackSubmitted" />
    <FeedbackDetailView v-model="showFeedbackDetail" :feedback-id="detailFbId" />
    <AppToast :message="toastMsg" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import NavBar from '@/components/common/NavBar.vue'
import AppToast from '@/components/common/AppToast.vue'
import FeedbackDialog from '@/components/app/FeedbackDialog.vue'
import FeedbackDetailView from '@/views/FeedbackDetailView.vue'
import { listMyFeedbacks, checkUnreadUpdates } from '@/services/feedbackService'
import { useAuthStore } from '@/stores/auth'

const FEEDBACK_REPO_OWNER = 'laurensZero'
const FEEDBACK_REPO_NAME = 'goods_app'

const { t } = useI18n()
const { toastMsg, showToast } = useToast()
const authStore = useAuthStore()

const showFeedbackDialog = ref(false)
const showFeedbackDetail = ref(false)
const detailFbId = ref(0)
const myFeedbacks = ref([])
const loading = ref(true)

const FEEDBACK_LIST_KEY = 'goods_feedback_last_viewed'

const statusMap = {
  pending: 'about.feedbackStatusPending',
  reviewing: 'about.feedbackStatusReviewing',
  resolved: 'about.feedbackStatusResolved',
  closed: 'about.feedbackStatusClosed'
}

function statusLabel(status) {
  return t(statusMap[status] || status)
}

function typeLabel(type) {
  const map = { bug: 'about.feedbackTypeBug', feature: 'about.feedbackTypeFeature', other: 'about.feedbackTypeOther' }
  return t(map[type] || type)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getLastViewedAt() {
  return localStorage.getItem(FEEDBACK_LIST_KEY) || '1970-01-01T00:00:00Z'
}

function setLastViewedAt() {
  localStorage.setItem(FEEDBACK_LIST_KEY, new Date().toISOString())
}

function isRecentlyUpdated(fb) {
  if (fb.status === 'pending') return false
  return fb.updated_at > getLastViewedAt()
}

async function loadMyFeedbacks() {
  const userId = authStore.user?.id
  if (!userId) {
    myFeedbacks.value = []
    loading.value = false
    return
  }
  try {
    myFeedbacks.value = await listMyFeedbacks(userId)
    // Check for unread admin replies / status changes
    const unread = await checkUnreadUpdates(userId, getLastViewedAt())
    // Update ManageView badge
    localStorage.setItem('goods_feedback_unread', String(unread))
    // Mark as read since user is viewing the page
    setLastViewedAt()
  } catch {
    // Silently ignore
  } finally {
    loading.value = false
  }
}

function onFeedbackSubmitted() {
  showToast(t('about.feedbackSuccess'), 3000)
  // Refresh list and badge
  loadMyFeedbacks()
}

onMounted(loadMyFeedbacks)
</script>

<style scoped src="../assets/views/FeedbackView.css"></style>