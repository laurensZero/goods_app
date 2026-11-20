#!/usr/bin/env node
/**
 * 从米哈游官方接口同步头像挂件清单到 Supabase。
 *
 * 数据源（2026-11 实测）：
 *   米游社   GET bbs-api.miyoushe.com/pendant/wapi/getUserPendantList   （需登录 Cookie）
 *   HoYoLAB  GET bbs-api-os.hoyolab.com/community/pendant/wapi/pendant/list/v2?type=1  （需登录 Cookie）
 *
 * 用法：
 *   MIYOUSHE_COOKIE='...' HOYOLAB_COOKIE='...' \
 *   SUPABASE_URL='https://api.goodsapp.de5.net' SUPABASE_SERVICE_ROLE_KEY='...' \
 *   node scripts/sync-mhy-decor.mjs
 *
 *   node scripts/sync-mhy-decor.mjs --emit-sql          # 只生成种子 SQL，不碰 Supabase
 *   node scripts/sync-mhy-decor.mjs --source miyoushe    # 只同步一边
 *   node scripts/sync-mhy-decor.mjs --dry-run            # 只打印差异
 *   node scripts/sync-mhy-decor.mjs --from-local         # 用本地 assets 快照（无 Cookie 时）
 *
 * 设计要点：
 * - 推送 payload **不含 enabled / mirror_url / thumb_url**，所以 on conflict 时不会把
 *   后台手工下架的条目重新启用、也不会清掉已回填的镜像列；新增行走列默认值。
 * - 源里消失的条目**不会**自动下架，只打印出来让人确认（官方活动挂件下架要人工判断）。
 * - 跨源去重：米游社条目优先保留（阿里 OSS 快、支持实时缩放），HoYoLAB 重复条目
 *   直接丢弃 —— 映射表与名字兜底逻辑在 supabase/functions/_shared/mhy-decor-shared.js，
 *   与线上 sync-mhy-decor Edge Function 共用。
 * - HoYoLAB 独占条目的图片镜像 / 缩略图由 scripts/mirror-mhy-decor.py 回填。
 * - 评论装扮（reply_bubble）目前国服没有独立接口，等 App 抓包后再加一个 source。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  HOYOLAB_GAME_NAMES,
  KNOWN_GAMES,
  dedupeDecorItems,
  guessMiyousheGame,
  normDecorName,
  resolveHyDuplicate
} from '../supabase/functions/_shared/mhy-decor-shared.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36'
const MIYOUSHE_API = 'https://bbs-api.miyoushe.com/pendant/wapi/getUserPendantList'
const HOYOLAB_API = 'https://bbs-api-os.hoyolab.com/community/pendant/wapi/pendant/list/v2'
const TABLE = 'mhy_decor_pendants'
const CHUNK = 200

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return fallback
  const next = process.argv[idx + 1]
  return next && !next.startsWith('--') ? next : 'true'
}

const SOURCE = arg('source', 'all')
const EMIT_SQL = process.argv.includes('--emit-sql')
const DRY_RUN = process.argv.includes('--dry-run')
const FROM_LOCAL = process.argv.includes('--from-local')
const SQL_OUT = resolve(process.cwd(), arg('out', 'supabase/mhy_decor_pendants_seed.sql'))

const MIYOUSHE_COOKIE = arg('miyoushe-cookie', process.env.MIYOUSHE_COOKIE || '')
const HOYOLAB_COOKIE = arg('hoyolab-cookie', process.env.HOYOLAB_COOKIE || '')
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** 去掉 OSS 处理参数 */
function stripProcess(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const idx = raw.indexOf('?')
  return idx === -1 ? raw : raw.slice(0, idx)
}

/** HoYoLAB 默认系列/未知归属兜底猜一次（名称里常带 IP 名，如「基础头像框-原神」） */
function guessHoyolabGame(rawGame, name, description = '') {
  const raw = String(rawGame || '').trim()
  if (KNOWN_GAMES.has(raw)) return raw
  const mapped = HOYOLAB_GAME_NAMES[raw]
  if (mapped && mapped !== '其他') return mapped
  return guessMiyousheGame({ name, description }) || '其他'
}

function log(...args) {
  console.log(...args)
}

// ---------------- 米游社 ----------------

async function fetchMiyoushe() {
  if (!MIYOUSHE_COOKIE) {
    log('[miyoushe] 没有 MIYOUSHE_COOKIE，跳过')
    return []
  }
  const res = await fetch(MIYOUSHE_API, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://www.miyoushe.com/',
      Cookie: MIYOUSHE_COOKIE
    }
  })
  const json = await res.json()
  if (json?.retcode !== 0) {
    throw new Error(`[miyoushe] retcode=${json?.retcode} ${json?.message || ''}`)
  }
  const list = json?.data?.list || []
  log(`[miyoushe] 拉到 ${list.length} 条`)

  return list.map((it) => {
    const game = guessMiyousheGame(it)
    return {
      id: `ms:${it.id}`,
      source: 'miyoushe',
      // 推不出来的先给「其他」，人工再改表
      game: game || '其他',
      name: String(it.name || '').trim(),
      description: String(it.description || '').trim(),
      url: stripProcess(it.url),
      animated: false,
      sort: Number(it.sort) || 0
    }
  }).filter((it) => it.url && it.name)
}

