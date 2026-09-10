// @ts-check
/**
 * 附件应用工具：attachment_apply
 *
 * 把用户随消息上传的图片写入收藏数据（谷子图 / 活动封面 / 活动照片）。
 * 普通文本模型即可完成——不需要 vision_analyze，也不做图片内容识别。
 *
 * image 参数与 vision_analyze 一致：附件序号 / att:<id> / 完整图片 URI。
 */

import { createGoodsImageId, normalizeGoodsImageList, GOODS_IMAGE_KIND_OPTIONS } from '@/utils/goods/images'

const GOODS_KINDS = new Set(GOODS_IMAGE_KIND_OPTIONS.map((option) => option.value))
const TARGETS = new Set(['goods_image', 'event_cover', 'event_photo'])

/** @type {Array<{ name: string, description: string, inputSchema: Record<string, unknown> }>} */
export const ATTACHMENT_TOOL_DEFINITIONS = [
  {
    name: 'attachment_apply',
    description:
      '把用户随消息附带的图片应用到数据：target=goods_image 写入谷子图片；event_cover 设为活动封面；event_photo 追加活动照片。image 填附件序号（"1"）或图片地址。用户要求「把这张加到收藏/设为封面/加张照片」时使用，不需要视觉识别。',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['goods_image', 'event_cover', 'event_photo'],
          description: 'goods_image=谷子图片；event_cover=活动封面；event_photo=活动照片'
        },
        id: { type: 'string', description: '谷子或活动 id（来自 goods_search / events_list）' },
        image: {
          type: 'string',
          description: '附件序号（"1"/"2"…）、att:<id> 或图片地址'
        },
        kind: {
          type: 'string',
          description: '仅 goods_image：图片类型 primary/detail/unboxing/closeup/custom，默认 primary（设为主图）'
        },
        caption: { type: 'string', description: '仅 event_photo：照片说明' }
      },
      required: ['target', 'id', 'image']
    }
  }
]

/**
 * @param {Object} deps
 * @param {() => Array<{ id?: string, uri: string, localPath?: string }>} deps.getAttachments
 * @param {(token: string) => { uri: string, localPath?: string }} [deps.resolveSource]
 * @param {{ list: any, updateGoods: (id: string, data: any) => Promise<any> }} deps.goodsStore
 * @param {{ list: any, updateEventRecord: (id: string, data: any) => Promise<any> }} [deps.eventsStore]
 */
export function createAttachmentToolHandlers({ getAttachments, resolveSource, goodsStore, eventsStore }) {
  /** @param {string} token */
  function pickImage(token) {
    const raw = String(token || '').trim()
    if (!raw) throw new Error('image 必填')
    const source = typeof resolveSource === 'function' ? resolveSource(raw) : fallbackResolve(raw, getAttachments)
    const uri = String(source?.uri || '').trim()
    const localPath = String(source?.localPath || '').trim()
    if (!uri && !localPath) throw new Error('图片地址为空')
    return { uri, localPath }
  }

  /** @param {Record<string, any>} args */
  async function attachment_apply(args) {
    const target = String(args?.target || '').trim()
    const id = String(args?.id || '').trim()
    if (!TARGETS.has(target)) throw new Error('target 需为 goods_image/event_cover/event_photo')
    if (!id) throw new Error('id 必填')
    const image = pickImage(args?.image)

    if (target === 'goods_image') {
      return applyGoodsImage(id, image, args)
    }
    if (target === 'event_cover') {
      return applyEventCover(id, image)
    }
    return applyEventPhoto(id, image, args)
  }

  /**
   * @param {string} id
   * @param {{ uri: string, localPath?: string }} image
   * @param {Record<string, any>} args
   */
  async function applyGoodsImage(id, image, args) {
    if (!goodsStore) throw new Error('收藏模块不可用')
    const list = listOf(goodsStore.list)
    const item = list.find((entry) => String(entry?.id || '') === id)
    if (!item) throw new Error(`未找到 id 为 ${id} 的谷子（回收站条目请先恢复）`)

    const rawKind = String(args?.kind || '').trim() || 'primary'
    const kind = GOODS_KINDS.has(rawKind) ? rawKind : 'primary'
    const existing = normalizeGoodsImageList(item.images, item.coverImage || item.image)
    const nextImage = {
      id: createGoodsImageId(),
      uri: image.uri,
      localPath: image.localPath || '',
      kind,
      isPrimary: kind === 'primary' || existing.length === 0
    }
    const nextImages = nextImage.isPrimary
      ? [{ ...nextImage, isPrimary: true }, ...existing.map((entry) => ({ ...entry, isPrimary: false }))]
      : [...existing, nextImage]

    await goodsStore.updateGoods(id, { images: nextImages })
    return { ok: true, target: 'goods_image', id, imageCount: nextImages.length, kind }
  }

  /**
   * @param {string} id
   * @param {{ uri: string, localPath?: string }} image
   */
  async function applyEventCover(id, image) {
    if (!eventsStore) throw new Error('活动模块不可用')
    const list = listOf(eventsStore.list)
    const event = list.find((entry) => String(entry?.id || '') === id)
    if (!event) throw new Error(`未找到 id 为 ${id} 的活动`)
    await eventsStore.updateEventRecord(id, { coverImage: image.uri })
    return { ok: true, target: 'event_cover', id }
  }

  /**
   * @param {string} id
   * @param {{ uri: string, localPath?: string }} image
   * @param {Record<string, any>} args
   */
  async function applyEventPhoto(id, image, args) {
    if (!eventsStore) throw new Error('活动模块不可用')
    const list = listOf(eventsStore.list)
    const event = list.find((entry) => String(entry?.id || '') === id)
    if (!event) throw new Error(`未找到 id 为 ${id} 的活动`)
    if (!image.uri) throw new Error('附件没有可写入的图片地址（请用 att:<id> 引用聊天附件）')
    const caption = String(args?.caption || '').trim()
    // 始终写对象：详情页/预览只认 photo.uri，裸字符串会静默不显示
    const photo = {
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uri: image.uri,
      caption
    }
    if (image.localPath) photo.localPath = image.localPath
    const photos = Array.isArray(event.photos) ? [...event.photos, photo] : [photo]
    await eventsStore.updateEventRecord(id, { photos })
    return { ok: true, target: 'event_photo', id, photoCount: photos.length }
  }

  return { attachment_apply }
}

/** 兼容无 resolveSource：序号 → 当前附件，其余当 URI */
function fallbackResolve(raw, getAttachments) {
  if (/^\d+$/.test(raw)) {
    const list = getAttachments?.() || []
    const hit = list[Number(raw) - 1]
    if (!hit?.uri && !hit?.localPath) {
      throw new Error(`附件 #${raw} 不存在（当前共 ${list.length} 张）`)
    }
    return hit
  }
  return { uri: raw }
}

/** 真实 pinia store 解包为数组；假实现可能是 ref 形状 */
function listOf(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(/** @type {any} */ (value)?.value)) return /** @type {any} */ (value).value
  return []
}
