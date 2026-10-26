import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMihoyoCookieState } from '@/composables/import/useMihoyoCookieState'
import { canUseNativeMihoyoImport } from '@/utils/mihoyo/nativeImport'
import { stokenErrorMessage } from '@/utils/mihoyo/stokenMessages'

/**
 * 米游铺导入会话门：购物车导入（CartImportView）与订单导入（AccountImportView）
 * 共用的 Cookie/账号/启动/拉取流程。
 *
 * 两个视图的差异点通过 options 注入：
 * - fetchNative / fetchWeb：各自的数据源（原生插件会话 vs Web 接口），
 *   返回 { list, ...meta }（纯数组也兼容）；进度计数等视图私有状态由视图在闭包里自己维护
 * - onList：数据到达后的视图私有处理（赋值 raw 列表、初始化全选等）
 * - listStepName：成功后的步骤名（购物车 'list' / 订单 'orders'）
 * - fetchFailedKey：拉取失败弹窗标题的 i18n key
 * - isEmbedded / isEmbeddedActive：内嵌 tab 模式判定（延迟 bootstrap 用）
 */
export function useMihoyoImportSession({
  fetchNative,
  fetchWeb,
  onList,
  listStepName = 'list',
  fetchFailedKey = 'import.fetchCartFailed',
  isEmbedded = () => false,
  isEmbeddedActive = () => true,
} = {}) {
  const { t } = useI18n()

  const canUseNativeImport = canUseNativeMihoyoImport()

  // ── 步骤机：cookie → loading → (list|orders) → done ──
  const step = ref('cookie')
  const fetchRunning = ref(false)
  /** Cookie/账号状态是否已从本地加载完成 */
  const cookieStateReady = ref(false)
  const autoOpenedQr = ref(false)

  const {
    cookieInput,
    rememberCookie,
    hasSavedCookie,
    cookieValid,
    cookieWarningMessage,
    canAutoSubmitSavedCookie,
    accounts,
    activeAccountId,
    activeAccountLabel,
    activeAccountAvatar,
    refreshingAccountId,
    initializeCookieState,
    applySavedCookieToInput,
    applyCookieToNativeSession,
    persistCookieAfterSuccess,
    persistNativeCookieAfterSuccess,
    handleCookieFailure,
    switchAccount,
    removeAccount,
    refreshAccountProfiles,
    refreshAccountWithStoken,
    saveStokenForAccount,
    loginNewAccountNative,
    submitNewAccountCookie,
  } = useMihoyoCookieState()

  // ── 会话相关 UI 状态 ──
  const showAccountSheet = ref(false)
  const accountSheetRef = ref(null)
  const showQrLogin = ref(false)

  function openAccountSheet() {
    showAccountSheet.value = true
    void refreshAccountProfiles()
  }

  async function onQrLoginSuccess({ cookie } = {}) {
    const value = String(cookie || '').trim()
    if (!value) return
    cookieInput.value = value
    rememberCookie.value = true
    try {
      await submitNewAccountCookie(value, true)
    } catch {
      // 账号列表写入失败不阻断
    }
    await startFetch({ silentCookieExpired: true })
  }

  /**
   * 网页端必须填有效 Cookie 才能继续；
   * 安卓端留空表示走原生 WebView 登录，填了则必须是有效 Cookie。
   */
  const cookiePrimaryDisabled = computed(() => {
    if (!canUseNativeImport) return !cookieValid.value
    return Boolean(cookieInput.value.trim()) && !cookieValid.value
  })

  /** 网页版：状态加载完且无任何会话/账号时，才自动弹扫码 */
  watch(
    () => [
      step.value,
      canUseNativeImport,
      cookieStateReady.value,
      cookieValid.value,
      hasSavedCookie.value,
      accounts.value,
    ],
    ([nextStep, native, ready, valid, saved, accountList]) => {
      if (native) return
      const hasSession = valid || saved || (Array.isArray(accountList) && accountList.length > 0)
      if (hasSession) {
        if (autoOpenedQr.value) {
          showQrLogin.value = false
          autoOpenedQr.value = false
        }
        return
      }
      if (!ready) return
      if (nextStep !== 'cookie') return
      if (showQrLogin.value) return
      showQrLogin.value = true
      autoOpenedQr.value = true
    },
    { immediate: true },
  )

  // ── 错误弹窗 ──
  const showErrorDialog = ref(false)
  const errorDialogTitle = ref('')
  const errorDialogMessage = ref('')

  function openErrorDialog(title, message) {
    errorDialogTitle.value = title
    errorDialogMessage.value = String(message || '').trim() || t('import.unknownError')
    showErrorDialog.value = true
  }

  function closeErrorDialog() {
    showErrorDialog.value = false
  }

  // ── 启动：独立页面挂载即拉；内嵌预挂载等宿主激活 ──
  let didBootstrap = false
  /**
   * 视图已卸载：之后不再发起原生/网络拉取，也不再回调 onList。
   * 用户常在「加载中」直接退出，若继续跑，结果会在别的页面里做整表规整
   * （建导入上下文、全选、落盘），主线程被占住，表现为所有页面卡住划不动；
   * 安卓端还可能把登录 Activity 拉起到已经离开的页面上。
   */
  let disposed = false
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      disposed = true
    })
  }

  function scheduleBootstrap() {
    if (didBootstrap) return
    didBootstrap = true
    // 先让 Tab 显示切换完成首帧绘制，再读本地状态/拉数据
    requestAnimationFrame(() => {
      if (disposed) return
      void bootstrapCookieState()
    })
  }

  onMounted(() => {
    if (!isEmbedded()) scheduleBootstrap()
  })

  // 内嵌 tab：预挂载时不拉数据，宿主激活后再 bootstrap。
  // 必须放在会话门里统一处理，否则新接入的视图很容易漏掉这个 watch
  // （账号导入页就曾因此一直停在 cookie 步、账号列表不加载）。
  // 切离时顺手关掉弹层：内嵌视图的 AppSheet 会 Teleport 到 body，
  // 不跟着 tab 隐藏，留着会挡住整个页面（看起来像划不动）。
  function closeSessionOverlays() {
    showQrLogin.value = false
    showAccountSheet.value = false
    showErrorDialog.value = false
  }

  watch(
    () => isEmbeddedActive(),
    (active) => {
      if (!isEmbedded()) return
      if (active) {
        scheduleBootstrap()
      } else {
        closeSessionOverlays()
      }
    },
    { immediate: true }
  )

  async function bootstrapCookieState() {
    if (canUseNativeImport) {
      // 原生会话由插件管理；本地账号列表仍要读，切号面板与「记住 Cookie」才有状态
      await initializeCookieState()
      if (disposed) return
      // 原生登录本来就会持久化会话，默认勾选「记住」，登录后直接进账号列表
      rememberCookie.value = true
      cookieStateReady.value = true
      await startFetch({ silentCookieExpired: true })
      return
    }

    await initializeCookieState()
    if (disposed) return
    cookieStateReady.value = true

    if (!canAutoSubmitSavedCookie.value) return

    applySavedCookieToInput()
    await startFetch({ silentCookieExpired: true })
  }

  // ── 账号面板动作 ──
  function stokenErrorText(result) {
    return stokenErrorMessage(t, result)
  }

  async function onRefreshAccount(account) {
    try {
      const result = await refreshAccountWithStoken(account?.id, { force: true })
      if (result?.ok && !result.skipped) {
        accountSheetRef.value?.setNotice?.(t('import.stokenRefreshSuccess'), 'success')
        return
      }
      if (!result?.ok) {
        accountSheetRef.value?.setNotice?.(stokenErrorText(result), 'error')
      }
    } catch (error) {
      accountSheetRef.value?.setNotice?.(
        String(error?.message || t('import.stokenRefreshFailed')),
        'error'
      )
    }
  }

  async function onSwitchAccount(account) {
    const result = await switchAccount(account?.id)
    if (!result.ok) {
      openErrorDialog(t('import.switchAccount'), t('import.switchAccountFailed'))
      return
    }

    // 原生端 Cookie 未写入插件时：不要自动 startFetch（会用空/旧会话失败并误标失效）
    if (canUseNativeImport && !result.nativeApplied) {
      openErrorDialog(t('import.switchAccount'), t('import.switchAccountNativeHint'))
      return
    }

    cookieInput.value = result.cookie
    // 直接进 loading 拉新账号数据，避免 cookie 空页/清列表造成的白屏闪烁
    await startFetch({ silentCookieExpired: true })
  }

  async function onRemoveAccount(account) {
    await removeAccount(account?.id)
  }

  /** 登录/重登成功后：刷新当前数据源（不只在切换账号时） */
  async function refreshAfterMihoyoLogin(nextCookie) {
    cookieInput.value = String(nextCookie || '').trim()
    if (!cookieInput.value) {
      step.value = 'cookie'
      return
    }
    await startFetch({ silentCookieExpired: true })
  }

  async function onLoginNewNative() {
    const result = await loginNewAccountNative()
    accountSheetRef.value?.closeAll?.()
    if (!result.ok) {
      if (result.cancelled) return
      openErrorDialog(t('import.loginNewAccount'), result.unsupported
        ? t('import.loginNewAccountUnsupported')
        : (result.message || t('import.loginNewAccountFailed')))
      return
    }
    await refreshAfterMihoyoLogin(result.cookie)
  }

  async function onLoginNewCookie({ cookie, remember } = {}) {
    const result = await submitNewAccountCookie(cookie, remember)
    if (!result.ok) {
      openErrorDialog(t('import.loginNewAccount'), t('import.loginNewAccountFailed'))
      return
    }
    accountSheetRef.value?.closeAll?.()
    if (canUseNativeImport && result.nativeApplied === false) {
      // Cookie 只进了账号列表、没进原生会话：继续走原生导入会用到旧会话
      openErrorDialog(t('import.loginNewAccount'), t('import.cookieNativeUnsupported'))
      return
    }
    await refreshAfterMihoyoLogin(result.cookie)
  }

  // ── 拉取：统一原生/Web 分支、Cookie 失效处理与持久化 ──

  function normalizeFetchResult(result) {
    if (Array.isArray(result)) return { list: result, meta: {} }
    return { list: Array.isArray(result?.list) ? result.list : [], meta: result || {} }
  }

  const startFetch = async (options = {}) => {
    if (fetchRunning.value || disposed) return
    fetchRunning.value = true
    step.value = 'loading'
    const { silentCookieExpired = false } = options

    try {
      if (canUseNativeImport) {
        // 安卓端粘贴了 Cookie：先写进原生会话，再让插件用这份会话拉数据；
        // 留空则插件按自己的流程拉起 WebView 登录。
        if (cookieInput.value.trim()) {
          const applied = await applyCookieToNativeSession(cookieInput.value)
          if (disposed) return
          if (!applied.applied) {
            step.value = 'cookie'
            openErrorDialog(t('import.loginNewAccount'), t('import.cookieNativeUnsupported'))
            return
          }
        }

        // 卸载后不要再调插件：无 Cookie 时插件会拉起全屏登录 Activity
        if (disposed) return
        const { list, meta } = normalizeFetchResult(await fetchNative())
        if (disposed) return
        onList?.(list, meta)
        step.value = listStepName
        // 原生端导入成功后，同步 Cookie 到多账号存储
        await persistNativeCookieAfterSuccess({ remember: rememberCookie.value })
        return
      }

      const { list, meta } = normalizeFetchResult(await fetchWeb(cookieInput.value.trim()))
      // 结果到达时视图可能已经卸载：跳过整表规整/落盘，避免拖住当前页面
      if (disposed) return
      onList?.(list, meta)
      await persistCookieAfterSuccess()
      step.value = listStepName
    } catch (error) {
      if (disposed) return
      // 原生分支没有 Cookie 失效握手，直接报拉取失败
      if (canUseNativeImport) {
        openErrorDialog(t(fetchFailedKey), error?.message || t('import.confirmLoginRetry'))
        step.value = 'cookie'
        return
      }

      const cookieExpired = await handleCookieFailure(error)
      if (disposed) return
      if (cookieExpired) {
        step.value = 'cookie'
        if (!silentCookieExpired) {
          openErrorDialog(t('import.cookieExpired'), t('import.cookieExpiredDesc'))
        }
        return
      }

      openErrorDialog(t(fetchFailedKey), error?.message || t('import.retryLater'))
      step.value = 'cookie'
    } finally {
      // 任何分支（含 applyCookieToNativeSession 抛错）都必须解锁，否则按钮永久无响应
      fetchRunning.value = false
    }
  }

  return {
    // 步骤机
    step,
    fetchRunning,
    cookieStateReady,
    canUseNativeImport,
    bootstrapCookieState,
    scheduleBootstrap,
    startFetch,
    // Cookie/账号状态（useMihoyoCookieState 透传）
    cookieInput,
    rememberCookie,
    hasSavedCookie,
    cookieValid,
    cookieWarningMessage,
    canAutoSubmitSavedCookie,
    accounts,
    activeAccountId,
    activeAccountLabel,
    activeAccountAvatar,
    refreshingAccountId,
    applyCookieToNativeSession,
    initializeCookieState,
    applySavedCookieToInput,
    handleCookieFailure,
    switchAccount,
    removeAccount,
    refreshAccountWithStoken,
    saveStokenForAccount,
    loginNewAccountNative,
    submitNewAccountCookie,
    openAccountSheet,
    // 会话 UI
    showAccountSheet,
    accountSheetRef,
    showQrLogin,
    cookiePrimaryDisabled,
    onQrLoginSuccess,
    showErrorDialog,
    errorDialogTitle,
    errorDialogMessage,
    openErrorDialog,
    closeErrorDialog,
    onRefreshAccount,
    onSwitchAccount,
    onRemoveAccount,
    onLoginNewNative,
    onLoginNewCookie,
    stokenErrorText,
  }
}
