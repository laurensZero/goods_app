<script setup>
import { computed } from 'vue'
import StatusPill from './StatusPill.vue'
import { jobProgress } from '../../services/github'

const props = defineProps({
  live: { type: Object, required: true },
  openLabel: { type: String, default: '打开 Actions' }
})

const emit = defineEmits(['toggle-job', 'load-logs'])

const visible = computed(() => props.live && (props.live.phase !== 'idle' || props.live.runId))

const primaryJobs = computed(() => (props.live.jobs || []).filter((j) => !j.isPost))
const postJobs = computed(() => (props.live.jobs || []).filter((j) => j.isPost))

const stepPill = (step) => {
  if (step.conclusion === 'success') return { status: 'ok', label: '完成' }
  if (step.conclusion === 'failure' || step.conclusion === 'timed_out') return { status: 'error', label: '失败' }
  if (step.conclusion === 'skipped') return { status: 'info', label: '跳过' }
  if (step.status === 'in_progress') return { status: 'warn', label: '进行中' }
  if (step.status === 'queued' || step.status === 'waiting') return { status: 'default', label: '排队' }
  return { status: 'default', label: '待执行' }
}

const jobPill = (job) => {
  if (job.conclusion === 'success') return { status: 'ok', label: '成功' }
  if (job.conclusion === 'failure' || job.conclusion === 'timed_out') return { status: 'error', label: '失败' }
  if (job.conclusion === 'cancelled') return { status: 'error', label: '取消' }
  if (props.live.phase === 'done' && props.live.conclusion === 'success') return { status: 'ok', label: '成功' }
  if (job.status === 'in_progress') return { status: 'warn', label: '进行中' }
  return { status: 'default', label: job.status || '排队' }
}

function isExpanded(jobId) {
  return Boolean(props.live.expanded?.[jobId])
}

function onToggle(job) {
  emit('toggle-job', job.id)
}

function onLoadLogs(job) {
  emit('load-logs', job.id)
}

function jobLogView(job) {
  return props.live.logsByJob?.[job.id] || null
}

function logsLoading(job) {
  return Boolean(props.live.logsLoading?.[job.id])
}

function visibleSteps(job) {
  return (job.steps || []).filter((s) => !s.isPost)
}

function postSteps(job) {
  return (job.steps || []).filter((s) => s.isPost)
}
</script>

<template>
  <div v-if="visible" class="wf-live" :class="`wf-live--${live.statusTone || 'default'}`">
    <div class="wf-live__head">
      <span v-if="live.phase === 'finding' || live.phase === 'running'" class="wf-live__pulse" />
      <div class="wf-live__title">
        <strong>{{ live.label }}</strong>
        <StatusPill :status="live.statusTone" :label="live.statusLabel || '…'" />
        <span v-if="live.runNumber" class="wf-live__meta">Run #{{ live.runNumber }}</span>
        <span v-if="live.statusDetail" class="wf-live__meta">{{ live.statusDetail }}</span>
      </div>
      <a
        v-if="live.htmlUrl"
        class="btn btn--sm"
        :href="live.htmlUrl"
        target="_blank"
        rel="noopener"
      >{{ openLabel }}</a>
    </div>

    <p v-if="live.error" class="wf-live__error">{{ live.error }}</p>
    <p v-else-if="live.phase === 'done' && live.conclusion === 'success'" class="wf-live__ok">
      {{ live.label }} 构建成功。
    </p>
    <div v-else-if="live.failureText" class="wf-live__fail">
      <p class="wf-live__fail-title">{{ live.label }} 失败，原因：</p>
      <p class="wf-live__fail-text">{{ live.failureText }}</p>
      <ul v-if="live.failures?.length" class="wf-live__fail-list">
        <li v-for="(f, i) in live.failures" :key="i">
          <span class="wf-live__fail-job">{{ f.job }}</span>
          <span v-if="f.steps?.length">失败步骤：{{ f.steps.join('、') }}</span>
          <ul v-if="f.messages?.length">
            <li v-for="(m, mi) in f.messages" :key="mi">{{ m }}</li>
          </ul>
        </li>
      </ul>
    </div>

    <div v-if="primaryJobs.length" class="wf-live__jobs">
      <div v-for="job in primaryJobs" :key="job.id" class="wf-live__job">
        <button class="wf-live__job-head" type="button" @click="onToggle(job)">
          <span class="wf-live__chevron" :class="{ 'wf-live__chevron--open': isExpanded(job.id) }">▸</span>
          <span class="wf-live__job-name">{{ job.name }}</span>
          <span class="wf-live__job-progress">
            {{ jobProgress(job).done }}/{{ jobProgress(job).total }}
            <template v-if="jobProgress(job).active"> · {{ jobProgress(job).active }}</template>
          </span>
          <StatusPill v-bind="jobPill(job)" />
        </button>

        <div v-if="isExpanded(job.id)" class="wf-live__job-body">
          <ul v-if="visibleSteps(job).length" class="wf-live__steps">
            <li v-for="(step, si) in visibleSteps(job)" :key="si" class="wf-live__step">
              <StatusPill v-bind="stepPill(step)" />
              <span :class="{ 'wf-live__step--fail': step.conclusion === 'failure' || step.conclusion === 'timed_out' }">
                {{ step.name }}
              </span>
            </li>
          </ul>

          <details v-if="postSteps(job).length" class="wf-live__post">
            <summary>收尾步骤（Post）×{{ postSteps(job).length }}</summary>
            <ul class="wf-live__steps">
              <li v-for="(step, si) in postSteps(job)" :key="si" class="wf-live__step wf-live__step--post">
                <StatusPill v-bind="stepPill(step)" />
                <span>{{ step.name }}</span>
              </li>
            </ul>
          </details>

          <div class="wf-live__log-actions">
            <button
              class="btn btn--sm"
              type="button"
              :disabled="logsLoading(job)"
              @click="onLoadLogs(job)"
            >
              {{ logsLoading(job) ? '日志加载中…' : (jobLogView(job) && !jobLogView(job).unavailable ? '刷新日志' : '展开日志') }}
            </button>
            <a v-if="job.htmlUrl" class="btn btn--sm" :href="job.htmlUrl" target="_blank" rel="noopener">在 Actions 打开</a>
          </div>

          <template v-if="jobLogView(job)">
            <p v-if="jobLogView(job).unavailable" class="wf-live__meta">
              浏览器无法拉取该 job 日志（可能被 CORS 拦截），请点「在 Actions 打开」查看完整输出。
            </p>
            <template v-else>
              <ul v-if="jobLogView(job).errors?.length" class="wf-live__log-errors">
                <li v-for="(err, ei) in jobLogView(job).errors" :key="ei">{{ err }}</li>
              </ul>
              <pre class="wf-live__log">{{ jobLogView(job).text || '（无日志内容）' }}</pre>
            </template>
          </template>
        </div>
      </div>
    </div>

    <details v-if="postJobs.length" class="wf-live__post">
      <summary>收尾 Job ×{{ postJobs.length }}</summary>
      <div v-for="job in postJobs" :key="job.id" class="wf-live__step wf-live__step--post" style="margin-top:6px">
        <StatusPill v-bind="jobPill(job)" />
        <span>{{ job.name }}</span>
      </div>
    </details>
  </div>
