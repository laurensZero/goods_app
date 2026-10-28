import { getPublicBaseUrl, rebasePublicImageUrl } from '@/utils/sync/supabaseClient'

/**
 * 导出文件里的内置存储图片地址跟随当前数据面端点。
 *
 * 行里的 `uri` 保留的是「写入那一刻所在端点」的绝对地址，而切换端点不会回写存量行；
 * 导出如果原样带出去，用户就会在备份里看到已经不再使用的旧域名。
 * 第三方 CDN（米游铺 / B 站等）、cloud-image:// 与本地路径都不匹配内置 base，原样返回。
 * @param {unknown} uri
 * @returns {string}
 */
export function rebaseExportImageUrl(uri) {
  const raw = String(uri || '').trim()
  if (!raw) return raw
  try {
    return rebasePublicImageUrl(raw, getPublicBaseUrl())
  } catch {
    return raw
  }
}

function rebaseImageEntry(entry) {
  if (typeof entry === 'string') return rebaseExportImageUrl(entry)
  if (!entry || typeof entry !== 'object') return entry
  return {
    ...entry,
    uri: rebaseExportImageUrl(entry.uri),
    editSourceUri: rebaseExportImageUrl(entry.editSourceUri)
  }
}

/** 谷子 / 心愿 / 回收站：images 及兼容字段 coverImage、image */
export function rebaseGoodsExportItem(item) {
  if (!item || typeof item !== 'object') return item
  return {
    ...item,
    ...(Array.isArray(item.images) ? { images: item.images.map(rebaseImageEntry) } : {}),
    ...(item.coverImage ? { coverImage: rebaseExportImageUrl(item.coverImage) } : {}),
    ...(item.image ? { image: rebaseExportImageUrl(item.image) } : {})
  }
}

/** 活动：封面、封面数据、照片 */
export function rebaseEventExportItem(event) {
  if (!event || typeof event !== 'object') return event
  return {
    ...event,
    ...(event.coverImage ? { coverImage: rebaseExportImageUrl(event.coverImage) } : {}),
    ...(event.coverImageData?.uri
      ? { coverImageData: { ...event.coverImageData, uri: rebaseExportImageUrl(event.coverImageData.uri) } }
      : {}),
    ...(Array.isArray(event.photos)
      ? {
        photos: event.photos.map((photo) => (
          photo && typeof photo === 'object'
            ? { ...photo, uri: rebaseExportImageUrl(photo.uri) }
            : photo
        ))
      }
      : {})
  }
}

/** 充值记录：image */
export function rebaseRechargeExportRecord(record) {
  if (!record || typeof record !== 'object') return record
  return {
    ...record,
    ...(record.image ? { image: rebaseExportImageUrl(record.image) } : {})
  }
}
