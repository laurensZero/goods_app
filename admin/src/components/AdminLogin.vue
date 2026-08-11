<script setup>
import { reactive, ref } from 'vue'
import { useAdminAuth } from '../composables/useAdminAuth'

const { login } = useAdminAuth()

const form = reactive({ username: '', password: '' })
const busy = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!form.username.trim() || !form.password) {
    error.value = '请输入账号和密码。'
    return
  }
  busy.value = true
  try {
    await login(form.username, form.password)
  } catch (e) {
    error.value = e?.message || '登录失败。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-shell">
    <form class="card login-card" @submit.prevent="submit">
      <div class="login-brand">
        <p class="card-kicker">Goods APP</p>
        <h1 class="card-title">管理台登录</h1>
        <p class="card-desc">
          使用 Goods APP 账号（邮箱）登录，经 Edge Function 校验管理员白名单后下发发布与数据库凭据。
        </p>
      </div>

      <div class="field">
        <label class="field-label" for="login-username">邮箱 / 账号</label>
        <input
          id="login-username"
          v-model="form.username"
          class="input"
          type="email"
          autocomplete="username"
          placeholder="admin@example.com"
          autofocus
        >
      </div>

      <div class="field">
        <label class="field-label" for="login-password">密码</label>
        <input
          id="login-password"
          v-model="form.password"
          class="input"
          type="password"
          autocomplete="current-password"
          placeholder="密码"
        >
      </div>

      <button class="btn btn--primary" type="submit" :disabled="busy">
        {{ busy ? '登录中…' : '登录' }}
      </button>

      <p v-if="error" class="status-text status-text--error">{{ error }}</p>
    </form>
  </div>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px var(--page-padding);
}

.login-card {
  width: 100%;
  max-width: 380px;
  gap: 14px;
}

.login-brand {
  text-align: center;
  margin-bottom: 4px;
}

.login-brand .card-kicker {
  text-transform: uppercase;
}
</style>
