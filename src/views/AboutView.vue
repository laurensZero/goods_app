<template>
  <div class="page about-page">
    <NavBar title="关于应用" show-back />

    <main ref="pageBodyRef" class="page-body">
      <section class="hero-section">
        <article class="hero-card">
          <img class="app-icon" :src="appIconSrc" alt="应用图标" />
          <div class="hero-copy">
            <p class="hero-label">About Goods App</p>
            <h1 class="hero-title">{{ appName }}</h1>
            <p class="hero-desc">用来整理谷子、位置、预设与备份同步的收藏管理工具。</p>
            <div class="hero-meta">
              <span class="hero-chip">版本 {{ appVersion }}</span>
              <span class="hero-chip">Android {{ androidVersionName }}</span>
            </div>
          </div>
        </article>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">App Info</p>
          <h2 class="section-title">应用信息</h2>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <p class="info-kicker">应用名称</p>
            <h3 class="info-value">{{ appName }}</h3>
            <p class="info-desc">Capacitor 应用名与管理页展示信息。</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">包名</p>
            <h3 class="info-value info-value--mono">{{ appId }}</h3>
            <p class="info-desc">安卓安装包唯一标识。</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">Web 版本</p>
            <h3 class="info-value">v{{ appVersion }}</h3>
            <p class="info-desc">来自项目根目录的 package.json。</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">Android 版本</p>
            <h3 class="info-value">{{ androidVersionName }}</h3>
            <p class="info-desc">当前原生工程中的 versionName。</p>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Current Data</p>
          <h2 class="section-title">当前数据</h2>
        </div>

        <div class="stats-grid">
          <article v-for="item in statsCards" :key="item.label" class="stat-card">
            <p class="stat-label">{{ item.label }}</p>
            <p class="stat-value">{{ item.value }}</p>
            <p class="stat-desc">{{ item.desc }}</p>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Feedback</p>
          <h2 class="section-title">反馈</h2>
        </div>

        <div class="feedback-grid">
          <button type="button" class="feedback-card" @click="openFeedbackDialog">
            <span class="feedback-icon feedback-icon--primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div class="feedback-body">
              <p class="feedback-kicker">In-App Submit</p>
              <h3 class="feedback-title">在 app 内提交反馈</h3>
              <p class="feedback-desc">填写标题和内容后，直接创建到 GitHub Issues。token 只保存在当前设备。</p>
            </div>
            <svg class="feedback-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <a class="feedback-card" :href="feedbackUrl" target="_blank" rel="noopener">
            <span class="feedback-icon feedback-icon--secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </span>
            <div class="feedback-body">
              <p class="feedback-kicker">GitHub Issues</p>
              <h3 class="feedback-title">前往 GitHub 提反馈</h3>
              <p class="feedback-desc">跳转到新建 issue 页面，并自动预填当前应用版本信息。</p>
            </div>
            <svg class="feedback-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </section>
    </main>

    <Transition name="overlay-fade">
      <div v-if="showFeedbackDialog" class="overlay" @click.self="closeFeedbackDialog">
        <div class="dialog">
          <h3 class="dialog-title">提交反馈到 GitHub Issues</h3>
          <p class="dialog-desc">
            需要一个对仓库 <code>laurensZero/goods_app</code> 具有 <code>Issues: write</code> 权限的 token。
          </p>

          <label class="dialog-field">
            <span class="dialog-label">GitHub Token</span>
            <div class="dialog-input-wrap">
              <input
                v-model="feedbackToken"
                class="dialog-input dialog-input--with-actions"
                :type="showFeedbackToken ? 'text' : 'password'"
                placeholder="github_pat_xxx / ghp_xxx"
                autocomplete="off"
              />
              <div class="dialog-input-actions">
                <button
                  type="button"
                  class="dialog-input-btn"
                  :aria-label="showFeedbackToken ? '隐藏 token' : '显示 token'"
                  @click="showFeedbackToken = !showFeedbackToken"
                >
                  {{ showFeedbackToken ? '隐藏' : '显示' }}
                </button>
                <button
                  type="button"
                  class="dialog-input-btn"
                  :disabled="!feedbackToken.trim()"
                  @click="copyText(feedbackToken.trim(), '反馈 token 已复制')"
                >
                  复制
                </button>
              </div>
            </div>
          </label>

          <label class="dialog-field">
            <span class="dialog-label">标题</span>
            <input
              v-model="feedbackTitle"
              class="dialog-input"
              type="text"
              maxlength="120"
              placeholder="例如：同步页拉取后提示文案不清楚"
            />
          </label>

          <label class="dialog-field">
            <span class="dialog-label">内容</span>
            <textarea
              v-model="feedbackBody"
              class="dialog-textarea"
              rows="7"
              placeholder="写下 bug、想法、使用场景或希望改进的地方。"
            />
          </label>

          <p v-if="feedbackTokenLogin" class="dialog-success">当前 token 已验证：{{ feedbackTokenLogin }}</p>
          <p v-if="feedbackError" class="dialog-error">{{ feedbackError }}</p>

          <div class="dialog-actions dialog-actions--between">
            <button
              type="button"
              class="dialog-btn dialog-btn--ghost"
              :disabled="isSubmittingFeedback || !feedbackToken.trim()"
              @click="clearSavedFeedbackToken"
            >
              清除已存 token
            </button>
            <div class="dialog-actions__right">
              <button type="button" class="dialog-btn dialog-btn--secondary" :disabled="isSubmittingFeedback" @click="closeFeedbackDialog">取消</button>
              <button
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="isSubmittingFeedback || !canSubmitFeedback"
                @click="submitFeedbackIssue"
              >
                {{ isSubmittingFeedback ? '提交中...' : '提交反馈' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="toast-fade">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NavBar from '@/components/NavBar.vue'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { createIssue } from '@/utils/githubIssues'
import { validateToken } from '@/utils/githubGist'
import packageJson from '../../package.json'
import capacitorConfig from '../../capacitor.config.json'

const FEEDBACK_TOKEN_KEY = 'goods_feedback_github_token'
const FEEDBACK_REPO_OWNER = 'laurensZero'
const FEEDBACK_REPO_NAME = 'goods_app'
const IS_NATIVE = Capacitor.isNativePlatform()

const goodsStore = useGoodsStore()
const presetsStore = usePresetsStore()
const syncStore = useSyncStore()
const pageBodyRef = ref(null)
const showFeedbackDialog = ref(false)
const showFeedbackToken = ref(false)
const feedbackToken = ref('')
const feedbackTokenLogin = ref('')
const feedbackTitle = ref('')
const feedbackBody = ref('')
const feedbackError = ref('')
const isSubmittingFeedback = ref(false)
const toastMsg = ref('')
let toastTimer = null

const appIconSrc = `${import.meta.env.BASE_URL}assets/icon-android-1024.png`
const appName = capacitorConfig.appName || packageJson.name || 'Goods App'
const appId = capacitorConfig.appId || 'unknown'
const appVersion = import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0'
const androidVersionName = import.meta.env.VITE_ANDROID_VERSION_NAME || import.meta.env.VITE_APP_VERSION || '1.0'

const feedbackUrl = computed(() => {
  const params = new URLSearchParams({
    title: '[反馈] ',
    body: buildIssueBody('请在这里描述问题、建议或想法。')
  })

  return `https://github.com/${FEEDBACK_REPO_OWNER}/${FEEDBACK_REPO_NAME}/issues/new?${params.toString()}`
})

const canSubmitFeedback = computed(() => (
  feedbackToken.value.trim().length > 0
  && feedbackTitle.value.trim().length > 0
  && feedbackBody.value.trim().length > 0
))

const statsCards = computed(() => [
  {
    label: '藏品',
    value: String(goodsStore.list.length),
    desc: '当前首页和搜索里可见的收藏条目。'
  },
  {
    label: '回收站',
    value: String(goodsStore.trashList.length),
    desc: '已删除但仍可恢复的数据。'
  },
  {
    label: '分类预设',
    value: String(presetsStore.categories.length),
    desc: '管理页里维护的分类标签。'
  },
  {
    label: '角色预设',
    value: String(presetsStore.characters.length),
    desc: '角色名与所属 IP 的预设数据。'
  },
  {
    label: '收纳位置',
    value: String(presetsStore.storageLocations.length),
    desc: '柜子、抽屉、册页等位置层级。'
  },
  {
    label: '同步状态',
    value: syncStore.lastSyncedAt ? '已配置' : '未同步',
    desc: syncStore.lastSyncedAt ? `最近同步：${formatSyncTime(syncStore.lastSyncedAt)}` : '可在管理页中配置 GitHub Gist 同步。'
  }
])

function buildIssueBody(content) {
  const lines = [
    '### 反馈内容',
    '',
    content,
    '',
    '### 版本信息',
    `- App: ${appName}`,
    `- Web: v${appVersion}`,
    `- Android: ${androidVersionName}`,
    `- 包名: ${appId}`,
    `- 最近同步: ${syncStore.lastSyncedAt ? formatSyncTime(syncStore.lastSyncedAt) : '从未同步'}`,
    '',
    '### 设备信息',
    `- 平台: ${Capacitor.getPlatform()}`,
    `- 运行环境: ${IS_NATIVE ? 'Native' : 'Web'}`,
    `- 语言: ${navigator.language || 'unknown'}`,
    `- 屏幕: ${window.screen?.width || 0}x${window.screen?.height || 0}`,
    `- 视口: ${window.innerWidth}x${window.innerHeight}`,
    `- User Agent: ${navigator.userAgent || 'unknown'}`
  ]

  return lines.join('\n')
}

function formatSyncTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function resetPageScrollTop() {
  try {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    window.scrollTo(0, 0)
  } catch {
    // ignore scroll reset failures in non-browser contexts
  }

  if (pageBodyRef.value) {
    pageBodyRef.value.scrollTop = 0
  }
}

function showToast(message, duration = 2600) {
  toastMsg.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, duration)
}

async function copyText(text, successMessage = '已复制') {
  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    showToast(successMessage)
  } catch {
    showToast('复制失败')
  }
}

