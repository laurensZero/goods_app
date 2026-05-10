/**
 * 核心数据模型类型定义
 *
 * 这些类型是商品、活动等数据结构的权威来源。
 * 在 JSDoc 中通过 @type {import('@/types/models').GoodsItem} 引用。
 */

/** 商品图片条目 */
export interface GoodsImage {
  id: string
  uri: string
  kind: 'primary' | 'custom' | string
  label: string
  storageMode: 'remote' | 'local' | 'gist-local' | 'inline-local' | string
  localPath: string
  gistFileName: string
  mimeType: string
  fileSize: number
  isPrimary: boolean
}

/** 音乐轨道条目 */
export interface TrackItem {
  id: string
  title: string
  artist: string
  album: string
  coverUrl: string
  durationMs: number
  source: 'netease' | 'manual' | string
  neteaseSongId: string
}

/** 活动封面图片数据 */
export interface EventCoverImageData {
  uri?: string
  storageMode?: string
  gistFileName?: string
  [key: string]: any
}

/** 商品完整对象（业务层 shape，对应 normalizeGoodsInput 返回值） */
export interface GoodsItem {
  id: string
  name: string
  category: string
  ip: string
  goodsId: string
  isWishlist: boolean
  characters: string[]
  tags: string[]
  storageLocation: string
  variant: string
  price: string
  actualPrice: string
  points: number | undefined
  acquiredAt: string
  unitAcquiredAtList: string[]
  unitActualPriceList: string[]
  unitCharacterList: string[]
  coverImage: string
  images: GoodsImage[]
  tracks: TrackItem[]
  note: string
  quantity: number
  updatedAt: number
  currency: string
  actualPriceCurrency: string
  collectStatus: string
  shippingFee: string
}

/** 商品表单状态（GoodsItem 去掉 id/updatedAt/coverImage） */
export type GoodsFormState = Omit<GoodsItem, 'id' | 'updatedAt' | 'coverImage'>

/** 商品 trash 条目 */
export type TrashGoodsItem = GoodsItem & { deletedAt: string }

/** 活动对象 */
export interface EventItem {
  id: string
  name: string
  type: string
  startDate: string
  endDate: string
  location: string
  description: string
  coverImage: string
  coverImageData: EventCoverImageData | null
  photos: string[]
  ticketPrice: string
  ticketType: string
  seatInfo: string
  tracks: TrackItem[]
  linkedGoodsIds: string[]
  tags: string[]
  createdAt: number
  updatedAt: number
}
