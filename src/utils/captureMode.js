// 程序截图模式：?capture=1 或 localStorage goods_capture_mode=1。
// 开启后抑制协议门禁、公告/生日/问卷弹窗、更新弹窗、推广横幅与各类 toast，
// 保证 puppeteer/自动化截图不被打扰；开启时持久化到 localStorage，hash 路由切换不丢失。
const STORAGE_KEY = 'goods_capture_mode'

let cached

function readQueryFlag() {
  try {
    const search = new URLSearchParams(window.location.search)
    if (search.has('capture')) {
      const value = search.get('capture')
      const on = value !== '0' && value !== 'false'
      try {
        if (on) window.localStorage.setItem(STORAGE_KEY, '1')
        else window.localStorage.removeItem(STORAGE_KEY)
      } catch { /* ignore */ }
      return on
    }
  } catch { /* ignore */ }
  return null
}

export function isCaptureMode() {
  if (cached !== undefined) return cached
  let on = readQueryFlag()
  if (on === null) {
    try {
      on = window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      on = false
    }
  }
  cached = !!on
  return cached
}
