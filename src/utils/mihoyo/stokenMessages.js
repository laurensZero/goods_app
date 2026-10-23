/**
 * stoken 保活结果文案。
 *
 * 账号面板会在多个页面（账号导入、购物车导入、结算）复用，
 * 统一放在这里，避免某个页面漏接 saveStoken 后只显示笼统的“刷新失败”。
 */
export function stokenErrorMessage(t, result) {
  switch (result?.kind) {
    case 'auth':
      return result?.message
        ? `${t('import.stokenAuthFailed')}（${result.message}）`
        : t('import.stokenAuthFailed')
    case 'mismatch':
      return t('import.stokenMismatch')
    case 'missing-mid':
      return t('import.stokenMissingMid')
    case 'invalid-stoken':
      return t('import.stokenInvalid')
    case 'proxy':
      return t('import.stokenProxyUnavailable')
    case 'transient':
      return result?.message
        ? `${t('import.stokenTransient')}：${result.message}`
        : t('import.stokenTransient')
    case 'no-stoken':
      return t('import.stokenNotConfigured')
    default:
      return String(result?.message || t('import.stokenRefreshFailed'))
  }
}
