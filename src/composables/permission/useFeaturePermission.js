/**
 * 通用功能白名单权限
 * 通过 Supabase Edge Function（feature 白名单表）校验当前登录用户是否拥有某功能权限。
 *
 * 校验 / 显示策略（每次开启 App 只发一次校验，所有用户一致）：
 *   - 上次「有权限」的结果按 feature 持久化；再次打开 App 时先乐观显示入口，
 *     随后并发启动一次真实校验：确认仍有权 → 保持并刷新持久化；确认无权 → 立即隐藏
 *   - 会话内结果缓存，后续调用直接复用，不重复请求
 *   - 网络异常不改变现状：复用上次已知结果（会话缓存或持久化结果），
 *     无任何上次结果时按「本轮未验证」（unverified）处理，绝不误判为无权限
 *   - 登出时 reset() 清除会话缓存并隐藏入口；重新登录触发下一次校验
 *
 * 安全策略（一律按无权限处理）：
 *   - 未登录 → denied
 *   - Supabase 未配置 / 无 access_token → denied
 *
 * 结果三态（checkFeaturePermissionState）：
 *   - allowed   确认有权限（本次校验通过，或网络异常时复用持久化的有权限结果）
 *   - denied    确认无权限（未登录 / 服务端明确返回 allowed:false）
 *   - unverified 本轮无法判定（网络异常 / 服务端错误且无上次已知结果），
 *               调用方应保持现状等待下次校验，不得当作无权限执行降级动作
 *
 * 扩展：新场景只需要在 backend 的 feature_whitelist 表登记新 feature 行，
 *       再 `useFeaturePermission('xxx')` 即可，无需改动本文件。
 *
 * 使用注意：返回对象里的 ref 在模板中必须解构成顶层变量再用
 *       `const { allowed } = useFeaturePermission('xxx')` + `v-if="allowed"`。
 *       直接 `v-if="perm.allowed"` 读到的是 ref 对象（恒为真），无法隐藏入口。
 */
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getSession } from '@/utils/supabase/auth'
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { createLogger } from '@/utils/logger'
import { readPersisted, writePersisted } from '@/utils/platform/storage'

const log = createLogger('feature-permission')

const PERSIST_PREFIX = 'goods_feature_allowed_'

// 会话级缓存：Map<feature, 'allowed' | 'denied' | 'unverified'>（不存在 = 本次会话尚未校验）
const sessionCache = new Map()
// 进行中的请求：Map<feature, Promise<string>>，避免并发触发重复请求
const inflight = new Map()

// 服务端以 200 返回这些 reason 时属于「本轮结果未知」而非确定性拒绝：
// 兼容尚未重新部署的旧版函数（内部错误也返回 200）。
const TRANSIENT_DENY_REASONS = new Set(['query_error', 'server_error', 'unauthorized'])

const PERMISSION_TIMEOUT_MS = 8000

function persistKey(feature) {
  return PERSIST_PREFIX + feature
}

function stateToAllowed(state) {
  return state === 'allowed'
}

async function readLastAllowed(feature) {
  return (await readPersisted(persistKey(feature), '')) === '1'
}

/**
 * 独立权限检查（三态），返回 'allowed' | 'denied' | 'unverified'
 * 指定 feature 名，与白名单表 / Edge Function 的 feature 值对应
 */
export async function checkFeaturePermissionState(feature) {
  const authStore = useAuthStore()

  // 硬刷新时 Supabase 的持久化 session 可能还在恢复，先等待认证初始化完成。
  await authStore.init()

  if (!authStore.isLoggedIn) return 'denied'

  // 会话内已校验过：直接复用（每次开启 App 只发一次请求）。
  // unverified 除外：结果未知，清掉缓存让本次调用真正重试一次。
  if (sessionCache.has(feature)) {
    const cached = sessionCache.get(feature)
    if (cached !== 'unverified') return cached
    sessionCache.delete(feature)
  }

  // 并发去重：同一 feature 同时有多个调用方时共享同一个请求
  if (inflight.has(feature)) return inflight.get(feature)

  const request = (async () => {
    try {
      const supabase = getSupabaseClient()
      const session = await getSession()
      if (!session?.access_token) return 'denied'
      // feature 拼进函数名传参：本版本 supabase-js 的 invoke 不支持 query 选项；
      // timeout 兜底弱网悬挂，超时走下方 catch 的「结果未知」分支
      const { data, error } = await supabase.functions.invoke(
        `check-feature-permission?feature=${encodeURIComponent(feature)}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${session.access_token}` },
          timeout: PERMISSION_TIMEOUT_MS,
        },
      )
      if (error) throw error
      if (data?.allowed !== true && TRANSIENT_DENY_REASONS.has(String(data?.reason || ''))) {
        throw new Error(`permission-check-transient:${data?.reason}`)
      }
      const allowed = data?.allowed === true
      log.info(`check:ok:${feature}`, { allowed, data })
      const state = allowed ? 'allowed' : 'denied'
      sessionCache.set(feature, state)
      await writePersisted(persistKey(feature), allowed ? '1' : '0')
      return state
    } catch (e) {
      log.error(`check:failed:${feature}`, { message: e?.message, error: e })
      // 网络异常 / 服务端错误：结果未知。复用上次已知结果；无上次结果则本轮未验证，
      // 不写入持久化（避免瞬时故障把「有权限」记录污染成「无权限」）
      const last = await readLastAllowed(feature)
      const state = last ? 'allowed' : 'unverified'
      sessionCache.set(feature, state)
      return state
    } finally {
      inflight.delete(feature)
    }
  })()
  inflight.set(feature, request)
  return request
}

/**
 * 独立权限检查（组件与路由守卫共用），返回 Promise<boolean>
 * 网络异常且无上次已知结果时返回 false（保守处理）；需要区分
 * 「确认无权限」与「本轮未验证」的场景请改用 checkFeaturePermissionState。
 */
export async function checkFeaturePermission(feature) {
  return stateToAllowed(await checkFeaturePermissionState(feature))
}

export function useFeaturePermission(feature) {
  const allowed = ref(false)
  const loading = ref(false)
  const checked = ref(false)
  const error = ref('')

  async function check() {
    // 乐观展示：上次会话有权限 → 先按有权显示入口，不等网络结果（仅会话内首次校验时生效）
    if (!sessionCache.has(feature) && !allowed.value) {
      try {
        const authStore = useAuthStore()
        await authStore.init()
        if (authStore.isLoggedIn && (await readLastAllowed(feature))) {
          allowed.value = true
        }
      } catch {}
    }

    loading.value = true
    error.value = ''
    try {
      allowed.value = await checkFeaturePermission(feature)
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
    sessionCache.delete(feature)
  }

  return { allowed, loading, checked, error, check, reset }
}