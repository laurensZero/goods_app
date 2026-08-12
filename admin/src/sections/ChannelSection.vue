<script setup>
import { onMounted, reactive } from 'vue'
import { CHANNELS, fetchOtaBundles, pruneOldBundles } from '../services/channels'
import { getSupabaseConfig, getGithubToken } from '../services/supabase'
import { dispatchWorkflow, WEB_BUNDLE_WORKFLOW } from '../services/github'
import { formatTime } from '../utils/format'
import { useConfirm } from '../composables/useConfirm'
import StatusPill from '../components/ui/StatusPill.vue'
import Skeleton from '../components/ui/Skeleton.vue'

const { confirm } = useConfirm()

const channels = reactive({})

function ensureState(channel) {
  if (!channels[channel]) {
    channels[channel] = { loading: true, error: null, data: null, versions: [], bundleUrl: '' }
  }
  return channels[channel]
}

async function loadChannel(channel) {
  const state = ensureState(channel)
  state.loading = true
  state.error = null
  try {
    const payload = await fetchOtaBundles(channel)
    state.loading = false
    state.data = payload.data
    state.versions = payload.versions
    state.bundleUrl = payload.bundleUrl
    state.storagePath = payload.storagePath
    if (payload.needsPrune) {
      pruneOldBundles(channel).catch(() => {})
    }
  } catch (e) {
    state.loading = false
    state.error = e?.message || '未知错误'
  }
}

function loadAll() {
  CHANNELS.forEach((channel) => loadChannel(channel))
}

function openTableRow(channel) {
  const config = getSupabaseConfig()
  if (!config.url || !config.key) return
  const url = `${config.url}/rest/v1/ota_releases?select=*&channel=eq.${encodeURIComponent(channel)}&order=published_at.desc&limit=3&apikey=${encodeURIComponent(config.key)}`
  window.open(url, '_blank', 'noopener')
}

function openBundle(bundleUrl) {
  if (bundleUrl) window.open(bundleUrl, '_blank', 'noopener')
}

let rollbackingChannel = null

async function triggerRollback(channel, version) {
  if (!getGithubToken()) {
    channels[channel].error = '回档需要先填写 GitHub Token。'
    return
  }
  const ok = await confirm({
    title: '触发回档',
    message: `确认将 ${channel} 通道回档到 ${version} 版本？`,
    confirmText: '确认回档'
  })
  if (!ok) return
  rollbackingChannel = channel
  try {
    await dispatchWorkflow(WEB_BUNDLE_WORKFLOW, {
      channel,
      version: '',
      min_native_version: '',
      update_level: 'prompt',
      notes: '',
      rollback_version: version
    })
    channels[channel].error = '已触发回档，请到 Actions 查看进度。'
  } catch (e) {
    channels[channel].error = e?.message || '回档触发失败。'
  } finally {
    rollbackingChannel = null
  }
}

function channelState(channel) {
  const s = channels[channel]
  if (!s) return { pill: 'default', label: '…' }
  if (s.loading) return { pill: 'warn', label: '加载中' }
  if (s.error) return { pill: 'error', label: '读取失败' }
  return { pill: 'ok', label: '正常' }
}

// 首次加载（尚无数据）时显示骨架；刷新时保留旧数据不闪骨架
function channelLoading(channel) {
  const s = channels[channel]
  return !!s?.loading && !s?.data
}

onMounted(loadAll)
</script>

<template>
  <p class="status-text">
    各通道当前 OTA Bundle 状态与历史。数据来自 Supabase <code>ota_releases</code> 表。
  </p>

  <div class="publish-grid">
    <article v-for="channel in CHANNELS" :key="channel" class="card channel-card">
      <header class="card-header">
        <div>
          <p class="card-kicker">channel</p>
          <h3 class="card-title">{{ channel }}</h3>
        </div>
        <StatusPill :status="channelState(channel).pill" :label="channelState(channel).label" />
      </header>

      <Skeleton v-if="channelLoading(channel)" variant="meta" count="5" />
      <div v-else class="meta">
        <dt>当前版本</dt>
        <dd>{{ channels[channel]?.data?.version || '--' }}</dd>
        <dt>发布说明</dt>
        <dd class="notes">{{ channels[channel]?.data?.notes || '--' }}</dd>
        <dt>最低原生版本</dt>
        <dd>{{ channels[channel]?.data?.minNativeVersion || '--' }}</dd>
        <dt>更新时间</dt>
        <dd>{{ formatTime(channels[channel]?.data?.publishedAt) }}</dd>
        <dt>SHA-256</dt>
        <dd class="hash">{{ channels[channel]?.data?.hash || '--' }}</dd>
      </div>

      <p v-if="channels[channel]?.error" class="tip tip--warn">{{ channels[channel].error }}</p>

      <div class="history-list">
        <Skeleton v-if="channelLoading(channel)" variant="list" count="2" />
        <div v-else-if="channels[channel]?.versions?.length === 0" class="history-item">
          {{ channels[channel]?.error ? '暂无可用历史' : '暂无历史（发布后自动生成）' }}
        </div>
        <div v-for="item in channels[channel]?.versions || []" :key="item.version" class="history-item">
          <div class="history-main">
            <span class="history-version">{{ item.version }}</span>
            <span class="history-time">{{ formatTime(item.publishedAt) }}</span>
          </div>
          <button
            class="btn btn--sm"
            type="button"
            :disabled="rollbackingChannel === channel || !item.version"
            @click="triggerRollback(channel, item.version)"
          >
            回档到此版本
          </button>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn--sm" type="button" @click="openTableRow(channel)">打开记录</button>
        <button class="btn btn--sm" type="button" :disabled="!channels[channel]?.bundleUrl" @click="openBundle(channels[channel]?.bundleUrl)">
          打开 Bundle
        </button>
        <button class="btn btn--sm btn--soft" type="button" :disabled="channels[channel]?.loading" @click="loadChannel(channel)">
          刷新
        </button>
      </div>
    </article>
  </div>

  <div class="actions">
    <button class="btn btn--primary" type="button" @click="loadAll">刷新全部通道</button>
  </div>
</template>

<style scoped>
.channel-card {
  gap: 12px;
}

.notes {
  white-space: pre-wrap;
}

.hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  word-break: break-all;
}

.history-list {
  display: grid;
  gap: 6px;
}
</style>