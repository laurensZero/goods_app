// src/utils/amap.js
// 高德地图 JS API 2.0 加载器（活动地图 EventMapView 使用）。
// key 与安全密钥来自高德开放平台「Web端(JS API)」应用；Web 服务 key（地理编码）在 Edge Function 侧。
// 两个值通过 Vite 环境变量注入（见 .env.local，已 gitignore），不落入源码仓库；
// 安全密钥通过全局 _AMapSecurityConfig 注入（v2.0 简易鉴权，无需代理服务器，且不出现在 URL 查询串）。

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || ''
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || ''
const AMAP_URL = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`

let amapPromise = null

/** 加载高德 JS API，返回全局 AMap 对象；已加载/加载中则复用同一实例 */
export function loadAmap() {
  if (typeof window === 'undefined') return Promise.reject(new Error('amap: no window'))
  if (window.AMap) return Promise.resolve(window.AMap)
  if (amapPromise) return amapPromise
  if (!AMAP_KEY || !AMAP_SECURITY_CODE) {
    return Promise.reject(new Error('amap: missing VITE_AMAP_KEY / VITE_AMAP_SECURITY_CODE (see .env.local)'))
  }
  amapPromise = new Promise((resolve, reject) => {
    // v2.0 简易鉴权：加载脚本前注入安全密钥（不拼在 URL 里，避免泄露到日志/Referer）
    window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
    const script = document.createElement('script')
    script.src = AMAP_URL
    script.async = true
    script.onload = () => resolve(window.AMap)
    script.onerror = () => {
      amapPromise = null
      reject(new Error('amap: script load failed'))
    }
    document.head.appendChild(script)
  })
  return amapPromise
}
