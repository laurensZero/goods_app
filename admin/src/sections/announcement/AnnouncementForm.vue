<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { SHOW_MODES, CTA_ACTIONS } from '../../constants'
import { normalizeVersionRuleForForm, buildVersionRuleFromForm, normalizeHttpsUrl } from '../../services/versionRules'
import UserPicker from '../../components/admin/UserPicker.vue'
import ConditionEditor from '../../components/admin/ConditionEditor.vue'
import VersionRuleFields from '../../components/admin/VersionRuleFields.vue'
import AppSelect from '../../components/admin/AppSelect.vue'

const CONDITION_LOGIC_OPTIONS = [
  { value: 'and', label: 'and（全部满足）' },
  { value: 'or', label: 'or（任一满足）' }
]

const props = defineProps({
  editing: { type: Object, default: null }
})

const emit = defineEmits(['submit', 'close'])

const form = reactive({
  id: '',
  enabled: true,
  priority: 100,
  title: '',
  message: '',
  imageUrl: '',
  customCss: '',
  showMode: 'once',
  channels: 'stable,beta',
  startAt: '',
  endAt: '',
  appRule: { mode: 'any', value: '' },
  bundleRule: { mode: 'any', value: '' },
  ctaText: '',
  ctaUrl: '',
  ctaAction: 'dismiss',
  targetUsers: [],
  conditionLogic: 'and',
  conditions: []
})

const saving = ref(false)
const error = ref('')

watch(
  () => props.editing,
  (item) => {
    if (!item) {
      Object.assign(form, {
        id: '',
        enabled: true,
        priority: 100,
        title: '',
        message: '',
        imageUrl: '',
        customCss: '',
        showMode: 'once',
        channels: 'stable,beta',
        startAt: '',
        endAt: '',
        appRule: { mode: 'any', value: '' },
        bundleRule: { mode: 'any', value: '' },
        ctaText: '',
        ctaUrl: '',
        ctaAction: 'dismiss',
        targetUsers: [],
        conditionLogic: 'and',
        conditions: []
      })
      return
    }
    const showRule = item.show_rule || {}
    const cta = item.cta || {}
    Object.assign(form, {
      id: item.id,
      enabled: item.enabled !== false,
      priority: item.priority ?? 100,
      title: item.title || '',
      message: item.message || '',
      imageUrl: item.image_url || '',
      customCss: item.custom_css || '',
      showMode: showRule.showMode || 'once',
      channels: Array.isArray(showRule.channels) ? showRule.channels.join(',') : 'stable,beta',
      startAt: showRule.startAt || '',
      endAt: showRule.endAt || '',
      appRule: normalizeVersionRuleForForm(showRule.appVersionRule, showRule.appVersion, showRule.minAppVersion, showRule.maxAppVersion),
      bundleRule: normalizeVersionRuleForForm(showRule.bundleVersionRule, showRule.bundleVersion, showRule.minBundleVersion, showRule.maxBundleVersion),
      ctaText: cta.text || '',
      ctaUrl: cta.url || '',
      ctaAction: cta.action || 'dismiss',
      targetUsers: Array.isArray(item.target_users) ? item.target_users : [],
      conditionLogic: showRule.logic || 'and',
      conditions: Array.isArray(showRule.conditions) ? showRule.conditions.map((c) => ({ ...c })) : []
    })
    error.value = ''
  },
  { immediate: true }
)

const isEditing = computed(() => !!props.editing)

