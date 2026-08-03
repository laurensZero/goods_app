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
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'

const log = createLogger('checkout-permission')

// 模块级短时缓存：同一次访问内复用（MyView 与路由守卫不重复请求）；
// 撤销白名单后最长 CACHE_TTL 内生效
const CACHE_TTL_MS = 60000
let cachedAllowed = null
let cachedAt = 0

/**
 * 独立权限检查（组件与路由守卫共用），返回 Promise<boolean>
 * 供 useCheckoutPermission() 与 /checkout 路由 beforeEnter 调用
 */
export async function checkCheckoutPermission() {
  const authStore = useAuthStore()

  if (!authStore.isLoggedIn) {
    cachedAllowed = false
    cachedAt = 0
    return false
  }

  if (cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedAllowed
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('check-checkout-permission', { method: 'GET' })
    if (error) throw error
    cachedAllowed = data?.allowed === true
  } catch (e) {
    log.error('check:failed', { message: e?.message })
    cachedAllowed = false
  }
  cachedAt = Date.now()
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
  }

  return { allowed, loading, checked, error, check, reset }
}
