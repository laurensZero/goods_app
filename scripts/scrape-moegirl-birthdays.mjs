// 从萌娘百科抓取热门 IP 角色生日，生成 character_birthdays 种子 SQL。
// 原理：Category:{M}月{D}日 列出当天生日的角色页；Category:{作品} 列出该作品的所有页面；
// 两边标题求交集 → (IP, 角色, 生日)，无需逐个打开角色页。
// 用法: node scripts/scrape-moegirl-birthdays.mjs
// 日期分类结果缓存在 /tmp/moe_days.json（重跑跳过约 370 个请求），SQL 输出到 stdout。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = 'https://zh.moegirl.org.cn'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const DAYS_CACHE = join(tmpdir(), 'moe_days.json')
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// 目标 IP：ip 写入库的名称（尽量与用户商品里的写法一致），categories 为萌百分类名候选（依次尝试）
const TARGET_IPS = [
  { ip: '蓝色监狱', aliases: ['ブルーロック', 'Blue Lock'], categories: ['蓝色监狱'] },
  { ip: '偶像梦幻祭', aliases: ['あんさんぶるスターズ!', 'Ensemble Stars', 'ES', '偶像梦幻祭2'], categories: ['偶像梦幻祭'] },
  { ip: '名侦探柯南', aliases: ['名探偵コナン', 'Detective Conan', '柯南'], categories: ['名侦探柯南'] },
  { ip: '进击的巨人', aliases: ['進撃の巨人', 'Attack on Titan', '巨人'], categories: ['进击的巨人'] },
  { ip: '催眠麦克风', aliases: ['ヒプノシスマイク', 'Hypnosis Mic', '催麦'], categories: ['催眠麦克风'] },
  { ip: '排球少年', aliases: ['ハイキュー!!', 'Haikyuu!!', '排球少年!!'], categories: ['排球少年!!', '排球少年'] },
  { ip: '咒术回战', aliases: ['呪術廻戦', 'Jujutsu Kaisen', '咒回'], categories: ['咒术回战'] },
  { ip: '鬼灭之刃', aliases: ['鬼滅の刃', 'Demon Slayer', '鬼灭'], categories: ['鬼灭之刃'] },
  { ip: '五等分的花嫁', aliases: ['五等分の花嫁', '五等分的新娘'], categories: ['五等分的花嫁', '五等分的新娘'] },
  { ip: '世界计划', aliases: ['プロジェクトセカイ', 'Project Sekai', 'pjsk', '世界计划 彩色舞台'], categories: ['世界计划 彩色舞台 feat.初音未来', '世界计划'] },
  { ip: 'LoveLive!', aliases: ['ラブライブ!', 'LL'], categories: ['LoveLive!系列', 'LoveLive!', 'LoveLive!Sunshine!!', 'LoveLive!虹咲学园学园偶像同好会', 'LoveLive!SuperStar!!'] },
  { ip: 'BanG Dream!', aliases: ['バンドリ!', '邦多利'], categories: ['BanG Dream!'] },
  { ip: '东京复仇者', aliases: ['東京卍リベンジャーズ', 'Tokyo Revengers', '东复'], categories: ['东京复仇者'] },
  { ip: '我推的孩子', aliases: ['推しの子', 'Oshi no Ko', '【我推的孩子】'], categories: ['我推的孩子', '【我推的孩子】'] },
  { ip: '黑子的篮球', aliases: ['黒子のバスケ', '黑篮'], categories: ['黑子的篮球'] },
  { ip: '网球王子', aliases: ['テニスの王子様', '新网球王子', '网王'], categories: ['网球王子', '新网球王子'] },
  { ip: 'Free!', aliases: ['Free!系列'], categories: ['Free!'] },
  { ip: 'BLEACH', aliases: ['死神', '境·界'], categories: ['BLEACH', '境·界'] },
  { ip: '全职猎人', aliases: ['HUNTER×HUNTER', '猎人'], categories: ['全职猎人', 'HUNTER×HUNTER'] },
  { ip: '辉夜大小姐想让我告白', aliases: ['かぐや様は告らせたい', '辉夜大小姐'], categories: ['辉夜大小姐想让我告白', '辉夜大小姐想让我告白～天才们的恋爱头脑战～'] },
  { ip: '天官赐福', aliases: ['TGCF'], categories: ['天官赐福'] },
  { ip: '全职高手', aliases: ['The King\'s Avatar'], categories: ['全职高手'] },
  { ip: '时光代理人', aliases: ['Link Click'], categories: ['时光代理人'] },
  { ip: '凹凸世界', aliases: ['AOTU'], categories: ['凹凸世界'] },
  { ip: '恋与制作人', aliases: ['恋与'], categories: ['恋与制作人'] },
  { ip: '恋与深空', aliases: ['Love and Deepspace', '深空'], categories: ['恋与深空'] },
  { ip: '光与夜之恋', aliases: ['光夜'], categories: ['光与夜之恋'] },
  { ip: '未定事件簿', aliases: ['未定', 'Tears of Themis'], categories: ['未定事件簿'] },
  { ip: '时空中的绘旅人', aliases: ['绘旅人'], categories: ['时空中的绘旅人'] },
  { ip: '第五人格', aliases: ['Identity V', '第五'], categories: ['第五人格'] },
  { ip: '阴阳师', aliases: ['Onmyoji'], categories: ['阴阳师'] },
  { ip: '王者荣耀', aliases: ['Honor of Kings', '王者'], categories: ['王者荣耀'] },
  { ip: '间谍过家家', aliases: ['SPY×FAMILY'], categories: ['间谍过家家'] },
  { ip: '链锯人', aliases: ['チェンソーマン', 'Chainsaw Man', '电锯人'], categories: ['链锯人', '电锯人'] },
  { ip: '葬送的芙莉莲', aliases: ['葬送のフリーレン', 'Frieren'], categories: ['葬送的芙莉莲'] },
  { ip: '文豪野犬', aliases: ['文豪ストレイドッグス', 'Bungo Stray Dogs', '文野'], categories: ['文豪野犬'] },
  { ip: '东京喰种', aliases: ['東京喰種', 'Tokyo Ghoul', '东京食尸鬼'], categories: ['东京喰种'] },
  { ip: 'JOJO的奇妙冒险', aliases: ['ジョジョの奇妙な冒険', 'JOJO'], categories: ['JOJO的奇妙冒险'] },
  { ip: '火影忍者', aliases: ['NARUTO', '火影'], categories: ['火影忍者'] },
  { ip: '海贼王', aliases: ['ONE PIECE', '航海王'], categories: ['ONE PIECE', '海贼王'] },
  { ip: '银魂', aliases: ['銀魂', 'Gintama'], categories: ['银魂'] },
  { ip: 'A3!', aliases: ['A3'], categories: ['A3!'] },
  { ip: '崩坏：星穹铁道', aliases: ['崩坏:星穹铁道', '星穹铁道', '星铁', '崩铁', 'Honkai: Star Rail', 'HSR'], categories: ['崩坏：星穹铁道'] },
  { ip: '明日方舟', aliases: ['Arknights', '方舟'], categories: ['明日方舟'] }
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchPage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      if (attempt === 2) throw e
      await sleep(1500 * (attempt + 1))
    }
  }
  return null
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

