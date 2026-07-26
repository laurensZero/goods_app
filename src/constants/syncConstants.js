// 集中管理同步相关常量（协议版本）

// Sync payload / manifest protocol versions
export const SYNC_PAYLOAD_VERSION = 7
export const RECHARGE_PAYLOAD_VERSION = 1
export const EVENT_PAYLOAD_VERSION = 3
export const EVENT_DATA_VERSION = 2
export const MANIFEST_VERSION = 1

// 其它可共享的同步相关常量
export const IMAGE_FILE_PREFIX = 'goods-image__'
export const EVENT_COVER_PREFIX = 'event-cover__'
export const EVENT_PHOTO_PREFIX = 'event-photo__'
export const IMAGE_FILE_SIZE_LIMIT = 1024 * 1024

// 增量拉取重叠窗口：since 水位回退该时长再查询，吸收设备间时钟偏移
// （行内 updated_at 是客户端时间戳）；合并为幂等 LWW，多拉无害
export const PULL_CLOCK_OVERLAP_MS = 10 * 60 * 1000
