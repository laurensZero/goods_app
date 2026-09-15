// ── 展示用：只去【】括号和尾款，保留周年对应信息 ──
// 例："二周年贺图款" → "二周年贺图"   "兹白【预售，5月初】" → "兹白"
export function cleanVariantText(text) {
  if (!text) return text
  let s = text
  s = s.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
  s = s.replace(/预售[^、，,）)】]*/g, '').replace(/预计[^、，,）)】]*/g, '')
  s = s.replace(/^\s*[\/／]+\s*/g, '').replace(/\s*[\/／]+\s*$/g, '')
  s = s.trim()
  if (s.endsWith('款')) s = s.slice(0, -1)
  return s.trim() || text.trim()
}

// ── 从单条款式文本提取纯角色名 ──
// 例："兹白【预售，5月初】" → "兹白"   "钒离款" → "钒离"
export function extractCharName(text) {
  if (!text) return null
  let s = text
  s = s.replace(/【[^】]*】/g, '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
  s = s.replace(/^\s*[\/／]+\s*/g, '').replace(/\s*[\/／]+\s*$/g, '')
  s = s.trim()
  if (s.endsWith('款')) s = s.slice(0, -1)
  s = s.replace(/^[二三四五六七八九十]+周年/, '')  // 中文周年前缀
  s = s.replace(/^\d+周年/, '')                                       // 数字周年前缀
  s = s.replace(/^(纪念|联动|活动|限定|特别|典藏|豪华|普通|标准|完整|初始|全)/, '')
  s = s.trim()
  return s || null
}

// ── 从款式文本提取角色名 ──
export function extractCharsFromVariants(variants) {
  if (!variants?.length) return []
  const result = []
  for (const v of variants) {
    const text = typeof v === 'string' ? v : v.text
    const name = extractCharName(text)
    if (!name || name.length < 2 || name.length > 8) continue
    if (/^[A-Za-z0-9\s]+$/.test(name)) continue
    if (/^[ABCDEF]$/.test(name)) continue
    result.push(name)
  }
  return [...new Set(result)]
}

export function displayVariantText(text) {
  return preserveGenderQualifier(cleanVariantText(text), text)
}

export function normalizeCharacterName(text) {
  const name = displayVariantText(text).trim()
  return name.replace(/\s*([ABCD])$/i, '').trim()
}

export function preserveGenderQualifier(cleanedText, originalText) {
  const base = cleanedText?.trim() || ''
  const source = String(originalText || '')
  const match = source.match(/[（(]\s*(男|女|男女|男款|女款)\s*[）)]/)

  if (!match || !base) return base || source.trim()

  const qualifier = match[1]
  if (base.includes(`（${qualifier}）`) || base.includes(`(${qualifier})`)) {
    return base
  }

  return `${base}（${qualifier}）`
}

// ── 判断清洗后的文本是否像角色名 ──
const NON_CHAR_WORDS = [
  '贺图', '贺卡', '周年', '配色', '全套', '套组', '套装', '组合', '合集',
  '随机', '加购', '赠品', '礼盒', '礼品', '礼包', '福袋', '特典',
  '联名', '联动', '合作', '纪念', '限定', '典藏', '豪华', '版本',
  '白色', '黑色', '红色', '蓝色', '绿色', '黄色', '粉色', '紫色', '橙色', '棕色',
  '标准', '普通', '完整', '初始', '全部', '其他', '同款', '款', '新年', '年版'
]

export function isLikelyCharName(name) {
  if (!name) return false
  if (name.length < 1 || name.length > 8) return false
  if (/^[A-Za-z0-9\s]+$/.test(name)) return false      // 纯英数
  if (/^\d{4}年?$/.test(name)) return false            // 新增：2024 或 2024年
  if (/\d+周年/.test(name)) return false               // 新增：2周年等
  if (!/[一-鿿]/.test(name)) return false      // 必须含汉字
  if (NON_CHAR_WORDS.some(kw => name.includes(kw))) return false
  return true
}
