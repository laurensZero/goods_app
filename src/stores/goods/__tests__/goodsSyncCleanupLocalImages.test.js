import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef } from 'vue'

vi.mock('@/utils/db/index', () => ({
  getItems: vi.fn(async () => []),
  saveItems: vi.fn(async () => {}),
}))
vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => 0),
  isLocalImageUri: vi.fn((uri) => typeof uri === 'string' && uri.startsWith('capacitor://')),
  extractManagedLocalImagePath: vi.fn((value) => {
    const text = String(value || '')
    const match = text.match(/user-images\/[\w.\-]+/)
    return match ? match[0] : ''
  }),
  collectManagedLocalImagePathsFromGoodsItem: vi.fn(() => new Set())
}))
vi.mock('@/utils/goods/saleReminder', () => ({
  cancelSaleReminderNotifications: vi.fn(async () => {})
}))
vi.mock('@/utils/image/cache', () => ({
  aliasCachedImage: vi.fn()
}))

import { cleanupBase64Images } from '../goodsSync'
import { saveItems } from '@/utils/db/index'
import { deleteManagedLocalImages } from '@/utils/image/localImage'

function makeImage(overrides = {}) {
  return {
    id: 'img_1',
    uri: '',
    kind: 'primary',
    label: '',
    storageMode: '',
    localPath: '',
    cloudFileName: '',
    mimeType: '',
    fileSize: 0,
    isPrimary: true,
    ...overrides
  }
}

function makeItem(id, images) {
  return { id, name: `item-${id}`, quantity: 1, updatedAt: 100, isWishlist: false, images }
}

function makeBackend({ files = {} } = {}) {
  return {
    getImagePublicUrl: (name) => `https://cdn.example.com/${name}`,
    getExistingImageCloud: async () => ({ files })
  }
}

