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
import zhGoodsGroup from './zh-CN/goodsGroup.json'
import zhNotify from './zh-CN/notify.json'

import enCommon from './en/common.json'
import enNav from './en/nav.json'
import enGoods from './en/goods.json'
import enHome from './en/home.json'
import enSearch from './en/search.json'
import enManage from './en/manage.json'
import enEvents from './en/events.json'
import enRecharge from './en/recharge.json'
import enSync from './en/sync.json'
import enTheme from './en/theme.json'
import enImport from './en/import.json'
import enAbout from './en/about.json'
import enValidation from './en/validation.json'
import enStatus from './en/status.json'
import enToast from './en/toast.json'
import enLeaderboard from './en/leaderboard.json'
import enShare from './en/share.json'
import enTrash from './en/trash.json'
import enMy from './en/my.json'
import enGoodsGroup from './en/goodsGroup.json'
import enNotify from './en/notify.json'

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
  ...zhMy,
  ...zhGoodsGroup,
  ...zhNotify
}

const enMessages = {
  ...enCommon,
  ...enNav,
  ...enGoods,
  ...enHome,
  ...enSearch,
  ...enManage,
  ...enEvents,
  ...enRecharge,
  ...enSync,
  ...enTheme,
  ...enImport,
  ...enAbout,
  ...enValidation,
  ...enStatus,
  ...enToast,
  ...enLeaderboard,
  ...enShare,
  ...enTrash,
  ...enMy,
  ...enGoodsGroup,
  ...enNotify
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: {
    'zh-CN': zhCNMessages,
    'en': enMessages
  }
})

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
