import { computed, ref } from 'vue'
import { isMihoyoCookieExpiredError, validateMihoyoCookie } from '@/utils/mihoyo/index'
import {
  clearMihoyoCookieState,
  getActiveMihoyoAccount,
  isAutoMihoyoAccountLabel,
  listMihoyoAccounts,
  loadMihoyoCookieState,
  markMihoyoCookieInvalid,
  removeMihoyoAccount,
  renameMihoyoAccount,
  saveMihoyoCookie,
  switchMihoyoAccount,
  upsertMihoyoAccountProfile
} from '@/utils/mihoyo/cookie'
import { fetchMihoyoAccountProfile } from '@/utils/mihoyo/accountProfile'
import {
  canUseNativeMihoyoImport,
  getNativeMihoyoCookie,
  loginMihoyoNativeNewAccount,
  logoutMihoyoNativeSession,
  setNativeMihoyoCookie
} from '@/utils/mihoyo/nativeImport'

const COOKIE_EXPIRED_MESSAGE = '已保存的 Cookie 可能已失效，请重新输入并更新。'

export function useMihoyoCookieState() {
  const cookieInput = ref('')
  const rememberCookie = ref(false)
  const hasSavedCookie = ref(false)
  const cookieWarningMessage = ref('')
  const savedCookieValue = ref('')
  const savedCookieInvalid = ref(false)
  const accounts = ref([])
  const activeAccountLabel = ref('')
  const activeAccountId = ref('')
  const activeAccountAvatar = ref('')

  const cookieValid = computed(() => {
    const value = cookieInput.value.trim()
    return value.length > 20 && validateMihoyoCookie(value)
  })

  const canAutoSubmitSavedCookie = computed(() =>
    Boolean(savedCookieValue.value) && !savedCookieInvalid.value
  )

  const hasMultipleAccounts = computed(() => accounts.value.length > 1)

  async function refreshAccounts() {
    const [list, active] = await Promise.all([listMihoyoAccounts(), getActiveMihoyoAccount()])
    accounts.value = list
    activeAccountId.value = String(active?.id || '')
    activeAccountLabel.value = String(active?.label || '')
    activeAccountAvatar.value = String(active?.avatarUrl || '')
  }

  /**
   * 登录新账号。
   * - 原生：拉起 WebView 登录（需插件 login()）
   * - 网页：由 UI 弹 Cookie 输入，提交后走 submitNewAccountCookie
   */
  async function loginNewAccountNative() {
    // 先把当前会话写入账号列表，避免切换登录时丢失
    if (savedCookieValue.value) {
      try { await saveMihoyoCookie(savedCookieValue.value) } catch { /* ignore */ }
    }
    const result = await loginMihoyoNativeNewAccount()
    if (!result.ok) return result
    await saveMihoyoAccountWithNickname(result.cookie)
    hasSavedCookie.value = true
    savedCookieValue.value = result.cookie
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
    cookieInput.value = result.cookie
    rememberCookie.value = true
    await refreshAccounts()
    return { ok: true, cookie: result.cookie }
  }

  /** 网页端提交新账号 Cookie */
  async function submitNewAccountCookie(cookie, remember = true) {
    const value = String(cookie || '').trim()
    if (!value) return { ok: false, message: 'empty' }
    await saveMihoyoAccountWithNickname(value)
    hasSavedCookie.value = true
    savedCookieValue.value = value
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
    cookieInput.value = value
    rememberCookie.value = Boolean(remember)
    await refreshAccounts()
    return { ok: true, cookie: value }
  }

  /**
   * 补拉尚未显示昵称的账号资料（旧数据只有 UID 自动标签时）。
   * 串行、最多 3 个，避免一次打爆接口。
   */
  async function refreshAccountProfiles() {
    const stale = (accounts.value || []).filter((item) => (
      item?.cookie
      && (
        !item.avatarUrl
        || !item.label
        || isAutoMihoyoAccountLabel(item.label, item.accountId || item.id)
      )
    )).slice(0, 3)

    let changed = false
    for (const account of stale) {
      try {
        const profile = await fetchMihoyoAccountProfile(account.cookie)
        if (!profile.nickname && !profile.avatarUrl) continue
        const updated = await upsertMihoyoAccountProfile(account.id, profile)
        if (updated) changed = true
      } catch {
        // 单个账号失败不影响其它
      }
    }
    if (changed) await refreshAccounts()
  }

  async function initializeCookieState() {
    const state = await loadMihoyoCookieState()
    const savedCookie = String(state.cookie || '').trim()

    savedCookieValue.value = savedCookie
    hasSavedCookie.value = Boolean(savedCookie)
    rememberCookie.value = Boolean(savedCookie)
    savedCookieInvalid.value = Boolean(state.invalidAt)
    cookieInput.value = ''
    cookieWarningMessage.value = state.invalidAt ? COOKIE_EXPIRED_MESSAGE : ''
    await refreshAccounts()
    void refreshAccountProfiles()
  }

  function applySavedCookieToInput() {
    cookieInput.value = savedCookieValue.value
  }

  async function persistCookieAfterSuccess(explicitCookie = '') {
    const value = String(explicitCookie || cookieInput.value).trim()
    const shouldSave = Boolean(value) && (Boolean(explicitCookie) || rememberCookie.value)

    if (!shouldSave) {
      // 未勾选记住时只清当前会话，保留账号列表以便快速切换
      await clearMihoyoCookieState({ keepAccounts: true })
      hasSavedCookie.value = false
      savedCookieValue.value = ''
      savedCookieInvalid.value = false
      cookieWarningMessage.value = ''
      activeAccountId.value = ''
      activeAccountLabel.value = ''
      await refreshAccounts()
      return
    }

    await saveMihoyoAccountWithNickname(value)
    hasSavedCookie.value = true
    savedCookieValue.value = value
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
    await refreshAccounts()
  }

  /** 保存 Cookie，并尽量用米游社用户名/头像作为账号资料 */
  async function saveMihoyoAccountWithNickname(cookie) {
    let profile = { nickname: '', avatarUrl: '', uid: '' }
    try {
      profile = await fetchMihoyoAccountProfile(cookie)
    } catch {
      profile = { nickname: '', avatarUrl: '', uid: '' }
    }
    await saveMihoyoCookie(cookie, {
      ...(profile.nickname ? { label: profile.nickname } : {}),
      ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {})
    })
  }

  /** 安卓原生导入成功后：读插件 Cookie 并写入多账号列表 */
  async function persistNativeCookieAfterSuccess() {
    if (!canUseNativeMihoyoImport()) return
    const cookie = await getNativeMihoyoCookie()
    if (!cookie) return
    await saveMihoyoAccountWithNickname(cookie)
    hasSavedCookie.value = true
    savedCookieValue.value = cookie
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
    await refreshAccounts()
  }

  async function handleCookieFailure(error) {
    const value = cookieInput.value.trim() || savedCookieValue.value.trim()
    if (!rememberCookie.value || !value || !isMihoyoCookieExpiredError(error)) {
      return false
    }

    await markMihoyoCookieInvalid(value, error?.message || '')
    hasSavedCookie.value = true
    savedCookieValue.value = value
    savedCookieInvalid.value = true
    cookieInput.value = ''
    cookieWarningMessage.value = COOKIE_EXPIRED_MESSAGE
    await refreshAccounts()
    return true
  }

  /**
   * 退出当前账号会话。
   * removeAccount=true 时同时从账号列表删除当前账号。
   */
  async function clearSavedCookie(resetInput = true, { removeAccount = false } = {}) {
    if (canUseNativeMihoyoImport()) {
      await logoutMihoyoNativeSession()
    }
    const currentId = activeAccountId.value
    if (removeAccount && currentId) {
      await removeMihoyoAccount(currentId)
    } else {
      await clearMihoyoCookieState({ keepAccounts: true })
    }
    hasSavedCookie.value = false
    rememberCookie.value = false
    savedCookieValue.value = ''
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
    activeAccountId.value = ''
    activeAccountLabel.value = ''

    if (resetInput) {
      cookieInput.value = ''
    }
    await refreshAccounts()
  }

  /**
   * 快速切换到已保存账号。
   * @returns {Promise<{ ok: boolean, cookie: string, nativeApplied: boolean, message?: string }>}
   */
  async function switchAccount(accountId) {
    const target = await switchMihoyoAccount(accountId)
    if (!target?.cookie) {
      return { ok: false, cookie: '', nativeApplied: false, message: 'account-missing' }
    }

    let nativeApplied = true
    if (canUseNativeMihoyoImport()) {
      nativeApplied = await setNativeMihoyoCookie(target.cookie)
      if (nativeApplied) {
        try {
          const current = await getNativeMihoyoCookie()
          // 写入后必须能读回同一 Cookie，否则原生导入仍会用旧会话/空 Cookie
          nativeApplied = Boolean(current) && current === target.cookie
        } catch {
          nativeApplied = false
        }
      }
      // 不要在失败时 logout：那会清掉原生会话，让「切号」变成「必失效」
    }

    savedCookieValue.value = target.cookie
    hasSavedCookie.value = true
    savedCookieInvalid.value = Boolean(target.invalidAt)
    rememberCookie.value = true
    // 网页端 startFetch 读 cookieInput：切号后必须写入目标 Cookie，不能清空
    cookieInput.value = target.cookie
    cookieWarningMessage.value = target.invalidAt ? COOKIE_EXPIRED_MESSAGE : ''
    activeAccountId.value = String(target.id || accountId || '')
    activeAccountLabel.value = String(target.accountLabel || target.label || '')
    activeAccountAvatar.value = String(target.avatarUrl || target.accountAvatarUrl || '')
    await refreshAccounts()

    return {
      ok: true,
      cookie: target.cookie,
      nativeApplied,
      message: nativeApplied ? '' : 'native-set-unsupported'
    }
  }

  async function renameAccount(accountId, label) {
    const updated = await renameMihoyoAccount(accountId, label)
    await refreshAccounts()
    return updated
  }

  async function removeAccount(accountId) {
    const id = String(accountId || '').trim()
    if (!id) return false
    const wasActive = id === activeAccountId.value
    if (wasActive && canUseNativeMihoyoImport()) {
      await logoutMihoyoNativeSession()
    }
    const ok = await removeMihoyoAccount(id)
    if (wasActive) {
      hasSavedCookie.value = false
      rememberCookie.value = false
      savedCookieValue.value = ''
      savedCookieInvalid.value = false
      cookieWarningMessage.value = ''
      activeAccountId.value = ''
      activeAccountLabel.value = ''
    }
    await refreshAccounts()
    return ok
  }

  /** 是否已登录（有可用 Cookie，含原生会话） */
  const mihoyoLoggedIn = computed(() => hasSavedCookie.value || Boolean(savedCookieValue.value))

  return {
    cookieInput,
    rememberCookie,
    hasSavedCookie,
    mihoyoLoggedIn,
    cookieValid,
    cookieWarningMessage,
    canAutoSubmitSavedCookie,
    accounts,
    activeAccountId,
    activeAccountLabel,
    activeAccountAvatar,
    hasMultipleAccounts,
    initializeCookieState,
    applySavedCookieToInput,
    persistCookieAfterSuccess,
    persistNativeCookieAfterSuccess,
    handleCookieFailure,
    clearSavedCookie,
    switchAccount,
    renameAccount,
    removeAccount,
    refreshAccounts,
    refreshAccountProfiles,
    loginNewAccountNative,
    submitNewAccountCookie
  }
}
