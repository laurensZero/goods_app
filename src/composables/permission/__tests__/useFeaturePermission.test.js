import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 工厂里引用的 mock 必须用 vi.hoisted 提前构造
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  readPersisted: vi.fn(),
  writePersisted: vi.fn(),
  isLoggedIn: vi.fn()
}))

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  appLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    // init 在生产里等认证初始化；测试直接视为已完成
    init: vi.fn(async () => {}),
    isLoggedIn: h.isLoggedIn()
  })
}))
vi.mock('@/utils/supabase/auth', () => ({
  getSession: vi.fn(async () => ({ access_token: 'token-1' }))
}))
vi.mock('@/utils/sync/supabaseClient', () => ({
  getSupabaseClient: () => ({ functions: { invoke: h.invoke } })
}))
vi.mock('@/utils/platform/storage', () => ({
  readPersisted: (...args) => h.readPersisted(...args),
  writePersisted: (...args) => h.writePersisted(...args)
}))

import {
  checkFeaturePermission,
  checkFeaturePermissionState,
  useFeaturePermission
} from '../useFeaturePermission'

const FEATURE = 'beta'
const PERSIST_KEY = 'goods_feature_allowed_beta'

describe('checkFeaturePermissionState：三态（allowed / denied / unverified）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.isLoggedIn.mockReturnValue(true)
    h.readPersisted.mockResolvedValue('')
    h.writePersisted.mockResolvedValue(undefined)
    h.invoke.mockResolvedValue({ data: { allowed: true }, error: null })
    // 会话缓存是模块级 Map：跨用例必须清掉，否则前一个用例的结果会串场
    useFeaturePermission(FEATURE).reset()
  })

  it('未登录：确定性 denied，不发请求、不写持久化', async () => {
    h.isLoggedIn.mockReturnValue(false)

    const state = await checkFeaturePermissionState(FEATURE)

    expect(state).toBe('denied')
    expect(h.invoke).not.toHaveBeenCalled()
    expect(h.writePersisted).not.toHaveBeenCalled()
  })

  it('200 + allowed:true：allowed 并持久化 1；同会话复用缓存不再发请求', async () => {
    expect(await checkFeaturePermissionState(FEATURE)).toBe('allowed')
    expect(h.writePersisted).toHaveBeenCalledWith(PERSIST_KEY, '1')
    expect(h.invoke).toHaveBeenCalledTimes(1)

    expect(await checkFeaturePermissionState(FEATURE)).toBe('allowed')
    expect(h.invoke).toHaveBeenCalledTimes(1)
  })

  it('200 + allowed:false（无 transient reason）：确定性 denied 并持久化 0', async () => {
    h.invoke.mockResolvedValue({ data: { allowed: false }, error: null })

    const state = await checkFeaturePermissionState(FEATURE)

    expect(state).toBe('denied')
    expect(h.writePersisted).toHaveBeenCalledWith(PERSIST_KEY, '0')
  })

  it('200 + query_error：结果未知 unverified，不污染持久化，下次调用真正重试', async () => {
    h.invoke
      .mockResolvedValueOnce({ data: { allowed: false, reason: 'query_error' }, error: null })
      .mockResolvedValueOnce({ data: { allowed: true }, error: null })

    expect(await checkFeaturePermissionState(FEATURE)).toBe('unverified')
    // unverified 不写持久化（避免瞬时故障把「有权限」记录污染成「无权限」）
    expect(h.writePersisted).not.toHaveBeenCalled()

    // unverified 不被会话缓存焊死：第二次调用重新请求并成功
    expect(await checkFeaturePermissionState(FEATURE)).toBe('allowed')
    expect(h.invoke).toHaveBeenCalledTimes(2)
  })

  it('网络异常 + 持久化里有「有权限」：复用上次已知结果 allowed', async () => {
    h.invoke.mockRejectedValue(new Error('network down'))
    h.readPersisted.mockResolvedValue('1')

    expect(await checkFeaturePermissionState(FEATURE)).toBe('allowed')
    expect(h.writePersisted).not.toHaveBeenCalled()
  })

  it('网络异常 + 无历史结果：unverified；布尔包装层返回 false 保守处理', async () => {
    h.invoke.mockRejectedValue(new Error('network down'))
    h.readPersisted.mockResolvedValue('')

    expect(await checkFeaturePermissionState(FEATURE)).toBe('unverified')
    expect(await checkFeaturePermission(FEATURE)).toBe(false)
  })

  it('Edge Function 返回 FunctionsHttpError（error 非空）：视为结果未知', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } })

    expect(await checkFeaturePermissionState(FEATURE)).toBe('unverified')
  })

  it('并发调用共享同一请求：只 invoke 一次', async () => {
    h.invoke.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: { allowed: true }, error: null }), 5)))

    const [a, b] = await Promise.all([
      checkFeaturePermissionState(FEATURE),
      checkFeaturePermissionState(FEATURE)
    ])

    expect(a).toBe('allowed')
    expect(b).toBe('allowed')
    expect(h.invoke).toHaveBeenCalledTimes(1)
  })
})