async function readPersistedFeedbackToken() {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: FEEDBACK_TOKEN_KEY })
      if (value !== null) return value
    } catch {
      // fall through to localStorage
    }
  }

  try {
    return localStorage.getItem(FEEDBACK_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

async function writePersistedFeedbackToken(value) {
  try {
    localStorage.setItem(FEEDBACK_TOKEN_KEY, value)
  } catch {
    // ignore localStorage failures
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key: FEEDBACK_TOKEN_KEY, value })
  } catch {
    // ignore preference failures
  }
}

async function clearPersistedFeedbackToken() {
  try {
    localStorage.removeItem(FEEDBACK_TOKEN_KEY)
  } catch {
    // ignore localStorage failures
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.remove({ key: FEEDBACK_TOKEN_KEY })
  } catch {
    // ignore preference failures
  }
}

function openFeedbackDialog() {
  feedbackError.value = ''
  feedbackTitle.value = ''
  feedbackBody.value = ''
  showFeedbackToken.value = false
  showFeedbackDialog.value = true
}

function closeFeedbackDialog() {
  if (isSubmittingFeedback.value) return
  showFeedbackDialog.value = false
  feedbackError.value = ''
}

async function clearSavedFeedbackToken() {
  feedbackToken.value = ''
  showFeedbackToken.value = false
  feedbackTokenLogin.value = ''
  await clearPersistedFeedbackToken()
  showToast('已清除本地保存的反馈 token')
}

