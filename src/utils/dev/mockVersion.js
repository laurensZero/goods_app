import { Capacitor } from '@capacitor/core'
import { normalizeVersionTag } from '@/utils/github/release'

// 浏览器 dev 下模拟原生 app 版本号 / OTA bundle 版本号的工具。
// 用于测试按版本门控的逻辑（如公告 minAppVersion / bundleVersionRule）。
// 未手动指定时默认模拟"最新"版本，确保"最新"门控的公告/更新默认能被测到。

export const MOCK_APP_VERSION_KEY = 'goods_dev_mock_app_version'
export const MOCK_BUNDLE_VERSION_KEY = 'goods_dev_mock_bundle_version'

// 未指定时的默认值：一个比任何真实版本都大的版本号，等价于"最新"
const DEV_LATEST_VERSION = '9999.0.0'

export function isDevVersionMockEnabled() {
  return import.meta.env.DEV && !Capacitor.isNativePlatform()
}

function readOverride(key) {
  try {
    const raw = String(localStorage.getItem(key) || '').trim()
    if (!raw || raw === 'latest') return ''
    return normalizeVersionTag(raw)
  } catch {
    return ''
  }
}

export function resolveMockAppVersion() {
  if (!isDevVersionMockEnabled()) return null
  return readOverride(MOCK_APP_VERSION_KEY) || DEV_LATEST_VERSION
}

export function resolveMockBundleVersion() {
  if (!isDevVersionMockEnabled()) return null
  return readOverride(MOCK_BUNDLE_VERSION_KEY) || DEV_LATEST_VERSION
}