// ---------------- HoYoLAB ----------------

async function fetchHoyolab() {
  if (!HOYOLAB_COOKIE) {
    log('[hoyolab] 没有 HOYOLAB_COOKIE，跳过')
    return []
  }
  const url = new URL(HOYOLAB_API)
  url.searchParams.set('type', '1')
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://www.hoyolab.com/',
      Origin: 'https://www.hoyolab.com',
      Cookie: HOYOLAB_COOKIE,
      'x-rpc-language': 'zh-cn',
      'x-rpc-client_type': '4',
      'x-rpc-app_version': '1.5.0'
    }
  })
  const json = await res.json()
  if (json?.retcode !== 0) {
    throw new Error(`[hoyolab] retcode=${json?.retcode} ${json?.message || ''}`)
  }
  const groups = json?.data?.list || []
  const seen = new Set()
  const out = []
  for (const group of groups) {
    for (const it of group.list || []) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      const url0 = stripProcess(it.url || it.dark_url)
      if (!url0) continue
      out.push({
        id: `hy:${it.id}`,
        source: 'hoyolab',
        rawGame: String(it.game_name || '').trim(),
        game: guessHoyolabGame(it.game_name, String(it.title || '').trim()),
        name: String(it.title || '').trim(),
        description: '',
        url: url0,
        animated: it.live === true,
        sort: Number(it.sort) || 0
      })
    }
  }
  log(`[hoyolab] 拉到 ${out.length} 条（${groups.length} 个系列）`)
  return out
}

// ---------------- 本地抓取产物（--from-local） ----------------

function readLocalJson(path) {
  const full = resolve(process.cwd(), path)
  try {
    return JSON.parse(readFileSync(full, 'utf8'))
  } catch {
    log(`[local] 读不到 ${path}，跳过`)
    return null
  }
}

function fetchMiyousheLocal() {
  const data = readLocalJson('miyoushe_assets/manifest.json')
  if (!Array.isArray(data)) return []
  log(`[local] 米游社 ${data.length} 条`)
  return data.map((it) => ({
    id: `ms:${it.id}`,
    source: 'miyoushe',
    // 快照里的「其他」用最新关键词规则重猜一次（规则后来加过词，旧快照没享受到）
    game: it.game && it.game !== '其他' ? it.game : (guessMiyousheGame(it) || '其他'),
    name: String(it.name || '').trim(),
    description: String(it.description || '').trim(),
    url: stripProcess(it.url),
    animated: false,
    sort: Number(it.sort) || 0
  })).filter((it) => it.url && it.name)
}

function fetchHoyolabLocal() {
  const data = readLocalJson('hoyolab_assets/manifest.json')
  if (!Array.isArray(data)) return []
  log(`[local] HoYoLAB ${data.length} 条`)
  return data.map((it) => ({
    id: `hy:${it.id}`,
    source: 'hoyolab',
    rawGame: String(it.game || '').trim(),
    game: guessHoyolabGame(it.game, String(it.title || '').trim()),
    name: String(it.title || '').trim(),
    description: '',
    url: stripProcess(it.url),
    animated: it.live === true,
    sort: Number(it.sort) || 0
  })).filter((it) => it.url && it.name)
}

// ---------------- 输出 ----------------

function sqlText(value) {
  return `'${String(value == null ? '' : value).replace(/'/g, "''")}'`
}

function toSqlRow(it) {
  return `  (${sqlText(it.id)}, ${sqlText(it.source)}, ${sqlText(it.game)}, ${sqlText(it.name)}, ` +
    `${sqlText(it.description)}, ${sqlText(it.url)}, ${it.animated ? 'true' : 'false'}, ${Number(it.sort) || 0})`
}

function buildSeedSql(items) {
  const blocks = []
  for (let i = 0; i < items.length; i += CHUNK) {
    const rows = items.slice(i, i + CHUNK).map(toSqlRow).join(',\n')
    blocks.push(
      'INSERT INTO mhy_decor_pendants (id, source, game, name, description, url, animated, sort) VALUES\n' +
      rows +
      '\nON CONFLICT (id) DO UPDATE SET\n' +
      '  source = EXCLUDED.source,\n' +
      '  game = EXCLUDED.game,\n' +
      '  name = EXCLUDED.name,\n' +
      '  description = EXCLUDED.description,\n' +
      '  url = EXCLUDED.url,\n' +
      '  animated = EXCLUDED.animated,\n' +
      '  sort = EXCLUDED.sort,\n' +
      '  updated_at = now();\n'
    )
  }
  return [
    '-- 自动生成，勿手工编辑：node scripts/sync-mhy-decor.mjs --emit-sql',
    `-- 条目：${items.length}；注意：不会重置 enabled`,
    '',
    ...blocks
  ].join('\n')
}

