<script setup>
import { reactive, ref } from 'vue'
import {
  getGithubToken,
  setGithubToken,
  clearGithubToken,
  getSupabaseConfig,
  saveSupabaseConfigToStorage,
  clearSupabaseConfig,
  testSupabaseConnection
} from '../services/supabase'

const config = getSupabaseConfig()
const savedToken = getGithubToken()

const auth = reactive({
  githubToken: '',
  supabaseUrl: config.url,
  supabaseKey: config.key,
  serviceKey: config.serviceKey,
  isGithubSet: !!savedToken,
  isSupabaseSet: !!config.url
})

const testing = ref(false)
const message = ref(null)

function notify(msg, type = 'info') {
  message.value = { text: msg, type }
}

function saveGithub() {
  try {
    if (!auth.githubToken.trim()) {
      notify('请输入 GitHub Token 后再保存。', 'error')
      return
    }
    setGithubToken(auth.githubToken)
    auth.isGithubSet = true
    auth.githubToken = ''
    notify('GitHub Token 已保存。', 'ok')
  } catch (e) {
    notify(e?.message || '保存失败。', 'error')
  }
}

function clearGithub() {
  clearGithubToken()
  auth.isGithubSet = false
  notify('已清除 GitHub Token。', 'ok')
}

function saveSupabase() {
  try {
    saveSupabaseConfigToStorage({
      url: auth.supabaseUrl,
      key: auth.supabaseKey,
      serviceKey: auth.serviceKey
    })
    auth.isSupabaseSet = true
    notify('Supabase 配置已保存。', 'ok')
  } catch (e) {
    notify(e?.message || '保存失败。', 'error')
  }
}

async function testSupabase() {
  testing.value = true
  message.value = null
  try {
    const info = await testSupabaseConnection({
      url: auth.supabaseUrl || config.url,
      key: auth.supabaseKey || config.key,
      serviceKey: auth.serviceKey
    })
    notify(`Supabase 连接成功！使用 ${info}`, 'ok')
  } catch (e) {
    notify(e?.message || '连接测试失败。', 'error')
  } finally {
    testing.value = false
  }
}

function clearSupabase() {
  clearSupabaseConfig()
  const defaults = getSupabaseConfig()
  auth.supabaseUrl = defaults.url
  auth.supabaseKey = defaults.key
  auth.serviceKey = defaults.serviceKey
  auth.isSupabaseSet = false
  notify('已清除保存的配置，恢复默认值。', 'ok')
}
</script>

<template>
  <p class="status-text">
    GitHub Token 用于触发发布工作流（需要 <code>repo</code>/<code>workflow</code> 权限）；
    Service Role Key 绕过 RLS。凭据仅保存在本机浏览器 localStorage。
  </p>

  <div class="grid auth-grid">
    <div class="card card--inner">
      <div class="card-header">
        <div>
          <p class="card-kicker">GitHub</p>
          <h3 class="card-title">GitHub Token</h3>
        </div>
        <span class="state" :class="auth.isGithubSet ? 'state--ok' : 'state--warn'">
          {{ auth.isGithubSet ? '已保存' : '未设置' }}
        </span>
      </div>

      <div class="field">
        <label class="field-label" for="github-token">Token</label>
        <input
          id="github-token"
          v-model="auth.githubToken"
          class="input"
          type="password"
          autocomplete="off"
          placeholder="ghp_xxxx…"
        >
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="button" @click="saveGithub">保存</button>
        <button class="btn" type="button" :disabled="!auth.isGithubSet" @click="clearGithub">清除</button>
      </div>
    </div>

    <div class="card card--inner">
      <div class="card-header">
        <div>
          <p class="card-kicker">Supabase</p>
          <h3 class="card-title">凭据配置</h3>
        </div>
        <span class="state" :class="auth.isSupabaseSet ? 'state--ok' : 'state--warn'">
          {{ auth.isSupabaseSet ? '已保存' : '默认值' }}
        </span>
      </div>

      <div class="field">
        <label class="field-label">Project URL</label>
        <input v-model="auth.supabaseUrl" class="input" type="text">
      </div>
      <div class="field">
        <label class="field-label">Anon Key</label>
        <input v-model="auth.supabaseKey" class="input" type="text">
      </div>
      <div class="field">
        <label class="field-label">Service Role Key</label>
        <input v-model="auth.serviceKey" class="input" type="password" autocomplete="off">
        <p class="tip tip--warn">Service Role Key 绕过 RLS，请勿提交到公开仓库。</p>
      </div>

      <div class="actions">
        <button class="btn btn--primary" type="button" @click="saveSupabase">保存</button>
        <button class="btn" type="button" :disabled="testing" @click="testSupabase">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <button class="btn" type="button" @click="clearSupabase">恢复默认</button>
      </div>
    </div>
  </div>

  <p v-if="message" class="status-text" :class="message.type === 'ok' ? 'status-text--ok' : message.type === 'error' ? 'status-text--error' : ''">
    {{ message.text }}
  </p>
</template>

<style scoped>
.auth-grid {
  grid-template-columns: 1fr;
}

.card--inner {
  gap: 12px;
}

@media (min-width: 860px) {
  .auth-grid {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}
</style>