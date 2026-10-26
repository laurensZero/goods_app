import { computed, ref } from 'vue'
import { isMihoyoCookieExpiredError, validateMihoyoCookie } from '@/utils/mihoyo/index'
import {
  clearMihoyoCookieState,
  getActiveMihoyoAccount,
  getMihoyoStoken,
  isAutoMihoyoAccountLabel,
  listMihoyoAccounts,
  loadMihoyoCookieState,
  markMihoyoAccountInvalid,
  markMihoyoCookieInvalid,
  parseMihoyoAccountId,
  parseMihoyoAccountMid,
  removeMihoyoAccount,
  renameMihoyoAccount,
  saveMihoyoCookie,
  saveMihoyoStoken,
  switchMihoyoAccount,
  updateMihoyoAccountCookie,
  updateMihoyoAccountRefreshState,
  upsertMihoyoAccountProfile
} from '@/utils/mihoyo/cookie'
import { fetchMihoyoAccountProfile } from '@/utils/mihoyo/accountProfile'
import { parseStokenInput, refreshMihoyoCookieWithStoken } from '@/utils/mihoyo/stokenRefresh'
import {
  applyNativeMihoyoCookie,
  canUseNativeMihoyoImport,
  getNativeMihoyoCookie,
  loginMihoyoNativeNewAccount,
  logoutMihoyoNativeSession,
  setNativeMihoyoCookie
} from '@/utils/mihoyo/nativeImport'

const COOKIE_EXPIRED_MESSAGE = '已保存的 Cookie 可能已失效，请重新输入并更新。'
/** 启动/切号时，超过这个间隔才自动检查 stoken；手动刷新不受限制 */
const STALE_REFRESH_MS = 12 * 60 * 60 * 1000

// 同一账号并发刷新复用同一个 Promise，避免启动检查 + 手动点击重复换票
const refreshInFlight = new Map()
let startupCheckPromise = null

function isRefreshStale(account) {
  const last = Date.parse(String(account?.lastCheckedAt || ''))
  if (!Number.isFinite(last)) return true
  return Date.now() - last >= STALE_REFRESH_MS
}

