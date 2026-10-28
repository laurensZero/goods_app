import { describe, expect, it, vi } from 'vitest'

const PRIMARY = 'https://zvqzicimowfqshgjsrri.supabase.co'
const BACKUP = 'https://api.goodsapp.de5.net'
const CF = 'https://cf.goodsapp.de5.net'

vi.mock('@/utils/sync/supabaseClient', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getPublicBaseUrl: () => BACKUP }
})

const {
  rebaseEventExportItem,
  rebaseExportImageUrl,
  rebaseGoodsExportItem,
  rebaseRechargeExportRecord
} = await import('@/utils/sync/exportImageUrls')

const STORAGE_PATH = '/storage/v1/object/public/goods-images/c7245e3f/goods-image__1__2__3.jpg'

describe('导出图片地址跟随数据端点', () => {
  it('把内置存储地址改写到当前端点', () => {
    expect(rebaseExportImageUrl(`${CF}${STORAGE_PATH}`)).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebaseExportImageUrl(`${PRIMARY}${STORAGE_PATH}`)).toBe(`${BACKUP}${STORAGE_PATH}`)
  })

  it('第三方 CDN、cloud-image:// 与本地路径原样返回', () => {
    const thirdParty = 'https://sdk-webstatic.mihoyo.com/a.png'
    expect(rebaseExportImageUrl(thirdParty)).toBe(thirdParty)
    expect(rebaseExportImageUrl('cloud-image://goods-image__1__2__3.jpg')).toBe('cloud-image://goods-image__1__2__3.jpg')
    expect(rebaseExportImageUrl('user-images/1.jpg')).toBe('user-images/1.jpg')
    expect(rebaseExportImageUrl('')).toBe('')
  })

  it('谷子导出会改写 images、coverImage、image 与编辑底图，且不改原对象', () => {
    const original = {
      id: 'g1',
      coverImage: `${CF}${STORAGE_PATH}`,
      image: `${CF}${STORAGE_PATH}`,
      images: [
        {
          id: 'i1',
          uri: `${CF}${STORAGE_PATH}`,
          editSourceUri: `${CF}${STORAGE_PATH}`
        },
        `${PRIMARY}${STORAGE_PATH}`
      ]
    }

    const rebased = rebaseGoodsExportItem(original)

    expect(rebased.images[0].uri).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebased.images[0].editSourceUri).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebased.images[1]).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebased.coverImage).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebased.image).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(original.images[0].uri).toBe(`${CF}${STORAGE_PATH}`)
    expect(original.coverImage).toBe(`${CF}${STORAGE_PATH}`)
  })

  it('活动导出会改写封面、封面数据与照片', () => {
    const rebased = rebaseEventExportItem({
      id: 'e1',
      coverImage: `${CF}${STORAGE_PATH}`,
      coverImageData: { uri: `${CF}${STORAGE_PATH}` },
      photos: [{ id: 'p1', uri: `${CF}${STORAGE_PATH}` }]
    })

    expect(rebased.coverImage).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebased.coverImageData.uri).toBe(`${BACKUP}${STORAGE_PATH}`)
    expect(rebased.photos[0].uri).toBe(`${BACKUP}${STORAGE_PATH}`)
  })

  it('充值记录导出会改写 image', () => {
    const rebased = rebaseRechargeExportRecord({
      id: 'r1',
      image: `${CF}${STORAGE_PATH}`
    })

    expect(rebased.image).toBe(`${BACKUP}${STORAGE_PATH}`)
  })
})
