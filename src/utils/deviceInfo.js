// src/utils/deviceInfo.js
// 采集真实设备型号（供同步心跳 + 反馈设备日志展示）。
// 原生端用 @capacitor/device 的 Device.getInfo()，回退浏览器 userAgent 推断。
// 注意：原生端 OS 返回的 model 多为厂商内部型号代码（如 Xiaomi 的 23013RK75C），
// 不一定是「Xiaomi 14 Pro」这类营销名；Web 端常能在 UA 中解析出营销名。

import { Capacitor } from '@capacitor/core'

let cached = null

function parseWebUserAgent() {
  const ua = navigator.userAgent || ''
  // Android 网页：形如 "Android 14; Xiaomi 14 Pro Build/..."
  const android = ua.match(/Android\s[\d.]+;\s([^;]+?)\sBuild\//i)
  if (android) {
    return { manufacturer: '', model: android[1].trim(), label: android[1].trim() }
  }
  // iOS
  if (/iPhone/.test(ua)) return { manufacturer: 'Apple', model: 'iPhone', label: 'iPhone' }
  if (/iPad/.test(ua)) return { manufacturer: 'Apple', model: 'iPad', label: 'iPad' }
  // 桌面：取 OS + 浏览器
  let os = 'Web'
  if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  else if (/Android/.test(ua)) os = 'Android'
  return { manufacturer: '', model: os, label: os }
}

/**
 * 返回真实设备信息：{ manufacturer, model, label }。
 * label 为可直接展示的友好名（manufacturer + model 组合）。
 * 失败或取不到时返回空串占位，不抛错。
 */
export async function getDeviceInfo() {
  if (cached) return cached
  let info = { manufacturer: '', model: '', label: '' }
  try {
    if (Capacitor.isNativePlatform()) {
      const mod = await import('@capacitor/device')
      const Device = mod.Device
      const d = await Device.getInfo()
      info = {
        manufacturer: d?.manufacturer || '',
        model: d?.model || '',
        label: [d?.manufacturer, d?.model].filter(Boolean).join(' ').trim()
      }
    } else {
      info = parseWebUserAgent()
    }
  } catch (e) {
    try { info = parseWebUserAgent() } catch {}
  }
  cached = info
  return info
}

/** 同步读取缓存（无则触发展示空，等下次心跳补齐）。 */
export function getCachedDeviceLabel() {
  return cached?.label || ''
}
