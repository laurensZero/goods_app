// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// —— supabase 层 mock：auth store 走真实现，getUser/updateUserProfile 由测试控制 ——
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
  getSession: vi.fn(async () => null)
}))
vi.mock('@/utils/supabase/auth', () => supabaseAuth)

const supabaseClient = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true),
  getSupabaseClient: vi.fn(() => ({ from: vi.fn() }))
}))
vi.mock('@/utils/sync/supabaseClient', () => supabaseClient)

// —— 本地持久层 mock（内存 Map，可断言写入内容） ——
const persisted = vi.hoisted(() => new Map())
vi.mock('@/utils/platform/storage', () => ({
  readPersisted: vi.fn(async (key) => (persisted.has(key) ? persisted.get(key) : null)),
  writePersisted: vi.fn(async (key, value) => { persisted.set(key, value) })
}))

import { useAuthStore } from '@/stores/auth'
import { useMhyBubblesStore, parseBubbleCompact, parseBubbleConfig, MHY_BUBBLE_PAGES } from '@/stores/mhyBubbles'

const BUBBLE_HOME = { i: 'msb:1', s: 'miyoushe', g: '原神', n: '可莉气泡', d: '', u: 'https://cdn/b1.png', bg: 'ffeeaa', gif: '', a: false, m: '', t: '' }
const BUBBLE_MY = { i: 'msb:2', s: 'miyoushe', g: '崩坏：星穹铁道', n: '三月七气泡', d: '', u: 'https://cdn/b2.png', bg: '', gif: 'https://cdn/b2.gif', a: true, m: '', t: '' }

function userWithBubbles(id = 'u-1', bubbles) {
  const metadata = { display_name: 'A' }
  // undefined = 没设过；显式传 null/字符串都原样带上
  if (bubbles !== undefined) metadata.mhy_bubbles = bubbles
  return { id, email: 'a@b.c', user_metadata: metadata }
}

async function loginAs(user) {
  localStorage.setItem('sb_auth_user', JSON.stringify(user))
  supabaseAuth.getUser.mockResolvedValue(user)
  const authStore = useAuthStore()
  await authStore.init()
  await flushPromises()
  return authStore
}

