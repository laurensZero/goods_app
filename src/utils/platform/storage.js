import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const IS_NATIVE = Capacitor.isNativePlatform()

export async function readPersisted(key, fallback = null) {
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch {}
  }
  try {
    const value = localStorage.getItem(key)
    return value !== null ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * 持久化写入。返回 true 表示权威存储写入成功（原生端为 Preferences，Web 端为 localStorage）。
 * 原生端以 Preferences 为准：readPersisted 优先读取 Preferences，
 * 若仅 localStorage 写入成功，下次读取仍是旧值，等同于写入失败。
 * options.critical 为 true 时失败会抛错，用于数据关键路径中止操作。
 * @param {string} key
 * @param {string} value
 * @param {{ critical?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
export async function writePersisted(key, value, options = {}) {
  let localOk = false
  let lastError = null
  try {
    localStorage.setItem(key, value)
    localOk = true
  } catch (e) {
    lastError = e
  }
  let ok
  if (IS_NATIVE) {
    try {
      await Preferences.set({ key, value })
      ok = true
    } catch (e) {
      lastError = e
      ok = false
    }
  } else {
    ok = localOk
  }
  if (!ok) {
    console.error(`[storage] writePersisted failed for key "${key}":`, lastError)
    if (options.critical) {
      const err = new Error(`storage write failed: ${key}`)
      err.cause = lastError
      err.isStorageWriteError = true
      throw err
    }
  }
  return ok
}

export async function removePersisted(key) {
  try { localStorage.removeItem(key) } catch {}
  if (!IS_NATIVE) return
  try { await Preferences.remove({ key }) } catch {}
}

// ── 敏感值单点存储：原生端只存 Preferences，Web 端只存 localStorage ──
// 读取时做一次性迁移：原生端若 Preferences 缺失而 localStorage 有旧的明文副本，
// 则迁移到 Preferences 并删除 localStorage 副本（保证升级用户不丢登录态）

function purgeLocalCopy(key) {
  try { localStorage.removeItem(key) } catch {}
}

export async function readSecret(key, fallback = null) {
  if (!IS_NATIVE) {
    try {
      const value = localStorage.getItem(key)
      return value !== null ? value : fallback
    } catch {
      return fallback
    }
  }
  try {
    const { value } = await Preferences.get({ key })
    if (value !== null) {
      // Preferences 命中时顺手清理历史双写残留的 localStorage 副本
      purgeLocalCopy(key)
      return value
    }
  } catch {}
  // 旧版本明文副本迁移：仅在成功写入 Preferences 后才删除 localStorage 副本
  let legacy = null
  try { legacy = localStorage.getItem(key) } catch {}
  if (legacy !== null) {
    try {
      await Preferences.set({ key, value: legacy })
      purgeLocalCopy(key)
    } catch {}
    return legacy
  }
  return fallback
}

export async function writeSecret(key, value) {
  if (!IS_NATIVE) {
    try { localStorage.setItem(key, value) } catch {}
    return
  }
  try {
    await Preferences.set({ key, value })
    purgeLocalCopy(key)
  } catch {
    // Preferences 异常时退回 localStorage，避免丢失已保存的凭据
    try { localStorage.setItem(key, value) } catch {}
  }
}

export async function removeSecret(key) {
  try { localStorage.removeItem(key) } catch {}
  if (!IS_NATIVE) return
  try { await Preferences.remove({ key }) } catch {}
}
