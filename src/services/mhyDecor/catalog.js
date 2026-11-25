// @ts-check
/**
 * 头像挂件清单（Supabase 表 `mhy_decor_pendants` 为准，本地只做缓存）。
 *
 * 为什么放云端：新增挂件只要往表里插一行，App 不用发版。
 * 图片本身不落库，表里只存米哈游 CDN 原始地址，展示时由
 * `utils/mhyDecor/cdn.js` 拼 `x-oss-process` 缩放参数。
 *
 * 读取顺序：内存 → Preferences 缓存（未过期）→ Supabase → 过期缓存。
 * 拿不到就是空目录（不做离线快照兜底）。
 */
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { pendantContentKey } from '@/utils/mhyDecor/cdn'

// v2：紧凑项新增 m/t（mirror_url/thumb_url），旧缓存结构没有这两个字段，直接换代
const CACHE_KEY = 'mhy_decor_catalog_v2'
/** 目录变更不频繁，6 小时够；强制刷新走 force */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const SELECT_COLUMNS =
  'id, source, game, name, description, url, mirror_url, thumb_url, animated, sort'

/**
 * @typedef {object} PendantItem
 * @property {string} i  id（'ms:10309' / 'hy:2048'）
 * @property {'miyoushe'|'hoyolab'} s 来源
 * @property {string} g 游戏
 * @property {string} n 名称
 * @property {string} d 描述
 * @property {string} u 原始 CDN 地址（不带 x-oss-process）
 * @property {string} m Supabase Storage 整图镜像（HoYoLAB 图的国内加速副本；米游社条目为空串）
 * @property {string} t 云端预压缩 128px 静态 webp（动图为首帧；米游社条目为空串）
 * @property {boolean} a 是否动图
 */

/** @type {PendantItem[] | null} */
let memo = null
/** @type {Promise<PendantItem[]> | null} */
let inflight = null

/**
 * 行 → 紧凑结构（调用方统一按 i/s/g/n/d/u/m/t/a 读，不用区分来源）。
 * 同时兼容两种入参：Supabase 行（id/source/game/…）和已缓存的紧凑项（i/s/g/…）。
 * @param {any} row
 * @returns {PendantItem | null}
 */
export function normalizePendantRow(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id ?? row.i ?? '').trim()
  const url = String(row.url ?? row.u ?? '').trim().split('?')[0]
  if (!id || !url) return null
  const source = row.source ?? row.s
  return {
    i: id,
    s: source === 'hoyolab' ? 'hoyolab' : 'miyoushe',
    g: String(row.game ?? row.g ?? '').trim() || '其他',
    n: String(row.name ?? row.n ?? '').trim(),
    d: String(row.description ?? row.d ?? '').trim(),
    u: url,
    // 镜像/缩略图由云端脚本回填，米游社条目两列为 ''；同样的地址规整（只留纯路径）
    m: String(row.mirror_url ?? row.m ?? '').trim().split('?')[0],
    t: String(row.thumb_url ?? row.t ?? '').trim().split('?')[0],
    a: (row.animated ?? row.a) === true
  }
}

/**
 * 同图去重时的保留优先级：动图 > 米游社 > 其他
 * @param {PendantItem} item
 */
function pendantScore(item) {
  return (item.a ? 2 : 0) + (item.s === 'miyoushe' ? 1 : 0)
}

/**
 * @param {any[]} rows
 * @returns {PendantItem[]}
 */
export function normalizePendantRows(rows) {
  const seenIds = new Set()
  /** @type {Map<string, number>} 图片内容键 → out 下标 */
  const byContent = new Map()
  const out = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizePendantRow(row)
    if (!item || seenIds.has(item.i)) continue
    seenIds.add(item.i)

    // 同一张图会被官方目录重复收录（不同 id / 不同名字，文件名 hash 相同）。
    // 只按 id 去重会漏，这里按内容键再压一遍；保留优先级与同步脚本一致：
    // 能播动画 > 米游社（阿里 OSS 国内直连快）> 先出现的。
    const key = pendantContentKey(item.u)
    const existing = byContent.get(key)
    if (existing !== undefined) {
      if (pendantScore(item) > pendantScore(out[existing])) out[existing] = item
      continue
    }
    byContent.set(key, out.length)
    out.push(item)
  }
  return out
}

/** @returns {Promise<{ fetchedAt: number, items: PendantItem[] } | null>} */
async function readCache() {
  try {
    const raw = await readPersisted(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const items = normalizePendantRows(parsed?.items)
    if (!items.length) return null
    return { fetchedAt: Number(parsed?.fetchedAt) || 0, items }
  } catch {
    return null
  }
}

/** @param {PendantItem[]} items */
async function writeCache(items) {
  try {
    await writePersisted(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), items }))
  } catch {
    // 缓存写失败不影响本次展示
  }
}

/** @returns {Promise<PendantItem[]>} */
async function fetchFromSupabase() {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('mhy_decor_pendants')
    .select(SELECT_COLUMNS)
    .eq('enabled', true)
    // sort 已编码米游社在前（ms 0..N / hy 100000..N），source 不再参与排序
    .order('game', { ascending: true })
    .order('sort', { ascending: true })

  if (error) throw new Error(error.message || '拉取头像挂件失败')
  return normalizePendantRows(data)
}

/**
 * 读取头像挂件清单。
 * @param {{ force?: boolean }} [options]
 *   force=true 跳过 TTL 与内存缓存直接请求云端（选择器「刷新」按钮用）。
 *   force 拉取失败/云端为空时行为不变——memo 回退旧缓存并抛错，
 *   调用方借此提示「已显示缓存数据」；非 force 保持静默，失败退缓存不抛。
 * @returns {Promise<PendantItem[]>}
 */
async function refreshPendantCatalog(cachedItems, { force = false } = {}) {
  if (inflight) return inflight
  inflight = (async () => {
    let fetched = null
    try {
      fetched = await fetchFromSupabase()
    } catch (e) {
      if (force) {
        memo = cachedItems || []
        throw e instanceof Error ? e : new Error(String(e))
      }
      return cachedItems || []
    }
    if (fetched && fetched.length) {
      memo = fetched
      await writeCache(fetched)
      return memo
    }
    memo = cachedItems || []
    if (force) throw new Error('????????')
    return memo
  })().finally(() => { inflight = null })
  return inflight
}

/** ????????????????????force ?????????? */
export async function loadPendantCatalog(options = {}) {
  if (options.force) {
    const cachedItems = memo || (await readCache())?.items || []
    return refreshPendantCatalog(cachedItems, { force: true })
  }
  if (memo) return memo
  if (inflight) return inflight
  const cached = await readCache()
  if (cached) {
    memo = cached.items
    if (Date.now() - cached.fetchedAt >= CACHE_TTL_MS) {
      // ?????????????????? memo ??????
      void refreshPendantCatalog(memo).catch(() => {})
    }
    return memo
  }
  return refreshPendantCatalog([])
}

/**
 * 按来源 + 游戏分组，保持表里的排序。
 * @param {PendantItem[]} items
 * @returns {{ source: string, game: string, items: PendantItem[] }[]}
 */
export function groupPendants(items) {
  /** @type {Map<string, { source: string, game: string, items: PendantItem[] }>} */
  const groups = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const key = `${item.s}|${item.g}`
    let group = groups.get(key)
    if (!group) {
      group = { source: item.s, game: item.g, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()]
}

/** 测试用：清掉内存缓存 */
export function resetPendantCatalogCache() {
  memo = null
  inflight = null
}
