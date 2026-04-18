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
              <span class="hero-chip">资源 {{ webBundleVersionLabel }}</span>
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
            <p class="info-kicker">Android 版本</p>
            <h3 class="info-value">{{ androidVersionName }}</h3>
            <p class="info-desc">当前原生工程中的 versionName。</p>
          </article>

          <article class="info-card">
            <p class="info-kicker">资源版本</p>
            <h3 class="info-value">{{ webBundleVersionLabel }}</h3>
            <p class="info-desc">当前生效的前端资源包版本（Capacitor Updater）。</p>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">App Update</p>
          <h2 class="section-title">检查更新</h2>
        </div>

        <div class="update-grid">
          <article class="update-panel">
            <p class="info-kicker">App Release</p>
            <h3 class="info-value">当前版本 v{{ updateStore.currentVersion }}</h3>
            <p class="info-desc">{{ IS_NATIVE ? '启动时会自动检查一次更新，你也可以在这里手动触发。' : 'Web 端默认不自动检查，你可以在这里手动触发。' }}</p>
            <div class="update-channel-row">
              <span class="update-channel-label">更新源</span>
              <div class="update-channel-actions">
                <button
                  v-for="source in updateStore.availableUpdateSources"
                  :key="`app-${source}`"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': updateStore.selectedSource === source }]"
                  @click="handleAppUpdateSourceChange(source)"
                >
                  {{ source }}
                </button>
              </div>
            </div>
            <p class="update-status">{{ updateStatusText }}</p>
            <p v-if="updateStore.downloadError" class="update-status update-status--error">{{ updateStore.downloadError }}</p>
            <div v-if="updateStore.isDownloading" class="update-download-progress">
              <div class="update-download-progress__head">
                <span>下载中</span>
                <span>{{ updateStore.downloadProgress }}%</span>
              </div>
              <div class="update-download-progress__track" role="progressbar" :aria-valuenow="updateStore.downloadProgress" aria-valuemin="0" aria-valuemax="100">
                <span class="update-download-progress__bar" :style="{ width: `${updateStore.downloadProgress}%` }" />
              </div>
              <div class="update-download-progress__meta">
                <span>{{ updateStore.downloadTransferred || '准备中…' }}</span>
                <span>{{ updateStore.downloadSpeed || '--' }}</span>
              </div>
            </div>
            <p class="update-meta">上次检查：{{ updateCheckedAtLabel }}</p>

            <div class="update-actions">
              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                :disabled="updateStore.isChecking"
                @click="handleManualCheckUpdate"
              >
                {{ updateStore.isChecking ? '检查中...' : '手动检查更新' }}
              </button>
              <button
                v-if="updateStore.hasUpdate"
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="updateStore.isDownloading"
                @click="handleStartUpdate"
              >
                {{ updateStore.isDownloading ? '下载中...' : (updateStore.supportsInAppDownload ? '下载并安装' : '前往更新') }}
              </button>
            </div>
          </article>

          <article class="update-panel">
            <p class="info-kicker">Web Bundle</p>
            <h3 class="info-value">当前资源 {{ webBundleVersionLabel }}</h3>
            <p class="info-desc">通过 manifest 执行资源增量更新，不修改 APK。</p>
            <div class="update-channel-row">
              <span class="update-channel-label">更新源</span>
              <div class="update-channel-actions">
                <button
                  v-for="source in webUpdateStore.availableUpdateSources"
                  :key="`bundle-${source}`"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': webUpdateStore.selectedSource === source }]"
                  @click="handleWebUpdateSourceChange(source)"
                >
                  {{ source }}
                </button>
              </div>
            </div>
            <div class="update-channel-row">
              <span class="update-channel-label">更新通道</span>
              <div class="update-channel-actions">
                <button
                  v-for="channel in webUpdateStore.availableUpdateChannels"
                  :key="channel"
                  type="button"
                  :class="['update-channel-btn', { 'update-channel-btn--active': webUpdateStore.selectedChannel === channel }]"
                  @click="handleWebUpdateChannelChange(channel)"
                >
                  {{ channel }}
                </button>
              </div>
            </div>
            <p class="update-status">{{ webUpdateStatusText }}</p>
            <section v-if="webUpdateReleaseNotesPreview" class="update-notes">
              <p class="update-notes__label">更新日志</p>
              <pre class="update-notes__body">{{ webUpdateReleaseNotesPreview }}</pre>
            </section>
            <p v-if="webUpdateStore.lastError" class="update-status update-status--error">{{ webUpdateStore.lastError }}</p>
            <div v-if="webUpdateStore.isDownloading" class="update-download-progress">
              <div class="update-download-progress__head">
                <span>下载中</span>
                <span>{{ webUpdateStore.downloadProgress }}%</span>
              </div>
              <div class="update-download-progress__track" role="progressbar" :aria-valuenow="webUpdateStore.downloadProgress" aria-valuemin="0" aria-valuemax="100">
                <span class="update-download-progress__bar" :style="{ width: `${webUpdateStore.downloadProgress}%` }" />
              </div>
            </div>
            <p class="update-meta">上次检查：{{ webUpdateCheckedAtLabel }}</p>
            <div class="update-actions">
              <button
                type="button"
                class="dialog-btn dialog-btn--secondary"
                :disabled="!webUpdateStore.supported || webUpdateStore.isChecking"
                @click="handleManualCheckWebUpdate"
              >
                {{ webUpdateStore.isChecking ? '检查中...' : '检查资源更新' }}
              </button>
              <button
                v-if="webUpdateStore.hasUpdate"
                type="button"
                class="dialog-btn dialog-btn--primary"
                :disabled="webUpdateStore.isDownloading"
                @click="handleStartWebUpdate"
              >
                {{ webUpdateStore.isDownloading ? '下载中...' : '下载并下次启动生效' }}
              </button>
              <button
                v-if="webUpdateStore.supported"
                type="button"
                class="dialog-btn dialog-btn--ghost"
                @click="showWebUpdateResetDialog = true"
              >
                恢复内置资源
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="content-section">
        <div class="section-head">
          <p class="section-label">Resource Management</p>
          <h2 class="section-title">资源管理</h2>
        </div>

        <div class="info-grid">
          <article class="info-card">
            <p class="info-kicker">本地图片缓存</p>
            <h3 class="info-value">{{ resourceSizeCacheImage }}</h3>
            <p class="info-desc">释放由于查看商品而产生的本地图片缓存，随时可再次下载。</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button class="dialog-btn dialog-btn--secondary" @click="handleClearImageCache">清除图片缓存</button>
            </div>
          </article>

          <article class="info-card">
            <p class="info-kicker">本地抠图模型</p>
            <h3 class="info-value">{{ resourceSizeModel }}</h3>
            <p class="info-desc">卸载由于使用“去除背景”功能而下载的模型文件以腾出空间。</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button
                class="dialog-btn dialog-btn--secondary"
                :disabled="isClearingCutoutModel"
                @click="handleClearCutoutModel"
              >
                {{ isClearingCutoutModel ? '卸载中...' : '卸载抠图模型' }}
              </button>
            </div>
          </article>

          <article class="info-card">
            <p class="info-kicker">应用更新残留</p>
            <h3 class="info-value">{{ resourceSizeUpdate }}</h3>
            <p class="info-desc">清理系统热更或下载的 APK 安装包等无效残留数据。</p>
            <div class="update-actions" style="margin-top: 1rem;">
              <button class="dialog-btn dialog-btn--secondary" @click="handleClearUpdateCache">清除更新残留</button>
            </div>
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

    <Transition name="overlay-fade">
      <div v-if="showWebUpdateRestartDialog" class="overlay" @click.self="cancelWebUpdateRestart">
        <div class="dialog">
          <h3 class="dialog-title">资源更新已下载完成</h3>
          <p class="dialog-desc">新资源将在重启 App 后生效，是否现在重启？</p>
          <div class="dialog-actions dialog-actions__right">
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="cancelWebUpdateRestart">稍后</button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="confirmWebUpdateRestart">立即重启</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="overlay-fade">
      <div v-if="showWebUpdateResetDialog" class="overlay" @click.self="showWebUpdateResetDialog = false">
        <div class="dialog">
          <h3 class="dialog-title">恢复内置资源版本</h3>
          <p class="dialog-desc">将回退到 APK 内置前端资源并立即重载应用，是否继续？</p>
          <div class="dialog-actions dialog-actions__right">
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="showWebUpdateResetDialog = false">取消</button>
            <button type="button" class="dialog-btn dialog-btn--primary" @click="confirmResetWebUpdate">确认恢复</button>
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
import { App as CapacitorApp } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import NavBar from '@/components/common/NavBar.vue'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useWebUpdateStore } from '@/stores/webUpdate'
import { useGoodsStore } from '@/stores/goods'
import { usePresetsStore } from '@/stores/presets'
import { useSyncStore } from '@/stores/sync'
import { createIssue } from '@/utils/githubIssues'
import { validateToken } from '@/utils/githubGist'
import { clearAllCache } from '@/utils/imageCache'
import { clearLocalModelAssets } from '@/composables/image/useImageCutout'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { scrollToTopAnimated } from '@/utils/scrollToTopAnimated'
import packageJson from '../../package.json'
import capacitorConfig from '../../capacitor.config.json'