</template>

<style scoped>
.wf-live {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius, 10px);
  background: var(--app-surface-2, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--app-border, rgba(0, 0, 0, 0.08));
}

.wf-live--warn { border-color: var(--status-warn, rgba(180, 120, 0, 0.35)); }
.wf-live--error { border-color: var(--status-error, rgba(199, 68, 68, 0.4)); }
.wf-live--ok { border-color: var(--status-ok, rgba(34, 161, 97, 0.35)); }

.wf-live__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.wf-live__pulse {
  width: 9px;
  height: 9px;
  margin-top: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--status-warn, #b07800);
  animation: wf-pulse 1.2s ease-in-out infinite;
}

@keyframes wf-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}

.wf-live__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  font-size: 13px;
}

.wf-live__meta {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.wf-live__error,
.wf-live__ok,
.wf-live__fail-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.wf-live__error,
.wf-live__fail-title,
.wf-live__fail-text { color: var(--status-error); }
.wf-live__ok { color: var(--status-ok); }

.wf-live__fail-list {
  margin: 6px 0 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.6;
}

.wf-live__fail-list ul {
  margin: 4px 0 0;
  padding-left: 14px;
  color: var(--status-error);
}

.wf-live__fail-job {
  font-weight: 600;
  color: var(--app-text);
  margin-right: 6px;
}

.wf-live__jobs { display: grid; gap: 8px; }
.wf-live__job {
  border: 1px solid var(--app-border, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  background: var(--app-surface, rgba(255, 255, 255, 0.04));
  overflow: hidden;
}

.wf-live__job-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  text-align: left;
  background: transparent;
}

.wf-live__chevron {
  width: 12px;
  flex: none;
  color: var(--app-text-secondary);
  transition: transform 0.15s ease;
  font-size: 12px;
}

.wf-live__chevron--open { transform: rotate(90deg); }

.wf-live__job-name {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}

.wf-live__job-progress {
  font-size: 12px;
  color: var(--app-text-secondary);
  white-space: nowrap;
}

.wf-live__job-body {
  display: grid;
  gap: 8px;
  padding: 8px 10px 10px 28px;
  border-top: 1px solid var(--app-border, rgba(0, 0, 0, 0.06));
}

.wf-live__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.wf-live__step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--app-text-secondary);
}

.wf-live__step--fail { color: var(--status-error); font-weight: 600; }
.wf-live__step--post { opacity: 0.75; }

.wf-live__post {
  font-size: 12px;
  color: var(--app-text-secondary);
}

.wf-live__post summary {
  cursor: pointer;
  margin-bottom: 6px;
}

.wf-live__log-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.wf-live__log-errors {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--status-error);
  line-height: 1.6;
}

.wf-live__log {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

html.theme-dark .wf-live__log {
  background: rgba(255, 255, 255, 0.06);
}
</style>