/** 给换票流程加硬超时，避免底层网络卡住导致按钮一直转圈 */
function withTimeout(promise, ms, message) {
  let timer = null
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

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
  const refreshingAccountId = ref('')

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
   * 用 stoken 刷新指定账号的 Cookie。
   * 成功才替换；鉴权失败才标记失效；网络失败只记录错误。
   */
  async function refreshAccountWithStoken(accountId, { force = false } = {}) {
    const id = String(accountId || '').trim()
    if (!id) return { ok: false, kind: 'missing-account', message: '账号不存在' }

    // 同一账号并发刷新复用同一个 Promise。
    // 但自动检查可能因为「未到 12 小时」直接 skipped：此时 Cookie 已经被接口判定失效，
    // 强制刷新必须等它结束后再真正换一次，不能被 skipped 结果挡住。
    const inFlight = refreshInFlight.get(id)
    if (inFlight) {
      const existing = await inFlight
      if (!force || (existing?.ok && existing?.cookie)) return existing
    }

    const promise = (async () => {
      const list = await listMihoyoAccounts()
      const account = list.find((item) => item.id === id)
      if (!account) return { ok: false, kind: 'missing-account', message: '账号不存在' }

      const stokenRecord = await getMihoyoStoken(id)
      if (!stokenRecord?.stoken) return { ok: false, kind: 'no-stoken', message: '未配置 stoken' }
      if (!force && !isRefreshStale(account)) return { ok: true, skipped: true }

      const mid = stokenRecord.mid || parseMihoyoAccountMid(account.cookie)
      const stuid = stokenRecord.stuid || account.accountId || parseMihoyoAccountId(account.cookie)
      if (!mid) {
        const result = {
          ok: false,
          kind: 'missing-mid',
          message: '缺少 mid，请粘贴 stoken.txt 完整内容',
        }
        await updateMihoyoAccountRefreshState(id, {
          refreshError: result.message,
          refreshErrorAt: new Date().toISOString(),
        })
        await refreshAccounts()
        return result
      }

      refreshingAccountId.value = id
      try {
        const result = await withTimeout(
          refreshMihoyoCookieWithStoken({
            stoken: stokenRecord.stoken,
            mid,
            stuid,
          }),
          35000,
          '刷新超时，请检查网络后重试'
        )
        const now = new Date().toISOString()

        if (result.ok) {
          await updateMihoyoAccountCookie(id, result.cookie, {
            hasStoken: true,
            stokenUpdatedAt: stokenRecord.updatedAt || now,
            lastValidAt: now,
            lastCheckedAt: now,
            refreshError: '',
            refreshErrorAt: '',
          })
          if (result.profile?.nickname || result.profile?.avatarUrl) {
            try {
              await upsertMihoyoAccountProfile(id, result.profile)
            } catch {
              // 昵称/头像补拉失败不影响 Cookie 已刷新
            }
          }

          const active = await getActiveMihoyoAccount()
          if (active?.id === id) {
            savedCookieValue.value = result.cookie
            cookieInput.value = result.cookie
            savedCookieInvalid.value = false
            cookieWarningMessage.value = ''
            hasSavedCookie.value = true
            rememberCookie.value = true
            try {
              await applyCookieToNativeSession(result.cookie)
            } catch {
              // 原生会话写入失败时保留网页端已刷新的 Cookie
            }
          }

          await refreshAccounts()
          return { ...result, refreshed: true }
        }

        if (result.kind === 'auth' || result.kind === 'mismatch') {
          await markMihoyoAccountInvalid(id, result.message || 'stoken 已失效')
          const active = await getActiveMihoyoAccount()
          if (active?.id === id) {
            savedCookieInvalid.value = true
            cookieWarningMessage.value = COOKIE_EXPIRED_MESSAGE
          }
        } else {
          await updateMihoyoAccountRefreshState(id, {
            refreshError: result.message || '刷新失败',
            refreshErrorAt: now,
          })
        }

        await refreshAccounts()
        return result
      } catch (error) {
        const message = String(error?.message || error || '刷新失败')
        await updateMihoyoAccountRefreshState(id, {
          refreshError: message,
          refreshErrorAt: new Date().toISOString(),
        })
        await refreshAccounts()
        return { ok: false, kind: 'transient', message }
      } finally {
        if (refreshingAccountId.value === id) refreshingAccountId.value = ''
      }
    })()

    refreshInFlight.set(id, promise)
    try {
      return await promise
    } finally {
      if (refreshInFlight.get(id) === promise) refreshInFlight.delete(id)
    }
  }

  /** 保存/更新账号 stoken，并立即强制刷新一次 */
  async function saveStokenForAccount(accountId, input) {
    const id = String(accountId || '').trim()
    const parsed = parseStokenInput(input)
    if (!id) return { ok: false, kind: 'missing-account', message: '账号不存在' }
    if (!parsed.stoken || parsed.stoken.length < 20 || /\s/.test(parsed.stoken)) {
      return { ok: false, kind: 'invalid-stoken', message: 'stoken 格式不正确' }
    }

    const list = await listMihoyoAccounts()
    const account = list.find((item) => item.id === id)
    if (!account) return { ok: false, kind: 'missing-account', message: '账号不存在' }

    const accountUid = String(account.accountId || parseMihoyoAccountId(account.cookie) || '').trim()
    const accountMid = parseMihoyoAccountMid(account.cookie)
    if (parsed.stuid && accountUid && parsed.stuid !== accountUid) {
      return { ok: false, kind: 'mismatch', message: 'stoken 与当前账号不一致' }
    }
    if (parsed.mid && accountMid && parsed.mid !== accountMid) {
      return { ok: false, kind: 'mismatch', message: 'stoken 与当前账号不一致' }
    }

    await saveMihoyoStoken(id, {
      stoken: parsed.stoken,
      mid: parsed.mid || accountMid,
      stuid: parsed.stuid || accountUid,
    })
    await refreshAccounts()
    return refreshAccountWithStoken(id, { force: true })
  }

  /** 手动刷新当前账号 */
  async function refreshActiveAccount({ force = true } = {}) {
    const active = await getActiveMihoyoAccount()
    if (!active?.id) {
      return { ok: false, kind: 'no-active-account', message: '当前没有登录账号' }
    }
    return refreshAccountWithStoken(active.id, { force })
  }

  /**
   * 拉取时发现 Cookie 失效：先用当前账号的 stoken 静默换一张新 Cookie。
   * 换票失败不抛错，由调用方决定回退到登录流程还是提示重试。
   */
  async function refreshCookieAfterExpiry() {
    try {
      return await refreshActiveAccount({ force: true })
    } catch (error) {
      return {
        ok: false,
        kind: 'transient',
        message: String(error?.message || error || '刷新失败'),
      }
    }
  }

  /** App 启动 / 页面激活时检查当前账号；同一轮只跑一次 */
  async function checkActiveAccountOnStartup() {
    if (startupCheckPromise) return startupCheckPromise
    startupCheckPromise = (async () => {
      const active = await getActiveMihoyoAccount()
      if (!active?.id) return { ok: true, skipped: true }
      const record = await getMihoyoStoken(active.id)
      if (!record?.stoken) return { ok: true, skipped: true }
      if (!isRefreshStale(active)) return { ok: true, skipped: true }
      return refreshAccountWithStoken(active.id, { force: false })
    })()
    try {
      return await startupCheckPromise
    } finally {
      startupCheckPromise = null
    }
  }

  /**
   * 登录新账号。
   * - 原生：拉起 WebView 登录（需插件 login()）
   * - 网页：账号面板优先扫码（MihoyoQrLoginSheet）；也可粘贴 Cookie，提交后走 submitNewAccountCookie
   */
  async function loginNewAccountNative({ preserveCurrent = true } = {}) {
    // 先把当前会话写入账号列表，避免切换登录时丢失
    if (preserveCurrent && savedCookieValue.value) {
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

  /**
   * 提交账号 Cookie（网页端粘贴、安卓端粘贴都走这里）。
   * 安卓端会同时写入原生插件会话，避免「已登录但原生导入仍用旧会话」。
   * @returns {Promise<{ ok: boolean, cookie: string, nativeApplied?: boolean, nativeUnsupported?: boolean }>}
   */
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

    const native = await applyCookieToNativeSession(value)
    return {
      ok: true,
      cookie: value,
      nativeApplied: native.applied,
      nativeUnsupported: native.unsupported
    }
  }

  /**
   * 安卓端把 Cookie 写入原生插件会话（原生订单/购物车导入读的是插件里的 Cookie）。
   * 非安卓端直接返回 applied=true，调用方无需分支。
   * @returns {Promise<{ applied: boolean, unsupported: boolean }>}
   */
  async function applyCookieToNativeSession(cookie) {
    const value = String(cookie || '').trim()
    if (!canUseNativeMihoyoImport()) return { applied: true, unsupported: false }
    if (!value) return { applied: false, unsupported: false }
    const result = await applyNativeMihoyoCookie(value)
    if (!result.ok) {
      console.warn('[mihoyoCookie] native session cookie not applied', {
        unsupported: result.unsupported
      })
    }
    return { applied: result.ok, unsupported: result.unsupported }
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
    void (async () => {
      try {
        await checkActiveAccountOnStartup()
      } catch {
        // 保活失败不影响页面初始化
      }
      try {
        await refreshAccountProfiles()
      } catch {
        // 资料补拉失败不影响页面
      }
    })()
  }

  function applySavedCookieToInput() {
    cookieInput.value = savedCookieValue.value
  }

  /**
   * 请求成功后落盘会话。
   * @returns {Promise<{ saved: boolean, nativeApplied: boolean, nativeUnsupported: boolean }>}
   */
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
      return { saved: false, nativeApplied: true, nativeUnsupported: false }
    }

    await saveMihoyoAccountWithNickname(value)
    hasSavedCookie.value = true
    savedCookieValue.value = value
    savedCookieInvalid.value = false
    cookieWarningMessage.value = ''
    await refreshAccounts()

    // 安卓端：粘贴/校验通过的 Cookie 也要写进原生会话，原生导入才能复用
    const native = await applyCookieToNativeSession(value)
    return {
      saved: true,
      nativeApplied: native.applied,
      nativeUnsupported: native.unsupported
    }
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

  /**
   * 安卓原生导入成功后：读插件 Cookie 并写入多账号列表。
   * 「记住 Cookie」与实际登录的是同一个号：不勾就不进账号列表（原生会话仍保留，
   * 插件无法做到「仅本次会话」），勾了就存下来方便下次一键切换。
   * @param {{ remember?: boolean }} options
   */
  async function persistNativeCookieAfterSuccess({ remember = true } = {}) {
    if (!canUseNativeMihoyoImport()) return
    if (!remember) return
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
    // 切号后按需后台检查；失败不阻塞本次切换
    void refreshAccountWithStoken(target.id, { force: false }).catch(() => {})

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
    savedCookieValue,
    savedCookieInvalid,
    mihoyoLoggedIn,
    cookieValid,
    cookieWarningMessage,
    canAutoSubmitSavedCookie,
    accounts,
    activeAccountId,
    activeAccountLabel,
    activeAccountAvatar,
    hasMultipleAccounts,
    refreshingAccountId,
    initializeCookieState,
    applySavedCookieToInput,
    applyCookieToNativeSession,
    persistCookieAfterSuccess,
    persistNativeCookieAfterSuccess,
    handleCookieFailure,
    clearSavedCookie,
    switchAccount,
    renameAccount,
    removeAccount,
    refreshAccounts,
    refreshAccountProfiles,
    refreshAccountWithStoken,
    refreshActiveAccount,
    refreshCookieAfterExpiry,
    checkActiveAccountOnStartup,
    saveStokenForAccount,
    loginNewAccountNative,
    submitNewAccountCookie
  }
}