// 解析分类页 mw-pages 区块的成员标题与下一页链接
function parseCategoryPage(html) {
  const section = html.split('id="mw-pages"')[1]
  if (!section) return { titles: [], next: null }
  const endIndex = section.search(/id="catlinks"|printfooter/)
  const body = endIndex > 0 ? section.slice(0, endIndex) : section
  const titles = [...body.matchAll(/<a href="\/[^"]+" title="([^"]+)">/g)]
    .map((m) => decodeEntities(m[1]))
    .filter((t) => !/^(Category|Special|Template|User|Help|萌娘百科):/.test(t))
  const nextMatch = body.match(/<a href="([^"]*pagefrom=[^"]*)"[^>]*>[^<]*下一页/)
  return {
    titles: [...new Set(titles)],
    next: nextMatch ? decodeEntities(nextMatch[1]) : null
  }
}

async function fetchCategoryMembers(categoryName) {
  let url = `${BASE}/Category:${encodeURIComponent(categoryName)}`
  const members = []
  for (let page = 0; page < 10 && url; page++) {
    const html = await fetchPage(url)
    if (html === null) return page === 0 ? null : members
    const { titles, next } = parseCategoryPage(html)
    members.push(...titles)
    url = next ? (next.startsWith('http') ? next : BASE + next) : null
    await sleep(150)
  }
  return members
}

async function buildDayMap() {
  if (existsSync(DAYS_CACHE)) {
    console.error(`[cache] 使用 ${DAYS_CACHE}`)
    return new Map(Object.entries(JSON.parse(readFileSync(DAYS_CACHE, 'utf8'))))
  }
  const dayMap = new Map() // title -> [month, day]（同名多日期时保留首个）
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= MONTH_DAYS[month - 1]; day++) {
      const members = await fetchCategoryMembers(`${month}月${day}日`)
      for (const title of members || []) {
        if (!dayMap.has(title)) dayMap.set(title, [month, day])
      }
    }
    console.error(`[day] ${month} 月完成，累计 ${dayMap.size} 个角色`)
  }
  writeFileSync(DAYS_CACHE, JSON.stringify(Object.fromEntries(dayMap)))
  return dayMap
}