const FEEDBACK_TOKEN_KEY = 'goods_feedback_github_token'
const FEEDBACK_REPO_OWNER = 'laurensZero'
const FEEDBACK_REPO_NAME = 'goods_app'
const IS_NATIVE = Capacitor.isNativePlatform()

const goodsStore = useGoodsStore()
const presetsStore = usePresetsStore()
const syncStore = useSyncStore()
const updateStore = useAppUpdateStore()
const webUpdateStore = useWebUpdateStore()
const pageBodyRef = ref(null)
const showFeedbackDialog = ref(false)
const showWebUpdateRestartDialog = ref(false)
const showWebUpdateResetDialog = ref(false)
const showFeedbackToken = ref(false)
const feedbackToken = ref('')
const feedbackTokenLogin = ref('')
const feedbackTitle = ref('')
const feedbackBody = ref('')
const feedbackError = ref('')
const isSubmittingFeedback = ref(false)
const isClearingCutoutModel = ref(false)
const toastMsg = ref('')
let toastTimer = null
let lastToastText = ''
let lastToastAt = 0

const appIconSrc = `${import.meta.env.BASE_URL}favicon.svg`
const appName = capacitorConfig.appName || packageJson.name || 'Goods App'
const appId = capacitorConfig.appId || 'unknown'
const appVersion = ref(import.meta.env.VITE_APP_VERSION || packageJson.version || '0.0.0')
const androidVersionName = ref(import.meta.env.VITE_ANDROID_VERSION_NAME || import.meta.env.VITE_APP_VERSION || '1.0')
const webBundleVersionLabel = computed(() => webUpdateStore.currentVersion || `v${appVersion.value}`)

