// src/utils/syncColumnMapping.js
// camelCase ↔ snake_case 列名映射

const CAMEL_TO_SNAKE = {
  goodsId: 'goods_id',
  isWishlist: 'is_wishlist',
  storageLocation: 'storage_location',
  actualPrice: 'actual_price',
  acquiredAt: 'acquired_at',
  unitAcquiredAtList: 'unit_acquired_at_list',
  unitActualPriceList: 'unit_actual_price_list',
  unitCharacterList: 'unit_character_list',
  actualPriceCurrency: 'actual_price_currency',
  collectStatus: 'collect_status',
  shippingFee: 'shipping_fee',
  coverImage: 'cover_image',
  coverImageData: 'cover_image_data',
  ticketPrice: 'ticket_price',
  ticketType: 'ticket_type',
  seatInfo: 'seat_info',
  linkedGoodsIds: 'linked_goods_ids',
  startDate: 'start_date',
  endDate: 'end_date',
  itemName: 'item_name',
  chargedAt: 'charged_at',
  updatedAt: 'updated_at',
  createdAt: 'created_at',
  syncedBy: 'synced_by',
  // sync_manifest
  deviceId: 'device_id',
  syncedAt: 'synced_at',
  collectionCount: 'collection_count',
  wishlistCount: 'wishlist_count',
  imageCount: 'image_count',
  goodsCount: 'goods_count',
  trashCount: 'trash_count',
  rechargeCount: 'recharge_count',
  eventCount: 'event_count',
  rechargeUpdatedAt: 'recharge_updated_at',
  eventUpdatedAt: 'event_updated_at',
  imageBucket: 'image_bucket',
  budgetMonthly: 'budget_monthly',
  budgetYearly: 'budget_yearly',
  // sync_presets
  storageLocations: 'storage_locations'
}

const SNAKE_TO_CAMEL = Object.fromEntries(
  Object.entries(CAMEL_TO_SNAKE).map(([k, v]) => [v, k])
)

/**
 * 将 camelCase 对象转为 snake_case（用于写入 Supabase）
 */
export function toSnakeCase(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = CAMEL_TO_SNAKE[key] || key
    result[snakeKey] = value
  }
  return result
}

/**
 * 将 snake_case 对象转为 camelCase（用于从 Supabase 读取）
 */
export function toCamelCase(obj) {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = SNAKE_TO_CAMEL[key] || key
    result[camelKey] = value
  }
  return result
}

/**
 * 批量转换数组中的对象为 camelCase
 */
export function mapRowsToCamelCase(rows) {
  return rows.map(toCamelCase)
}
