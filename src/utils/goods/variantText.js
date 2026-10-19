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
// 常见谷子类型词：出现在 SKU / 款式文案里时代表品类而非角色名。
// 例：SKU 文本「毛巾A」→「毛巾」、「镭射闪卡」→ 都不应被当成角色。
// importResolver 复用它把这类词加入分类黑名单（同样用于 skuCharacters 兜底路径）。
export const MERCHANDISE_TYPE_WORDS = [
  '毛巾', '抱枕', '挂布', '毯子', '眼罩', '雨伞', '雨衣',
  '水杯', '杯子', '保温杯', '马克杯', '鼠标垫', '桌垫', '杯垫', '餐垫',
  '项链', '手链', '戒指', '耳钉', '耳环', '发夹', '发绳', '发饰', '胸针',
  '徽章', '吧唧', '手表', '手机壳', '挂绳', '钥匙扣', '挂件', '挂饰', '吊件',
  '摆件', '手办', '玩偶', '公仔', '毛绒', '冰箱贴', '立牌', '亚克力', '色纸',
  '明信片', '拍立得', '闪卡', '卡套', '卡砖', '贴纸', '海报', '挂画', '拼图',
  '文件夹', '笔记本', '便签', '台历', '帆布袋', '手提袋', '斜挎包', '背包',
  '口罩', '帽子', '围巾', '手套', '袜子',
  // 常见盲盒 / 应援 / 卡牌类
  '盲袋', '应援', '扇子', '挂毯', '卡册', '卡包', '票根', '镭射',
]

// 系列名（不是品类词，但同样不应被当成角色）
export const MERCHANDISE_SERIES_WORDS = [
  '妄想天使',
]

const NON_CHAR_WORDS = [
  '贺图', '贺卡', '周年', '配色', '全套', '套组', '套装', '组合', '合集',
  '随机', '加购', '赠品', '礼盒', '礼品', '礼包', '福袋', '特典',
  '联名', '联动', '合作', '纪念', '限定', '典藏', '豪华', '版本',
  '白色', '黑色', '红色', '蓝色', '绿色', '黄色', '粉色', '紫色', '橙色', '棕色',
  '标准', '普通', '完整', '初始', '全部', '其他', '同款', '款', '新年', '年版',
  ...MERCHANDISE_TYPE_WORDS,
  ...MERCHANDISE_SERIES_WORDS,
]

/**
 * 文本里是否含品类/系列词（用于「角色候选」的包含式判断）。
 * 注意：不检查纯英数、长度、必须含汉字等规则——那些是 isLikelyCharName 的职责，
 * 这里只回答「是不是谷子品类/系列文案」，避免误伤英文角色名。
 */
export function hasMerchandiseWord(text) {
  const name = String(text || '')
  if (!name) return false
  return MERCHANDISE_TYPE_WORDS.some((word) => name.includes(word))
    || MERCHANDISE_SERIES_WORDS.some((word) => name.includes(word))
}

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
