// @ts-check
/**
 * 外框「二次编辑」的状态存取。
 *
 * 职责边界（阶段二起）：
 *   - **配方**的同步真相在 `goods.images[i].edit`（跟着行同步，任意设备都能二次编辑）；
 *     本地表 `image_edits` 里留一份副本作离线/回退用，读取时 `images[i].edit` 优先。
 *   - **底图的云端位置**在 `images[i].editSourceUri` / `editSourceCloudFileName`。
 *   - **底图的本机路径**只在本地表 `image_edits.sourcePath`：不能挂同步行——
 *     拉取会用远端整行覆盖 `images`，本地专用字段正是那样被静默抹掉的。
 *     删图 / 删商品 / 未保存就离开编辑页三条回收路径也都从这张表走。
 *
 * 业务组件不要直接碰 `image_edits` 表，统一经本模块。
 */
import {
  deleteImageEdit,
  deleteImageEditsByImageIds,
  deleteImageEditsBySourcePaths,
  getImageEdit,
  saveImageEdit
} from '@/utils/db/index'
import { deleteManagedLocalImages, extractManagedLocalImagePath, localImageFileExists } from '@/utils/image/localImage'
import { normalizeImageEditRecipe } from '@/utils/image/imageEditRecipe'

/**
 * 读出「可直接二次编辑」的状态。
 *
 * 配方不认识（模板已删 / 版本比本机新）→ null；
 * 底图本机没有但云端有 → 返回云端 URI（`fromCloud: true`），由调用方拉回本地。
 * 两边都没有（换设备 + 没同步到底图）→ null，入口顺势退回「快速编辑」，不会框上加框。
 *
 * @param {{ id?: string, edit?: unknown, editSourceUri?: string }} image
 * @returns {Promise<null | { recipe: NonNullable<ReturnType<typeof normalizeImageEditRecipe>>, sourceUri: string, sourcePath: string, fromCloud: boolean }>}
 */
export async function readImageEditState(image) {
  const imageId = String(image?.id || '')
  if (!imageId) return null

  const row = await getImageEdit(imageId).catch((e) => {
    console.error('[imageEdit] readImageEditState failed:', e)
    return null
  })

  // images[i].edit 是同步真相；本地表只是副本（还没同步出去的编辑靠它兜底）
  const recipe = normalizeImageEditRecipe(image?.edit) || normalizeImageEditRecipe(row?.recipe)
  if (!recipe) return null

  const cloudFileName = String(image?.editSourceCloudFileName || '').trim()
  const cloudUri = String(image?.editSourceUri || '').trim()
  // 本机底图记的云端文件名与当前行不一致 → 别的设备换过底图，本机这份是旧的，改用云端
  const localStale = Boolean(
    cloudFileName && row?.sourceCloudFileName && row.sourceCloudFileName !== cloudFileName
  )

  if (row?.sourceUri && !localStale) {
    const exists = await localImageFileExists(row.sourceUri, row.sourcePath).catch(() => false)
    if (exists) {
      return {
        recipe,
        sourceUri: row.sourceUri,
        sourcePath: row.sourcePath || '',
        // 空串 = 「本机这份是最新的」，不用跟云端比新旧
        sourceCloudFileName: String(row.sourceCloudFileName || ''),
        fromCloud: false
      }
    }
  }
  if (!cloudUri) return null

  return { recipe, sourceUri: cloudUri, sourcePath: '', sourceCloudFileName: cloudFileName, fromCloud: true }
}

/**
 * 记一份配方 + 底图的本机位置。
 * @param {{ imageId: string, goodsId?: string, recipe: unknown, sourceUri: string, sourcePath?: string, sourceCloudFileName?: string }} state
 * @returns {Promise<boolean>} 是否真的写入
 */
