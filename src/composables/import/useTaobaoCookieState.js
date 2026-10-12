import { computed, ref } from 'vue'
import {
  clearTaobaoCookie,
  getActiveTaobaoAccount,
  getTaobaoCookie,
  isAutoTaobaoAccountLabel,
  isTaobaoCookieReady,
  listTaobaoAccounts,
  markTaobaoCookieInvalid,
  removeTaobaoAccount,
  renameTaobaoAccount,
  setTaobaoCookie,
  switchTaobaoAccount,
  upsertTaobaoAccountProfile,
} from '@/utils/taobao/cookie'
import { fetchTaobaoAccountProfile, profileFromCookie } from '@/utils/taobao/accountProfile'
import { validateTaobaoCookie } from '@/utils/taobao/service'
import { createLogger } from '@/utils/logger'

const logger = createLogger('taobao:accountState')

/** 淘宝账号状态（Hub / 导入页共用）：账号列表 + 当前会话 + 校验徽标 */
export function useTaobaoCookieState() {
  const accounts = ref([])
  const activeAccountId = ref('')
  const activeAccountLabel = ref('')
  const activeAccountAvatar = ref('')
  const cookieReady = ref(false)
  const cookieStatus = ref('idle') // idle | ok | expired | blocked
  const loading = ref(false)

  const hasAccounts = computed(() => accounts.value.length > 0)

  async function refreshAccounts() {
    const [list, active, cookie] = await Promise.all([
      listTaobaoAccounts(),
      getActiveTaobaoAccount(),
      getTaobaoCookie(),
    ])
    accounts.value = list
    activeAccountId.value = String(active?.id || '')
    activeAccountLabel.value = String(active?.label || '')
    activeAccountAvatar.value = String(active?.avatarUrl || '')
    cookieReady.value = isTaobaoCookieReady(cookie)
  }

  /** 补拉尚未显示昵称/头像的账号资料（最多 3 个，避免打爆接口） */
  async function refreshAccountProfiles() {
    const stale = (accounts.value || []).filter((item) => (
      item?.cookie
      && (
        !item.avatarUrl
        || !item.label
        || isAutoTaobaoAccountLabel(item.label, item.accountId || item.id)
      )
    )).slice(0, 3)

    let changed = false
    for (const account of stale) {
      try {
        const profile = await fetchTaobaoAccountProfile(account.cookie)
        const payload = {
          ...(profile.nickname ? { label: profile.nickname } : {}),
          ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
        }
        if (!payload.label && !payload.avatarUrl) continue
        const updated = await upsertTaobaoAccountProfile(account.id, payload)
        if (updated) changed = true
      } catch {
        // 单个账号失败不影响其它
      }
    }
    if (changed) await refreshAccounts()
  }

  /** 保存 Cookie（先尽量拉昵称/头像），并刷新账号列表 */
  async function saveAccountWithProfile(cookie, extraOptions = {}) {
    const value = String(cookie || '').trim()
    if (!value) return { ok: false, cookie: '' }

    let profile = { nickname: '', avatarUrl: '' }
    try {
      profile = await fetchTaobaoAccountProfile(value)
    } catch {
      profile = profileFromCookie(value)
    }
    await setTaobaoCookie(value, {
      ...(profile.nickname ? { label: profile.nickname } : {}),
      ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      ...extraOptions,
    })
    cookieReady.value = isTaobaoCookieReady(value)
    await refreshAccounts()
    return { ok: true, cookie: value }
  }

  /** 校验当前激活 Cookie（样例商品探测），更新徽标状态 */
  async function validateActiveCookie() {
    loading.value = true
    try {
      const cookie = await getTaobaoCookie()
      if (!isTaobaoCookieReady(cookie)) {
        cookieReady.value = false
        cookieStatus.value = 'idle'
        return { ok: false, code: 'NO_COOKIE' }
      }
      const result = await validateTaobaoCookie()
      cookieReady.value = result.ok
      cookieStatus.value = result.ok
        ? 'ok'
        : (result.code === 'BLOCKED' ? 'blocked' : 'expired')
      if (!result.ok && result.code !== 'BLOCKED') {
        const active = await getActiveTaobaoAccount()
        if (active?.cookie) await markTaobaoCookieInvalid(active.cookie, result.code)
        await refreshAccounts()
      }
      return result
    } catch {
      cookieStatus.value = 'expired'
      return { ok: false, code: 'NETWORK' }
    } finally {
      loading.value = false
    }
  }

  async function initialize() {
    await refreshAccounts()
    cookieStatus.value = cookieReady.value ? 'ok' : 'idle'
    void refreshAccountProfiles()
  }

  async function switchAccount(accountId) {
    const target = await switchTaobaoAccount(accountId)
    if (!target?.cookie) return { ok: false, cookie: '' }
    cookieReady.value = isTaobaoCookieReady(target.cookie)
    await refreshAccounts()
    return { ok: true, cookie: target.cookie, account: target }
  }

  async function removeAccount(accountId) {
    const id = String(accountId || '').trim()
    if (!id) return false
    const wasActive = id === activeAccountId.value
    const ok = await removeTaobaoAccount(id)
    if (wasActive) {
      cookieReady.value = false
      cookieStatus.value = 'idle'
    }
    await refreshAccounts()
    return ok
  }

  async function renameAccount(accountId, label) {
    const updated = await renameTaobaoAccount(accountId, label)
    await refreshAccounts()
    return updated
  }

  /** 退出当前会话（保留账号列表） */
  async function clearSession() {
    await clearTaobaoCookie({ keepAccounts: true })
    cookieReady.value = false
    cookieStatus.value = 'idle'
    activeAccountId.value = ''
    activeAccountLabel.value = ''
    activeAccountAvatar.value = ''
    await refreshAccounts()
  }

  return {
    accounts,
    activeAccountId,
    activeAccountLabel,
    activeAccountAvatar,
    cookieReady,
    cookieStatus,
    loading,
    hasAccounts,
    initialize,
    refreshAccounts,
    refreshAccountProfiles,
    saveAccountWithProfile,
    validateActiveCookie,
    switchAccount,
    removeAccount,
    renameAccount,
    clearSession,
  }
}