function formatUpdateSourceLabel(source) {
  const normalized = String(source || '').trim().toLowerCase()
  if (normalized === 'gitee') return 'Gitee'
  if (normalized === 'github') return 'GitHub'
  if (normalized === 'auto') return '自动'
  return normalized || '--'
}

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

const updateStatusText = computed(() => {
  const sourceLabel = formatUpdateSourceLabel(updateStore.selectedSource)
  const resolvedLabel = updateStore.resolvedSource ? formatUpdateSourceLabel(updateStore.resolvedSource) : ''

  if (updateStore.isChecking) return `正在检查版本更新（${sourceLabel}）...`
  if (updateStore.lastStatus === 'disabled') return '当前为 Web 开发环境，已禁用更新检查。'
  if (updateStore.lastStatus === 'available' && updateStore.latestVersion) {
    return resolvedLabel
      ? `发现新版本 v${updateStore.latestVersion}（命中 ${resolvedLabel}）`
      : `发现新版本 v${updateStore.latestVersion}`
  }
  if (updateStore.lastStatus === 'latest') return '当前已是最新版本'
  if (updateStore.lastStatus === 'error') return updateStore.lastError || '检查更新失败，请稍后再试。'
  if (resolvedLabel) {
    return `可手动检查版本更新（策略 ${sourceLabel}，最近命中 ${resolvedLabel}）。`
  }
  return `可手动检查版本更新（策略 ${sourceLabel}）。`
})

