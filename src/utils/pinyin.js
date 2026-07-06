// pinyin-pro 懒加载：首次调用时动态导入，后续走缓存
let _pinyinFn = null
let _pinyinPromise = null

function ensurePinyin() {
  if (!_pinyinFn && !_pinyinPromise) {
    _pinyinPromise = import('pinyin-pro').then((mod) => {
      _pinyinFn = mod.pinyin
    })
  }
  return _pinyinPromise
}

// 同步缓存：避免重复转换
const _searchTextCache = new Map()
const CACHE_LIMIT = 2000

function _cacheGet(key) {
  return _searchTextCache.get(key)
}

function _cacheSet(key, value) {
  if (_searchTextCache.size >= CACHE_LIMIT) {
    const firstKey = _searchTextCache.keys().next().value
    _searchTextCache.delete(firstKey)
  }
  _searchTextCache.set(key, value)
}

/**
 * 生成中文文本的拼音搜索字符串（同步）
 * 返回格式: "全拼\n首字母" (小写)
 * 例: "龙华花园" → "longhuayuan\nlhhy"
 *
 * 注意: 首次调用时 pinyin-pro 可能尚未加载完成，
 * 此时返回空字符串。后台加载完成后后续调用正常工作。
 */
export function toPinyinSearchText(text) {
  if (!text) return ''
  const str = String(text).trim()
  if (!str) return ''

  const cached = _cacheGet(str)
  if (cached !== undefined) return cached

  if (!_pinyinFn) {
    // pinyin-pro 尚未加载，触发后台加载，当前返回空
    ensurePinyin()
    return ''
  }

  const full = _pinyinFn(str, { toneType: 'none', type: 'array' }).join('')
  const initials = _pinyinFn(str, { pattern: 'first', toneType: 'none', type: 'array' }).join('')

  const result = `${full.toLowerCase()}\n${initials.toLowerCase()}`
  _cacheSet(str, result)
  return result
}

/**
 * 拼音感知的文本匹配（同步）
 * 支持: 原文子串匹配、全拼匹配、首字母匹配
 */
export function pinyinIncludes(haystack, keyword) {
  if (!keyword) return true
  if (!haystack) return false

  const lowerHaystack = haystack.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()

  // 原文子串匹配
  if (lowerHaystack.includes(lowerKeyword)) return true

  // 拼音匹配 — 只对包含中文的文本生效
  if (/[一-鿿]/.test(haystack)) {
    // 确保 pinyin-pro 在后台加载
    ensurePinyin()
    const cached = _cacheGet(haystack)
    if (cached && cached.includes(lowerKeyword)) return true
  }

  return false
}

/**
 * 预热拼音缓存（在搜索功能首次使用时调用）
 * 加载 pinyin-pro 并缓存常用文本
 */
export async function warmPinyinCache(texts) {
  await ensurePinyin()
  for (const text of texts) {
    if (text && /[一-鿿]/.test(text)) {
      toPinyinSearchText(text)
    }
  }
}
