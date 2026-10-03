import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/db/index', () => ({
  getImageEdit: vi.fn(async () => null),
  saveImageEdit: vi.fn(async () => {}),
  deleteImageEdit: vi.fn(async () => {}),
  deleteImageEditsByImageIds: vi.fn(async () => []),
  deleteImageEditsBySourcePaths: vi.fn(async () => 0)
}))
vi.mock('@/utils/image/localImage', () => ({
  deleteManagedLocalImages: vi.fn(async () => 0),
  localImageFileExists: vi.fn(async () => true),
  extractManagedLocalImagePath: vi.fn((value) => {
    const match = String(value || '').match(/user-images\/[\w.\-]+/)
    return match ? match[0] : ''
  })
}))

import {
  deleteImageEdit,
  deleteImageEditsByImageIds,
  deleteImageEditsBySourcePaths,
  getImageEdit,
  saveImageEdit
} from '@/utils/db/index'
import { deleteManagedLocalImages, localImageFileExists } from '@/utils/image/localImage'
import { buildImageEditRecipe } from '@/utils/image/imageEditRecipe'
import {
  forgetImageEditState,
  forgetImageEditsByImageIds,
  forgetImageEditsBySourcePaths,
  forgetImageEditsForGoodsItems,
  forgetImageEditsForRemovedImages,
  persistImageEditState,
  readImageEditState
} from '@/utils/image/imageEdit'

const RECIPE = buildImageEditRecipe({
  frameId: 'wave',
  colorwayId: 'blue',
  fitRatioPercent: 94,
  bgColor: '#EFEEE8',
  labelsDate: '2026.10.02'
})

function editRow(overrides = {}) {
  return {
    imageId: 'img_1',
    goodsId: 'g1',
    recipe: { ...RECIPE },
    sourceUri: 'capacitor://localhost/_capacitor_file_/user-images/1_src.jpg',
    sourcePath: 'user-images/1_src.jpg',
    sourceCloudFileName: '',
    updatedAt: 1,
    ...overrides
  }
}

function imageEntry(overrides = {}) {
  return { id: 'img_1', ...overrides }
}

beforeEach(() => {
  getImageEdit.mockReset().mockResolvedValue(null)
  saveImageEdit.mockReset().mockResolvedValue(undefined)
  deleteImageEdit.mockReset().mockResolvedValue(undefined)
  deleteImageEditsByImageIds.mockReset().mockResolvedValue([])
  deleteImageEditsBySourcePaths.mockReset().mockResolvedValue(0)
  deleteManagedLocalImages.mockReset().mockResolvedValue(0)
  localImageFileExists.mockReset().mockResolvedValue(true)
})

