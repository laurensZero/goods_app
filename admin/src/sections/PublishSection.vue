<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { dispatchWorkflow, WEB_BUNDLE_WORKFLOW, APK_WORKFLOW, workflowUrl, fetchRecentCommits, formatBetaNotesFromCommits } from '../services/github'
import { getGithubToken } from '../services/supabase'
import { fetchLatestApkVersion } from '../services/channels'
import AppSelect from '../components/admin/AppSelect.vue'
import { CHANNEL_OPTIONS, UPDATE_LEVELS, APK_BUILD_TYPES } from '../constants'
import { useConfirm } from '../composables/useConfirm'

const { confirm } = useConfirm()

const form = reactive({
  channel: 'beta',
  version: '',
  minNativeVersion: '',
  updateLevel: '',
  notes: '',
  rollbackVersion: ''
})

const apk = reactive({
  buildType: 'release',
  tag: '',
  updateLevel: 'prompt'
})

const publishStatus = ref({ text: '等待操作', type: 'default' })
const apkStatus = ref({ text: '等待操作', type: 'default' })
const notesPreview = ref('')
const publishBusy = ref(false)
const apkBusy = ref(false)
const notesBusy = ref(false)
const latestApk = ref('')
const channelHint = ref('')

const updateLevelOptions = computed(() => [
  { value: '', label: `默认（${channelHint.value}）` },
  ...UPDATE_LEVELS
])

function setPublishStatus(text, type = 'default') {
  publishStatus.value = { text, type }
}

function setApkStatus(text, type = 'default') {
  apkStatus.value = { text, type }
}

function syncUpdateLevelByChannel() {
  if (form.channel === 'stable') {
    channelHint.value = 'stable 通道默认 prompt（留空时）'
  } else {
    channelHint.value = 'beta 通道默认 silent（留空时）'
  }
}

function openWorkflow(target = WEB_BUNDLE_WORKFLOW) {
  window.open(workflowUrl(target), '_blank', 'noopener')
}

async function generateBetaNotes() {
  notesBusy.value = true
  notesPreview.value = '正在生成 beta 更新日志预览…'
  try {
    const commits = await fetchRecentCommits()
    const list = Array.isArray(commits) ? [...commits].reverse() : []
    const preview = [
      '最近提交预览（仅用于手动发布前确认，实际发布时仍以 workflow 生成的日志为准）',
      '',
      formatBetaNotesFromCommits(list)
    ].join('\n')
    notesPreview.value = preview
    if (!String(form.notes || '').trim()) {
      form.notes = formatBetaNotesFromCommits(list)
    }
    setPublishStatus('已生成 beta 更新日志预览。', 'ok')
  } catch (e) {
    notesPreview.value = e?.message || '生成 beta 更新日志预览失败。'
    setPublishStatus(e?.message || '生成失败。', 'error')
  } finally {
    notesBusy.value = false
  }
}

function buildPublishInputs() {
  if (!getGithubToken()) throw new Error('请先填写 GitHub Token（需要 workflow 权限）。')
  const inputs = {
    channel: form.channel,
    version: String(form.version || '').trim(),
    min_native_version: String(form.minNativeVersion || '').trim(),
    notes: String(form.notes || '').trim()
  }
  if (String(form.updateLevel || '').trim()) {
    inputs.update_level = String(form.updateLevel).trim().toLowerCase()
  }
  return inputs
}

async function triggerPublish() {
  try {
    const inputs = buildPublishInputs()
    const ok = await confirm({
      title: '构建并发布',
      message: `确认触发 ${inputs.channel} 通道的 OTA Bundle 发布？`,
      confirmText: '确认发布'
    })
    if (!ok) return
    publishBusy.value = true
    setPublishStatus('正在触发发布工作流…')
    await dispatchWorkflow(WEB_BUNDLE_WORKFLOW, inputs)
    setPublishStatus('已触发发布。请在 Actions 页面查看执行进度，完成后可刷新通道。', 'ok')
  } catch (e) {
    setPublishStatus(e?.message || '触发发布失败。', 'error')
  } finally {
    publishBusy.value = false
  }
}

async function triggerRollback() {
  const version = String(form.rollbackVersion || '').trim()
  try {
    if (!getGithubToken()) throw new Error('回档需要先填写 GitHub Token。')
    if (!version) throw new Error('请填写要回档到的版本号。')
    const ok = await confirm({
      title: '触发回档',
      message: `确认将 ${form.channel} 通道回档到 ${version} 版本？`,
      confirmText: '确认回档'
    })
    if (!ok) return
    publishBusy.value = true
    setPublishStatus(`正在回档 ${form.channel} -> ${version} …`)
    await dispatchWorkflow(WEB_BUNDLE_WORKFLOW, {
      channel: form.channel,
      version: '',
      min_native_version: '',
      update_level: '',
      notes: '',
      rollback_version: version
    })
    setPublishStatus(`已触发回档：${form.channel} -> ${version}。请到 Actions 查看进度。`, 'ok')
  } catch (e) {
    setPublishStatus(e?.message || '回档触发失败。', 'error')
  } finally {
    publishBusy.value = false
  }
}