async function ensureFeedbackTokenValid(token) {
  const check = await validateToken(token)
  if (!check.valid) {
    throw new Error('Token 无效，或没有访问 GitHub 的权限')
  }

  feedbackTokenLogin.value = check.login
  await writePersistedFeedbackToken(token)
}

async function submitFeedbackIssue() {
  const token = feedbackToken.value.trim()
  const title = feedbackTitle.value.trim()
  const content = feedbackBody.value.trim()

  if (!token || !title || !content) return

  isSubmittingFeedback.value = true
  feedbackError.value = ''

  try {
    await ensureFeedbackTokenValid(token)
    const issue = await createIssue(token, FEEDBACK_REPO_OWNER, FEEDBACK_REPO_NAME, {
      title,
      body: buildIssueBody(content)
    })

    showFeedbackDialog.value = false
    feedbackTitle.value = ''
    feedbackBody.value = ''
    showToast('反馈已提交到 GitHub Issues', 3200)

    if (issue?.html_url) {
      window.open(issue.html_url, '_blank', 'noopener')
    }
  } catch (error) {
    feedbackError.value = error.message || '提交失败'
  } finally {
    isSubmittingFeedback.value = false
  }
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)
  syncStore.init()
  feedbackToken.value = await readPersistedFeedbackToken()
})

onBeforeUnmount(() => {
  // no-op
})
</script>

<style scoped>
.about-page {
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

.hero-card,
.info-card,
.stat-card,
.feedback-card,
.dialog {
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}

.hero-card {
  position: relative;
  display: grid;
  gap: 18px;
  padding: 22px;
  overflow: hidden;
  border-radius: var(--radius-large);
}

.hero-card::before {
  content: '';
  position: absolute;
  inset: auto -70px -90px auto;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(83, 144, 255, 0.20) 0%, rgba(83, 144, 255, 0) 72%);
  pointer-events: none;
}

.app-icon {
  width: 88px;
  height: 88px;
  border-radius: 24px;
  box-shadow: 0 14px 32px rgba(75, 133, 240, 0.18);
}

.hero-copy,
.section-head,
.info-card,
.stat-card,
.feedback-card {
  position: relative;
  z-index: 1;
}

