// @ts-check
import { parseMusicPreviewHref } from '@/utils/ai/jumpLinks'
import { parseBilibiliVideoId } from '@/utils/music/bilibiliMusic'
import { extractNeteaseSongId } from '@/utils/music/neteaseMusic'
import { extractQQSongMid } from '@/utils/music/qqMusic'

/**
 * 把用户粘贴的内容解析成「音源 + 音源 id」。
 *
 * 支持（按识别优先级）：
 * - 应用内试听协议 `app://play_music/<source>/<id>`（AI 回复里的试听链接）
 * - B 站：BV 号本身，或任何带 BV 号的链接 / 分享文案
 * - 网易云：music.163.com / 163cn.tv 的单曲链接或分享文案
 * - QQ 音乐：qq.com 域名下带歌曲 mid 的链接（`/songDetail/<mid>`、`songmid=<mid>`）
 * - `allowBareId` 为 true 时，再接受裸 ID：纯数字按网易云歌曲 id，字母数字混合按 QQ mid
 *
 * 默认不认裸 ID：搜索框里 "abc1234567" 这类输入可能是歌名关键词，不能当成 QQ mid 抢走。
 * 曲目卡片上「绑定音源」是明确指定目标的操作，才放开裸 ID。
 * 歌单 / 专辑 / 短链（b23.tv、163cn.tv、u?__=xxx）解析不出单曲，返回 null。
 *
 * @param {string} input
 * @param {{ allowBareId?: boolean }} [options]
 * @returns {{ source: 'netease' | 'qq' | 'bilibili', id: string } | null}
 */
export function parseTrackSourceInput(input, options = {}) {
  const allowBareId = options?.allowBareId === true
  const raw = String(input || '').trim()
  if (!raw) return null

  // 1) 应用内试听链接
  const preview = parseMusicPreviewHref(raw)
  if (preview) return { source: preview.source, id: preview.id }

  // 2) B 站：BV 号是全局唯一的强特征，裸号 / 链接 / 分享文案都能命中
  const bvid = parseBilibiliVideoId(raw)
  if (bvid) return { source: 'bilibili', id: bvid }

  // 3) 网易云：先按域名收窄，避免把别的站点的 ?id= 当成歌曲 id
  if (/music\.163\.com|163cn\.tv/i.test(raw)) {
    const songId = extractNeteaseSongId(raw)
    if (songId) return { source: 'netease', id: songId }
  }

  // 4) QQ 音乐：同上，先收窄域名 / songmid 参数
  if (/(^|\.)qq\.com|songmid=/i.test(raw)) {
    const songMid = extractQQSongMid(raw)
    if (songMid) return { source: 'qq', id: songMid }
  }

  if (!allowBareId) return null

  // 5) 裸 ID
  if (/^\d{3,}$/.test(raw)) return { source: 'netease', id: raw }
  if (/^[a-zA-Z0-9]{10,}$/.test(raw)) return { source: 'qq', id: raw }

  return null
}
