// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'

// —— supabase 层 mock：auth store 走真实现，getUser 由测试控制 ——
const supabaseAuth = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  sendMagicLink: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(async () => {}),
  resetPassword: vi.fn(),
  verifyRecoveryOtp: vi.fn(),
  getAuthRedirectTo: vi.fn(() => ''),
  getEmailVerifyRedirectTo: vi.fn(() => ''),
  updateUserProfile: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
  handleAuthCallback: vi.fn(async () => {}),
  updatePassword: vi.fn(),
  getLinkedProviders: vi.fn(async () => []),
  linkOAuthProvider: vi.fn(),
  unlinkOAuthProvider: vi.fn(),
  deleteAccount: vi.fn(),
  // useFeaturePermission 旁路校验用：无 session 直接走 denied 分支，不打日志噪音
  getSession: vi.fn(async () => null)
}))
vi.mock('@/utils/supabase/auth', () => supabaseAuth)

const supabaseClient = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true),
  // useFeaturePermission 等旁路模块会取 client（失败被内部捕获），给个 no-op 消噪
  getSupabaseClient: vi.fn(() => ({ functions: { invoke: vi.fn(async () => { throw new Error('offline') }) } }))
}))
vi.mock('@/utils/sync/supabaseClient', () => supabaseClient)

// —— MyView 的重依赖逐个 mock（与挂件链路无关的都拦在外面） ——
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })
}))
vi.mock('@/utils/routeTransition', () => ({
  runWithRouteTransition: (fn) => fn()
}))
vi.mock('@/composables/scroll', () => ({
  usePageScroll: () => ({
    restore: vi.fn(async () => {}),
    clearStoredScrollState: vi.fn(),
    clearDisplayedScrollPosition: vi.fn()
  })
}))
vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(async () => ''),
  writePersisted: vi.fn(async () => true)
}))
vi.mock('@/utils/image/cache', () => ({
  getCachedImage: vi.fn(async () => null),
  peekCachedImage: vi.fn(() => null),
  preloadImages: vi.fn()
}))
vi.mock('@/utils/markdown', () => ({
  detectMarkdownContent: () => false,
  renderMarkdown: vi.fn(async () => ''),
  mountBiliEmbedEnhancers: vi.fn()
}))
vi.mock('@/composables/my/useBudgetCalculation', async () => {
  const { ref } = await import('vue')
  return {
    useBudgetCalculation: () => ({
      monthlyBudgetInput: ref(''),
      yearlyBudgetInput: ref(''),
      currentPeriodLabel: ref(''),
      currentYearLabel: ref(''),
      monthlyBudgetProgress: ref(0),
      yearlyBudgetProgress: ref(0),
      monthlyAverageSpend: ref(0),
      yearlyAverageSpend: ref(0),
      spendRangeMonths: ref(0),
      hasSpendingHistory: ref(false),
      applySuggestedBudget: vi.fn(),
      loadBudgetSettings: vi.fn(async () => {})
    })
  }
})
vi.mock('@/composables/my/useQrScanner', async () => {
  const { ref } = await import('vue')
  const noop = vi.fn()
  return {
    useQrScanner: () => ({
      scanning: ref(false),
      scanError: ref(''),
      showScanner: ref(false),
      scannerReady: ref(false),
      cameraActive: ref(false),
      nativeMode: ref(false),
      scannerVideoRef: ref(null),
      scannerCanvasRef: ref(null),
      scannerHint: ref(''),
      showWebLoginConfirm: ref(false),
      pendingWebLoginType: ref(''),
      pendingWebLoginName: ref(''),
      isApprovingWebLogin: ref(false),
      openScanner: noop,
      closeScanner: noop,
      handleScannerGallery: noop,
      onScannerVideoReady: noop,
      resetScannerState: noop,
      cancelWebLoginConfirm: noop,
      confirmWebLogin: noop
    })
  }
})
vi.mock('@/stores/sync', () => ({
  useSyncStore: () => ({
    init: vi.fn(async () => {}),
    lastSyncedAt: '',
    syncStatus: ''
  })
}))
vi.mock('@/stores/exchangeRate', () => ({
  useExchangeRateStore: () => ({
    error: '',
    loading: false,
    lastUpdated: null,
    fetchRates: vi.fn(async () => {})
  })
}))
vi.mock('@/stores/characterBirthday', () => ({
  useCharacterBirthdayStore: () => ({
    todayBirthdays: [],
    openDialog: vi.fn()
  })
}))
vi.mock('@/stores/announcement', () => ({
  useAnnouncementStore: () => ({
    allAnnouncements: [],
    changelogEntries: [],
    isBetaChannel: false,
    listLoading: false,
    listVisible: false,
    unreadCount: 0,
    listReadRecord: {},
    openList: vi.fn(),
    closeList: vi.fn(),
    fetchAllForList: vi.fn(async () => {}),
    fetchChangelog: vi.fn(async () => {}),
    markAllRead: vi.fn(),
    markOneRead: vi.fn()
  })
}))
vi.mock('@/stores/qqBinding', () => ({
  useQQBindingStore: () => ({
    isBound: false,
    isLoading: false,
    qqNickname: '',
    isInitialized: false,
    reset: vi.fn(),
    init: vi.fn(async () => {}),
    refreshBinding: vi.fn(async () => {})
  })
}))
// mihoyoFeatures store 保持真实实现：它只读写 localStorage，正好用来测开关门控