function buildRow() {
  const f = form
  const id = String(f.id || '').trim()
  const title = String(f.title || '').trim()
  const message = String(f.message || '').trim()
  if (!id) throw new Error('公告 ID 不能为空。')
  if (!title) throw new Error('公告标题不能为空。')
  if (!message) throw new Error('公告正文不能为空。')

  const channels = String(f.channels || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const appRule = buildVersionRuleFromForm(f.appRule.mode, f.appRule.value, 'App版本')
  const bundleRule = buildVersionRuleFromForm(f.bundleRule.mode, f.bundleRule.value, 'Bundle版本')
  const ctaUrl = normalizeHttpsUrl(f.ctaUrl)

  const showRule = {
    showMode: String(f.showMode || 'once').trim() || 'once',
    startAt: String(f.startAt || '').trim(),
    endAt: String(f.endAt || '').trim(),
    channels: channels.length ? channels : ['stable', 'beta'],
    logic: String(f.conditionLogic || 'and').trim(),
    conditions: f.conditions.filter((c) => c && c.type)
  }
  if (appRule) {
    showRule.appVersionRule = appRule
    if (appRule.exact) showRule.appVersion = appRule.exact
    if (appRule.min) showRule.minAppVersion = appRule.min
    if (appRule.max) showRule.maxAppVersion = appRule.max
  }
  if (bundleRule) {
    showRule.bundleVersionRule = bundleRule
    if (bundleRule.exact) showRule.bundleVersion = bundleRule.exact
    if (bundleRule.min) showRule.minBundleVersion = bundleRule.min
    if (bundleRule.max) showRule.maxBundleVersion = bundleRule.max
  }

  return {
    id,
    enabled: f.enabled,
    priority: Number.isFinite(Number(f.priority)) ? Number(f.priority) : 100,
    title,
    message,
    image_url: String(f.imageUrl || '').trim(),
    custom_css: String(f.customCss || '').trim(),
    target_users: f.targetUsers.length ? f.targetUsers : [],
    cta: { text: String(f.ctaText || '').trim(), url: ctaUrl, action: String(f.ctaAction || 'dismiss').trim() },
    show_rule: showRule
  }
}

async function submit() {
  saving.value = true
  error.value = ''
  try {
    const row = buildRow()
    emit('submit', row)
  } catch (e) {
    error.value = e?.message || '保存失败。'
  } finally {
    saving.value = false
  }
}

const previewCtaAction = computed(() => {
  const action = String(form.ctaAction || '').trim()
  if (action === 'open_url' && form.ctaUrl) return 'open_url'
  if (action === 'navigate' && form.ctaUrl) return 'navigate'
  return 'dismiss'
})

// 与 app 端 AnnouncementDialog.showPrimaryButton 保持一致：
// 仅 open_url / navigate 且有 url 时显示主按钮
const showPrimaryButton = computed(() => {
  const action = String(form.ctaAction || '').trim().toLowerCase()
  return (action === 'open_url' || action === 'navigate') && !!String(form.ctaUrl || '').trim()
})

const primaryButtonText = computed(() => String(form.ctaText || '').trim() || '查看详情')

// 与 app 端 updatedAtLabel 一致：取 showRule.startAt 的日期
const previewUpdatedAtLabel = computed(() => {
  const value = String(form.startAt || '').trim()
  if (!value) return ''
  const timestamp = /^\d+$/.test(value) ? Number(value) : new Date(value).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const date = new Date(timestamp)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
})
</script>

<template>
  <div class="ann-form">
    <!-- ① 基本信息 -->
    <div class="form-group">
      <h4 class="group-title">基本信息</h4>
      <div class="group-grid">
        <div class="field">
          <label class="field-label">公告 ID</label>
          <input v-model="form.id" class="input" type="text" :disabled="isEditing" placeholder="如 notice-v1.4-update">
        </div>
        <div class="field">
          <label class="field-label">优先级（数值越大越靠前）</label>
          <input v-model.number="form.priority" class="input" type="number">
        </div>
        <div class="field field--full">
          <label class="field-label">标题</label>
          <input v-model="form.title" class="input" type="text" placeholder="公告标题">
        </div>
        <div class="field field--full">
          <label class="field-label">正文</label>
          <textarea v-model="form.message" class="textarea" placeholder="公告内容" />
        </div>
        <div class="field">
          <label class="field-label">图片 URL（可选）</label>
          <input v-model="form.imageUrl" class="input" type="text" placeholder="https://…">
        </div>
        <div class="field">
          <label class="field-label">自定义 CSS（可选）</label>
          <input v-model="form.customCss" class="input" type="text" placeholder="如 .ann-msg{color:#f00}">
        </div>
        <div class="field field--full">
          <label class="checkbox-row">
            <input v-model="form.enabled" type="checkbox">
            启用公告
          </label>
        </div>
      </div>
    </div>

    <!-- ② 展示规则 -->
    <div class="form-group">
      <h4 class="group-title">展示规则</h4>
      <div class="group-grid">
        <div class="field">
          <label class="field-label">展示模式</label>
          <AppSelect v-model="form.showMode" :options="SHOW_MODES" placeholder="选择展示模式" />
        </div>
        <div class="field">
          <label class="field-label">展示通道（逗号分隔）</label>
          <input v-model="form.channels" class="input" type="text" placeholder="stable,beta">
        </div>
        <div class="field">
          <label class="field-label">开始时间（可选）</label>
          <input v-model="form.startAt" class="input" type="datetime-local">
        </div>
        <div class="field">
          <label class="field-label">结束时间（可选）</label>
          <input v-model="form.endAt" class="input" type="datetime-local">
        </div>
      </div>
      <div class="rule-grid">
        <VersionRuleFields v-model="form.appRule" label="App 版本条件" />
        <VersionRuleFields v-model="form.bundleRule" label="Bundle 版本条件" />
      </div>
    </div>

    <!-- ③ CTA -->
    <div class="form-group">
      <h4 class="group-title">按钮（CTA）</h4>
      <div class="group-grid">
        <div class="field">
          <label class="field-label">按钮文字</label>
          <input v-model="form.ctaText" class="input" type="text" placeholder="如 前往更新">
        </div>
        <div class="field">
          <label class="field-label">按钮动作</label>
          <AppSelect v-model="form.ctaAction" :options="CTA_ACTIONS" placeholder="选择按钮动作" />
        </div>
        <div class="field field--full">
          <label class="field-label">按钮链接（open_url / navigate 时需要）</label>
          <input v-model="form.ctaUrl" class="input" type="text" placeholder="https://…">
        </div>
      </div>
    </div>

    <!-- ④ 定向 -->
    <div class="form-group">
      <h4 class="group-title">定向</h4>
      <div class="field">
        <label class="field-label">目标用户（留空 = 所有用户）</label>
        <UserPicker v-model="form.targetUsers" />
      </div>
      <div class="field">
        <label class="field-label">条件逻辑（AND / OR）</label>
        <AppSelect v-model="form.conditionLogic" :options="CONDITION_LOGIC_OPTIONS" placeholder="选择条件逻辑" />
      </div>
      <div class="field">
        <label class="field-label">附加条件</label>
        <ConditionEditor v-model:conditions="form.conditions" />
      </div>
    </div>

    <!-- 实时预览 -->
    <div class="form-group">
      <h4 class="group-title">全真预览</h4>
      <div class="preview-stage">
        <div class="preview-dialog">
          <p class="preview-kicker">Announcement</p>
          <h5 class="preview-title">{{ form.title || '公告标题' }}</h5>
          <img v-if="form.imageUrl" :src="form.imageUrl" class="preview-img" alt="">
          <p class="preview-message">{{ form.message || '公告正文预览…' }}</p>
          <div v-if="previewUpdatedAtLabel" class="preview-meta">更新于 {{ previewUpdatedAtLabel }}</div>
          <div class="preview-actions">
            <button class="preview-btn preview-btn--secondary" type="button">知道了</button>
            <button v-if="showPrimaryButton" class="preview-btn preview-btn--primary" type="button">{{ primaryButtonText }}</button>
          </div>
        </div>
        <p class="tip">
          CTA 动作：{{ previewCtaAction === 'open_url' ? 'open_url（新窗口打开链接）' : previewCtaAction === 'navigate' ? 'navigate（应用内跳转）' : 'dismiss（无主按钮，仅「知道了」）' }}
        </p>
      </div>
    </div>

    <p v-if="error" class="status-text status-text--error">{{ error }}</p>

    <div class="form-actions">
      <button class="btn btn--primary" type="button" :disabled="saving" @click="submit">
        {{ saving ? '保存中…' : '保存公告' }}
      </button>
      <button class="btn" type="button" @click="emit('close')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.ann-form {
  display: grid;
  gap: 16px;
}