beforeEach(() => {
  localStorage.clear()
  persisted.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  supabaseClient.isSupabaseConfigured.mockReturnValue(true)
  supabaseAuth.getUser.mockResolvedValue(null)
  supabaseAuth.updateUserProfile.mockImplementation(async (attrs) => {
    // 与真实端点一致：updateUser 返回带新 metadata 的 user
    const cached = JSON.parse(localStorage.getItem('sb_auth_user') || 'null')
    return { user: { ...(cached || { id: 'u-1' }), user_metadata: { ...(cached?.user_metadata || {}), ...attrs } } }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseBubbleCompact / parseBubbleConfig', () => {
  it('紧凑项校验：缺 i/u 丢弃，字段规整', () => {
    expect(parseBubbleCompact(BUBBLE_HOME)).toEqual(BUBBLE_HOME)
    expect(parseBubbleCompact({ i: '', u: 'https://x/a.png' })).toBeNull()
    expect(parseBubbleCompact({ i: 'x', u: '' })).toBeNull()
    expect(parseBubbleCompact(null)).toBeNull()
    expect(parseBubbleCompact('junk')).toBeNull()
  })

  it('整体配置解析：只保留合法页面 key，缺失 key 一律 null', () => {
    const config = parseBubbleConfig(JSON.stringify({ home: BUBBLE_HOME, junk: { i: 'x', u: 'u' } }))
    expect(config.home).toEqual(BUBBLE_HOME)
    expect(config.my).toBeNull()
    expect(Object.keys(config).sort()).toEqual([...MHY_BUBBLE_PAGES].sort())
  })

  it('显式 null / undefined / 坏 JSON 返回 null（由调用方决定回退）', () => {
    expect(parseBubbleConfig(null)).toBeNull()
    expect(parseBubbleConfig(undefined)).toBeNull()
    expect(parseBubbleConfig('{bad json')).toBeNull()
    expect(parseBubbleConfig(42)).toBeNull()
  })
})

describe('useMhyBubblesStore · 配置收敛', () => {
  it('云端设过 mhy_bubbles：整体以云端为准，并镜像回本地缓存', async () => {
    persisted.set('goods_mhy_bubbles', JSON.stringify({ home: BUBBLE_MY })) // 本地旧值，应被云端覆盖
    await loginAs(userWithBubbles('u-1', JSON.stringify({ home: BUBBLE_HOME, my: null })))

    const store = useMhyBubblesStore()
    await store.restore()
    await flushPromises()

    expect(store.byPage.home).toEqual(BUBBLE_HOME)
    expect(store.byPage.my).toBeNull()
    // 云端收敛后本地镜像跟上（整体对象五个 key）
    const mirrored = JSON.parse(persisted.get('goods_mhy_bubbles'))
    expect(mirrored.home).toEqual(BUBBLE_HOME)
    expect(mirrored.my).toBeNull()
  })

  it('云端没设过（undefined）：退本地缓存，不写镜像', async () => {
    persisted.set('goods_mhy_bubbles', JSON.stringify({ my: BUBBLE_MY }))
    await loginAs(userWithBubbles('u-1', undefined))

    const store = useMhyBubblesStore()
    await store.restore()
    await flushPromises()

    expect(store.byPage.my).toEqual(BUBBLE_MY)
    expect(store.byPage.home).toBeNull()
  })

  it('refreshUser 拉到云端配置后，metadata watch 自动重新收敛（跨端传播）', async () => {
    // 先以「云端没设过」登录
    await loginAs(userWithBubbles('u-1', undefined))
    const store = useMhyBubblesStore()
    await store.restore()

    // 另一端设了气泡：refreshUser 拉回新 metadata
    supabaseAuth.getUser.mockResolvedValue(userWithBubbles('u-1', JSON.stringify({ home: BUBBLE_HOME })))
    await useAuthStore().refreshUser()
    await flushPromises()

    expect(store.byPage.home).toEqual(BUBBLE_HOME)
  })

  it('坏 JSON / 缺字段：该页当无气泡，不抛错', async () => {
    await loginAs(userWithBubbles('u-1', '{bad json'))
    const store = useMhyBubblesStore()
    await store.restore()
    await flushPromises()
    for (const key of MHY_BUBBLE_PAGES) expect(store.byPage[key]).toBeNull()
  })
})

describe('useMhyBubblesStore · 每页写入', () => {
  it('未登录：setPage 只写本地缓存，不打云端', async () => {
    const store = useMhyBubblesStore()
    await store.restore()

    await store.setPage('home', BUBBLE_HOME)
    const saved = JSON.parse(persisted.get('goods_mhy_bubbles'))
    expect(saved.home).toEqual(BUBBLE_HOME)
    expect(supabaseAuth.updateUserProfile).not.toHaveBeenCalled()
  })

  it('登录：setPage 同步云端，整体一个对象存五个 key', async () => {
    await loginAs(userWithBubbles('u-1', undefined))
    const store = useMhyBubblesStore()
    await store.restore()

    await store.setPage('home', BUBBLE_HOME)
    await store.setPage('my', BUBBLE_MY)

    expect(supabaseAuth.updateUserProfile).toHaveBeenCalledTimes(2)
    const payload = JSON.parse(supabaseAuth.updateUserProfile.mock.calls[1][0].mhy_bubbles)
    expect(payload.home).toEqual(BUBBLE_HOME)
    expect(payload.my).toEqual(BUBBLE_MY)
    expect(payload.wishlist).toBeNull()
    expect(payload.events).toBeNull()
    expect(payload.recharge).toBeNull()
  })

  it('清空某页：该页写显式 null（别的端能识别「已清空」）', async () => {
    await loginAs(userWithBubbles('u-1', JSON.stringify({ home: BUBBLE_HOME })))
    const store = useMhyBubblesStore()
    await store.restore()
    expect(store.byPage.home).toEqual(BUBBLE_HOME)

    await store.setPage('home', null)
    expect(store.byPage.home).toBeNull()
    const payload = JSON.parse(supabaseAuth.updateUserProfile.mock.calls[0][0].mhy_bubbles)
    expect(payload).toHaveProperty('home', null)
    const saved = JSON.parse(persisted.get('goods_mhy_bubbles'))
    expect(saved).toHaveProperty('home', null)
  })

  it('非法 pageKey 直接忽略', async () => {
    const store = useMhyBubblesStore()
    await store.restore()
    await store.setPage('unknown', BUBBLE_HOME)
    expect(store.byPage.unknown).toBeUndefined()
    expect(supabaseAuth.updateUserProfile).not.toHaveBeenCalled()
    expect(persisted.has('goods_mhy_bubbles')).toBe(false) // 不落库
  })

  it('云端同步失败时向上抛错（宿主据此弹 toast），本地已生效', async () => {
    await loginAs(userWithBubbles('u-1', undefined))
    supabaseAuth.updateUserProfile.mockRejectedValueOnce(new Error('offline'))
    const store = useMhyBubblesStore()
    await store.restore()

    await expect(store.setPage('events', BUBBLE_HOME)).rejects.toThrow('offline')
    expect(store.byPage.events).toEqual(BUBBLE_HOME) // 本地即写即生效
  })
})

describe('useMhyBubblesStore · ensureLoaded 跨端拉取', () => {
  it('已登录且本地无配置：ensureLoaded 触发一次 refreshUser', async () => {
    await loginAs(userWithBubbles('u-1', undefined))
    supabaseAuth.getUser.mockClear()
    const store = useMhyBubblesStore()
    await store.restore()

    // 走到限频窗口之外，确保不被前序测试的时间戳挡住
    const nowSpy = vi.spyOn(Date, 'now')
    const realNow = Date.now()
    nowSpy.mockReturnValue(realNow + 60_000)

    supabaseAuth.getUser.mockResolvedValue(userWithBubbles('u-1', JSON.stringify({ wishlist: BUBBLE_MY })))
    await store.ensureLoaded('wishlist')
    await flushPromises()

    expect(supabaseAuth.getUser).toHaveBeenCalledTimes(1)
    expect(store.byPage.wishlist).toEqual(BUBBLE_MY)
    nowSpy.mockRestore()
  })

  it('10s 限频窗口内第二次 ensureLoaded 不再打请求', async () => {
    await loginAs(userWithBubbles('u-1', undefined))
    supabaseAuth.getUser.mockClear()
    const store = useMhyBubblesStore()
    await store.restore()

    supabaseAuth.getUser.mockResolvedValue(userWithBubbles('u-1', undefined))
    await store.ensureLoaded('home')
    const callsAfterFirst = supabaseAuth.getUser.mock.calls.length

    await store.ensureLoaded('wishlist')
    await flushPromises()
    expect(supabaseAuth.getUser.mock.calls.length).toBe(callsAfterFirst)
  })

  it('本地已有配置时不打 refreshUser', async () => {
    persisted.set('goods_mhy_bubbles', JSON.stringify({ home: BUBBLE_HOME }))
    await loginAs(userWithBubbles('u-1', undefined))
    supabaseAuth.getUser.mockClear()
    const store = useMhyBubblesStore()
    await store.restore()

    await store.ensureLoaded('home')
    await flushPromises()
    expect(supabaseAuth.getUser).not.toHaveBeenCalled()
  })

  it('未登录时不打 refreshUser', async () => {
    const store = useMhyBubblesStore()
    await store.restore()
    await store.ensureLoaded('home')
    await flushPromises()
    expect(supabaseAuth.getUser).not.toHaveBeenCalled()
  })
})
