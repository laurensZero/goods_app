import { computed, ref } from 'vue'
import {
  getSession,
  isAuthenticated,
  login as loginRequest,
  logout as clearLogout
} from '../services/auth'

/**
 * 管理台认证状态（模块级单例，App.vue 与 AuthSection 共享）。
 * 登录成功后凭据写入 localStorage；登出后回到登录门。
 */

const authenticated = ref(isAuthenticated())
const session = ref(getSession())

export function useAdminAuth() {
  const admin = computed(() => session.value?.admin || null)

  async function login(username, password) {
    const next = await loginRequest(username, password)
    authenticated.value = true
    session.value = next
    return next
  }

  function logout() {
    clearLogout()
    authenticated.value = false
    session.value = null
  }

  return { authenticated, session, admin, login, logout }
}