// —— 组件 stub：AppSheet 直渲染方便 find；frame 值透到 data-frame 上断言 ——
vi.mock('@/components/common/AppSheet.vue', () => ({
  default: {
    name: 'AppSheet',
    props: ['modelValue', 'sheetClass', 'size'],
    emits: ['update:modelValue', 'opened', 'closed'],
    template: '<div v-if="modelValue" class="stub-sheet"><slot /></div>'
  }
}))
vi.mock('@/components/common/MhyAvatarFrame.vue', () => ({
  default: {
    name: 'MhyAvatarFrame',
    props: ['avatar', 'frame', 'frameMirror', 'frameThumb', 'animated', 'size', 'alt', 'lazy', 'skeletonEnabled'],
    template: '<span class="stub-frame" :data-frame="frame" :data-mirror="frameMirror" :data-animated="String(animated)" />'
  }
}))
vi.mock('@/components/my/MhyDecorPickerSheet.vue', () => ({
  default: {
    name: 'MhyDecorPickerSheet',
    props: ['modelValue', 'pendant'],
    emits: ['update:modelValue', 'select'],
    template: '<div v-if="modelValue" class="stub-picker" />'
  }
}))
// 装扮角标（评论气泡）：门控在 MyView 调用点，桩掉只断言渲染与否 + pageKey 透传
vi.mock('@/components/common/MhyBubbleDeco.vue', () => ({
  default: {
    name: 'MhyBubbleDeco',
    props: ['pageKey'],
    template: '<span class="stub-bubble-deco" :data-page-key="pageKey" />'
  }
}))
vi.mock('@/components/common/SupabaseLoginDialog.vue', () => ({
  default: { name: 'SupabaseLoginDialog', props: ['modelValue'], emits: ['update:modelValue', 'login-success', 'toast'], template: '<div />' }
}))
vi.mock('@/components/common/AppToast.vue', () => ({
  default: { name: 'AppToast', props: ['message'], template: '<div />' }
}))
vi.mock('@/components/image/QuickImageEditorDialog.vue', () => ({
  default: { name: 'QuickImageEditorDialog', props: ['show', 'sourceFile', 'simpleMode'], emits: ['update:show', 'save'], template: '<div />' }
}))
vi.mock('@/components/my/QrScannerOverlay.vue', () => ({
  default: { name: 'QrScannerOverlay', props: ['modelValue'], emits: ['update:modelValue', 'close', 'gallery-pick', 'video-ready'], template: '<div />' }
}))
vi.mock('@/components/my/QQBindingSheet.vue', () => ({
  default: { name: 'QQBindingSheet', props: ['show'], emits: ['close', 'bound'], template: '<div />' }
}))

import MyView from '../MyView.vue'
import zhMy from '@/locales/zh-CN/my.json'
import zhCommon from '@/locales/zh-CN/common.json'
import zhNav from '@/locales/zh-CN/nav.json'
import zhBirthday from '@/locales/zh-CN/birthday.json'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': { ...zhMy, ...zhCommon, ...zhNav, ...zhBirthday } },
  missingWarn: false,
  fallbackWarn: false
})

const PENDANT = { i: 'ms:1', u: 'https://cdn/frame.png', t: 'https://cdn/frame.webp', m: 'https://mirror/frame.png', a: false, n: '温迪头像框' }

function userWithPendant(id = 'u-1') {
  return {
    id,
    email: 'a@b.c',
    // avatar_url 让 displayAvatarSrc 非空，MhyAvatarFrame（v-if）才会渲染
    user_metadata: { display_name: 'A', avatar_url: 'https://cdn/avatar.png', mhy_pendant: JSON.stringify(PENDANT) }
  }
}

function seedCachedUser(user) {
  localStorage.setItem('sb_auth_user', JSON.stringify(user))
}

/** 挂载 MyView 并等 init/refreshUser 链路收敛 */
async function mountView() {
  const wrapper = mount(MyView, {
    global: { plugins: [i18n] }
  })
  await flushPromises()
  return wrapper
}

