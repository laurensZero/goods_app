import { createI18n } from 'vue-i18n'
import { Locale } from 'vant'
import { appLog } from '../utils/logger'
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
import zhAiChat from './zh-CN/aiChat.json'
import zhMcp from './zh-CN/mcp.json'
import zhSurvey from './zh-CN/survey.json'
import zhSale from './zh-CN/sale.json'
import zhBirthday from './zh-CN/birthday.json'
import zhCollage from './zh-CN/collage.json'

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

function mergeMessages(parts) {
  const {
    common,
    nav,
    goods,
    home,
    search,
    manage,
    events,
    recharge,
    sync,
    theme,
    import: importMsgs,
    about,
    validation,
    status,
    toast,
    leaderboard,
    share,
    trash,
    my,
    goodsGroup,
    notify,
    sale,
    mcp,
    aiChat,
    collage,
    survey,
    birthday
  } = parts

  return {
    ...common,
    ...nav,
    ...goods,
    ...home,
    ...search,
    ...manage,
    ...events,
    ...recharge,
    ...sync,
    ...theme,
    ...importMsgs,
    ...about,
    ...validation,
    ...status,
    ...toast,
    ...leaderboard,
    ...share,
    ...trash,
    ...my,
    ...goodsGroup,
    ...notify,
    ...sale,
    ...mcp,
    ...aiChat,
    ...collage,
    survey,
    birthday
  }
}

// 默认/回退语言同步打进入口；其余语言按需 import，避免 5 份语言包全进首包
const zhCNMessages = mergeMessages({
  common: zhCommon,
  nav: zhNav,
  goods: zhGoods,
  home: zhHome,
  search: zhSearch,
  manage: zhManage,
  events: zhEvents,
  recharge: zhRecharge,
  sync: zhSync,
  theme: zhTheme,
  import: zhImport,
  about: zhAbout,
  validation: zhValidation,
  status: zhStatus,
  toast: zhToast,
  leaderboard: zhLeaderboard,
  share: zhShare,
  trash: zhTrash,
  my: zhMy,
  goodsGroup: zhGoodsGroup,
  notify: zhNotify,
  sale: zhSale,
  mcp: zhMcp,
  aiChat: zhAiChat,
  collage: zhCollage,
  survey: zhSurvey,
  birthday: zhBirthday
})

