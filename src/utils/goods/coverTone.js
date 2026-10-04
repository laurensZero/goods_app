const CATEGORY_TONES = {
  '手办': 'figure',
  '挂件': 'charm',
  '立牌': 'standee',
  '徽章': 'badge',
  '卡牌': 'card',
  '卡片': 'card',
  '明信片': 'postcard',
  '色纸': 'shikishi',
  'CD/专辑': 'album',
  '服饰': 'apparel',
  '镭射票': 'ticket',
  '画集': 'artbook',
  '赠品': 'gift',
  '其他': 'other'
}

export const COVER_TONE_FALLBACK = 'other'

export const COVER_TONES = Object.freeze([
  'figure',
  'charm',
  'standee',
  'badge',
  'card',
  'postcard',
  'shikishi',
  'album',
  'apparel',
  'ticket',
  'artbook',
  'gift',
  'other'
])

export function getCoverTone(category) {
  const key = typeof category === 'string' ? category.trim() : ''
  return CATEGORY_TONES[key] || COVER_TONE_FALLBACK
}
