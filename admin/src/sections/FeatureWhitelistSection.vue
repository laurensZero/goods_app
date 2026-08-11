<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabaseRequest } from '../services/supabase'
import { fetchUsersList } from '../services/versionRules'
import UserPicker from '../components/admin/UserPicker.vue'
import AppSelect from '../components/admin/AppSelect.vue'

const FEATURE_OPTIONS = [
  { value: 'checkout', label: 'checkout（自助下单）', hint: '我的页「自助下单」入口与路由守卫' },
  { value: 'remove_bg', label: 'remove_bg（云端抠图）', hint: '图片抠图调用 remove-bg Edge Function' },
  { value: 'admin', label: 'admin（管理台登录）', hint: 'admin-login Edge Function 校验的管理员白名单' }
]

const featureOptions = ref([])
const activeFeature = ref('checkout')
const whitelistMap = ref({})
const loading = ref(false)
const status = ref({ text: '', type: 'default' })

const pendingIds = ref([])
const note = ref('')
const saving = ref(false)

let usersMap = {}

const currentFeature = computed(() =>
  featureOptions.value.find((f) => f.value === activeFeature.value)
    || { value: activeFeature.value, label: activeFeature.value, hint: '' }
)
const activeEntries = computed(() => whitelistMap.value[activeFeature.value] || [])

function setStatus(text, type = 'default') {
  status.value = { text, type }
}

function displayFor(id) {
  return usersMap[id] || String(id).slice(0, 12)
}

async function ensureUsers() {
  try {
    const list = await fetchUsersList()
    usersMap = {}
    list.forEach((u) => { usersMap[u.id] = u.display })
  } catch {
    /* UserPicker 内部会提示 */
  }
}

async function loadWhitelist() {
  loading.value = true
  setStatus('正在加载白名单…')
  try {
    const rows = await supabaseRequest('/rest/v1/feature_whitelist', {
      params: { select: 'user_id,feature,note,created_at', order: 'feature' }
    })
    const list = Array.isArray(rows) ? rows : []
    const map = {}
    list.forEach((r) => {
      const key = String(r.feature || '').trim()
      if (!key) return
      if (!map[key]) map[key] = []
      map[key].push({
        user_id: String(r.user_id),
        note: String(r.note || '').trim(),
        created_at: r.created_at
      })
    })
    whitelistMap.value = map

    const known = FEATURE_OPTIONS.map((f) => f.value)
    const all = Array.from(new Set([...known, ...Object.keys(map)]))
    featureOptions.value = all.map((v) =>
      FEATURE_OPTIONS.find((o) => o.value === v) || { value: v, label: String(v), hint: '' }
    )
    if (!featureOptions.value.some((f) => f.value === activeFeature.value) && featureOptions.value.length) {
      activeFeature.value = featureOptions.value[0].value
    }
    setStatus(`共 ${list.length} 条授权记录。`, 'ok')
  } catch (e) {
    whitelistMap.value = {}
    setStatus(e?.message || '加载失败。', 'error')
  } finally {
    loading.value = false
  }
}

async function addUsers() {
  const feature = activeFeature.value
  const granted = new Set(activeEntries.value.map((e) => e.user_id))
  const ids = pendingIds.value.filter((id) => !granted.has(String(id)))
  if (!ids.length) {
    setStatus('请先选择要授权的用户。', 'error')
    return
  }
  saving.value = true
  setStatus('正在写入白名单…')
  try {
    const noteText = String(note.value || '').trim()
    for (const id of ids) {
      await supabaseRequest('/rest/v1/feature_whitelist', {
        method: 'POST',
        body: { user_id: id, feature, note: noteText || null }
      })
    }
    pendingIds.value = []
    note.value = ''
    setStatus(`已为 ${ids.length} 个用户授权 ${feature}。`, 'ok')
    await loadWhitelist()
  } catch (e) {
    setStatus(e?.message || '写入失败。', 'error')
  } finally {
    saving.value = false
  }
}

async function removeUser(userId) {
  const feature = activeFeature.value
  if (!confirm(`确认移除 ${displayFor(userId)} 的 ${feature} 权限？`)) return
  try {
    await supabaseRequest('/rest/v1/feature_whitelist', {
      method: 'DELETE',
      params: { feature: `eq.${feature}`, user_id: `eq.${userId}` }
    })
    await loadWhitelist()
  } catch (e) {
    setStatus(e?.message || '移除失败。', 'error')
  }
}

onMounted(() => {
  ensureUsers()
  loadWhitelist()
})
</script>

<template>
  <p class="status-text">
    管理 <code>feature_whitelist</code> 表：按功能（feature）为指定用户（user_id）授权。
    客户端经 Edge Function 校验，未登记的用户无法使用对应功能；
    <code>admin</code> 授权用于管理台登录（admin-login Edge Function 校验）。
  </p>

  <div class="actions">
    <button class="btn" type="button" :disabled="loading" @click="loadWhitelist">
      {{ loading ? '加载中…' : '刷新' }}
    </button>
  </div>

  <p class="status-text" :class="status.type === 'ok' ? 'status-text--ok' : status.type === 'error' ? 'status-text--error' : ''">
    {{ status.text }}
  </p>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">feature</p>
        <h3 class="card-title">功能</h3>
      </div>
    </div>
    <div class="field">
      <AppSelect v-model="activeFeature" :options="featureOptions" @change="pendingIds = []" />
      <p class="tip">{{ currentFeature.hint }}</p>
    </div>
  </div>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">whitelisted</p>
        <h3 class="card-title">已授权用户</h3>
      </div>
      <span class="state">{{ activeEntries.length }} 人</span>
    </div>

    <div v-if="activeEntries.length" class="list">
      <div v-for="e in activeEntries" :key="e.user_id" class="list-item">
        <div class="list-item-main">
          <span class="list-item-title">{{ displayFor(e.user_id) }}</span>
          <span class="list-item-meta">
            {{ e.user_id }}<template v-if="e.note"> · {{ e.note }}</template>
          </span>
        </div>
        <div class="list-actions">
          <button class="btn btn--sm btn--danger" type="button" @click="removeUser(e.user_id)">移除</button>
        </div>
      </div>
    </div>
    <p v-else class="tip">暂无授权用户（此功能对所有人关闭）</p>
  </div>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">grant</p>
        <h3 class="card-title">添加授权</h3>
      </div>
    </div>
    <UserPicker v-model="pendingIds" />
    <div class="field">
      <label class="field-label">备注（可选，写入 note 列）</label>
      <input v-model="note" class="input" type="text" placeholder="如：内测用户">
    </div>
    <div class="actions">
      <button class="btn btn--primary" type="button" :disabled="saving" @click="addUsers">
        {{ saving ? '写入中…' : `为 ${currentFeature.value} 授权` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.card--inner {
  gap: 12px;
}

.list {
  display: grid;
  gap: 8px;
}
</style>
