<script setup>
import { computed } from 'vue'
import { useAdminAuth } from '../composables/useAdminAuth'
import { getGithubToken, getSupabaseConfig } from '../services/supabase'

const { admin, logout } = useAdminAuth()

const githubSet = computed(() => !!getGithubToken())
const serviceKeySet = computed(() => !!getSupabaseConfig().serviceKey)
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
      <div class="list-item">
        <span class="cred-name">GitHub Token</span>
        <span class="state" :class="githubSet ? 'state--ok' : 'state--warn'">
          {{ githubSet ? '已下发' : '未配置' }}
        </span>
      </div>
      <div class="list-item">
        <span class="cred-name">Supabase Service Role Key</span>
        <span class="state" :class="serviceKeySet ? 'state--ok' : 'state--warn'">
          {{ serviceKeySet ? '已下发' : '未配置' }}
        </span>
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

.cred-name {
  font-size: 13px;
  color: var(--app-text-secondary);
}
</style>
