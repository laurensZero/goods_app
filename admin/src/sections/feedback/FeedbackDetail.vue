<script setup>
import { computed, ref, watch } from 'vue'
import { supabaseRequest } from '../../services/supabase'
import { formatTime } from '../../utils/format'
import { FEEDBACK_STATUS, FEEDBACK_STATUS_LABEL, FEEDBACK_TYPE_LABEL } from '../../constants'
import TypeBadge from '../../components/ui/TypeBadge.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import AppSelect from '../../components/admin/AppSelect.vue'

const props = defineProps({
  feedbackId: { type: [Number, String], default: null }
})

const emit = defineEmits(['close', 'updated'])

const detail = ref(null)
const status = ref({ text: '等待操作', type: 'default' })
const replyContent = ref('')
const replyBusy = ref(false)
const statusBusy = ref(false)
const showMore = ref(false)

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

function statusTone(value) {
  if (value === 'resolved') return 'ok'
  if (value === 'reviewing') return 'info'
  if (value === 'closed') return 'default'
  return 'warn'
}

function typeTone(value) {
  if (value === 'bug') return 'error'
  if (value === 'feature') return 'info'
  return 'default'
}

async function loadDetail() {
  if (!props.feedbackId) return
  detail.value = null
  showMore.value = false
  replyContent.value = ''
  try {
    const fb = await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(props.feedbackId)}`, { params: { select: '*' } })
    const item = Array.isArray(fb) ? fb[0] : fb
    if (!item) throw new Error('反馈不存在。')
    detail.value = item
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  }
}

watch(() => props.feedbackId, () => {
  if (props.feedbackId) loadDetail()
}, { immediate: true })

// 时间线：首次回复 + followups 合并按时间排序
const timeline = computed(() => {
  if (!detail.value) return []
  const items = []
  if (detail.value.admin_reply?.trim()) {
    items.push({
      id: 'admin_reply',
      role: 'admin',
      content: detail.value.admin_reply,
      createdAt: detail.value.admin_reply_at,
      attachments: []
    })
  }
  for (const f of detail.value.followups || []) {
    items.push({
      id: f.id || `fu-${f.created_at || Math.random()}`,
      role: f.role === 'admin' ? 'admin' : 'user',
      content: f.content || '',
      createdAt: f.created_at,
      attachments: Array.isArray(f.attachments) ? f.attachments : []
    })
  }
  return items.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
})

async function sendReply() {
  const content = String(replyContent.value || '').trim()
  if (!detail.value || !content) {
    setStatus('回复内容不能为空。', 'error')
    return
  }
  replyBusy.value = true
  setStatus('正在发送回复…')
  try {
    // 统一走 RPC，保证 followups 数组与 admin_reply 一致
    await supabaseRequest('/rest/v1/rpc/append_feedback_followup', {
      method: 'POST',
      body: { p_feedback_id: detail.value.id, p_user_id: null, p_content: content, p_role: 'admin', p_attachments: null }
    })
    // 若仍处于待处理，回复后自动置为处理中
    if (detail.value.status === 'pending') {
      await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(detail.value.id)}`, {
        method: 'PATCH',
        body: { status: 'reviewing' }
      })
    }
    replyContent.value = ''
    setStatus('回复已发送。', 'ok')
    await loadDetail()
    emit('updated')
  } catch (e) {
    setStatus(e?.message || '发送回复失败。', 'error')
  } finally {
    replyBusy.value = false
  }
}