export async function persistImageEditState(state) {
  const imageId = String(state?.imageId || '')
  const recipe = normalizeImageEditRecipe(state?.recipe)
  const sourceUri = String(state?.sourceUri || '')
  if (!imageId || !recipe || !sourceUri) return false

  await saveImageEdit({
    imageId,
    goodsId: String(state.goodsId || ''),
    recipe,
    sourceUri,
    sourcePath: String(state.sourcePath || ''),
    sourceCloudFileName: String(state.sourceCloudFileName || ''),
    updatedAt: Date.now()
  })
  return true
}

/**
 * 忘掉某张图的配方，并回收它的底图文件（若已不在别处引用）。
 * @param {string} imageId
 * @returns {Promise<boolean>} 是否曾存在配方
 */
export async function forgetImageEditState(imageId) {
  const id = String(imageId || '')
  if (!id) return false
  const row = await getImageEdit(id).catch(() => null)
  await deleteImageEdit(id).catch((e) => {
    console.error('[imageEdit] forgetImageEditState failed:', e)
  })
  if (row?.sourcePath) await deleteManagedLocalImages([row.sourcePath])
  return Boolean(row)
}

/**
 * 按图片 id 批量回收配方与底图文件。
 * @param {Iterable<string>} imageIds
 * @returns {Promise<number>} 清掉的条数
 */
export async function forgetImageEditsByImageIds(imageIds) {
  const ids = [...new Set(Array.from(imageIds || []).map((id) => String(id || '')).filter(Boolean))]
  if (!ids.length) return 0

  const rows = await deleteImageEditsByImageIds(ids).catch((e) => {
    console.error('[imageEdit] forgetImageEditsByImageIds failed:', e)
    return []
  })
  const paths = rows.map((row) => row.sourcePath).filter(Boolean)
  if (paths.length) await deleteManagedLocalImages(paths)
  return rows.length
}

/**
 * 永久删除商品时：连带清掉这些商品的图片配方行与底图文件。
 * 走图片 id 而不是 goodsId——新增商品落库时才分配 id，写入配方时 goodsId 可能还是空串。
 *
 * @param {{ images?: any[] }[]} items
 * @returns {Promise<number>} 清理掉的配方条数
 */
export async function forgetImageEditsForGoodsItems(items) {
  const imageIds = []
  for (const item of items || []) {
    imageIds.push(...collectGoodsItemImageIds(item))
  }
  return await forgetImageEditsByImageIds(imageIds)
}

/**
 * 某张图从商品里被拿掉时（换图 / 更新覆盖）回收它的配方与底图。
 * 没有任何图片被移除时不会碰 DB，可以放心挂在热路径上。
 *
 * @param {{ images?: any[] } | null} previousItem
 * @param {{ images?: any[] } | null} nextItem
 * @returns {Promise<number>}
 */
export async function forgetImageEditsForRemovedImages(previousItem, nextItem) {
  const previousIds = collectGoodsItemImageIds(previousItem)
  if (!previousIds.length) return 0
  const nextIds = new Set(collectGoodsItemImageIds(nextItem))
  const removedIds = previousIds.filter((id) => !nextIds.has(id))
  return await forgetImageEditsByImageIds(removedIds)
}

/**
 * @param {{ images?: any[] } | null} item
 * @returns {string[]}
 */
function collectGoodsItemImageIds(item) {
  const ids = []
  for (const image of item?.images || []) {
    if (!image || typeof image === 'string') continue
    const id = String(image.id || '')
    if (id) ids.push(id)
  }
  return ids
}

/**
 * 未保存就离开编辑页：按底图路径丢掉对应的配方行（文件由会话清理负责删）。
 * @param {Iterable<string>} paths
 * @returns {Promise<number>}
 */
export async function forgetImageEditsBySourcePaths(paths) {
  const list = [...new Set(
    Array.from(paths || [])
      .map((path) => extractManagedLocalImagePath(path))
      .filter(Boolean)
  )]
  if (!list.length) return 0
  return await deleteImageEditsBySourcePaths(list).catch((e) => {
    console.error('[imageEdit] forgetImageEditsBySourcePaths failed:', e)
    return 0
  })
}
