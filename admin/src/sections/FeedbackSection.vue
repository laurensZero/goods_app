<script setup>
import { onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { formatTime } from '../services/versionRules'
import AppSelect from '../components/admin/AppSelect.vue'

const STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'reviewing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' }
]
const TYPE_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: '建议' },
  { value: 'other', label: '其他' }
]

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]))
const TYPE_LABEL = Object.fromEntries(TYPE_OPTIONS.map(t => [t.value, t.label]))

const filters = ref({ status: '', type: '' })
const loading = ref(false)
const listStatus = ref({ text: '', type: 'default' })

const items = ref([])

const detail = ref(null)
const detailStatus = ref({ text: '', type: 'default' })
const replyContent = ref('')
const replyBusy = ref(false)
const statusBusy = ref(false)

function setListStatus(text, type = 'default') {
  listStatus.value = { text, type }
}

async function loadList() {
  loading.value = true
  setListStatus('正在加载反馈列表…')
  try {
    const params = {
      select: 'id,type,title,status,device_id,app_version,created_at,updated_at',
      order: 'created_at.desc',
      limit: '200'
    }
    if (filters.value.status) params.status = `eq.${filters.value.status}`
    if (filters.value.type) params.type = `eq.${filters.value.type}`
    const data = await supabaseRequest('/rest/v1/feedbacks', { params })
    items.value = Array.isArray(data) ? data : []
    setListStatus(`共 ${items.value.length} 条反馈。`, 'ok')
  } catch (e) {
    items.value = []
    setListStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.value = { status: '', type: '' }
  loadList()
}

async function openDetail(id) {
  detailStatus.value = { text: '等待操作', type: 'default' }
  detail.value = null
  replyContent.value = ''
  try {
    const fb = await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(id)}`, { params: { select: '*' } })
    const item = Array.isArray(fb) ? fb[0] : fb
    if (!item) throw new Error('反馈不存在。')
    detail.value = item
  } catch (e) {
    detailStatus.value = { text: e?.message || '加载失败。', type: 'error' }
  }
}

async function sendReply() {
  const content = String(replyContent.value || '').trim()
  if (!detail.value || !content) {
    detailStatus.value = { text: '回复内容不能为空。', type: 'error' }
    return
  }
  replyBusy.value = true
  detailStatus.value = { text: '正在发送回复…', type: 'default' }
  try {
    const existing = await supabaseRequest(
      `/rest/v1/feedbacks?id=eq.${encodeURIComponent(detail.value.id)}&select=admin_reply`
    )
    const hasReply = existing && existing[0]?.admin_reply
    if (!hasReply) {
      await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(detail.value.id)}`, {
        method: 'PATCH',
        body: { admin_reply: content, admin_reply_at: new Date().toISOString() }
      })
      detailStatus.value = { text: '首次回复已发送！', type: 'ok' }
    } else {
      await supabaseRequest('/rest/v1/rpc/append_feedback_followup', {
        method: 'POST',
        body: { p_feedback_id: detail.value.id, p_user_id: null, p_content: content, p_role: 'admin', p_attachments: null }
      })
      detailStatus.value = { text: '追加回复已发送！', type: 'ok' }
    }
    replyContent.value = ''
    await openDetail(detail.value.id)
  } catch (e) {
    detailStatus.value = { text: e?.message || '发送回复失败。', type: 'error' }
  } finally {
    replyBusy.value = false
  }
}

async function updateStatus() {
  if (!detail.value) return
  statusBusy.value = true
  detailStatus.value = { text: '正在更新状态…', type: 'default' }
  try {
    await supabaseRequest(`/rest/v1/feedbacks?id=eq.${encodeURIComponent(detail.value.id)}`, {
      method: 'PATCH',
      body: { status: detail.value.status }
    })
    detailStatus.value = { text: `状态已更新为 ${STATUS_LABEL[detail.value.status]}。`, type: 'ok' }
    await openDetail(detail.value.id)
  } catch (e) {
    detailStatus.value = { text: e?.message || '更新状态失败。', type: 'error' }
  } finally {
    statusBusy.value = false
  }
}

onMounted(loadList)
</script>