async function updateStatus() {
  if (!detail.value) return
  statusBusy.value = true
  setStatus('正在更新状态…')
  try {
    await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(detail.value.id)}`, {
      method: 'PATCH',
      body: { status: detail.value.status }
    })
    setStatus(`状态已更新为 ${FEEDBACK_STATUS_LABEL[detail.value.status] || detail.value.status}。`, 'ok')
    await loadDetail()
    emit('updated')
  } catch (e) {
    setStatus(e?.message || '更新状态失败。', 'error')
  } finally {
    statusBusy.value = false
  }
}
</script>

<template>
  <div v-if="detail" class="fb-detail">
    <!-- 头部 -->
    <div class="fb-head">
      <div class="fb-head-row">
        <TypeBadge :tone="typeTone(detail.type)" :label="FEEDBACK_TYPE_LABEL[detail.type] || detail.type || '--'" />
        <StatusPill :status="statusTone(detail.status)" :label="FEEDBACK_STATUS_LABEL[detail.status] || detail.status || '待处理'" />
        <span class="fb-id">#{{ detail.id }}</span>
      </div>
      <h4 class="fb-title">{{ detail.title || detail.id }}</h4>
      <p class="fb-time">{{ formatTime(detail.created_at) }}</p>
    </div>

    <!-- 正文 -->
    <div v-if="detail.content" class="section">
      <p class="section-title">反馈内容</p>
      <p class="pre-wrap fb-body">{{ detail.content }}</p>
    </div>

    <div v-if="detail.contact" class="section">
      <p class="section-title">联系方式</p>
      <p class="fb-body">{{ detail.contact }}</p>
    </div>

    <!-- 附件 -->
    <div v-if="detail.attachments?.length" class="section">
      <p class="section-title">附件（{{ detail.attachments.length }}）</p>
      <div class="attach-list">
        <a v-for="att in detail.attachments" :key="att.url" :href="att.url" target="_blank" rel="noopener" class="attach-link">
          {{ att.name || '附件' }}
        </a>
      </div>
    </div>

    <!-- 更多信息（默认折叠） -->
    <button class="more-toggle" type="button" @click="showMore = !showMore">
      {{ showMore ? '收起更多信息' : '展开更多信息' }}
    </button>
    <dl v-if="showMore" class="meta more-meta">
      <dt>App 版本</dt>
      <dd>{{ detail.app_version || '--' }}</dd>
      <dt>Bundle 版本</dt>
      <dd>{{ detail.bundle_version || '--' }}</dd>
      <dt>平台</dt>
      <dd>{{ detail.platform || '--' }}</dd>
      <dt>设备 ID</dt>
      <dd class="mono">{{ detail.device_id || '--' }}</dd>
      <dt>User Agent</dt>
      <dd class="mono">{{ detail.user_agent || '--' }}</dd>
      <dt>首次回复时间</dt>
      <dd>{{ formatTime(detail.admin_reply_at) }}</dd>
      <dt>更新时间</dt>
      <dd>{{ formatTime(detail.updated_at) }}</dd>
    </dl>

    <!-- 时间线 -->
    <div class="section">
      <p class="section-title">对话记录</p>
      <div v-if="timeline.length" class="timeline">
        <div
          v-for="item in timeline"
          :key="item.id"
          class="timeline-item"
          :class="item.role === 'admin' ? 'timeline-item--admin' : 'timeline-item--user'"
        >
          <span class="timeline-role">{{ item.role === 'admin' ? '管理员' : '用户' }}</span>
          <span class="timeline-time">{{ formatTime(item.createdAt) }}</span>
          <p class="pre-wrap timeline-content">{{ item.content }}</p>
          <div v-if="item.attachments?.length" class="followup-attachments">
            <a v-for="att in item.attachments" :key="att.url" :href="att.url" target="_blank" rel="noopener" class="attach-link">
              {{ att.name || '附件' }}
            </a>
          </div>
        </div>
      </div>
      <EmptyState v-else title="暂无回复" description="输入内容回复用户" />
    </div>

    <!-- 回复输入 + 状态 -->
    <div class="reply-block">
      <textarea v-model="replyContent" class="textarea" placeholder="输入回复内容…" rows="3" />
      <div class="reply-actions">
        <button class="btn btn--primary" type="button" :disabled="replyBusy" @click="sendReply">
          {{ replyBusy ? '发送中…' : '发送回复' }}
        </button>
        <AppSelect v-model="detail.status" :options="FEEDBACK_STATUS" placeholder="选择状态" />
        <button class="btn" type="button" :disabled="statusBusy" @click="updateStatus">
          {{ statusBusy ? '更新中…' : '更新状态' }}
        </button>
      </div>
    </div>

    <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
      {{ status.text }}
    </p>
  </div>

  <EmptyState v-else title="加载中…" description="正在获取反馈详情" />
</template>

<style scoped>
.fb-detail {
  display: grid;
  gap: 14px;
}

.fb-head {
  display: grid;
  gap: 6px;
}

.fb-head-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.fb-id {
  font-size: 11px;
  color: var(--app-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.fb-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
}

.fb-time {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}

.section {
  display: grid;
  gap: 6px;
}

.section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.fb-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text);
}

.pre-wrap {
  white-space: pre-wrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  word-break: break-all;
}

.attach-list,
.followup-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.attach-link {
  font-size: 12px;
  color: var(--app-pending);
  padding: 4px 10px;
  border-radius: var(--radius-xxs);
  background: var(--status-info-bg);
}

.more-toggle {
  justify-self: start;
  font-size: 12px;
  color: var(--app-text-tertiary);
  background: none;
  border: none;
  padding: 4px 0;
}

.more-meta {
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
}

.timeline {
  display: grid;
  gap: 8px;
}

.timeline-item {
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--app-border);
  background: var(--app-surface-soft);
  display: grid;
  gap: 4px;
}

.timeline-item--admin {
  border-color: color-mix(in srgb, var(--app-info, #3c7bff) 40%, var(--app-border));
}

.timeline-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-secondary);
}

.timeline-time {
  font-size: 11px;
  color: var(--app-text-tertiary);
}

.timeline-content {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-text);
  white-space: pre-wrap;
}

.reply-block {
  display: grid;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}

.reply-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.status-select {
  width: 130px;
}
</style>