describe('readImageEditState', () => {
  it('无图 id / 无行无同步配方 → null', async () => {
    expect(await readImageEditState(imageEntry({ id: '' }))).toBeNull()
    expect(await readImageEditState(imageEntry())).toBeNull()
    expect(getImageEdit).toHaveBeenCalledWith('img_1')
  })

  it('配方不认识（模板已删）→ null，二次编辑入口不出现', async () => {
    getImageEdit.mockResolvedValue(editRow({ recipe: { ...RECIPE, frameId: 'gone' } }))
    expect(await readImageEditState(imageEntry())).toBeNull()
  })

  it('本机底图文件丢了且没有云端引用 → null（否则一点就是框上加框）', async () => {
    getImageEdit.mockResolvedValue(editRow())
    localImageFileExists.mockResolvedValue(false)
    expect(await readImageEditState(imageEntry())).toBeNull()
  })

  it('正常时回吐配方与底图位置', async () => {
    getImageEdit.mockResolvedValue(editRow())
    const state = await readImageEditState(imageEntry())
    expect(state).toEqual({
      recipe: RECIPE,
      sourceUri: 'capacitor://localhost/_capacitor_file_/user-images/1_src.jpg',
      sourcePath: 'user-images/1_src.jpg',
      sourceCloudFileName: '',
      fromCloud: false
    })
  })

  it('读表抛错时按「没有配方」处理，不阻断编辑入口', async () => {
    getImageEdit.mockRejectedValue(new Error('boom'))
    expect(await readImageEditState(imageEntry())).toBeNull()
  })

  // ---- 阶段二：配方随行同步、底图可来自云端 ----

  it('images[i].edit 是同步真相：本地表配方是坏数据也以行为准', async () => {
    getImageEdit.mockResolvedValue(editRow({ recipe: { ...RECIPE, frameId: 'gone' } }))
    const state = await readImageEditState(imageEntry({ edit: RECIPE }))
    expect(state.recipe).toEqual(RECIPE)
    expect(state.fromCloud).toBe(false)
  })

  it('只有配方、底图本地与云端都没有 → null（入口退回快速编辑）', async () => {
    expect(await readImageEditState(imageEntry({ edit: RECIPE }))).toBeNull()
  })

  it('本机没有底图时用云端引用，并标记 fromCloud 让上层落本地副本', async () => {
    getImageEdit.mockResolvedValue(null)
    const state = await readImageEditState(imageEntry({
      edit: RECIPE,
      editSourceUri: 'cloud-image://goods-image__g1__img_1s__9.jpg',
      editSourceCloudFileName: 'goods-image__g1__img_1s__9.jpg'
    }))
    expect(state).toEqual({
      recipe: RECIPE,
      sourceUri: 'cloud-image://goods-image__g1__img_1s__9.jpg',
      sourcePath: '',
      sourceCloudFileName: 'goods-image__g1__img_1s__9.jpg',
      fromCloud: true
    })
  })

  it('本地底图记的云端文件与当前行不一致 → 本机那份是旧的，改用云端', async () => {
    getImageEdit.mockResolvedValue(editRow({ sourceCloudFileName: 'goods-image__g1__img_1s__1.jpg' }))
    const state = await readImageEditState(imageEntry({
      edit: RECIPE,
      editSourceCloudFileName: 'goods-image__g1__img_1s__2.jpg',
      editSourceUri: 'cloud-image://goods-image__g1__img_1s__2.jpg'
    }))
    expect(state.fromCloud).toBe(true)
    expect(state.sourceCloudFileName).toBe('goods-image__g1__img_1s__2.jpg')
  })

  it('本地副本标记为空串 = 本机最新，不与云端比新旧', async () => {
    getImageEdit.mockResolvedValue(editRow({ sourceCloudFileName: '' }))
    const state = await readImageEditState(imageEntry({
      edit: RECIPE,
      editSourceCloudFileName: 'goods-image__g1__img_1s__2.jpg'
    }))
    expect(state.fromCloud).toBe(false)
    expect(state.sourceUri).toBe('capacitor://localhost/_capacitor_file_/user-images/1_src.jpg')
  })

  it('本地文件没了但云端文件名与本地记录一致时，仍然回退云端', async () => {
    getImageEdit.mockResolvedValue(editRow({ sourceCloudFileName: 'goods-image__g1__img_1s__2.jpg' }))
    localImageFileExists.mockResolvedValue(false)
    const state = await readImageEditState(imageEntry({
      edit: RECIPE,
      editSourceCloudFileName: 'goods-image__g1__img_1s__2.jpg',
      editSourceUri: 'cloud-image://goods-image__g1__img_1s__2.jpg'
    }))
    expect(state.fromCloud).toBe(true)
  })
})

describe('persistImageEditState', () => {
  it('写入归一化后的配方', async () => {
    const ok = await persistImageEditState({
      imageId: 'img_1',
      goodsId: 'g1',
      recipe: { ...RECIPE, bgColor: '#ABCDEF', fitRatio: 9 },
      sourceUri: 'capacitor://localhost/user-images/1_src.jpg',
      sourcePath: 'user-images/1_src.jpg',
      sourceCloudFileName: 'goods-image__g1__img_1s__9.jpg'
    })
    expect(ok).toBe(true)
    expect(saveImageEdit).toHaveBeenCalledTimes(1)
    const arg = saveImageEdit.mock.calls[0][0]
    expect(arg.imageId).toBe('img_1')
    expect(arg.goodsId).toBe('g1')
    expect(arg.sourceUri).toBe('capacitor://localhost/user-images/1_src.jpg')
    expect(arg.sourcePath).toBe('user-images/1_src.jpg')
    expect(arg.sourceCloudFileName).toBe('goods-image__g1__img_1s__9.jpg')
    expect(arg.updatedAt).toBeGreaterThan(0)
    expect(arg.recipe.bgColor).toBe('#abcdef')
    expect(arg.recipe.fitRatio).toBe(1)
  })

  it('配方无效或缺底图 → 不写', async () => {
    expect(await persistImageEditState({ imageId: 'img_1', recipe: null, sourceUri: 'x' })).toBe(false)
    expect(await persistImageEditState({ imageId: '', recipe: RECIPE, sourceUri: 'x' })).toBe(false)
    expect(await persistImageEditState({ imageId: 'img_1', recipe: RECIPE, sourceUri: '' })).toBe(false)
    expect(saveImageEdit).not.toHaveBeenCalled()
  })
})

