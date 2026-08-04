/**
 * 米游铺自助下单功能白名单权限
 * 通过 Supabase Edge Function check-checkout-permission 校验当前登录用户
 *
 * 安全策略（一律按无权限处理）：
 *   - 未登录 → allowed: false
 *   - 网络请求失败 / Edge Function 不可用 → allowed: false
 *   - Supabase 未配置 → allowed: false
 */
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getSession } from '@/utils/supabase/auth'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'

const log = createLogger('checkout-permission')

// 模块级缓存：同一次会话内复用（MyView 与路由守卫不重复请求）；
// 一旦查到结果就不再重复请求，直到页面刷新
let cachedAllowed = null

/**
 * 独立权限检查（组件与路由守卫共用），返回 Promise<boolean>
 * 供 useCheckoutPermission() 与 /checkout 路由 beforeEnter 调用
 */
export async function checkCheckoutPermission() {
  const authStore = useAuthStore()

  // 硬刷新时 Supabase 的持久化 session 可能还在恢复，先等待认证初始化完成。
  await authStore.init()

  if (!authStore.isLoggedIn) {
    cachedAllowed = false
    return false
  }

  if (cachedAllowed !== null) {
    return cachedAllowed
  }

  try {
    const supabase = getSupabaseClient()
    const session = await getSession()
    if (!session?.access_token) {
      cachedAllowed = false
      return cachedAllowed
    }
    const { data, error } = await supabase.functions.invoke('check-checkout-permission', {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (error) throw error
    cachedAllowed = data?.allowed === true
  } catch (e) {
    log.error('check:failed', { message: e?.message })
    cachedAllowed = false
  }
  return cachedAllowed
}

export function useCheckoutPermission() {
  const allowed = ref(false)
  const loading = ref(false)
  const checked = ref(false)
  const error = ref('')

  async function check() {
    loading.value = true
    error.value = ''
    try {
      allowed.value = await checkCheckoutPermission()
    } catch (e) {
      allowed.value = false
      error.value = e?.message || ''
    } finally {
      checked.value = true
      loading.value = false
    }
  }

  function reset() {
    allowed.value = false
    checked.value = false
    loading.value = false
    error.value = ''
    cachedAllowed = null
  }

  return { allowed, loading, checked, error, check, reset }
}
