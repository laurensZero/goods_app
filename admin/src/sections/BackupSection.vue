<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useConfirm } from '../composables/useConfirm'
import StatusPill from '../components/ui/StatusPill.vue'
import Skeleton from '../components/ui/Skeleton.vue'
import {
  backupHealth,
  listArchives,
  listLogs,
  triggerBackup,
  imageExport,
  restoreBackup,
  getDownloadUrl
} from '../services/backup'
import { logAudit } from '../services/audit'

const { confirm } = useConfirm()

const health = ref(null)
const archives = ref([])
const logs = ref([])

const busy = ref('')
const status = ref({ text: '等待操作', type: 'default' })

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

const KIND_LABEL = {
  all: '全部',
  db: '数据库',
  images: '图库',
  image_export: '图库打包',
  restore: '回档'
}

function kindLabel(kind) {
  return KIND_LABEL[kind] || kind || '--'
}

function statusLabel(st) {
  return { running: '进行中', success: '成功', failed: '失败' }[st] || st
}

function statusType(st) {
  return { running: 'warn', success: 'ok', failed: 'error' }[st] || 'default'
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '--'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

function formatTime(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isImageArchive(name) {
  return String(name || '').startsWith('images-')
}

async function load() {
  busy.value = 'load'
  try {
    const [h, a, l] = await Promise.all([backupHealth(), listArchives(), listLogs(100)])
    health.value = h
    archives.value = Array.isArray(a?.files) ? a.files : []
    logs.value = Array.isArray(l?.logs) ? l.logs : []
    setStatus('已刷新。', 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    busy.value = ''
  }
}

async function doBackup(kind) {
  const label = kindLabel(kind)
  const ok = await confirm({
    title: `立即备份（${label}）`,
    message: `确认触发一次「${label}」备份？VPS 将异步执行，完成后写入备份日志。`,
    confirmText: '开始备份'
  })
  if (!ok) return
  busy.value = `backup-${kind}`
  setStatus(`正在触发${label}备份…`)
  try {
    await triggerBackup(kind)
    setStatus(`已触发${label}备份。任务在 VPS 后台执行，稍后刷新查看进度。`, 'ok')
  } catch (e) {
    setStatus(e?.message || '触发失败。', 'error')
  } finally {
    busy.value = ''
  }
}

async function doImageExport() {
  busy.value = 'export-images'
  setStatus('正在触发图库打包…')
  try {
    await imageExport()
    setStatus('已开始打包图库。完成后「images-*.tar.gz」会出现在归档列表，可点击下载。', 'ok')
  } catch (e) {
    setStatus(e?.message || '图库打包触发失败。', 'error')
  } finally {
    busy.value = ''
  }
}

async function downloadArchive(name) {
  try {
    const url = await getDownloadUrl(name)
    if (!url) throw new Error('未生成下载链接。')
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    setStatus(e?.message || '获取下载链接失败。', 'error')
  }
}

// ── 回档确认弹窗（自实现，含二级密码）──
const restoreDialog = reactive({
  visible: false,
  archive: '',
  includeImages: false,
  scope: '',
  password: ''
})
const restoreError = ref('')

function openRestore(archive, includeImages) {
  restoreDialog.archive = archive
  restoreDialog.includeImages = includeImages
  restoreDialog.scope = includeImages ? '数据 + 图库' : '仅数据'
  restoreDialog.password = ''
  restoreError.value = ''
  restoreDialog.visible = true
}

function closeRestore() {
  if (busy.value === 'restore') return
  restoreDialog.visible = false
}

async function confirmRestore() {
  if (!restoreDialog.password) {
    restoreError.value = '请输入二级密码。'
    return
  }
  busy.value = 'restore'
  setStatus('正在触发回档…')
  try {
    await restoreBackup(restoreDialog.archive, restoreDialog.includeImages, restoreDialog.password)
    logAudit('backup.restore', restoreDialog.archive, { includeImages: restoreDialog.includeImages })
    restoreDialog.visible = false
    setStatus('已触发回档。VPS 将先自动备份当前数据库存档（安全快照），再执行回档，完成后写入备份日志。', 'ok')
  } catch (e) {
    restoreError.value = e?.message || '回档触发失败。'
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<template>
  <p class="status-text">
    备份在 VPS 上执行（表数据归档 + 图库增量下载），管理台可一键触发、查看/下载归档并回档。
    <code>/backup-webhook</code> 为 VPS 上的 webhook 入口。
  </p>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">Backup</p>
        <h3 class="card-title">立即备份</h3>
      </div>
      <StatusPill
        v-if="health"
        :status="health.configured ? 'ok' : 'error'"
        :label="health.configured ? '已连接 VPS' : 'VPS 未配置'"
      />
      <span v-else class="state">--</span>
    </div>

    <div class="actions">
      <button
        class="btn btn--primary"
        type="button"
        :disabled="busy === 'backup-all'"
        @click="doBackup('all')"
      >
        {{ busy === 'backup-all' ? '触发中…' : '备份全部' }}
      </button>
      <button class="btn btn--soft" type="button" :disabled="busy === 'backup-db'" @click="doBackup('db')">
        {{ busy === 'backup-db' ? '触发中…' : '仅数据库' }}
      </button>
      <button class="btn btn--soft" type="button" :disabled="busy === 'backup-images'" @click="doBackup('images')">
        {{ busy === 'backup-images' ? '触发中…' : '仅图库' }}
      </button>
      <button class="btn btn--soft" type="button" :disabled="busy === 'export-images'" @click="doImageExport">
        {{ busy === 'export-images' ? '打包中…' : '打包下载图库' }}
      </button>
      <button class="btn btn--sm" type="button" :disabled="busy === 'load'" @click="load">
        {{ busy === 'load' ? '刷新中…' : '刷新' }}
      </button>
    </div>
  </div>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">Archives</p>
        <h3 class="card-title">备份归档</h3>
      </div>
      <span class="state">{{ archives.length }} 个</span>
    </div>

    <Skeleton v-if="busy === 'load' && !archives.length" variant="list" count="4" />
    <template v-else-if="archives.length">
      <div v-for="a in archives" :key="a.name" class="list-item">
        <div class="list-item-main">
          <span class="list-item-title">
            {{ a.name }}
            <span v-if="isImageArchive(a.name)" class="badge badge--info">图库</span>
          </span>
          <span class="list-item-meta">{{ formatBytes(a.size) }} · {{ formatTime(a.mtime * 1000) }}</span>
        </div>
        <div class="list-actions">
          <button class="btn btn--sm" type="button" @click="downloadArchive(a.name)">下载</button>
          <template v-if="!isImageArchive(a.name)">
            <button class="btn btn--sm" type="button" @click="openRestore(a.name, false)">回档(数据)</button>
            <button class="btn btn--sm btn--danger" type="button" @click="openRestore(a.name, true)">回档(含图库)</button>
          </template>
        </div>
      </div>
    </template>
    <p v-else class="status-text">暂无归档。</p>
  </div>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">Logs</p>
        <h3 class="card-title">备份历史</h3>
      </div>
      <span class="state">{{ logs.length }} 条</span>
    </div>

    <Skeleton v-if="busy === 'load' && !logs.length" variant="list" count="5" />
    <template v-else-if="logs.length">
      <div v-for="l in logs" :key="l.id" class="list-item">
        <div class="list-item-main">
          <span class="list-item-title">
            {{ l.id }}
            <span class="badge">{{ kindLabel(l.kind) }}</span>
          </span>
          <span class="list-item-meta">
            {{ formatTime(l.started_at) }} → {{ formatTime(l.finished_at) }}
            <template v-if="l.archive"> · {{ l.archive }}</template>
            <template v-if="l.db_rows != null"> · {{ l.db_rows }} 行</template>
            <template v-if="l.archive_size"> · {{ formatBytes(l.archive_size) }}</template>
            <template v-if="l.image_new != null"> · 图 {{ l.image_new }}/{{ l.image_skipped }}</template>
          </span>
          <span v-if="l.error" class="status-text status-text--error">{{ l.error }}</span>
        </div>
        <StatusPill :status="statusType(l.status)" :label="statusLabel(l.status)" />
      </div>
    </template>
    <p v-else class="status-text">暂无备份记录。</p>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <!-- 回档确认弹窗（含二级密码） -->
  <Transition name="overlay-fade">
    <div v-if="restoreDialog.visible" class="restore-overlay" @click.self="closeRestore">
      <div class="restore-dialog" role="dialog" aria-modal="true">
        <p class="card-kicker">Restore</p>
        <h3 class="dialog-title">回档：{{ restoreDialog.archive }}</h3>
        <p class="dialog-desc">
          将用该归档覆盖 Supabase 上的<strong>{{ restoreDialog.scope }}</strong>。此操作不可撤销，
          触发回档前会自动先备份一份当前数据库存档（安全快照）。
          <template v-if="restoreDialog.includeImages">图库将以 VPS 本地镜像重传覆盖，耗时较长。</template>
        </p>

        <div class="field">
          <label class="field-label" for="restore-password">二级密码</label>
          <input
            id="restore-password"
            v-model="restoreDialog.password"
            class="input"
            type="password"
            autocomplete="off"
            placeholder="输入回档二级密码"
            @keyup.enter="confirmRestore"
          />
        </div>

        <p v-if="restoreError" class="dialog-error">{{ restoreError }}</p>

        <div class="dialog-actions">
          <button class="btn btn--soft" type="button" :disabled="busy === 'restore'" @click="closeRestore">
            取消
          </button>
          <button class="btn btn--primary btn--danger-solid" type="button" :disabled="busy === 'restore'" @click="confirmRestore">
            {{ busy === 'restore' ? '触发中…' : '确认回档' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.card--inner {
  gap: 12px;
}

/* ── 回档确认弹窗 ── */
.restore-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-overlay);
  backdrop-filter: blur(var(--app-overlay-blur));
  -webkit-backdrop-filter: blur(var(--app-overlay-blur));
}

.restore-dialog {
  width: min(100%, 460px);
  padding: 22px;
  border-radius: var(--radius-large);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  display: grid;
  gap: 12px;
}

.dialog-title {
  margin: 4px 0 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--app-text);
  word-break: break-all;
}

.dialog-desc {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary);
  line-height: 1.7;
}

.dialog-desc strong {
  color: var(--status-error);
}

.dialog-error {
  margin: 0;
  font-size: 13px;
  color: var(--status-error);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.btn--danger-solid {
  background: var(--status-error);
  color: #fff;
  border-color: transparent;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