describe('cleanupBase64Images 云端确认后清理本地副本', () => {
  beforeEach(() => {
    saveItems.mockReset()
    saveItems.mockResolvedValue(undefined)
    deleteManagedLocalImages.mockReset()
    deleteManagedLocalImages.mockResolvedValue(0)
  })

  it('base64 在云端确认后替换为公网 URL，且不 bump updatedAt', async () => {
    const list = shallowRef([makeItem('a', [
      makeImage({
        uri: 'data:image/png;base64,AAA',
        cloudFileName: 'goods-image__a.png',
        storageMode: 'inline-local',
        localPath: ''
      })
    ])])
    const trashList = shallowRef([])
    const updatedAt = list.value[0].updatedAt

    await cleanupBase64Images(list, trashList, makeBackend({
      files: { 'goods-image__a.png': { name: 'goods-image__a.png' } }
    }))

    const img = list.value[0].images[0]
    expect(img.uri).toBe('https://cdn.example.com/goods-image__a.png')
    expect(img.storageMode).toBe('remote')
    expect(list.value[0].updatedAt).toBe(updatedAt)
    expect(saveItems).toHaveBeenCalledTimes(1)
  })

  it('已上云的 linked-local：清空 localPath、改写 remote URI 并删除本地文件', async () => {
    const list = shallowRef([makeItem('a', [
      makeImage({
        uri: 'https://cdn.example.com/goods-image__a.png',
        cloudFileName: 'goods-image__a.png',
        storageMode: 'cloud-local',
        localPath: 'user-images/1_a.jpg'
      })
    ])])
    const trashList = shallowRef([])

    await cleanupBase64Images(list, trashList, makeBackend({
      files: { 'goods-image__a.png': { name: 'goods-image__a.png' } }
    }))

    const img = list.value[0].images[0]
    expect(img.uri).toBe('https://cdn.example.com/goods-image__a.png')
    expect(img.localPath).toBe('')
    expect(img.storageMode).toBe('remote')
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(new Set(['user-images/1_a.jpg']))
  })

  it('本地图 uri 仍指向本地文件时，先改写到云端 URL 再删本地文件', async () => {
    const list = shallowRef([makeItem('a', [
      makeImage({
        uri: 'capacitor://localhost/_capacitor_file_/data/user-images/1_a.jpg',
        cloudFileName: 'goods-image__a.png',
        storageMode: 'linked-local',
        localPath: 'user-images/1_a.jpg'
      })
    ])])
    const trashList = shallowRef([])

    await cleanupBase64Images(list, trashList, makeBackend({
      files: { 'goods-image__a.png': { name: 'goods-image__a.png' } }
    }))

    const img = list.value[0].images[0]
    expect(img.uri).toBe('https://cdn.example.com/goods-image__a.png')
    expect(img.localPath).toBe('')
    expect(img.storageMode).toBe('remote')
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(new Set(['user-images/1_a.jpg']))
  })

  it('云端未确认的文件不删除本地副本', async () => {
    const list = shallowRef([makeItem('a', [
      makeImage({
        uri: 'https://cdn.example.com/goods-image__missing.png',
        cloudFileName: 'goods-image__missing.png',
        storageMode: 'cloud-local',
        localPath: 'user-images/1_a.jpg'
      })
    ])])
    const trashList = shallowRef([])

    await cleanupBase64Images(list, trashList, makeBackend({ files: {} }))

    const img = list.value[0].images[0]
    expect(img.localPath).toBe('user-images/1_a.jpg')
    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
    expect(saveItems).not.toHaveBeenCalled()
  })

  it('skipFiles 中的上传失败文件保留本地引用', async () => {
    const list = shallowRef([makeItem('a', [
      makeImage({
        uri: 'data:image/png;base64,AAA',
        cloudFileName: 'goods-image__fail.png',
        storageMode: 'inline-local',
        localPath: 'user-images/1_a.jpg'
      })
    ])])
    const trashList = shallowRef([])

    await cleanupBase64Images(list, trashList, makeBackend({
      files: { 'goods-image__fail.png': { name: 'goods-image__fail.png' } }
    }), { skipFiles: new Set(['goods-image__fail.png']) })

    const img = list.value[0].images[0]
    expect(img.uri).toBe('data:image/png;base64,AAA')
    expect(img.localPath).toBe('user-images/1_a.jpg')
    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
    expect(saveItems).not.toHaveBeenCalled()
  })

  it('回收站条目同样清理', async () => {
    const list = shallowRef([])
    const trashList = shallowRef([makeItem('t1', [
      makeImage({
        uri: 'https://cdn.example.com/goods-image__t.png',
        cloudFileName: 'goods-image__t.png',
        storageMode: 'cloud-local',
        localPath: 'user-images/1_t.jpg'
      })
    ])])

    await cleanupBase64Images(list, trashList, makeBackend({
      files: { 'goods-image__t.png': { name: 'goods-image__t.png' } }
    }))

    const img = trashList.value[0].images[0]
    expect(img.localPath).toBe('')
    expect(img.storageMode).toBe('remote')
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(new Set(['user-images/1_t.jpg']))
  })

  it('无 getExistingImageCloud 时只处理 base64，不删本地文件', async () => {
    const list = shallowRef([makeItem('a', [
      makeImage({
        uri: 'data:image/png;base64,AAA',
        cloudFileName: 'goods-image__a.png',
        storageMode: 'inline-local',
        localPath: ''
      }),
      makeImage({
        id: 'img_2',
        uri: 'https://cdn.example.com/goods-image__b.png',
        cloudFileName: 'goods-image__b.png',
        storageMode: 'cloud-local',
        localPath: 'user-images/1_b.jpg'
      })
    ])])
    const trashList = shallowRef([])

    await cleanupBase64Images(list, trashList, {
      getImagePublicUrl: (name) => `https://cdn.example.com/${name}`
    })

    expect(list.value[0].images[0].uri).toBe('https://cdn.example.com/goods-image__a.png')
    expect(list.value[0].images[1].localPath).toBe('user-images/1_b.jpg')
    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
  })
})