describe('forgetImageEditState', () => {
  it('删行并回收底图文件', async () => {
    getImageEdit.mockResolvedValue(editRow())
    expect(await forgetImageEditState('img_1')).toBe(true)
    expect(deleteImageEdit).toHaveBeenCalledWith('img_1')
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(['user-images/1_src.jpg'])
  })

  it('本来就没有配方时不碰文件', async () => {
    expect(await forgetImageEditState('img_1')).toBe(false)
    expect(deleteManagedLocalImages).not.toHaveBeenCalled()
  })

  it('空 id 直接返回', async () => {
    expect(await forgetImageEditState('')).toBe(false)
    expect(deleteImageEdit).not.toHaveBeenCalled()
  })
})

describe('forgetImageEditsByImageIds', () => {
  it('按 id 删行并回收各自的底图', async () => {
    deleteImageEditsByImageIds.mockResolvedValue([
      editRow({ imageId: 'a', sourcePath: 'user-images/a_src.jpg' }),
      editRow({ imageId: 'b', sourcePath: 'user-images/b_src.jpg' })
    ])
    expect(await forgetImageEditsByImageIds(['a', 'b', 'a'])).toBe(2)
    expect(deleteImageEditsByImageIds).toHaveBeenCalledWith(['a', 'b'])
    expect(deleteManagedLocalImages).toHaveBeenCalledWith(['user-images/a_src.jpg', 'user-images/b_src.jpg'])
  })

  it('空列表不碰 DB', async () => {
    expect(await forgetImageEditsByImageIds([])).toBe(0)
    expect(deleteImageEditsByImageIds).not.toHaveBeenCalled()
  })
})

describe('forgetImageEditsForGoodsItems', () => {
  it('汇总所有商品的图片 id', async () => {
    await forgetImageEditsForGoodsItems([
      { images: [{ id: 'a' }, { id: 'b' }] },
      { images: [{ id: 'c' }, null] }
    ])
    expect(deleteImageEditsByImageIds).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('没有图片时不调用', async () => {
    await forgetImageEditsForGoodsItems([{ images: [] }, {}])
    expect(deleteImageEditsByImageIds).not.toHaveBeenCalled()
  })
})

describe('forgetImageEditsForRemovedImages', () => {
  it('只回收被移除那几张图的配方', async () => {
    await forgetImageEditsForRemovedImages(
      { images: [{ id: 'keep' }, { id: 'gone' }] },
      { images: [{ id: 'keep' }, { id: 'fresh' }] }
    )
    expect(deleteImageEditsByImageIds).toHaveBeenCalledWith(['gone'])
  })

  it('图片没变化时不碰 DB（可以挂在更新热路径上）', async () => {
    await forgetImageEditsForRemovedImages(
      { images: [{ id: 'keep' }] },
      { images: [{ id: 'keep' }] }
    )
    await forgetImageEditsForRemovedImages(null, { images: [{ id: 'keep' }] })
    expect(deleteImageEditsByImageIds).not.toHaveBeenCalled()
  })
})

describe('forgetImageEditsBySourcePaths', () => {
  it('把 URI 归一成托管路径后按路径删行', async () => {
    deleteImageEditsBySourcePaths.mockResolvedValue(1)
    const count = await forgetImageEditsBySourcePaths([
      'capacitor://localhost/_capacitor_file_/user-images/1_src.jpg',
      'user-images/1_src.jpg',
      ''
    ])
    expect(count).toBe(1)
    expect(deleteImageEditsBySourcePaths).toHaveBeenCalledWith(['user-images/1_src.jpg'])
  })

  it('没有可识别的路径时直接返回 0', async () => {
    expect(await forgetImageEditsBySourcePaths(['https://cdn.example.com/a.jpg'])).toBe(0)
    expect(deleteImageEditsBySourcePaths).not.toHaveBeenCalled()
  })
})
