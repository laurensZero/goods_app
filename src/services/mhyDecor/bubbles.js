// @ts-check
/**
 * 评论装扮气泡清单（Supabase 表 `mhy_reply_bubbles` 为准，本地只做缓存）。
 *
 * 与 `catalog.js`（头像挂件）同构：新增气泡只往表里插一行，App 不用发版。
 * 差异点：
 * - 气泡有独立的 `gif_url`（动图地址）和 `bg_color`（底色），紧凑项带 bg/gif 出来；
 * - `pag_url`（SVGA 动图）Web 放不了，不进紧凑项；
 * - `gif_url` 不剥查询参数：它是直接播放的地址，不会再拼 x-oss-process。
 *
 * 读取顺序：内存 → Preferences 缓存（未过期）→ Supabase → 过期缓存。
 * 拿不到就是空目录（不做离线快照兜底）。
 */
import { getSupabaseClient } from '@/utils/sync/supabaseClient'
import { readPersisted, writePersisted } from '@/utils/platform/storage'

const CACHE_KEY = 'mhy_bubble_catalog_v1'
/** 目录变更不频繁，6 小时够；强制刷新走 force */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const SELECT_COLUMNS =
  'id, source, game, name, description, url, bg_color, gif_url, pag_url, animated, sort, mirror_url, thumb_url'

/**
 * @typedef {object} BubbleItem
 * @property {string} i  id（'msb:xxx'）
 * @property {'miyoushe'|'hoyolab'} s 来源
 * @property {string} g 游戏（官方中文名 IP 归属）
 * @property {string} n 名称
 * @property {string} d 描述
 * @property {string} u 静态底图（透明 PNG，不带 x-oss-process）
 * @property {string} bg 底色 hex（无 #，可空串）
 * @property {string} gif 动图地址（多数为空串；有值 = 可播动图）
 * @property {boolean} a 是否动图
 * @property {string} m Supabase Storage 整图镜像（回填中，可能为空串）
 * @property {string} t 云端预压缩 128px 静态 webp（回填中，可能为空串）
 */

/** @type {BubbleItem[] | null} */
let memo = null
/** @type {Promise<BubbleItem[]> | null} */
let inflight = null

/**
 * 行 → 紧凑结构（调用方统一按 i/s/g/n/d/u/bg/gif/a/m/t 读，不用区分来源）。
 * 同时兼容两种入参：Supabase 行（id/source/game/…）和已缓存的紧凑项（i/s/g/…）。
 * @param {any} row
 * @returns {BubbleItem | null}
 */
export function normalizeBubbleRow(row) {
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
    // 底色存的 hex 无 #，个别脏数据可能带 #，统一剥掉
    bg: String(row.bg_color ?? row.bg ?? '').trim().replace(/^#/, ''),
    // gif 直接播放、不拼缩放参数，所以不剥查询参数（保留可能的签名/版本串）
    gif: String(row.gif_url ?? row.gif ?? '').trim(),
    a: (row.animated ?? row.a) === true,
    // 镜像/缩略图由云端脚本回填，可能为 ''；同样的地址规整（只留纯路径）
    m: String(row.mirror_url ?? row.m ?? '').trim().split('?')[0],
    t: String(row.thumb_url ?? row.t ?? '').trim().split('?')[0]
  }
}

/**
 * @param {any[]} rows
 * @returns {BubbleItem[]}
 */
export function normalizeBubbleRows(rows) {
  const seen = new Set()
  const out = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeBubbleRow(row)
    if (!item || seen.has(item.i)) continue
    seen.add(item.i)
    out.push(item)
  }
  return out
}

/** @returns {Promise<{ fetchedAt: number, items: BubbleItem[] } | null>} */
async function readCache() {
  try {
    const raw = await readPersisted(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const items = normalizeBubbleRows(parsed?.items)
    if (!items.length) return null
    return { fetchedAt: Number(parsed?.fetchedAt) || 0, items }
  } catch {
    return null
  }
}

/** @param {BubbleItem[]} items */
async function writeCache(items) {
  try {
    await writePersisted(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), items }))
  } catch {
    // 缓存写失败不影响本次展示
  }
}

/** @returns {Promise<BubbleItem[]>} */
async function fetchFromSupabase() {
  const db = getSupabaseClient()
  const { data, error } = await db
    .from('mhy_reply_bubbles')
    .select(SELECT_COLUMNS)
    .eq('enabled', true)
    .order('source', { ascending: true })
    .order('game', { ascending: true })
    .order('sort', { ascending: true })

  if (error) throw new Error(error.message || '拉取评论气泡失败')
  return normalizeBubbleRows(data)
}

/**
 * 读取评论气泡清单。
 * @param {{ force?: boolean }} [options]
 *   force=true 跳过 TTL 与内存缓存直接请求云端（选择器「刷新」按钮用）。
 *   force 拉取失败/云端为空时行为不变——memo 回退旧缓存并抛错，
 *   调用方借此提示「已显示缓存数据」；非 force 保持静默，失败退缓存不抛。
 * @returns {Promise<BubbleItem[]>}
 */
export async function loadBubbleCatalog(options = {}) {
  if (memo && !options.force) return memo
  if (inflight) return inflight

  inflight = (async () => {
    const cached = await readCache()
    const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS
    if (fresh && !options.force) {
      memo = cached.items
      return memo
    }

    let fetched = null
    try {
      fetched = await fetchFromSupabase()
    } catch (e) {
      if (options.force) {
        // 兜底旧缓存后把错误抛出去（调用方提示「已显示缓存数据」）
        memo = cached ? cached.items : []
        throw e instanceof Error ? e : new Error(String(e))
      }
      // 云端不可用就走过期缓存；没有缓存就是空目录
    }

    if (fetched && fetched.length) {
      memo = fetched
      await writeCache(fetched)
      return memo
    }

    // 云端为空：常规加载按兜底语义返回旧缓存；force 视为拉取失败（无法区分
    // 「云端被清空」与「拉取异常」，统一按失败提示，老数据不动）
    memo = cached ? cached.items : []
    if (options.force) throw new Error('云端气泡目录为空')
    return memo
  })().finally(() => {
    inflight = null
  })

  return inflight
}

/** 测试用：清掉内存缓存 */
export function resetBubbleCatalogCache() {
  memo = null
  inflight = null
}