.form-group {
  display: grid;
  gap: 12px;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-secondary);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
}

.group-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.rule-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.preview-stage {
  display: grid;
  gap: 8px;
}

/* 模拟 app 端 AnnouncementDialog：遮罩 + 居中弹窗卡片 */
.preview-stage {
  padding: 20px;
  background:
    radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--app-text) 8%, transparent), transparent 60%),
    var(--app-surface-soft);
  border: 1px solid var(--app-border);
  border-radius: var(--radius-card);
}

.preview-dialog {
  width: min(100%, 480px);
  margin: 0 auto;
  max-height: 60vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  border: 1px solid var(--app-border);
}

.preview-kicker {
  margin: 0;
  color: var(--app-text-tertiary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.preview-title {
  margin: 8px 0 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.preview-img {
  display: block;
  width: 100%;
  margin-top: 14px;
  border-radius: var(--radius-xs);
  max-height: 240px;
  object-fit: cover;
}

.preview-message {
  margin: 12px 0 0;
  color: var(--app-text-secondary);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.preview-meta {
  margin-top: 12px;
  color: var(--app-text-tertiary);
  font-size: 12px;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.preview-btn {
  min-height: 42px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.preview-btn--secondary {
  background: var(--app-surface-soft);
  color: var(--app-text-secondary);
}

.preview-btn--primary {
  background: var(--app-text);
  color: var(--app-bg);
}

.form-actions {
  display: flex;
  gap: 10px;
}

.form-actions .btn {
  flex: 1;
}

@media (min-width: 560px) {
  .group-grid {
    grid-template-columns: 1fr 1fr;
  }
  .rule-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
