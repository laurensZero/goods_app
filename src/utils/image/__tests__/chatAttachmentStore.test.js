import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { idbMock } = vi.hoisted(() => {
  const stores = new Map()
  return {
    idbMock: {
      stores,
      reset() {
        stores.clear()
      }
    }
  }
})

function createFakeIDB() {
  const storeData = idbMock.stores
  return {
    open: vi.fn(() => {
      const req = {}
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => ({}),
          transaction: (_name, _mode) => ({
            objectStore: () => ({
              put: (value, key) => {
                const store = storeData.get('blobs') || new Map()
                store.set(key, value)
                storeData.set('blobs', store)
                const r = {}
                queueMicrotask(() => r.onsuccess?.())
                return r
              },
              get: (key) => {
                const r = {}
                queueMicrotask(() => {
                  r.result = storeData.get('blobs')?.get(key)
                  r.onsuccess?.()
                })
                return r
              },
              delete: (key) => {
                storeData.get('blobs')?.delete(key)
                const r = {}
                queueMicrotask(() => r.onsuccess?.())
                return r
              },
              getAllKeys: () => {
                const r = {}
                queueMicrotask(() => {
                  r.result = [...(storeData.get('blobs')?.keys() || [])]
                  r.onsuccess?.()
                })
                return r
              }
            })
          })
        }
        req.onsuccess?.()
      })
      return req
    })
  }
}

globalThis.indexedDB = createFakeIDB()

const {
  chatAttachmentUri,
  parseChatAttachmentUri,
  isChatAttachmentUri,
  putChatAttachmentBlob,
  putChatAttachmentFromFile,
  putChatAttachmentFromDataUrl,
  getChatAttachmentBlob,
  deleteChatAttachmentBlob,
  resolveChatAttachmentDisplayUri,
  resolveChatAttachmentDataUrl,
  pruneOrphanChatAttachments
} = await import('../chatAttachmentStore')

describe('chatAttachmentStore', () => {
  beforeEach(() => {
    idbMock.reset()
  })

  afterEach(() => {
    // keep fake idb for module-level openDb cache between tests
  })

  it('短引用解析', () => {
    expect(chatAttachmentUri('abc')).toBe('chat-att://abc')
    expect(parseChatAttachmentUri('chat-att://abc')).toBe('abc')
    expect(isChatAttachmentUri('chat-att://abc')).toBe(true)
    expect(isChatAttachmentUri('data:image/png;base64,AA')).toBe(false)
  })

  it('File → 短引用 → Blob 往返', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const uri = await putChatAttachmentFromFile(file, 'att-1')
    expect(uri).toBe('chat-att://att-1')
    const blob = await getChatAttachmentBlob('att-1')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBe(3)
  })

  it('data URL → 短引用', async () => {
    const uri = await putChatAttachmentFromDataUrl('data:image/png;base64,AAAA', 'att-data')
    expect(uri).toBe('chat-att://att-data')
    const dataUrl = await resolveChatAttachmentDataUrl(uri)
    expect(String(dataUrl).startsWith('data:image/png')).toBe(true)
  })

  it('display uri：chat-att 返回 objectURL，其它原样', async () => {
    await putChatAttachmentBlob(new Blob(['x'], { type: 'image/jpeg' }), 'att-d')
    const display = await resolveChatAttachmentDisplayUri('chat-att://att-d')
    expect(display.startsWith('blob:')).toBe(true)
    expect(await resolveChatAttachmentDisplayUri('https://example.com/a.png')).toBe('https://example.com/a.png')
  })

  it('缺失 blob 时 data url 为 null', async () => {
    expect(await resolveChatAttachmentDataUrl('chat-att://missing')).toBeNull()
  })

  it('删除与孤儿回收', async () => {
    await putChatAttachmentBlob(new Blob(['a']), 'keep')
    await putChatAttachmentBlob(new Blob(['b']), 'orphan')
    const removed = await pruneOrphanChatAttachments(['keep'])
    expect(removed).toBe(1)
    expect(await getChatAttachmentBlob('keep')).toBeTruthy()
    expect(await getChatAttachmentBlob('orphan')).toBeNull()
    await deleteChatAttachmentBlob('keep')
    expect(await getChatAttachmentBlob('keep')).toBeNull()
  })
})
