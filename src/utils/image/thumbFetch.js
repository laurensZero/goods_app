// 缩略图请求的取数辅助：resize-image edge function 在函数内校验 apikey 头
// （公开 anon key，随 app 分发，不是机密），只有走该函数的请求需要携带；
// 其余图片（Storage 原图、外链）保持无自定义头，避免无谓的 CORS 预检。
import { SUPABASE_ANON_KEY } from '@/config/supabase'

export function getThumbFetchHeaders(url) {
  if (!String(url || '').includes('/functions/v1/resize-image')) return null
  return SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : null
}