async function pushToSupabase(items) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（或用 --emit-sql 只出 SQL）')
  }
  let pushed = 0
  for (let i = 0; i < items.length; i += CHUNK) {
    const rows = items.slice(i, i + CHUNK).map((it) => ({
      id: it.id,
      source: it.source,
      game: it.game,
      name: it.name,
      description: it.description,
      url: it.url,
      animated: it.animated,
      sort: it.sort,
      updated_at: new Date().toISOString()
    }))
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Supabase upsert 失败 ${res.status}: ${text.slice(0, 300)}`)
    }
    pushed += rows.length
    log(`  已推送 ${pushed}/${items.length}`)
  }
  return pushed
}

async function listRemoteIds() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  const ids = new Set()
  let from = 0
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?select=id&order=id.asc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Range: `${from}-${from + 999}`
        }
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) break
    for (const row of rows) ids.add(row.id)
    if (rows.length < 1000) break
    from += 1000
  }
  return ids
}

// ---------------- main ----------------

async function main() {
  const wantMiyoushe = SOURCE === 'all' || SOURCE === 'miyoushe'
  const wantHoyolab = SOURCE === 'all' || SOURCE === 'hoyolab'

  // 米游社先收集：跨源去重时 HoYoLAB 的重复条目并入米游社条目（OSS 快 + 支持缩放）
  const msItems = FROM_LOCAL
    ? (wantMiyoushe ? fetchMiyousheLocal() : [])
    : (wantMiyoushe ? await fetchMiyoushe() : [])
  let hyItems = FROM_LOCAL
    ? (wantHoyolab ? fetchHoyolabLocal() : [])
    : (wantHoyolab ? await fetchHoyolab() : [])

  // 跨源去重：静态映射（像素级核准）+ 归一化名兜底；映射目标不存在时不丢 HoYoLAB 条目
  if (wantMiyoushe && wantHoyolab && msItems.length) {
    const msIds = new Set(msItems.map((it) => it.id))
    const msIndex = new Map()
    for (const it of msItems) {
      const norm = normDecorName(it.name)
      const key = `${norm}|${it.game}`
      if (norm && !msIndex.has(key)) msIndex.set(key, it.id)
    }
    const before = hyItems.length
    hyItems = hyItems.filter((it) => {
      const dup = resolveHyDuplicate(it.id, it.rawGame, it.name, (n, g) => msIndex.get(`${n}|${g}`) || null)
      if (dup && msIds.has(dup)) return false
      return true
    })
    log(`跨源去重：HoYoLAB ${before} → ${hyItems.length}（并入米游社 ${before - hyItems.length} 条）`)
  }

  const merged = [...msItems, ...hyItems]
  if (!merged.length) {
    console.error('没有拉到任何条目：检查 Cookie / --source')
    process.exit(1)
  }

  // 官方目录会重复收录同一张图（不同 id / 不同名字），名字查重兜不住，按图片内容键再压一遍
  const items = dedupeDecorItems(merged)
  if (items.length !== merged.length) {
    log(`同图去重：${merged.length} → ${items.length}（丢掉 ${merged.length - items.length} 条）`)
  }

  items.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1
    if (a.game !== b.game) return a.game < b.game ? -1 : 1
    if (a.sort !== b.sort) return a.sort - b.sort
    return a.id < b.id ? -1 : 1
  })

  const unknownGame = items.filter((it) => it.game === '其他')
  log(`合计 ${items.length} 条（米游社 ${items.filter((x) => x.source === 'miyoushe').length} / ` +
    `HoYoLAB ${items.filter((x) => x.source === 'hoyolab').length}），动态 ${items.filter((x) => x.animated).length} 条`)
  if (unknownGame.length) {
    log(`⚠ ${unknownGame.length} 条游戏归属没推出来（game='其他'），需要人工改表：`)
    for (const it of unknownGame.slice(0, 20)) log(`   ${it.id}  ${it.name}`)
  }

  const remoteIds = await listRemoteIds()
  if (remoteIds) {
    const localIds = new Set(items.map((it) => it.id))
    const missing = [...remoteIds].filter((id) => !localIds.has(id))
    if (missing.length) {
      log(`⚠ 表里有 ${missing.length} 条源里没有（可能已下架，需人工确认，脚本不会自动禁用）：`)
      for (const id of missing.slice(0, 20)) log(`   ${id}`)
    }
  }

  if (DRY_RUN) {
    log('--dry-run：不改任何东西')
    return
  }

  if (EMIT_SQL) {
    writeFileSync(SQL_OUT, buildSeedSql(items), 'utf8')
    log(`已写入 ${SQL_OUT}`)
    return
  }

  await pushToSupabase(items)
  log(`完成：${items.length} 条已 upsert（enabled 保持不变）`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