const localeLoaders = {
  'zh-TW': async () => {
    const [
      common, nav, goods, home, search, manage, events, recharge, sync, theme,
      importMsgs, about, validation, status, toast, leaderboard, share, trash, my,
      goodsGroup, notify, sale, mcp, aiChat, collage, survey, birthday
    ] = await Promise.all([
      import('./zh-TW/common.json'),
      import('./zh-TW/nav.json'),
      import('./zh-TW/goods.json'),
      import('./zh-TW/home.json'),
      import('./zh-TW/search.json'),
      import('./zh-TW/manage.json'),
      import('./zh-TW/events.json'),
      import('./zh-TW/recharge.json'),
      import('./zh-TW/sync.json'),
      import('./zh-TW/theme.json'),
      import('./zh-TW/import.json'),
      import('./zh-TW/about.json'),
      import('./zh-TW/validation.json'),
      import('./zh-TW/status.json'),
      import('./zh-TW/toast.json'),
      import('./zh-TW/leaderboard.json'),
      import('./zh-TW/share.json'),
      import('./zh-TW/trash.json'),
      import('./zh-TW/my.json'),
      import('./zh-TW/goodsGroup.json'),
      import('./zh-TW/notify.json'),
      import('./zh-TW/sale.json'),
      import('./zh-TW/mcp.json'),
      import('./zh-TW/aiChat.json'),
      import('./zh-TW/collage.json'),
      import('./zh-TW/survey.json'),
      import('./zh-TW/birthday.json')
    ])
    return mergeMessages({
      common: common.default,
      nav: nav.default,
      goods: goods.default,
      home: home.default,
      search: search.default,
      manage: manage.default,
      events: events.default,
      recharge: recharge.default,
      sync: sync.default,
      theme: theme.default,
      import: importMsgs.default,
      about: about.default,
      validation: validation.default,
      status: status.default,
      toast: toast.default,
      leaderboard: leaderboard.default,
      share: share.default,
      trash: trash.default,
      my: my.default,
      goodsGroup: goodsGroup.default,
      notify: notify.default,
      sale: sale.default,
      mcp: mcp.default,
      aiChat: aiChat.default,
      collage: collage.default,
      survey: survey.default,
      birthday: birthday.default
    })
  },
  'en': async () => {
    const [
      common, nav, goods, home, search, manage, events, recharge, sync, theme,
      importMsgs, about, validation, status, toast, leaderboard, share, trash, my,
      goodsGroup, notify, sale, mcp, aiChat, collage, survey, birthday
    ] = await Promise.all([
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
      import('./en/my.json'),
      import('./en/goodsGroup.json'),
      import('./en/notify.json'),
      import('./en/sale.json'),
      import('./en/mcp.json'),
      import('./en/aiChat.json'),
      import('./en/collage.json'),
      import('./en/survey.json'),
      import('./en/birthday.json')
    ])
    return mergeMessages({
      common: common.default,
      nav: nav.default,
      goods: goods.default,
      home: home.default,
      search: search.default,
      manage: manage.default,
      events: events.default,
      recharge: recharge.default,
      sync: sync.default,
      theme: theme.default,
      import: importMsgs.default,
      about: about.default,
      validation: validation.default,
      status: status.default,
      toast: toast.default,
      leaderboard: leaderboard.default,
      share: share.default,
      trash: trash.default,
      my: my.default,
      goodsGroup: goodsGroup.default,
      notify: notify.default,
      sale: sale.default,
      mcp: mcp.default,
      aiChat: aiChat.default,
      collage: collage.default,
      survey: survey.default,
      birthday: birthday.default
    })
  },
  'ja': async () => {
    const [
      common, nav, goods, home, search, manage, events, recharge, sync, theme,
      importMsgs, about, validation, status, toast, leaderboard, share, trash, my,
      goodsGroup, notify, sale, mcp, aiChat, collage, survey, birthday
    ] = await Promise.all([
      import('./ja/common.json'),
      import('./ja/nav.json'),
      import('./ja/goods.json'),
      import('./ja/home.json'),
      import('./ja/search.json'),
      import('./ja/manage.json'),
      import('./ja/events.json'),
      import('./ja/recharge.json'),
      import('./ja/sync.json'),
      import('./ja/theme.json'),
      import('./ja/import.json'),
      import('./ja/about.json'),
      import('./ja/validation.json'),
      import('./ja/status.json'),
      import('./ja/toast.json'),
      import('./ja/leaderboard.json'),
      import('./ja/share.json'),
      import('./ja/trash.json'),
      import('./ja/my.json'),
      import('./ja/goodsGroup.json'),
      import('./ja/notify.json'),
      import('./ja/sale.json'),
      import('./ja/mcp.json'),
      import('./ja/aiChat.json'),
      import('./ja/collage.json'),
      import('./ja/survey.json'),
      import('./ja/birthday.json')
    ])
    return mergeMessages({
      common: common.default,
      nav: nav.default,
      goods: goods.default,
      home: home.default,
      search: search.default,
      manage: manage.default,
      events: events.default,
      recharge: recharge.default,
      sync: sync.default,
      theme: theme.default,
      import: importMsgs.default,
      about: about.default,
      validation: validation.default,
      status: status.default,
      toast: toast.default,
      leaderboard: leaderboard.default,
      share: share.default,
      trash: trash.default,
      my: my.default,
      goodsGroup: goodsGroup.default,
      notify: notify.default,
      sale: sale.default,
      mcp: mcp.default,
      aiChat: aiChat.default,
      collage: collage.default,
      survey: survey.default,
      birthday: birthday.default
    })
  },
  'ko': async () => {
    const [
      common, nav, goods, home, search, manage, events, recharge, sync, theme,
      importMsgs, about, validation, status, toast, leaderboard, share, trash, my,
      goodsGroup, notify, sale, mcp, aiChat, collage, survey, birthday
    ] = await Promise.all([
      import('./ko/common.json'),
      import('./ko/nav.json'),
      import('./ko/goods.json'),
      import('./ko/home.json'),
      import('./ko/search.json'),
      import('./ko/manage.json'),
      import('./ko/events.json'),
      import('./ko/recharge.json'),
      import('./ko/sync.json'),
      import('./ko/theme.json'),
      import('./ko/import.json'),
      import('./ko/about.json'),
      import('./ko/validation.json'),
      import('./ko/status.json'),
      import('./ko/toast.json'),
      import('./ko/leaderboard.json'),
      import('./ko/share.json'),
      import('./ko/trash.json'),
      import('./ko/my.json'),
      import('./ko/goodsGroup.json'),
      import('./ko/notify.json'),
      import('./ko/sale.json'),
      import('./ko/mcp.json'),
      import('./ko/aiChat.json'),
      import('./ko/collage.json'),
      import('./ko/survey.json'),
      import('./ko/birthday.json')
    ])
    return mergeMessages({
      common: common.default,
      nav: nav.default,
      goods: goods.default,
      home: home.default,
      search: search.default,
      manage: manage.default,
      events: events.default,
      recharge: recharge.default,
      sync: sync.default,
      theme: theme.default,
      import: importMsgs.default,
      about: about.default,
      validation: validation.default,
      status: status.default,
      toast: toast.default,
      leaderboard: leaderboard.default,
      share: share.default,
      trash: trash.default,
      my: my.default,
      goodsGroup: goodsGroup.default,
      notify: notify.default,
      sale: sale.default,
      mcp: mcp.default,
      aiChat: aiChat.default,
      collage: collage.default,
      survey: survey.default,
      birthday: birthday.default
    })
  }
}

