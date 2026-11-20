// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// supabase 工具层整模块 mock：getUser 由每个用例控制，其余给 no-op 防止 import 报错
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
  deleteAccount: vi.fn()
}))
vi.mock('@/utils/supabase/auth', () => supabaseAuth)

const supabaseClient = vi.hoisted(() => ({ isSupabaseConfigured: vi.fn(() => true) }))
vi.mock('@/utils/sync/supabaseClient', () => supabaseClient)

import { useAuthStore } from '@/stores/auth'

const CACHED_USER = { id: 'u-1', email: 'a@b.c', user_metadata: { display_name: 'A' } }
// 模拟「设备 A 在别的端改过挂件」后的最新 user_metadata
const FRESH_USER = {
  id: 'u-1',
  email: 'a@b.c',
  user_metadata: { display_name: 'A', mhy_pendant: JSON.stringify({ i: 'ms:1', u: 'frame.png' }) }
}

function baseUser() {
  return { ...CACHED_USER, user_metadata: { ...CACHED_USER.user_metadata } }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  supabaseClient.isSupabaseConfigured.mockReturnValue(true)
})

describe('auth store refreshUser（多端 metadata 同步）', () => {
  it('拉取最新 user 写回 store，session 不动，本地缓存镜像同步更新', async () => {
    const store = useAuthStore()
    store.user = baseUser()
    store.session = { access_token: 'tok' }
    supabaseAuth.getUser.mockResolvedValue(FRESH_USER)

    await store.refreshUser()

    expect(supabaseAuth.getUser).toHaveBeenCalledTimes(1)
    expect(store.user.user_metadata.mhy_pendant).toBe(FRESH_USER.user_metadata.mhy_pendant)
    expect(store.session).toEqual({ access_token: 'tok' })
    const cached = JSON.parse(localStorage.getItem('sb_auth_user'))
    expect(cached.user_metadata.mhy_pendant).toBe(FRESH_USER.user_metadata.mhy_pendant)
  })

  it('失败静默：网络错误时保留本地缓存登录态，不抛错也不置空', async () => {
    const store = useAuthStore()
    store.user = baseUser()
    supabaseAuth.getUser.mockRejectedValue(Object.assign(new Error('network down'), { status: 0 }))

    await expect(store.refreshUser()).resolves.toBeNull()
    expect(store.user?.id).toBe('u-1')
    expect(store.user?.user_metadata?.mhy_pendant).toBeUndefined()
  })

  it('未登录时不发请求', async () => {
    const store = useAuthStore()
    store.user = null

    await store.refreshUser()

    expect(supabaseAuth.getUser).not.toHaveBeenCalled()
  })

  it('未配置 Supabase 时不发请求', async () => {
    supabaseClient.isSupabaseConfigured.mockReturnValue(false)
    const store = useAuthStore()
    store.user = baseUser()

    await store.refreshUser()

    expect(supabaseAuth.getUser).not.toHaveBeenCalled()
  })

  it('并发调用共享同一次 in-flight 请求', async () => {
    const store = useAuthStore()
    store.user = baseUser()
    let resolveGet
    supabaseAuth.getUser.mockImplementation(
      () => new Promise((resolve) => { resolveGet = resolve })
    )

    const p1 = store.refreshUser()
    const p2 = store.refreshUser()
    expect(supabaseAuth.getUser).toHaveBeenCalledTimes(1)
    resolveGet(FRESH_USER)
    await Promise.all([p1, p2])

    expect(supabaseAuth.getUser).toHaveBeenCalledTimes(1)
    expect(store.user.user_metadata.mhy_pendant).toBe(FRESH_USER.user_metadata.mhy_pendant)
  })

  it('请求期间被登出时不把登录态复活', async () => {
    const store = useAuthStore()
    store.user = baseUser()
    let resolveGet
    supabaseAuth.getUser.mockImplementation(
      () => new Promise((resolve) => { resolveGet = resolve })
    )

    const pending = store.refreshUser()
    store.user = null // 模拟 getUser 在途时用户点了退出
    resolveGet(FRESH_USER)
    await pending

    expect(store.user).toBeNull()
    expect(localStorage.getItem('sb_auth_user')).toBeNull()
  })
})
