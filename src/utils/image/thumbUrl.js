// 统一解析「缩略图 URL」：有 Supabase 后端时走 edge function 缩放，
// 否则原样返回原图。组件层用它作为 LazyCachedImage 的 src，并把原图作为 fallbackSrc，
// 这样即使 edge function 未部署也不会出现裂图。
import { useSyncStore } from '@/stores/sync'
import { isSupabaseConfigured } from '@/utils/sync/supabaseClient'

let cachedBackend = null

function getBackend() {
  if (!cachedBackend || typeof cachedBackend.getPhotoThumbUrl !== 'function') {
    try {
      const resolved = isSupabaseConfigured() ? useSyncStore().getCurrentBackend() : null
      if (resolved && typeof resolved.getPhotoThumbUrl === 'function') {
        cachedBackend = resolved
      }
    } catch {
      // 忽略，下次继续重试
    }
  }
  return cachedBackend
}

export function resolvePhotoThumbUrl(photo, { width = 400 } = {}) {
  const uri = String(photo?.uri || '').trim()
  if (!uri) return ''
  const be = getBackend()
  if (be && typeof be.getPhotoThumbUrl === 'function') {
    const thumb = be.getPhotoThumbUrl(photo, { width })
    if (thumb) return thumb
  }
  return uri
}
