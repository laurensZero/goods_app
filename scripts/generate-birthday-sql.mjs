// 从 nanoka.cc 抓取原神/绝区零角色生日并生成 character_birthdays 种子 SQL。
// 用法: node scripts/generate-birthday-sql.mjs <gi_char.html> <zzz_char.html> <zzz静态版本号>
// 示例: node scripts/generate-birthday-sql.mjs /tmp/gi_char.html /tmp/zzz_char.html "3.1.12+17625891"
import { readFileSync } from 'node:fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function extractEmbeddedMaps(html) {
  const maps = []
  for (const [, content] of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const outer = JSON.parse(content)
      if (typeof outer?.body !== 'string') continue
      const parsed = JSON.parse(outer.body)
      if (parsed && typeof parsed === 'object') maps.push(parsed)
    } catch { /* 非目标 script */ }
  }
  return maps
}

function sqlText(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function sqlAliases(list) {
  const unique = [...new Set(list.map((v) => String(v || '').trim()).filter(Boolean))]
  return sqlText(JSON.stringify(unique))
}

function makeRow(ip, ipAliases, name, aliases, month, day, color) {
  return `(${sqlText(ip)}, ${sqlAliases(ipAliases).replace(/^'|'$/g, "'")}, ${sqlText(name)}, ${sqlAliases(aliases)}, ${month}, ${day}, ${sqlText(color)})`
}

// ---- 原神 ----
const GI_ELEMENT_COLORS = {
  Fire: '#ff6640', Water: '#00b8ff', Wind: '#33d7a0', Electric: '#b380ff',
  Grass: '#9be53d', Ice: '#7fd8f0', Rock: '#ffb54a',
  Pyro: '#ff6640', Hydro: '#00b8ff', Anemo: '#33d7a0', Electro: '#b380ff',
  Dendro: '#9be53d', Cryo: '#7fd8f0', Geo: '#ffb54a'
}

function buildGiRows(html) {
  const map = extractEmbeddedMaps(html).find((m) => Object.values(m).some((c) => Array.isArray(c?.birth)))
  if (!map) throw new Error('gi: 未找到内嵌角色数据')
  const rows = []
  const seen = new Set()
  for (const c of Object.values(map)) {
    const [month, day] = Array.isArray(c?.birth) ? c.birth : []
    const zh = String(c?.zh || '').trim()
    // 旅行者生日由玩家自定，数据里的占位值不收录
    if (!zh || zh === '旅行者' || !month || !day || seen.has(zh)) continue
    seen.add(zh)
    rows.push({
      name: zh,
      aliases: [c.en, c.ja, c.ko],
      month,
      day,
      color: GI_ELEMENT_COLORS[c.element] || ''
    })
  }
  rows.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, 'zh-Hans-CN'))
  return rows.map((r) => makeRow('原神', ['Genshin Impact', 'Genshin'], r.name, r.aliases, r.month, r.day, r.color))
}

// ---- 绝区零 ----
const ZZZ_ELEMENT_COLORS = {
  物理: '#e8c832', 火: '#ff6640', 冰: '#7fd8f0', 电: '#b380ff',
  以太: '#fc79e6', 烈霜: '#7fd8f0', 玄墨: '#8d78e0'
}

async function buildZzzRows(html, version) {
  const map = extractEmbeddedMaps(html).find((m) => Object.values(m).some((c) => c && typeof c === 'object' && 'code' in c && 'zh' in c))
  if (!map) throw new Error('zzz: 未找到内嵌角色数据')
  const rows = []
  for (const [id, c] of Object.entries(map)) {
    const zh = String(c?.zh || '').trim()
    if (!zh) continue
    const url = `https://static.nanoka.cc/zzz/${encodeURIComponent(version)}/zh/character/${id}.json`
    let detail
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) { console.error(`skip ${id} ${zh}: HTTP ${res.status}`); continue }
      detail = await res.json()
    } catch (e) {
      console.error(`skip ${id} ${zh}: ${e.message}`)
      continue
    }
    const birthday = String(detail?.partner_info?.birthday || '').trim()
    const match = birthday.match(/^(\d{1,2})[/-](\d{1,2})$/)
    if (!match) { console.error(`skip ${id} ${zh}: no birthday (${birthday || 'empty'})`); continue }
    const month = Number(match[1])
    const day = Number(match[2])
    const fullName = String(detail?.partner_info?.full_name || '').trim()
    // 元素名部分带「属性」后缀（如「电属性」vs「物理」），统一剥掉再映射
    const elementName = String(Object.values(detail?.element_type || {})[0] || '').replace(/属性$/, '')
    rows.push({
      name: zh,
      aliases: [fullName !== zh ? fullName : '', c.en, c.ja, c.ko],
      month,
      day,
      color: ZZZ_ELEMENT_COLORS[elementName] || ''
    })
  }
  rows.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, 'zh-Hans-CN'))
  return rows.map((r) => makeRow('绝区零', ['Zenless Zone Zero', 'ZZZ'], r.name, r.aliases, r.month, r.day, r.color))
}

const [giHtmlPath, zzzHtmlPath, zzzVersion] = process.argv.slice(2)
const giRows = buildGiRows(readFileSync(giHtmlPath, 'utf8'))
const zzzRows = await buildZzzRows(readFileSync(zzzHtmlPath, 'utf8'), zzzVersion)

console.log(`-- 原神（${giRows.length} 行，数据来源 gi.nanoka.cc）`)
console.log(giRows.join(',\n') + ',')
console.log(`-- 绝区零（${zzzRows.length} 行，数据来源 zzz.nanoka.cc）`)
console.log(zzzRows.join(',\n') + ',')
