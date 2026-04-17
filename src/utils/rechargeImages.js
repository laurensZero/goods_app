import rechargeDistribution from '@/constants/recharge-options-distribution.json'

const GAME_LABEL_MAP = {
  hk4e_cn: '原神',
  hkrpg_cn: '星穹铁道',
  bh3_cn: '崩坏3',
  nap_cn: '绝区零'
}

export function normalizeRechargeItemName(name) {
  let text = String(name || '').trim().replace(/\s+/g, '')
  if (!text) return ''

  text = text.replace(/x\d+$/iu, '')
  text = text.replace(/^\d+创世结晶$/u, '创世结晶')
  text = text.replace(/^\d+菲林底片$/u, '菲林底片')
  return text.trim()
}

export function buildRechargeImageLookupKey(game, name, amount) {
  return `${String(game || '').trim()}::${normalizeRechargeItemName(name)}::${Number(amount || 0).toFixed(2)}`
}

export function buildRechargePresetImageMap(source = rechargeDistribution) {
  const map = new Map()
  const nameMap = new Map()

  for (const value of Object.values(source || {})) {
    const gameBiz = String(value?.gameBiz || '').trim()
    const gameLabel = GAME_LABEL_MAP[gameBiz] || gameBiz
    const options = Array.isArray(value?.options) ? value.options : []

    for (const option of options) {
      const name = normalizeRechargeItemName(String(option?.name || '').trim())
      const amount = Number(option?.amount || 0)
      const image = String(option?.image || '').trim()
      if (!gameLabel || !name || !Number.isFinite(amount) || amount <= 0 || !image) continue

      const key = buildRechargeImageLookupKey(gameLabel, name, amount)
      if (!map.has(key)) {
        map.set(key, image)
      }

      const nameKey = buildRechargeImageLookupKey(gameLabel, name, 0)
      if (!nameMap.has(nameKey)) {
        nameMap.set(nameKey, image)
      }
    }
  }

  return { map, nameMap }
}

const DEFAULT_PRESET_IMAGE_MAP = buildRechargePresetImageMap()

export function resolveRechargePresetImage(record, presetImageMap = DEFAULT_PRESET_IMAGE_MAP) {
  const game = String(record?.game || '').trim()
  const nameRaw = String(record?.itemName || '').trim()
  const name = normalizeRechargeItemName(nameRaw)
  const amount = Number(record?.amount || 0)
  if (!game || !name || !Number.isFinite(amount)) return ''

  const nameKey = buildRechargeImageLookupKey(game, name, 0)

  if (amount <= 0) {
    return presetImageMap.nameMap.get(nameKey) || ''
  }

  const candidates = [amount]
  const countMatch = nameRaw.match(/x(\d+)$/iu)
  if (countMatch) {
    const count = Number(countMatch[1])
    if (Number.isFinite(count) && count > 1) {
      const perUnit = amount / count
      if (Number.isFinite(perUnit) && perUnit > 0) {
        candidates.push(perUnit)
      }
    }
  }

  for (const candidateAmount of candidates) {
    const key = buildRechargeImageLookupKey(game, name, candidateAmount)
    const matched = presetImageMap.map.get(key)
    if (matched) return matched
  }

  return presetImageMap.nameMap.get(nameKey) || ''
}

function isLikelyImageUrl(url) {
  return typeof url === 'string' && /^(https?:)?\/\//i.test(url)
}

export function collectRechargeImageUrls(records = [], presetImageMap = DEFAULT_PRESET_IMAGE_MAP) {
  const urls = []
  const seen = new Set()

  for (const record of records || []) {
    const direct = String(record?.image || '').trim()
    const resolved = direct || resolveRechargePresetImage(record, presetImageMap)
    if (!isLikelyImageUrl(resolved) || seen.has(resolved)) continue
    seen.add(resolved)
    urls.push(resolved)
  }

  return urls
}