const loadedLocales = new Set([DEFAULT_LOCALE])
const loadingLocales = new Map()

async function ensureLocaleMessages(locale) {
  if (!SUPPORTED_LOCALES.includes(locale) || loadedLocales.has(locale)) return

  if (!loadingLocales.has(locale)) {
    const loader = localeLoaders[locale]
    if (!loader) return
    const promise = loader()
      .then((messages) => {
        i18n.global.setLocaleMessage(locale, messages)
        loadedLocales.add(locale)
      })
      .finally(() => {
        loadingLocales.delete(locale)
      })
    loadingLocales.set(locale, promise)
  }

  await loadingLocales.get(locale)
}

// 缺 key 监控：同一 locale+key 只上报一次，避免重复渲染刷爆日志缓冲
const reportedMissingKeys = new Set()

function handleMissingKey(locale, key) {
  const cacheKey = `${locale}:${key}`
  if (reportedMissingKeys.has(cacheKey)) return
  reportedMissingKeys.add(cacheKey)

  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing key "${key}" in locale "${locale}"`)
  } else {
    appLog('warn', `i18n missing key: ${key} (${locale})`)
  }
}

const initialLocale = detectLocale()

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: FALLBACK_LOCALE,
  missing: (locale, key) => {
    handleMissingKey(locale, key)
  },
  messages: {
    'zh-CN': zhCNMessages
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

// 启动时若用户语言不是 zh-CN，后台预载对应语言包（不阻塞首屏）
const i18nReady = initialLocale === DEFAULT_LOCALE
  ? Promise.resolve()
  : ensureLocaleMessages(initialLocale).catch((error) => {
    appLog('warn', `i18n:preload-failed:${initialLocale}`, error)
  })

export async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return
  if (i18n.global.locale.value === locale) return

  await ensureLocaleMessages(locale)

  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  localStorage.setItem(STORAGE_KEY, locale)
  syncVantLocale(locale)
}

export function getLocale() {
  return i18n.global.locale.value
}

export { SUPPORTED_LOCALES, i18nReady }

syncVantLocale(initialLocale)

export default i18n