function sqlText(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function displayName(title) {
  // 剥掉消歧义用的「作品:」前缀与括号后缀
  return title.replace(/^[^:：]+[:：]/, '').replace(/\([^)]*\)$/, '').trim()
}

const dayMap = await buildDayMap()
const emittedRows = []

for (const target of TARGET_IPS) {
  // 角色页通常挂在「<作品>角色」分类下，作品主分类只兜底；全部候选合并成员
  const candidates = [...new Set([
    ...target.categories.map((c) => `${c}角色`),
    `${target.ip}角色`,
    ...target.categories
  ])]
  const memberSet = new Set()
  const usedCategories = []
  for (const category of candidates) {
    const members = await fetchCategoryMembers(category)
    if (members && members.length) {
      usedCategories.push(`${category}(${members.length})`)
      for (const title of members) memberSet.add(title)
    }
  }
  const members = [...memberSet]
  const usedCategory = usedCategories.join(' + ')
  if (!members.length) {
    console.error(`[skip] ${target.ip}: 分类不存在或为空（试过 ${candidates.join(' / ')}）`)
    continue
  }

  const rows = []
  const seenNames = new Set()
  for (const title of members) {
    const birth = dayMap.get(title)
    if (!birth) continue
    const name = displayName(title)
    if (!name || seenNames.has(name)) continue
    seenNames.add(name)
    const aliases = [...new Set([
      title !== name ? title : '',
      name.includes('·') ? name.replace(/·/g, '') : ''
    ].filter(Boolean))]
    rows.push({ name, aliases, month: birth[0], day: birth[1] })
  }

  if (!rows.length) {
    console.error(`[empty] ${target.ip}: 分类 ${usedCategory} 无生日交集`)
    continue
  }
  rows.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, 'zh-Hans-CN'))
  console.error(`[ok] ${target.ip}: ${rows.length} 个角色（分类 ${usedCategory}）`)

  emittedRows.push(`-- ${target.ip}（${rows.length} 行，数据来源 zh.moegirl.org.cn）`)
  for (const row of rows) {
    emittedRows.push(`(${sqlText(target.ip)}, ${sqlText(JSON.stringify(target.aliases))}, ${sqlText(row.name)}, ${sqlText(JSON.stringify(row.aliases))}, ${row.month}, ${row.day}, ''),`)
  }
}

console.log(`INSERT INTO character_birthdays (ip, ip_aliases, name, aliases, birth_month, birth_day, color) VALUES`)
console.log(emittedRows.join('\n').replace(/,$/, ''))
console.log('ON CONFLICT (ip, name) DO NOTHING;')