const updateCheckedAtLabel = computed(() => (
  updateStore.lastCheckedAt ? formatSyncTime(updateStore.lastCheckedAt) : '尚未检查'
))

const webUpdateStatusText = computed(() => {
  const sourceLabel = formatUpdateSourceLabel(webUpdateStore.selectedSource)
  const resolvedLabel = webUpdateStore.resolvedSource ? formatUpdateSourceLabel(webUpdateStore.resolvedSource) : ''

  if (!webUpdateStore.supported) return '仅原生环境支持资源增量更新。'
  if (webUpdateStore.isChecking) return `正在检查资源更新（${sourceLabel}）...`
  if (webUpdateStore.lastStatus === 'pending' && webUpdateStore.pendingVersion) {
    return `资源包 v${webUpdateStore.pendingVersion} 已就绪，重启或切后台后生效。`
  }
  if (webUpdateStore.lastStatus === 'available' && webUpdateStore.latestVersion) {
    return resolvedLabel
      ? `发现资源更新 v${webUpdateStore.latestVersion}（命中 ${resolvedLabel}）`
      : `发现资源更新 v${webUpdateStore.latestVersion}`
  }
  if (webUpdateStore.lastStatus === 'incompatible-native' && webUpdateStore.latestMinNativeVersion) {
    return `当前原生版本过低，需升级到 Android ${webUpdateStore.latestMinNativeVersion} 后再应用此资源包。`
  }
  if (webUpdateStore.lastStatus === 'missing-asset') {
    return 'manifest 缺少 version/url 字段，无法更新资源。'
  }
  if (webUpdateStore.lastStatus === 'latest') return '当前资源已是最新版本'
  if (webUpdateStore.lastStatus === 'error') return webUpdateStore.lastError || '资源更新检查失败'
  if (resolvedLabel) {
    return `可手动检查 ${webUpdateStore.selectedChannel} 通道资源包（策略 ${sourceLabel}，最近命中 ${resolvedLabel}）。`
  }
  return `可手动检查 ${webUpdateStore.selectedChannel} 通道资源包（策略 ${sourceLabel}）。`
})

const webUpdateCheckedAtLabel = computed(() => (
  webUpdateStore.lastCheckedAt ? formatSyncTime(webUpdateStore.lastCheckedAt) : '尚未检查'
))

const webUpdateReleaseNotesPreview = computed(() => {
  return String(webUpdateStore.releaseNotesPreview || '').trim()
})

