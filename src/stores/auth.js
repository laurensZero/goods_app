// src/stores/auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  signInWithEmail,
  signUpWithEmail,
  sendMagicLink,
  signInWithOAuth,
  signOut as supabaseSignOut,
  resetPassword,
  updateUserProfile,
  getUser,
  onAuthStateChange,
  handleAuthCallback
} from '@/utils/supabase/auth'
import { isSupabaseConfigured } from '@/utils/sync/supabaseClient'

const AUTH_USER_KEY = 'sb_auth_user'
let _pendingLoginSync = false

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const session = ref(null)
  const isLoading = ref(false)
  const error = ref('')
  const isInitialized = ref(false)
  let authSubscription = null

  const isLoggedIn = computed(() => !!user.value)
  const userEmail = computed(() => user.value?.email || '')
  const userDisplayName = computed(() =>
    user.value?.user_metadata?.display_name ||
    user.value?.user_metadata?.full_name ||
    user.value?.email?.split('@')[0] ||
    ''
  )
  const userAvatarUrl = computed(() =>
    user.value?.user_metadata?.avatar_url ||
    user.value?.user_metadata?.picture ||
    ''
  )

  function setUser(newUser) {
    user.value = newUser
    if (newUser) {
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify({
          id: newUser.id,
          email: newUser.email,
          user_metadata: newUser.user_metadata,
          app_metadata: newUser.app_metadata
        }))
      } catch { /* ignore */ }
    } else {
      try { localStorage.removeItem(AUTH_USER_KEY) } catch { /* ignore */ }
    }
  }

  function setSession(newSession) {
    session.value = newSession
  }

  function clearError() {
    error.value = ''
  }

  let wasConfigured = false

  async function init() {
    const configured = isSupabaseConfigured()

    // Already initialized with same config state — skip
    if (isInitialized.value && configured === wasConfigured) return

    // Not configured yet — just mark and return
    if (!configured) {
      isInitialized.value = true
      wasConfigured = false
      return
    }

    // 先从 localStorage 读缓存，立即显示登录状态
    if (!user.value) {
      try {
        const cached = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null')
        if (cached?.id) {
          user.value = cached
        }
      } catch { /* ignore */ }
    }

    // Clean up previous subscription if re-initializing
    if (authSubscription) {
      authSubscription.unsubscribe()
      authSubscription = null
    }

    // 处理 OAuth / Magic Link 回调中的 token
    try {
      await handleAuthCallback()
    } catch (e) {
      console.warn('[auth] handleAuthCallback failed:', e.message)
    }

    try {
      const currentUser = await getUser()
      setUser(currentUser)
    } catch {
      setUser(null)
    }

    authSubscription = onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user || null)
      // 登录成功后自动触发同步
      if (event === 'SIGNED_IN' && newSession?.user && _pendingLoginSync) {
        _pendingLoginSync = false
        setTimeout(async () => {
          try {
            const { useSyncStore } = await import('@/stores/sync')
            const syncStore = useSyncStore()
            if (syncStore.isSupabaseMode && syncStore.isSupabaseMode()) {
              syncStore.sync({ source: 'auth' }).catch(() => {})
            }
          } catch { /* ignore */ }
        }, 500)
      }
    })

    isInitialized.value = true
    wasConfigured = true
  }

  async function loginWithEmail(email, password) {
    isLoading.value = true
    error.value = ''
    try {
      const data = await signInWithEmail(email, password)
      _pendingLoginSync = true
      setSession(data.session)
      setUser(data.user)
      return data.user
    } catch (e) {
      error.value = e.message || '登录失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function registerWithEmail(email, password, metadata = {}) {
    isLoading.value = true
    error.value = ''
    try {
      const data = await signUpWithEmail(email, password, { metadata })
      // Supabase may return user without session if email confirmation is required
      if (data.session) {
        _pendingLoginSync = true
        setSession(data.session)
        setUser(data.user)
      }
      setUser(data.user)
      return data
    } catch (e) {
      error.value = e.message || '注册失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function loginWithMagicLink(email) {
    isLoading.value = true
    error.value = ''
    try {
      await sendMagicLink(email)
    } catch (e) {
      error.value = e.message || '发送失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function loginWithOAuth(provider) {
    isLoading.value = true
    error.value = ''
    try {
      const data = await signInWithOAuth(provider)
      _pendingLoginSync = true
      return data
    } catch (e) {
      error.value = e.message || '社交登录失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    isLoading.value = true
    error.value = ''
    try {
      await supabaseSignOut()
      setUser(null)
      setSession(null)
    } catch (e) {
      error.value = e.message || '退出失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function sendResetPassword(email) {
    isLoading.value = true
    error.value = ''
    try {
      await resetPassword(email)
    } catch (e) {
      error.value = e.message || '重置失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function updateProfile(attributes) {
    isLoading.value = true
    error.value = ''
    try {
      const data = await updateUserProfile(attributes)
      setUser(data.user)
      return data.user
    } catch (e) {
      error.value = e.message || '更新失败'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function dispose() {
    if (authSubscription) {
      authSubscription.unsubscribe()
      authSubscription = null
    }
  }

  return {
    user, session, isLoading, error, isInitialized,
    isLoggedIn, userEmail, userDisplayName, userAvatarUrl,
    init, loginWithEmail, registerWithEmail, loginWithMagicLink,
    loginWithOAuth, logout, sendResetPassword, updateProfile,
    clearError, dispose
  }
})
