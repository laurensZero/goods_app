<script setup>
import { computed } from 'vue'
import { useAdminAuth } from '../composables/useAdminAuth'
import { getGithubToken, getSupabaseConfig } from '../services/supabase'
import StatusPill from '../components/ui/StatusPill.vue'

const { admin, logout } = useAdminAuth()

const githubSet = computed(() => !!getGithubToken())
const serviceKeySet = computed(() => !!getSupabaseConfig().serviceKey)
// 会话里缓存的凭据形态：legacy JWT（eyJ 开头，过渡期）或新版 admin-api 共享口令
const legacyServiceKey = computed(() => {
  const key = getSupabaseConfig().serviceKey
  return !!key && key.startsWith('eyJ')
})
</script>

<template>
  <p class="status-text">
    凭据由 admin-login Edge Function 校验 Goods APP 账号并检查
    <code>feature_whitelist</code> 的 <code>admin</code> 授权后下发，仅保存在本机浏览器 localStorage。
  </p>

  <div class="card card--inner">
    <div class="card-header">
      <div>
        <p class="card-kicker">account</p>
        <h3 class="card-title">当前管理员</h3>
      </div>
      <span class="state state--ok">已登录</span>
    </div>

    <dl class="meta">
      <dt>账号</dt>
      <dd>{{ admin?.username || '--' }}</dd>
      <dt>角色</dt>
      <dd>{{ admin?.role || 'admin' }}</dd>
    </dl>

    <hr class="sep">

    <div class="card-header">
      <div>
        <p class="card-kicker">tokens</p>
        <h3 class="card-title">已下发凭据</h3>
      </div>
    </div>

    <div class="list">
      <div class="cred-card">
        <div class="cred-head">
          <span class="cred-name">GitHub Token</span>
          <StatusPill :status="githubSet ? 'ok' : 'warn'" :label="githubSet ? '已下发' : '未配置'" />
        </div>
        <p class="cred-desc">用于触发 GitHub Actions 发布 / 回档工作流</p>
      </div>
      <div class="cred-card">
        <div class="cred-head">
          <span class="cred-name">Supabase 管理口令</span>
          <StatusPill
            :status="serviceKeySet ? (legacyServiceKey ? 'warn' : 'ok') : 'warn'"
            :label="serviceKeySet ? (legacyServiceKey ? '过渡期 legacy JWT' : '已下发') : '未配置'"
          />
        </div>
        <p class="cred-desc">
          {{ legacyServiceKey
            ? '旧版凭据（过渡期兼容，仍可用）。重新登录后换发为 admin-api 共享口令。'
            : '经 admin-api Edge Function 代理读写 Supabase 数据面（REST / GoTrue / Storage），本口令不直接访问数据面。' }}
        </p>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn--danger" type="button" @click="logout">退出登录</button>
    </div>
  </div>
</template>

<style scoped>
.card--inner {
  gap: 12px;
}

.list {
  display: grid;
  gap: 10px;
}

.cred-card {
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-xs);
  background: var(--app-surface-soft);
  display: grid;
  gap: 6px;
}

.cred-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.cred-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.cred-desc {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-tertiary);
}
</style>
