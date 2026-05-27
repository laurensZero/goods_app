import { createI18n } from 'vue-i18n'
import { Locale } from 'vant'
import enUS from 'vant/es/locale/lang/en-US'
import zhCN from 'vant/es/locale/lang/zh-CN'

import zhCommon from './zh-CN/common.json'
import zhNav from './zh-CN/nav.json'
import zhGoods from './zh-CN/goods.json'
import zhHome from './zh-CN/home.json'
import zhSearch from './zh-CN/search.json'
import zhManage from './zh-CN/manage.json'
import zhEvents from './zh-CN/events.json'
import zhRecharge from './zh-CN/recharge.json'
import zhSync from './zh-CN/sync.json'
import zhTheme from './zh-CN/theme.json'
import zhImport from './zh-CN/import.json'
import zhAbout from './zh-CN/about.json'
import zhValidation from './zh-CN/validation.json'
import zhStatus from './zh-CN/status.json'
import zhToast from './zh-CN/toast.json'
import zhLeaderboard from './zh-CN/leaderboard.json'
import zhShare from './zh-CN/share.json'
import zhTrash from './zh-CN/trash.json'
import zhMy from './zh-CN/my.json'

const STORAGE_KEY = 'goods_locale'
const SUPPORTED_LOCALES = ['zh-CN', 'en']
const DEFAULT_LOCALE = 'zh-CN'
const FALLBACK_LOCALE = 'zh-CN'

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored
  } catch {}

  const deviceLang = navigator.language || navigator.userLanguage || ''
  if (deviceLang.startsWith('zh')) return 'zh-CN'
  if (deviceLang.startsWith('en')) return 'en'

  return DEFAULT_LOCALE
}

const zhCNMessages = {
  ...zhCommon,
  ...zhNav,
  ...zhGoods,
  ...zhHome,
  ...zhSearch,
  ...zhManage,
  ...zhEvents,
  ...zhRecharge,
  ...zhSync,
  ...zhTheme,
  ...zhImport,
  ...zhAbout,
  ...zhValidation,
  ...zhStatus,
  ...zhToast,
  ...zhLeaderboard,
  ...zhShare,
  ...zhTrash,
  ...zhMy
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: {
    'zh-CN': zhCNMessages
  }
})

const messageLoaders = {
  en: () => Promise.all([
    import('./en/common.json'),
    import('./en/nav.json'),
    import('./en/goods.json'),
    import('./en/home.json'),
    import('./en/search.json'),
    import('./en/manage.json'),
    import('./en/events.json'),
    import('./en/recharge.json'),
    import('./en/sync.json'),
    import('./en/theme.json'),
    import('./en/import.json'),
    import('./en/about.json'),
    import('./en/validation.json'),
    import('./en/status.json'),
    import('./en/toast.json'),
    import('./en/leaderboard.json'),
    import('./en/share.json'),
    import('./en/trash.json'),
    import('./en/my.json')
  ]).then((modules) => Object.assign({}, ...modules.map((m) => m.default)))
}

function syncVantLocale(locale) {
  if (locale === 'en') {
    Locale.use('en-US', enUS)
  } else {
    Locale.use('zh-CN', zhCN)
  }
}

export async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  if (i18n.global.locale.value === locale) return

  if (!i18n.global.availableLocales.includes(locale)) {
    const messages = await messageLoaders[locale]()
    i18n.global.setLocaleMessage(locale, messages)
  }

  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  localStorage.setItem(STORAGE_KEY, locale)
  syncVantLocale(locale)
}

export function getLocale() {
  return i18n.global.locale.value
}

export { SUPPORTED_LOCALES }

syncVantLocale(detectLocale())

export default i18n