async function triggerApkBuild() {
  try {
    if (!getGithubToken()) throw new Error('请先填写 GitHub Token（需要 workflow 权限）。')
    const inputs = { build_type: apk.buildType, update_level: String(apk.updateLevel || 'prompt').toLowerCase() }
    if (apk.buildType === 'release') {
      const tag = String(apk.tag || '').trim().replace(/^[vV]/, 'v')
      if (!tag) throw new Error('release 构建必须填写 Release Tag（如 v1.5.0）。')
      inputs.release_tag = tag
    }
    const ok = await confirm({
      title: '触发 APK 构建',
      message: `确认触发 ${apk.buildType === 'release' ? 'release' : 'debug'} 构建${inputs.release_tag ? `（${inputs.release_tag}）` : ''}？`,
      confirmText: '确认构建'
    })
    if (!ok) return
    apkBusy.value = true
    setApkStatus('正在触发 APK 构建工作流…')
    await dispatchWorkflow(APK_WORKFLOW, inputs)
    const label = apk.buildType === 'release' ? `（${inputs.release_tag}）` : '（debug）'
    setApkStatus(`已触发 APK 构建${label}。请到 Actions 页面查看执行进度。`, 'ok')
  } catch (e) {
    setApkStatus(e?.message || '触发 APK 构建失败。', 'error')
  } finally {
    apkBusy.value = false
  }
}

onMounted(async () => {
  syncUpdateLevelByChannel()
  try {
    latestApk.value = await fetchLatestApkVersion()
  } catch {
    latestApk.value = ''
  }
})
</script>

<template>
  <p class="status-text">
    触发 GitHub Actions workflow_dispatch。Web Bundle 使用 <code>publish-web-bundle.yml</code>（频道仅 stable / beta），
    APK 使用 <code>build-apk.yml</code>。
  </p>

  <div class="scroll-row">
    <button class="btn btn--sm" type="button" @click="openWorkflow(WEB_BUNDLE_WORKFLOW)">打开 Web Bundle workflow</button>
    <button class="btn btn--sm" type="button" @click="openWorkflow(APK_WORKFLOW)">打开 APK workflow</button>
  </div>

  <div class="grid">
    <div class="card card--inner">
      <div class="card-header">
        <div>
          <p class="card-kicker">Web bundle</p>
          <h3 class="card-title">发布 OTA Bundle</h3>
        </div>
        <span class="state">workflow_dispatch</span>
      </div>

      <div class="field">
        <label class="field-label">发布通道</label>
        <AppSelect v-model="form.channel" :options="CHANNEL_OPTIONS" @change="syncUpdateLevelByChannel" />
      </div>

      <div class="field">
        <label class="field-label">版本号（可选，留空自动生成 {最新APK版本}.N）</label>
        <input v-model="form.version" class="input" type="text" placeholder="例如 1.6.0.1">
      </div>

      <div class="field">
        <label class="field-label">更新级别（可选）</label>
        <AppSelect v-model="form.updateLevel" :options="updateLevelOptions" />
      </div>

      <div class="field">
        <label class="field-label">更新说明（可选，留空则按 commit 自动生成）</label>
        <textarea v-model="form.notes" class="textarea" placeholder="用户可见的更新内容" />
      </div>

      <div class="field">
        <label class="field-label">最低原生版本号（可选）</label>
        <input v-model="form.minNativeVersion" class="input" type="text" placeholder="例如 1.3.1">
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="button" :disabled="publishBusy" @click="triggerPublish">
          {{ publishBusy ? '触发中…' : '构建并发布' }}
        </button>
        <button class="btn btn--soft" type="button" :disabled="notesBusy" @click="generateBetaNotes">
          {{ notesBusy ? '生成中…' : '生成 beta 更新日志' }}
        </button>
      </div>

      <hr class="sep">

      <div class="actions">
        <input v-model="form.rollbackVersion" class="input" type="text" placeholder="回档版本号（如 1.6.0.2）" style="flex:1">
        <button class="btn btn--soft" type="button" :disabled="publishBusy" @click="triggerRollback">回档</button>
      </div>

      <p v-if="notesPreview" class="preview">{{ notesPreview }}</p>
    </div>

    <div class="card card--inner">
      <div class="card-header">
        <div>
          <p class="card-kicker">APK</p>
          <h3 class="card-title">构建 Android APK</h3>
        </div>
        <span class="state" :class="latestApk ? 'state--ok' : 'state'">
          {{ latestApk ? `最新：${latestApk}` : '暂无 Release' }}
        </span>
      </div>

      <div class="field">
        <label class="field-label">构建类型</label>
        <AppSelect v-model="apk.buildType" :options="APK_BUILD_TYPES" />
      </div>

      <div class="field">
        <label class="field-label">Release Tag（{{ apk.buildType === 'release' ? 'release 必填' : 'debug 无需填写' }}）</label>
        <input v-model="apk.tag" class="input" type="text" placeholder="如 v1.5.0" :disabled="apk.buildType === 'debug'">
      </div>

      <div class="field">
        <label class="field-label">更新级别</label>
        <AppSelect v-model="apk.updateLevel" :options="UPDATE_LEVELS" />
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="button" :disabled="apkBusy" @click="triggerApkBuild">
          {{ apkBusy ? '触发中…' : '触发 APK 构建' }}
        </button>
      </div>
    </div>
  </div>

  <p class="status-text" :class="publishStatus.type === 'ok' ? 'status-text--ok' : publishStatus.type === 'error' ? 'status-text--error' : ''">
    {{ publishStatus.text }}
  </p>
  <p class="status-text" :class="apkStatus.type === 'ok' ? 'status-text--ok' : apkStatus.type === 'error' ? 'status-text--error' : ''">
    {{ apkStatus.text }}
  </p>
</template>

<style scoped>
.card--inner {
  gap: 12px;
}

.scroll-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preview {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
  font-size: 12px;
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--app-text-secondary);
  word-break: break-word;
}
</style>