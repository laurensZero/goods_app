import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAttachmentToolHandlers, ATTACHMENT_TOOL_DEFINITIONS } from '../attachmentTools'

const ATTACHMENTS = [{ id: 'a1', uri: 'data:image/png;base64,AAA', localPath: '' }]

function makeGoodsStore(items = []) {
  return {
    list: items,
    updateGoods: vi.fn(async (id, data) => id)
  }
}

function makeEventsStore(items = []) {
  return {
    list: items,
    updateEventRecord: vi.fn(async (id) => id)
  }
}

describe('attachmentTools', () => {
  beforeEach(() => {})

  it('导出 attachment_apply 定义', () => {
    expect(ATTACHMENT_TOOL_DEFINITIONS[0].name).toBe('attachment_apply')
  })

  it('goods_image：追加附件为谷子主图并清掉旧主图标记', async () => {
    const goodsStore = makeGoodsStore([{
      id: 'g1',
      images: [{ id: 'old', uri: 'https://x/a.png', isPrimary: true, kind: 'primary' }]
    }])
    const handlers = createAttachmentToolHandlers({
      getAttachments: () => ATTACHMENTS,
      goodsStore
    })

    const result = await handlers.attachment_apply({ target: 'goods_image', id: 'g1', image: '1' })

    expect(result).toMatchObject({ ok: true, target: 'goods_image', id: 'g1', imageCount: 2 })
    const nextImages = goodsStore.updateGoods.mock.calls[0][1].images
    expect(nextImages).toHaveLength(2)
    expect(nextImages[0]).toMatchObject({ uri: 'data:image/png;base64,AAA', isPrimary: true })
    expect(nextImages[1]).toMatchObject({ id: 'old', isPrimary: false })
  })

  it('goods_image：找不到条目时抛错', async () => {
    const handlers = createAttachmentToolHandlers({
      getAttachments: () => ATTACHMENTS,
      goodsStore: makeGoodsStore([])
    })
    await expect(
      handlers.attachment_apply({ target: 'goods_image', id: 'nope', image: '1' })
    ).rejects.toThrow('未找到')
  })

  it('event_cover：写入活动封面', async () => {
    const eventsStore = makeEventsStore([{ id: 'e1', coverImage: '', photos: [] }])
    const handlers = createAttachmentToolHandlers({
      getAttachments: () => ATTACHMENTS,
      eventsStore
    })

    const result = await handlers.attachment_apply({ target: 'event_cover', id: 'e1', image: '1' })
    expect(result).toMatchObject({ ok: true, target: 'event_cover' })
    expect(eventsStore.updateEventRecord).toHaveBeenCalledWith('e1', {
      coverImage: 'data:image/png;base64,AAA'
    })
  })

  it('event_photo：无 caption 时也写成对象（裸字符串 UI 不显示）', async () => {
    const eventsStore = makeEventsStore([{ id: 'e1', photos: [] }])
    const handlers = createAttachmentToolHandlers({
      getAttachments: () => ATTACHMENTS,
      eventsStore
    })

    await handlers.attachment_apply({ target: 'event_photo', id: 'e1', image: '1' })
    const photos = eventsStore.updateEventRecord.mock.calls[0][1].photos
    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({ uri: 'data:image/png;base64,AAA', caption: '' })
    expect(typeof photos[0]).toBe('object')
    expect(photos[0].id).toMatch(/^photo_/)
  })

  it('event_photo：追加照片并保留 caption', async () => {
    const eventsStore = makeEventsStore([{ id: 'e1', photos: ['https://x/old.jpg'] }])
    const handlers = createAttachmentToolHandlers({
      getAttachments: () => ATTACHMENTS,
      eventsStore
    })

    const result = await handlers.attachment_apply({
      target: 'event_photo',
      id: 'e1',
      image: '1',
      caption: '舞台'
    })
    expect(result).toMatchObject({ ok: true, photoCount: 2 })
    const photos = eventsStore.updateEventRecord.mock.calls[0][1].photos
    expect(photos).toHaveLength(2)
    expect(photos[1]).toMatchObject({ uri: 'data:image/png;base64,AAA', caption: '舞台' })
  })

  it('非法 target 抛错', async () => {
    const handlers = createAttachmentToolHandlers({
      getAttachments: () => ATTACHMENTS,
      goodsStore: makeGoodsStore()
    })
    await expect(
      handlers.attachment_apply({ target: 'avatar', id: 'x', image: '1' })
    ).rejects.toThrow('target')
  })
})
