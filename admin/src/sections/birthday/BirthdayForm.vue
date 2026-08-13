<script setup>
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  editing: { type: Object, default: null }
})

const emit = defineEmits(['submit', 'close'])

const form = reactive({
  name: '',
  ip: '',
  ipAliases: '',
  aliases: '',
  birthMonth: 1,
  birthDay: 1,
  color: '',
  message: '',
  enabled: true
})

const saving = ref(false)
const error = ref('')

function splitList(text) {
  return String(text || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function resetForm() {
  Object.assign(form, {
    name: '',
    ip: '',
    ipAliases: '',
    aliases: '',
    birthMonth: 1,
    birthDay: 1,
    color: '',
    message: '',
    enabled: true
  })
}

watch(
  () => props.editing,
  (item) => {
    error.value = ''
    if (!item) {
      resetForm()
      return
    }
    Object.assign(form, {
      name: item.name || '',
      ip: item.ip || '',
      ipAliases: Array.isArray(item.ip_aliases) ? item.ip_aliases.join(', ') : '',
      aliases: Array.isArray(item.aliases) ? item.aliases.join(', ') : '',
      birthMonth: item.birth_month ?? 1,
      birthDay: item.birth_day ?? 1,
      color: item.color || '',
      message: item.message || '',
      enabled: item.enabled !== false
    })
  },
  { immediate: true }
)

function buildRow() {
  const name = String(form.name || '').trim()
  if (!name) throw new Error('角色名不能为空。')
  const month = Number(form.birthMonth)
  const day = Number(form.birthDay)
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('出生月份需在 1–12 之间。')
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('出生日期需在 1–31 之间。')
  const color = String(form.color || '').trim()
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('颜色需为 #RRGGBB 格式（留空亦可）。')

  return {
    ip: String(form.ip || '').trim(),
    ip_aliases: splitList(form.ipAliases),
    name,
    aliases: splitList(form.aliases),
    birth_month: month,
    birth_day: day,
    color,
    message: String(form.message || '').trim(),
    enabled: form.enabled
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
</script>

<template>
  <div class="bd-form">
    <div class="group-grid">
      <div class="field">
        <label class="field-label">角色名 *</label>
        <input v-model="form.name" class="input" type="text" placeholder="如 胡桃">
      </div>
      <div class="field">
        <label class="field-label">所属 IP</label>
        <input v-model="form.ip" class="input" type="text" placeholder="如 原神">
      </div>
      <div class="field">
        <label class="field-label">出生月份</label>
        <input v-model.number="form.birthMonth" class="input" type="number" min="1" max="12">
      </div>
      <div class="field">
        <label class="field-label">出生日期</label>
        <input v-model.number="form.birthDay" class="input" type="number" min="1" max="31">
      </div>
      <div class="field">
        <label class="field-label">强调色</label>
        <div class="color-row">
          <input v-model="form.color" class="input" type="text" placeholder="#RRGGBB">
          <input v-model="form.color" class="color-picker" type="color" aria-label="选择颜色">
        </div>
      </div>
      <div class="field">
        <label class="field-label">IP 别名（逗号分隔）</label>
        <input v-model="form.ipAliases" class="input" type="text" placeholder="Genshin Impact, Genshin">
      </div>
      <div class="field field--full">
        <label class="field-label">角色别名（逗号分隔）</label>
        <input v-model="form.aliases" class="input" type="text" placeholder="Hu Tao, 후타오">
      </div>
      <div class="field field--full">
        <label class="field-label">祝福文案（留空用默认）</label>
        <textarea v-model="form.message" class="textarea" placeholder="生日祝福文案" />
      </div>
      <div class="field field--full">
        <label class="checkbox-row">
          <input v-model="form.enabled" type="checkbox">
          启用（关闭后客户端不再匹配该角色）
        </label>
      </div>
    </div>

    <p v-if="error" class="status-text status-text--error">{{ error }}</p>

    <div class="form-actions">
      <button class="btn btn--primary" type="button" :disabled="saving" @click="submit">
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <button class="btn" type="button" @click="emit('close')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.bd-form {
  display: grid;
  gap: 16px;
}

.group-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface);
  cursor: pointer;
  flex-shrink: 0;
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
}
</style>
