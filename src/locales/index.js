import { createI18n } from 'vue-i18n'
import { Locale } from 'vant'
import enUS from 'vant/es/locale/lang/en-US'
import zhCN from 'vant/es/locale/lang/zh-CN'
import jaJP from 'vant/es/locale/lang/ja-JP'

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
import zhSurvey from './zh-CN/survey.json'
import zhSale from './zh-CN/sale.json'
import zhBirthday from './zh-CN/birthday.json'

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
import enSurvey from './en/survey.json'
import enSale from './en/sale.json'
import enBirthday from './en/birthday.json'

import jaCommon from './ja/common.json'
import jaNav from './ja/nav.json'
import jaGoods from './ja/goods.json'
import jaHome from './ja/home.json'
import jaSearch from './ja/search.json'
import jaManage from './ja/manage.json'
import jaEvents from './ja/events.json'
import jaRecharge from './ja/recharge.json'
import jaSync from './ja/sync.json'
import jaTheme from './ja/theme.json'
import jaImport from './ja/import.json'
import jaAbout from './ja/about.json'
import jaValidation from './ja/validation.json'
import jaStatus from './ja/status.json'
import jaToast from './ja/toast.json'
import jaLeaderboard from './ja/leaderboard.json'
import jaShare from './ja/share.json'
import jaTrash from './ja/trash.json'
import jaMy from './ja/my.json'
import jaGoodsGroup from './ja/goodsGroup.json'
import jaNotify from './ja/notify.json'
import jaSurvey from './ja/survey.json'
import jaSale from './ja/sale.json'
import jaBirthday from './ja/birthday.json'

import koCommon from './ko/common.json'
import koNav from './ko/nav.json'
import koGoods from './ko/goods.json'
import koHome from './ko/home.json'
import koSearch from './ko/search.json'
import koManage from './ko/manage.json'
import koEvents from './ko/events.json'
import koRecharge from './ko/recharge.json'
import koSync from './ko/sync.json'
import koTheme from './ko/theme.json'
import koImport from './ko/import.json'
import koAbout from './ko/about.json'
import koValidation from './ko/validation.json'
import koStatus from './ko/status.json'
import koToast from './ko/toast.json'
import koLeaderboard from './ko/leaderboard.json'
import koShare from './ko/share.json'
import koTrash from './ko/trash.json'
import koMy from './ko/my.json'
import koGoodsGroup from './ko/goodsGroup.json'
import koNotify from './ko/notify.json'
import koSurvey from './ko/survey.json'
import koSale from './ko/sale.json'
import koBirthday from './ko/birthday.json'

import zhTWCommon from './zh-TW/common.json'
import zhTWNav from './zh-TW/nav.json'
import zhTWGoods from './zh-TW/goods.json'
import zhTWHome from './zh-TW/home.json'
import zhTWSearch from './zh-TW/search.json'
import zhTWManage from './zh-TW/manage.json'
import zhTWEvents from './zh-TW/events.json'
import zhTWRecharge from './zh-TW/recharge.json'
import zhTWSync from './zh-TW/sync.json'
import zhTWTheme from './zh-TW/theme.json'
import zhTWImport from './zh-TW/import.json'
import zhTWAbout from './zh-TW/about.json'
import zhTWValidation from './zh-TW/validation.json'
import zhTWStatus from './zh-TW/status.json'
import zhTWToast from './zh-TW/toast.json'
import zhTWLeaderboard from './zh-TW/leaderboard.json'
import zhTWShare from './zh-TW/share.json'
import zhTWTrash from './zh-TW/trash.json'
import zhTWMy from './zh-TW/my.json'
import zhTWGoodsGroup from './zh-TW/goodsGroup.json'
import zhTWNotify from './zh-TW/notify.json'
import zhTWSurvey from './zh-TW/survey.json'
import zhTWSale from './zh-TW/sale.json'
import zhTWBirthday from './zh-TW/birthday.json'

const STORAGE_KEY = 'goods_locale'
const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko']
const DEFAULT_LOCALE = 'zh-CN'
const FALLBACK_LOCALE = 'zh-CN'

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored
  } catch {}

  const deviceLang = navigator.language || navigator.userLanguage || ''
  if (deviceLang.startsWith('zh-TW') || deviceLang.startsWith('zh-Hant')) return 'zh-TW'
  if (deviceLang.startsWith('zh')) return 'zh-CN'
  if (deviceLang.startsWith('en')) return 'en'
  if (deviceLang.startsWith('ja')) return 'ja'
  if (deviceLang.startsWith('ko')) return 'ko'

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
  ...zhNotify,
  ...zhSale,
  survey: zhSurvey,
  birthday: zhBirthday
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
  ...enNotify,
  ...enSale,
  survey: enSurvey,
  birthday: enBirthday
}

const jaMessages = {
  ...jaCommon,
  ...jaNav,
  ...jaGoods,
  ...jaHome,
  ...jaSearch,
  ...jaManage,
  ...jaEvents,
  ...jaRecharge,
  ...jaSync,
  ...jaTheme,
  ...jaImport,
  ...jaAbout,
  ...jaValidation,
  ...jaStatus,
  ...jaToast,
  ...jaLeaderboard,
  ...jaShare,
  ...jaTrash,
  ...jaMy,
  ...jaGoodsGroup,
  ...jaNotify,
  ...jaSale,
  survey: jaSurvey,
  birthday: jaBirthday
}

const koMessages = {
  ...koCommon,
  ...koNav,
  ...koGoods,
  ...koHome,
  ...koSearch,
  ...koManage,
  ...koEvents,
  ...koRecharge,
  ...koSync,
  ...koTheme,
  ...koImport,
  ...koAbout,
  ...koValidation,
  ...koStatus,
  ...koToast,
  ...koLeaderboard,
  ...koShare,
  ...koTrash,
  ...koMy,
  ...koGoodsGroup,
  ...koNotify,
  ...koSale,
  survey: koSurvey,
  birthday: koBirthday
}

const zhTWMessages = {
  ...zhTWCommon,
  ...zhTWNav,
  ...zhTWGoods,
  ...zhTWHome,
  ...zhTWSearch,
  ...zhTWManage,
  ...zhTWEvents,
  ...zhTWRecharge,
  ...zhTWSync,
  ...zhTWTheme,
  ...zhTWImport,
  ...zhTWAbout,
  ...zhTWValidation,
  ...zhTWStatus,
  ...zhTWToast,
  ...zhTWLeaderboard,
  ...zhTWShare,
  ...zhTWTrash,
  ...zhTWMy,
  ...zhTWGoodsGroup,
  ...zhTWNotify,
  ...zhTWSale,
  survey: zhTWSurvey,
  birthday: zhTWBirthday
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: {
    'zh-CN': zhCNMessages,
    'zh-TW': zhTWMessages,
    'en': enMessages,
    'ja': jaMessages,
    'ko': koMessages
  }
})

const VANT_LOCALE_MAP = {
  'zh-CN': { locale: 'zh-CN', messages: zhCN },
  'zh-TW': { locale: 'zh-TW', messages: zhCN }, // Vant 没有 zh-TW，回退到 zh-CN
  'en': { locale: 'en-US', messages: enUS },
  'ja': { locale: 'ja-JP', messages: jaJP },
  'ko': { locale: 'en-US', messages: enUS }, // Vant 没有 ko-KR，回退到 en-US
}

function syncVantLocale(locale) {
  const vantConfig = VANT_LOCALE_MAP[locale] || VANT_LOCALE_MAP['zh-CN']
  Locale.use(vantConfig.locale, vantConfig.messages)
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
