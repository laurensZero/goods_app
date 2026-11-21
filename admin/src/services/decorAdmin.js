import { supabaseRequest } from './supabase'

// ── 装扮目录管理服务 ──
// 操作两张米游社/HoYoLAB 装扮目录表：
//   mhy_decor_pendants  头像框（App 头像外圈挂件）
//   mhy_reply_bubbles   评论装扮（页面右上角贴角装饰）
//
// 与 sync-mhy-decor Edge Function 的分工：Function 只做「增量发现新条目」，
// 不碰已有行；本服务是人工维护入口（改归属 / 上下架 / 手工补录）。
// enabled=false 的行是墓碑：客户端不可见，但同步的增量闸门认它（不会回流）。

export const DECOR_KINDS = {
  pendant: {
    table: 'mhy_decor_pendants',
    label: '头像框',
    idPrefix: 'ms: / hy:',
    select: 'id,name,game,source,description,url,mirror_url,thumb_url,animated,sort,enabled,updated_at,content_key,pixel_hash'
  },
  bubble: {
    table: 'mhy_reply_bubbles',
    label: '评论装扮',
    idPrefix: 'msb:',
    select: 'id,name,game,source,description,url,bg_color,gif_url,pag_url,mirror_url,thumb_url,animated,sort,enabled,updated_at,content_key,pixel_hash'
  }
}

/** IP 归属清单（与 supabase/functions/_shared/mhy-decor-shared.js 的 DECOR_GAMES 保持同步） */
export const DECOR_GAMES = [
  '原神', '崩坏：星穹铁道', '绝区零', '未定事件簿', '崩坏3', '崩坏学园2',
  '大别野', '崩坏：因缘精灵', '星布谷地', '米游社', '其他'
]

export const DECOR_SOURCES = ['miyoushe', 'hoyolab']

export function decorKindOf(kind) {
  return DECOR_KINDS[kind] || DECOR_KINDS.pendant
}

/** 全量拉取（两表都 < 1000 行，PostgREST 单页上限内，一次拿完） */
export async function fetchDecorRows(kind) {
  const def = decorKindOf(kind)
  const data = await supabaseRequest(`/rest/v1/${def.table}`, {
    params: { select: def.select, order: 'source.asc,game.asc,sort.asc,id.asc' }
  })
  return Array.isArray(data) ? data : []
}

export async function patchDecorRow(kind, id, fields) {
  const def = decorKindOf(kind)
  return supabaseRequest(`/rest/v1/${def.table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { ...fields, updated_at: new Date().toISOString() }
  })
}

export async function createDecorRow(kind, row) {
  const def = decorKindOf(kind)
  return supabaseRequest(`/rest/v1/${def.table}`, {
    method: 'POST',
    body: { ...row, updated_at: new Date().toISOString() }
  })
}

/**
 * 预览图降级链：thumb（128px）→ mirror（Storage 整图）→ url（米哈游 CDN 原图）。
 * 返回当前层级应显示的地址；level 由调用方在 img @error 时递增。
 */
export function decorPreviewSrc(row, level = 0) {
  const chain = [row.thumb_url, row.mirror_url, row.url].filter(Boolean)
  return chain[Math.min(level, chain.length - 1)] || ''
}

export function decorPreviewLevels(row) {
  return [row.thumb_url, row.mirror_url, row.url].filter(Boolean).length
}
