<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { DECOR_GAMES, DECOR_SOURCES, decorKindOf } from '../../services/decorAdmin'

const props = defineProps({
  kind: { type: String, default: 'pendant' },
  editing: { type: Object, default: null }
})
const emit = defineEmits(['submit', 'close'])

const def = computed(() => decorKindOf(props.kind))
const isEdit = computed(() => !!props.editing)

const form = reactive({
  id: '',
  name: '',
  game: '其他',
  source: 'miyoushe',
  description: '',
  url: '',
  bg_color: '',
  gif_url: '',
  pag_url: '',
  mirror_url: '',
  thumb_url: '',
  animated: false,
  sort: 0,
  enabled: true
})

const submitting = ref(false)

function fill(row) {
  form.id = row?.id || ''
  form.name = row?.name || ''
  form.game = row?.game || '其他'
  form.source = row?.source || 'miyoushe'
  form.description = row?.description || ''
  form.url = row?.url || ''
  form.bg_color = row?.bg_color || ''
  form.gif_url = row?.gif_url || ''
  form.pag_url = row?.pag_url || ''
  form.mirror_url = row?.mirror_url || ''
  form.thumb_url = row?.thumb_url || ''
  form.animated = !!row?.animated
  form.sort = Number(row?.sort) || 0
  form.enabled = row?.enabled !== false
}

watch(() => props.editing, (row) => fill(row), { immediate: true })

const idHint = computed(() => {
  if (isEdit.value) return ''
  const prefix = def.value.idPrefix
  return props.kind === 'bubble' ? `建议 msb:<assets_id> 或 msb:manual-< slug >（前缀 ${prefix}）` : `建议 ms:<assets_id> / hy:<id>（前缀 ${prefix}）`
})

const idValid = computed(() => /^(ms|hy|msb):[\w-]+$/.test(form.id.trim()))

const previewSrc = computed(() => form.thumb_url || form.mirror_url || form.url || '')

function onSubmit() {
  if (submitting.value) return
  if (!isEdit.value && !idValid.value) return
  const payload = {
    id: form.id.trim(),
    name: form.name.trim(),
    game: form.game,
    source: form.source,
    description: form.description.trim(),
    url: form.url.trim(),
    animated: !!form.animated,
    sort: Number(form.sort) || 0,
    enabled: !!form.enabled
  }
  if (props.kind === 'bubble') {
    payload.bg_color = form.bg_color.trim()
    payload.gif_url = form.gif_url.trim()
    payload.pag_url = form.pag_url.trim()
  }
  payload.mirror_url = form.mirror_url.trim()
  payload.thumb_url = form.thumb_url.trim()
  emit('submit', payload)
  submitting.value = true
}
</script>

<template>
  <form class="decor-form" @submit.prevent="onSubmit">
    <div v-if="previewSrc" class="decor-form__preview">
      <img :src="previewSrc" alt="" @error="$event.target.style.opacity = 0" />
    </div>

    <label class="field">
      <span class="field-label">ID{{ isEdit ? '（不可改）' : '' }}</span>
      <input v-model="form.id" type="text" :disabled="isEdit" :placeholder="idHint" />
      <span v-if="!isEdit && form.id && !idValid" class="field-error">格式须为 ms:xxx / hy:xxx / msb:xxx</span>
    </label>

    <label class="field">
      <span class="field-label">名称</span>
      <input v-model="form.name" type="text" placeholder="展示名" />
    </label>

    <div class="field-row">
      <label class="field">
        <span class="field-label">IP 归属</span>
        <select v-model="form.game">
          <option v-for="game in DECOR_GAMES" :key="game" :value="game">{{ game }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">来源</span>
        <select v-model="form.source" :disabled="isEdit">
          <option v-for="src in DECOR_SOURCES" :key="src" :value="src">{{ src }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">排序</span>
        <input v-model.number="form.sort" type="number" step="1" />
      </label>
    </div>

    <label class="field">
      <span class="field-label">描述</span>
      <input v-model="form.description" type="text" />
    </label>

    <label class="field">
      <span class="field-label">图片地址（米哈游 CDN 原图）</span>
      <input v-model="form.url" type="text" placeholder="https://…webp/png" />
    </label>

    <template v-if="kind === 'bubble'">
      <div class="field-row">
        <label class="field">
          <span class="field-label">底色 bg_color（无 #）</span>
          <input v-model="form.bg_color" type="text" placeholder="e6e1f5" />
        </label>
        <label class="field">
          <span class="field-label">动图地址 gif_url</span>
          <input v-model="form.gif_url" type="text" placeholder="https://…gif/webp" />
        </label>
      </div>
      <label class="field">
        <span class="field-label">PAG 地址 pag_url（仅存档，Web 不播放）</span>
        <input v-model="form.pag_url" type="text" />
      </label>
    </template>

    <label class="field">
      <span class="field-label">镜像图 mirror_url（Storage 整图）</span>
      <input v-model="form.mirror_url" type="text" />
    </label>
    <label class="field">
      <span class="field-label">缩略图 thumb_url（128px webp）</span>
      <input v-model="form.thumb_url" type="text" />
    </label>

    <div class="field-row field-row--checks">
      <label class="check">
        <input v-model="form.animated" type="checkbox" />
        <span>动图条目</span>
      </label>
      <label class="check">
        <input v-model="form.enabled" type="checkbox" />
        <span>启用（客户端可见）</span>
      </label>
    </div>

    <p class="decor-form__hint">
      改完保存即生效；客户端目录有 6 小时缓存，App 侧在选择器里手动刷新可立即拿到。
    </p>

    <div class="decor-form__actions">
      <button class="btn btn--primary" type="submit" :disabled="submitting || (!isEdit && !idValid) || !form.name.trim() || !form.url.trim()">
        {{ submitting ? '保存中…' : '保存' }}
      </button>
      <button class="btn" type="button" @click="emit('close')">取消</button>
    </div>
  </form>
</template>

<style scoped>
.decor-form {
  display: grid;
  gap: 12px;
}

.decor-form__preview {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-radius: 8px;
  background: var(--admin-surface-soft, rgba(127, 127, 127, 0.12));
}

.decor-form__preview img {
  max-width: 100%;
  max-height: 96px;
  object-fit: contain;
}

.field {
  display: grid;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  opacity: 0.72;
}

.field input[type='text'],
.field input[type='number'],
.field select {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--admin-border, rgba(127, 127, 127, 0.3));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 12px;
}

.field input:disabled {
  opacity: 0.55;
}

.field-error {
  color: #e5615e;
  font-size: 11px;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.field-row--checks {
  align-items: center;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.decor-form__hint {
  margin: 0;
  font-size: 11px;
  opacity: 0.6;
}

.decor-form__actions {
  display: flex;
  gap: 8px;
}
</style>
