<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { loadMaintenanceMode, saveMaintenanceMode, clearMaintenanceMode } from '../services/maintenance'
import { MAINTENANCE_BLOCKS } from '../constants'
import { useConfirm } from '../composables/useConfirm'
import Skeleton from '../components/ui/Skeleton.vue'

const { confirm } = useConfirm()

const BLOCKS = MAINTENANCE_BLOCKS

const form = reactive({
  enabled: false,
  message: '',
  blocks: {}
})

const status = ref({ text: '等待操作', type: 'default' })
const busy = ref('')
const loaded = ref(false)

const hasBlock = computed(() => BLOCKS.some(b => form.blocks[b.key]))

function setFormData(data) {
  const d = data && typeof data === 'object' ? data : null
  form.enabled = !!d?.enabled
  form.message = d?.message || ''
  BLOCKS.forEach(b => { form.blocks[b.key] = !!d?.blocks?.includes(b.key) })
}

function collectBlocks() {
  return BLOCKS.filter(b => form.blocks[b.key]).map(b => b.key)
}

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

async function load() {
  busy.value = 'load'
  setStatus('正在加载维护模式配置…')
  try {
    const data = await loadMaintenanceMode()
    setFormData(data)
    loaded.value = true
    setStatus(data ? '已加载维护模式配置。' : '维护模式未配置。', 'ok')
  } catch (e) {
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    busy.value = ''
  }
}

async function save() {
  const payload = {
    enabled: form.enabled,
    message: String(form.message || '').trim(),
    blocks: collectBlocks()
  }
  if (payload.enabled && payload.blocks.length === 0) {
    setStatus('启用维护模式时需要至少选择一个阻止的功能。', 'error')
    return
  }
  busy.value = 'save'
  setStatus('正在保存维护模式配置…')
  try {
    await saveMaintenanceMode(payload)
    setStatus('维护模式配置已保存！（已应用到所有用户）', 'ok')
  } catch (e) {
    setStatus(e?.message || '保存失败。', 'error')
  } finally {
    busy.value = ''
  }
}

async function clear() {
  const ok = await confirm({
    title: '清除维护模式',
    message: '确认清除维护模式配置？所有功能将恢复正常。',
    confirmText: '确认清除',
    danger: true
  })
  if (!ok) return
  busy.value = 'clear'
  setStatus('正在清除维护模式配置…')
  try {
    await clearMaintenanceMode()
    setFormData(null)
    setStatus('维护模式配置已清除。', 'ok')
  } catch (e) {
    setStatus(e?.message || '清除失败。', 'error')
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<template>
  <p class="status-text">
    维护模式用于停更 / 数据异常期间临时关闭同步功能。状态会写入云端 sync_manifest，对所有客户端生效。
  </p>

  <Skeleton v-if="busy === 'load' && !loaded" variant="form" count="3" />
  <template v-else>
    <label class="checkbox-row">
      <input v-model="form.enabled" type="checkbox">
      <strong>启用维护模式</strong>
    </label>

    <div class="field">
      <label class="field-label" for="maintenance-message">维护提示消息（可选，客户端展示）</label>
      <input id="maintenance-message" v-model="form.message" class="input" type="text" placeholder="例如：系统维护中，同步功能暂时不可用">
    </div>

    <div class="block-grid">
      <label v-for="block in BLOCKS" :key="block.key" class="checkbox-row block-checkbox">
        <input v-model="form.blocks[block.key]" type="checkbox">
        {{ block.label }}
      </label>
    </div>
  </template>

  <div class="actions">
    <button class="btn btn--primary" type="button" :disabled="busy === 'save'" @click="save">
      {{ busy === 'save' ? '保存中…' : '保存维护状态' }}
    </button>
    <button class="btn" type="button" :disabled="busy === 'load'" @click="load">
      {{ busy === 'load' ? '加载中…' : '重新加载' }}
    </button>
    <button class="btn btn--danger" type="button" :disabled="busy === 'clear' || !hasBlock && !form.enabled" @click="clear">
      清除维护模式
    </button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>
</template>

<style scoped>
.block-grid {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  border: 1px solid var(--app-border);
}

.block-checkbox {
  min-height: 28px;
}
</style>