let authStateCallback = null

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  supabaseClient.isSupabaseConfigured.mockReturnValue(true)
  supabaseAuth.onAuthStateChange.mockImplementation((cb) => {
    authStateCallback = cb
    return { unsubscribe: vi.fn() }
  })
  supabaseAuth.handleAuthCallback.mockResolvedValue(undefined)
})

describe('MyView 挂件接线', () => {
  it('挂载后 refreshUser 拉到的云端挂件反映到头像 frame 上（跨端同步收敛）', async () => {
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue(userWithPendant())

    const wrapper = await mountView()

    expect(wrapper.find('.stub-frame').attributes('data-frame')).toBe(PENDANT.u)
  })

  it('登录态变化（user.id 变化）时再次 refreshUser 并更新挂件', async () => {
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })

    const wrapper = await mountView()
    const callsAfterMount = supabaseAuth.getUser.mock.calls.length
    expect(callsAfterMount).toBeGreaterThan(0)

    // 离开 MyView 内部 10s 限频窗口后再触发换号登录
    const nowSpy = vi.spyOn(Date, 'now')
    const realNow = Date.now()
    nowSpy.mockReturnValue(realNow + 11_000)
    const newUser = userWithPendant('u-2')
    supabaseAuth.getUser.mockResolvedValue(newUser)
    authStateCallback('SIGNED_IN', { user: newUser, token_type: 'bearer', access_token: 't' })
    await flushPromises()
    nowSpy.mockRestore()

    expect(supabaseAuth.getUser.mock.calls.length).toBeGreaterThan(callsAfterMount)
    expect(wrapper.find('.stub-frame').attributes('data-frame')).toBe(PENDANT.u)
  })

  it('profile edit sheet 里的「编辑头像框」入口：先关弹层再开选择器', async () => {
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue(userWithPendant())

    const wrapper = await mountView()
    // 未打开时选择器不渲染
    expect(wrapper.find('.stub-picker').exists()).toBe(false)

    // 点名字旁的小铅笔打开用户信息编辑弹层
    await wrapper.find('.name-edit-btn').trigger('click')
    expect(wrapper.text()).toContain('编辑头像框')

    // 点击入口：profile edit sheet 关闭、挂件选择器打开
    await wrapper.findAll('button').find((b) => b.text() === '编辑头像框').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('编辑头像框')
    expect(wrapper.find('.stub-picker').exists()).toBe(true)
  })

  it('米游铺开关关闭：头像退化为纯头像，弹层入口不渲染；数据层照常收敛', async () => {
    localStorage.setItem('goods_mihoyo_features', JSON.stringify({ enabled: false }))
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue(userWithPendant())

    const wrapper = await mountView()

    // 展示层：frame/mirror 传空，等价于没选挂件
    expect(wrapper.find('.stub-frame').attributes('data-frame')).toBe('')
    expect(wrapper.find('.stub-frame').attributes('data-mirror')).toBe('')

    // 入口：profile edit sheet 里没有「编辑头像框」，其他按钮仍在
    await wrapper.find('.name-edit-btn').trigger('click')
    expect(wrapper.text()).not.toContain('编辑头像框')
    expect(wrapper.text()).toContain('更换头像')

    // 数据层不受开关影响：云端值照样写回本地镜像（writePersisted 被调用）
    const writeCalls = vi.mocked(await import('@/utils/platform/storage')).writePersisted
    expect(writeCalls.mock.calls.some(([key]) => key === 'goods_mhy_pendant')).toBe(true)
  })

  it('米游铺开关默认开启：行为与现状一致', async () => {
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue(userWithPendant())

    const wrapper = await mountView()

    expect(wrapper.find('.stub-frame').attributes('data-frame')).toBe(PENDANT.u)
    await wrapper.find('.name-edit-btn').trigger('click')
    expect(wrapper.text()).toContain('编辑头像框')
  })
})

describe('MyView 装扮角标接线（评论气泡 · 调用点门控）', () => {
  it('米游铺开关开启（默认）：账号面板渲染装扮角标并透传 pageKey=my', async () => {
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue(userWithPendant())

    const wrapper = await mountView()

    const deco = wrapper.find('.stub-bubble-deco')
    expect(deco.exists()).toBe(true)
    expect(deco.attributes('data-page-key')).toBe('my')
  })

  it('米游铺开关关闭：角标与编辑入口整棵不渲染（v-if；数据层不受影响）', async () => {
    localStorage.setItem('goods_mihoyo_features', JSON.stringify({ enabled: false }))
    seedCachedUser({ id: 'u-1', email: 'a@b.c', user_metadata: { avatar_url: 'https://cdn/avatar.png' } })
    supabaseAuth.getUser.mockResolvedValue(userWithPendant())

    const wrapper = await mountView()

    expect(wrapper.find('.stub-bubble-deco').exists()).toBe(false)
  })
})