.hero-label,
.section-label,
.info-kicker,
.stat-label,
.feedback-kicker,
.dialog-label {
  color: var(--app-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-title,
.section-title,
.info-value,
.feedback-title {
  margin-top: 6px;
  color: var(--app-text);
  letter-spacing: -0.04em;
}

.hero-title {
  font-size: 30px;
  font-weight: 700;
}

.section-title {
  font-size: 22px;
  font-weight: 600;
}

.hero-desc,
.info-desc,
.stat-desc,
.feedback-desc,
.dialog-desc {
  margin-top: 10px;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.section-head {
  margin-bottom: 14px;
}

.info-grid,
.stats-grid,
.feedback-grid {
  display: grid;
  gap: 12px;
}

.info-grid,
.stats-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-card,
.stat-card {
  padding: 18px;
  border-radius: var(--radius-card);
}

.info-value {
  font-size: 18px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.info-value--mono {
  font-family: 'Consolas', 'SFMono-Regular', monospace;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.stat-value {
  margin-top: 8px;
  color: var(--app-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.feedback-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 18px;
  border: 1px solid rgba(17, 20, 22, 0.04);
  border-radius: var(--radius-card);
  color: var(--app-text);
  text-align: left;
  text-decoration: none;
}

.feedback-card:active {
  transform: scale(var(--press-scale-card));
}

.feedback-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 14px;
}

.feedback-icon--primary {
  background: rgba(90, 120, 250, 0.10);
  color: #5a78fa;
}

.feedback-icon--secondary {
  background: rgba(120, 100, 255, 0.10);
  color: #7864ff;
}

.feedback-icon svg,
.feedback-arrow {
  width: 22px;
  height: 22px;
}

.feedback-body {
  flex: 1;
  min-width: 0;
}

.feedback-kicker {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.feedback-title {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 600;
}

.feedback-desc {
  margin: 0;
  font-size: 13px;
}

.feedback-arrow {
  flex-shrink: 0;
  stroke: var(--app-text-tertiary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.dialog {
  width: min(100%, 480px);
  padding: 24px;
  border-radius: var(--radius-large);
}

.dialog-title {
  margin: 0 0 8px;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 600;
}

.dialog-desc {
  margin: 0 0 16px;
}

.dialog-desc code {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--app-surface-soft);
  font-size: 13px;
}

.dialog-field {
  display: block;
  margin-top: 14px;
}

.dialog-label {
  display: block;
  margin-bottom: 8px;
}

.dialog-input,
.dialog-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
}

.dialog-input-wrap {
  position: relative;
}

.dialog-input--with-actions {
  padding-right: 122px;
}

.dialog-input-actions {
  position: absolute;
  top: 50%;
  right: 10px;
  display: flex;
  gap: 6px;
  transform: translateY(-50%);
}

.dialog-input-btn {
  min-width: 42px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 9px;
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.dialog-input-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-textarea {
  resize: vertical;
  min-height: 140px;
}

.dialog-input:focus,
.dialog-textarea:focus {
  border-color: var(--app-text-tertiary);
}

.dialog-error {
  margin-top: 12px;
  color: #c74444;
  font-size: 13px;
}

.dialog-success {
  margin-top: 12px;
  color: #28c880;
  font-size: 13px;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-actions--between {
  justify-content: space-between;
  align-items: center;
}

.dialog-actions__right {
  display: flex;
  gap: 10px;
}

.dialog-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.dialog-btn--ghost,
.dialog-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.dialog-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + max(env(safe-area-inset-bottom), 12px) + 12px);
  z-index: 999;
  padding: 10px 20px;
  border-radius: 20px;
  background: rgba(20, 20, 22, 0.88);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.25s ease;
}

.overlay-fade-enter-active .dialog,
.overlay-fade-leave-active .dialog {
  transition: transform 0.25s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .dialog,
.overlay-fade-leave-to .dialog {
  transform: scale(0.95) translateY(8px);
}

:deep(.nav-bar) {
  z-index: 60;
}

:deep(.nav-back) {
  background: color-mix(in srgb, var(--app-surface) 84%, transparent);
  border-color: color-mix(in srgb, var(--app-text) 8%, transparent);
}

@media (max-width: 768px) {
  .info-grid,
  .stats-grid,
  .feedback-grid {
    grid-template-columns: 1fr;
  }

  .dialog-actions,
  .dialog-actions__right {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .dialog-actions--between {
    align-items: stretch;
  }

  .dialog-btn {
    width: 100%;
  }

  .dialog-input--with-actions {
    padding-right: 14px;
    padding-bottom: 48px;
  }

  .dialog-input-actions {
    top: auto;
    right: 12px;
    bottom: 9px;
    transform: none;
  }

}
</style>