function buildIssueBody(content) {
  const lines = [
    '### 反馈内容',
    '',
    content,
    '',
    '### 版本信息',
    `- App: ${appName}`,
    `- Web: v${appVersion.value}`,
    `- Android: ${androidVersionName.value}`,
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
  scrollToTopAnimated(() => pageBodyRef.value, 0)
}

function showToast(message, duration = 2600) {
  const nextMessage = String(message || '').trim()
  if (!nextMessage) return

  const now = Date.now()
  if (nextMessage === lastToastText && now - lastToastAt < 1200) {
    return
  }

  lastToastText = nextMessage
  lastToastAt = now
  toastMsg.value = nextMessage
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

async function openFeedbackDialog() {
  feedbackError.value = ''
  feedbackTitle.value = ''
  feedbackBody.value = ''
  showFeedbackToken.value = false
  if (!feedbackToken.value.trim()) {
    const persistedToken = await readPersistedFeedbackToken()
    feedbackToken.value = persistedToken || syncStore.token || ''
    feedbackTokenLogin.value = syncStore.githubLogin || ''
  }
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

async function handleManualCheckUpdate() {
  if (updateStore.isChecking) return

  try {
    const result = await updateStore.checkForUpdates({ source: 'manual' })
    if (result?.status === 'disabled') {
      showToast('Web 开发环境已禁用更新检查')
      return
    }

    if (result?.status === 'available') {
      showToast(`发现新版本 v${updateStore.latestVersion}`, 3200)
      return
    }

    showToast('当前已是最新版本')
  } catch (error) {
    showToast(updateStore.lastError || error?.message || '检查更新失败，请稍后再试。', 3200)
  }
}

async function handleStartUpdate() {
  if (updateStore.isDownloading) return

  const succeeded = await updateStore.downloadAndInstallUpdate()
  if (succeeded) {
    if (updateStore.usingMockDownload) {
      showToast('模拟下载完成', 2200)
      return
    }
    if (updateStore.supportsInAppDownload) {
      showToast('更新包下载完成，请选择安装程序继续安装。', 3200)
      return
    }
  }

  if (updateStore.downloadError) {
    showToast(updateStore.downloadError, 3200)
  }
}

async function handleAppUpdateSourceChange(source) {
  if (updateStore.selectedSource === source) return
  updateStore.setUpdateSource(source)
  showToast(`已切换版本更新源：${source}`, 2200)
  await handleManualCheckUpdate()
}

async function handleManualCheckWebUpdate() {
  if (!webUpdateStore.supported || webUpdateStore.isChecking) return

  try {
    const result = await webUpdateStore.checkForUpdates()
    if (result?.status === 'available') {
      showToast(`发现资源更新 v${webUpdateStore.latestVersion}`, 3200)
      return
    }
    if (result?.status === 'incompatible-native') {
      showToast(
        webUpdateStore.latestMinNativeVersion
          ? `需要先升级到 Android ${webUpdateStore.latestMinNativeVersion} 再更新资源。`
          : '当前原生版本不满足资源包要求。',
        3200
      )
      return
    }
    if (result?.status === 'missing-asset') {
      showToast('manifest 缺少 version/url', 3200)
      return
    }
    showToast('当前资源已是最新版本')
  } catch (error) {
    showToast(webUpdateStore.lastError || error?.message || '检查资源更新失败', 3200)
  }
}

async function handleWebUpdateChannelChange(channel) {
  if (webUpdateStore.selectedChannel === channel) return
  webUpdateStore.setUpdateChannel(channel)
  showToast(`已切换资源更新通道：${channel}`, 2200)
  await handleManualCheckWebUpdate()
}

async function handleWebUpdateSourceChange(source) {
  if (webUpdateStore.selectedSource === source) return
  webUpdateStore.setUpdateSource(source)
  showToast(`已切换资源更新源：${source}`, 2200)
  await handleManualCheckWebUpdate()
}

async function handleStartWebUpdate() {
  if (webUpdateStore.isDownloading) return

  const succeeded = await webUpdateStore.downloadAndPrepareUpdate()
  if (succeeded) {
    showWebUpdateRestartDialog.value = true
    return
  }
}

function cancelWebUpdateRestart() {
  showWebUpdateRestartDialog.value = false
  showToast('已保留更新，稍后重启后生效。', 2600)
}

async function confirmWebUpdateRestart() {
  showWebUpdateRestartDialog.value = false

  if (!IS_NATIVE) {
    window.location.reload()
    return
  }

  showToast('正在应用更新并重启...', 1800)
  const activated = await webUpdateStore.applyPendingUpdateNow()
  if (!activated) {
    showToast(webUpdateStore.lastError || '应用更新失败，请手动重开应用。', 3200)
  }
}

async function confirmResetWebUpdate() {
  showWebUpdateResetDialog.value = false
  showToast('正在恢复内置资源...', 1800)
  const resetOk = await webUpdateStore.resetToBuiltinBundle()
  if (!resetOk) {
    showToast(webUpdateStore.lastError || '恢复失败，请手动重启应用。', 3200)
  }
}

onMounted(async () => {
  resetPageScrollTop()
  window.requestAnimationFrame(resetPageScrollTop)

  if (IS_NATIVE) {
    try {
      const info = await CapacitorApp.getInfo()
      const runtimeVersion = String(info?.version || '').trim()
      if (runtimeVersion) {
        appVersion.value = runtimeVersion
        androidVersionName.value = runtimeVersion
      }
    } catch {
      // ignore runtime version read failures and keep fallback values
    }
  }

  syncStore.init()
  void updateStore.init()
  void webUpdateStore.init()
  feedbackToken.value = await readPersistedFeedbackToken()
})

onBeforeUnmount(() => {
  clearTimeout(toastTimer)
})

// ======== 资源空间计算 ========
const resourceSizeCacheImage = ref('--')
const resourceSizeModel = ref('--')
const resourceSizeUpdate = ref('--')

async function calculateDirectorySize(path, directory) {
  let total = 0
  try {
    const res = await Filesystem.readdir({ path, directory })
    for (const file of res.files) {
      if (file.type === 'directory') {
        total += await calculateDirectorySize(`${path}/${file.name}`, directory)
      } else {
        total += Number(file.size) || 0
      }
    }
  } catch {
    // 忽略目录不存在的情况
  }
  return total
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function refreshResourceSizes() {
  if (!IS_NATIVE) {
    resourceSizeCacheImage.value = 'H5端由浏览器管理'
    resourceSizeModel.value = 'Web 端未保存'
    resourceSizeUpdate.value = 'Web 端未使用'
    return
  }

  calculateDirectorySize('img-cache', Directory.Cache).then(size => {
    resourceSizeCacheImage.value = size > 0 ? formatSize(size) : '0 B'
  })
  
  calculateDirectorySize('imgly-assets', Directory.Data).then(size => {
    resourceSizeModel.value = size > 0 ? formatSize(size) : '0 B'
  })

  calculateDirectorySize('updates', Directory.Cache).then(size => {
    resourceSizeUpdate.value = size > 0 ? formatSize(size) : '0 B'
  })
}

onMounted(() => {
  refreshResourceSizes()
})

async function handleClearImageCache() {
  try {
    await clearAllCache()
    showToast('图片缓存已清除')
    refreshResourceSizes()
  } catch (error) {
    showToast('清除图片缓存失败')
  }
}

async function handleClearCutoutModel() {
  if (!IS_NATIVE) {
    showToast('Web版未下载原生模型')
    return
  }
  if (isClearingCutoutModel.value) return

  isClearingCutoutModel.value = true

  try {
    const ok = await clearLocalModelAssets()
    if (ok) {
      showToast('抠图模型已卸载')
    } else {
      showToast('清理抠图模型失败')
    }
  } catch (error) {
    console.error('[about] clear cutout model failed:', error)
    showToast('清理抠图模型失败')
  } finally {
    isClearingCutoutModel.value = false
    refreshResourceSizes()
  }
}

async function handleClearUpdateCache() {
  try {
    if (IS_NATIVE) {
      await Filesystem.rmdir({
        path: 'updates',
        directory: Directory.Cache,
        recursive: true
      })
    }
    const { caches } = window
    if (caches) {
      await caches.delete('app-update-cache')
    }
    showToast('应用更新缓存已清除')
    refreshResourceSizes()
  } catch (error) {
    showToast('应用更新缓存为空。')
  }
}


</script>

<style scoped src="../assets/views/AboutView.css"></style>