<template>
  <div class="filters">
    <AppSelect
      v-model="filters.status"
      :options="[{ value: '', label: '全部状态' }, ...STATUS_OPTIONS]"
      inline
      class="filter-select"
      @change="loadList"
    />
    <AppSelect
      v-model="filters.type"
      :options="[{ value: '', label: '全部类型' }, ...TYPE_OPTIONS]"
      inline
      class="filter-select"
      @change="loadList"
    />
    <button class="btn btn--soft" type="button" :disabled="!filters.status && !filters.type" @click="resetFilters">清除筛选</button>
    <button class="btn" type="button" :disabled="loading" @click="loadList">{{ loading ? '加载中…' : '刷新' }}</button>
  </div>

  <p class="status-text" :class="listStatus.type === 'ok' ? 'status-text--ok' : listStatus.type === 'error' ? 'status-text--error' : ''">
    {{ listStatus.text }}
  </p>

  <div class="list">
    <article v-if="!loading && items.length === 0" class="history-item">暂无反馈</article>
    <article v-for="item in items" :key="item.id" class="list-item list-item--feedback">
      <div class="list-item-main">
        <div class="badge-row">
          <span class="badge" :class="item.type === 'bug' ? 'badge--error' : item.type === 'feature' ? 'badge--info' : 'badge'">
            {{ TYPE_LABEL[item.type] || item.type || '--' }}
          </span>
          <span class="state" :class="item.status === 'resolved' ? 'state--ok' : item.status === 'closed' ? 'state' : item.status === 'reviewing' ? 'state--info' : 'state--warn'">
            {{ STATUS_LABEL[item.status] || item.status || '待处理' }}
          </span>
        </div>
        <span class="list-item-title">{{ item.title || item.id }}</span>
        <span class="list-item-meta">
          v{{ item.app_version || '--' }} · {{ formatTime(item.created_at) }}
          <template v-if="item.device_id"> · {{ item.device_id.substring(0, 12) }}…</template>
        </span>
      </div>
      <div class="list-actions">
        <button class="btn btn--sm" type="button" @click="openDetail(item.id)">查看</button>
      </div>
    </article>
  </div>

  <section v-if="detail" class="card detail-card">
    <div class="card-header">
      <div>
        <p class="card-kicker">feedback detail</p>
        <h3 class="card-title">{{ detail.title || detail.id }}</h3>
      </div>
      <button class="btn btn--sm" type="button" @click="detail = null">收起</button>
    </div>

    <div class="meta">
      <dt>类型</dt>
      <dd>{{ TYPE_LABEL[detail.type] || detail.type || '--' }}</dd>
      <dt>状态</dt>
      <dd>{{ STATUS_LABEL[detail.status] || detail.status || '--' }}</dd>
      <dt>内容</dt>
      <dd class="pre-wrap">{{ detail.content || '--' }}</dd>
      <dt>联系方式</dt>
      <dd>{{ detail.contact || '--' }}</dd>
      <dt>App 版本</dt>
      <dd>{{ detail.app_version || '--' }}</dd>
      <dt>平台</dt>
      <dd>{{ detail.platform || '--' }}</dd>
      <dt>设备 ID</dt>
      <dd class="mono">{{ detail.device_id || '--' }}</dd>
      <dt>User Agent</dt>
      <dd class="mono">{{ detail.user_agent || '--' }}</dd>
      <dt>附件</dt>
      <dd>
        <template v-if="detail.attachments?.length">
          <a v-for="att in detail.attachments" :key="att.url" :href="att.url" target="_blank" rel="noopener" class="attach-link">
            {{ att.name || '附件' }}
          </a>
        </template>
        <template v-else>无</template>
      </dd>
      <dt>首次回复时间</dt>
      <dd>{{ formatTime(detail.admin_reply_at) }}</dd>
      <dt>更新时间</dt>
      <dd>{{ formatTime(detail.updated_at) }}</dd>
    </div>

    <div class="reply-block">
      <div class="followups">
        <div v-if="detail.admin_reply?.trim()" class="history-item followup followup--admin">
          <span class="badge badge--info">管理员 · 首次回复</span>
          <span class="history-time">{{ formatTime(detail.admin_reply_at) }}</span>
          <p class="pre-wrap">{{ detail.admin_reply }}</p>
        </div>
        <div
          v-for="f in detail.followups || []"
          :key="f.id || f.created_at"
          class="history-item followup"
          :class="f.role === 'admin' ? 'followup--admin' : 'followup--user'"
        >
          <span class="badge" :class="f.role === 'admin' ? 'badge--info' : 'badge--ok'">
            {{ f.role === 'admin' ? '管理员' : '用户' }}
          </span>
          <span class="history-time">{{ formatTime(f.created_at) }}</span>
          <p class="pre-wrap">{{ f.content || '' }}</p>
          <div v-if="f.attachments?.length" class="followup-attachments">
            <a v-for="att in f.attachments" :key="att.url" :href="att.url" target="_blank" rel="noopener" class="attach-link">
              {{ att.name || '附件' }}
            </a>
          </div>
        </div>
        <div v-if="!detail.admin_reply?.trim() && !detail.followups?.length" class="history-item">暂无回复</div>
      </div>

      <textarea v-model="replyContent" class="textarea" placeholder="输入回复内容…" rows="3" />
      <div class="actions">
        <button class="btn btn--primary btn--sm" type="button" :disabled="replyBusy" @click="sendReply">
          {{ replyBusy ? '发送中…' : '发送回复' }}
        </button>
        <AppSelect v-model="detail.status" :options="STATUS_OPTIONS" class="status-select" />
        <button class="btn btn--sm" type="button" :disabled="statusBusy" @click="updateStatus">更新状态</button>
      </div>
    </div>

    <p class="status-text" :class="detailStatus.type === 'ok' ? 'status-text--ok' : detailStatus.type === 'error' ? 'status-text--error' : ''">
      {{ detailStatus.text }}
    </p>
  </section>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.filters .filter-select {
  width: auto;
  min-width: 130px;
}

.list {
  display: grid;
  gap: 8px;
}

.badge-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.detail-card {
  gap: 14px;
}

.pre-wrap {
  white-space: pre-wrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  word-break: break-all;
}

.attach-link {
  display: inline-block;
  margin-right: 8px;
}

.reply-block {
  display: grid;
  gap: 10px;
}

.followups {
  display: grid;
  gap: 6px;
}

.followup {
  align-items: flex-start;
}

.followup--admin {
  border-color: color-mix(in srgb, var(--app-info, #3c7bff) 40%, var(--app-border));
}

.followup p {
  width: 100%;
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--app-text);
}

.followup-attachments {
  width: 100%;
  margin-top: 4px;
}

.actions .status-select {
  width: 130px;
  flex-shrink: 0;
}
</style>