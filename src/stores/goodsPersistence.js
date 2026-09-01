// @ts-check
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { parseJsonArray } from '@/utils/parseJsonArray'

const TRASH_STORAGE_KEY = 'goods_trash_items'
const PURGED_TRASH_IDS_STORAGE_KEY = 'goods_purged_trash_ids'
const IMAGES_MIGRATION_KEY = 'goods_images_migrated_v1'
const CHARACTERS_MIGRATION_KEY = 'goods_characters_normalized_v1'
const VARIANT_MIGRATION_KEY = 'goods_variant_normalized_v2'
const BASE64_URL_MIGRATION_KEY = 'goods_base64_url_replaced_v1'

//  Trash persistence

// TODO(重构): 回收站迁移为「同表软删除」模型（对齐 events/recharge/groups）：
// trashList 的数据源从 Preferences（TRASH_STORAGE_KEY）改为 goods 表自身——
// 行已带 trashed=1 软删除标记，补 deletedAt 列后按标记分桶读取即可。
// 当前双轨存储（Preferences 回收站 + SQLite 软删除行）令同步合并必须跨桶按 id
// 手工对账（goodsSync.js 的 importTrashBackup/importGoodsBackup LWW 守卫、
// goods.js init 的 reconcileListTrashOverlap 自愈均为其补丁），同表模型可从
// 结构上消除「同 id 同时挂在收藏与回收站」的不一致。
// 迁移要点：启动时把 Preferences trashList 回填进 goods 表（trashList 是回收站
// 展示的权威源，SQLite 软删除行可能缺 deletedAt 等字段）；purgedTrashIds 墓碑
// 机制保留；回填完成写迁移 flag 后清空 TRASH_STORAGE_KEY。
function readTrashLocal() {
  try {
    return parseJsonArray(localStorage.getItem(TRASH_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeTrashLocal(list) {
  try {
    localStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

async function readPersistedTrash() {
  const value = await readPersisted(TRASH_STORAGE_KEY)
  if (value !== null) return parseJsonArray(value)
  return readTrashLocal()
}

async function writePersistedTrash(list) {
  const payload = JSON.stringify(list)
  writeTrashLocal(list)
  const ok = await writePersisted(TRASH_STORAGE_KEY, payload)
  if (ok) return
  // 写入失败重试一次；再失败则抛错，让调用方中止破坏性操作
  await writePersisted(TRASH_STORAGE_KEY, payload, { critical: true })
}

// 远端 goods 表的 trashed=1 行是永久墓碑，本地清空回收站后仍可能再次被增量拉取。
// 记录本地已经永久清除过的 id，避免云端墓碑更新时重新出现在本地。
function normalizePurgedTrashIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))]
}

async function readPersistedPurgedTrashIds() {
  const value = await readPersisted(PURGED_TRASH_IDS_STORAGE_KEY)
  if (value !== null) return new Set(normalizePurgedTrashIds(parseJsonArray(value)))
  try {
    return new Set(normalizePurgedTrashIds(parseJsonArray(localStorage.getItem(PURGED_TRASH_IDS_STORAGE_KEY))))
  } catch {
    return new Set()
  }
}

async function writePersistedPurgedTrashIds(ids) {
  const payload = JSON.stringify(normalizePurgedTrashIds(ids))
  const ok = await writePersisted(PURGED_TRASH_IDS_STORAGE_KEY, payload)
  if (ok) return
  await writePersisted(PURGED_TRASH_IDS_STORAGE_KEY, payload, { critical: true })
}

//  Migration flags

function _readFlagLocal(key) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

async function _readFlag(key) {
  const value = await readPersisted(key)
  if (value !== null) return value === '1'
  return _readFlagLocal(key)
}

async function _writeFlag(key) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // ignore
  }
  await writePersisted(key, '1')
}

function readImagesMigrationFlag() { return _readFlag(IMAGES_MIGRATION_KEY) }
function writeImagesMigrationFlag() { return _writeFlag(IMAGES_MIGRATION_KEY) }
function readCharactersMigrationFlag() { return _readFlag(CHARACTERS_MIGRATION_KEY) }
function writeCharactersMigrationFlag() { return _writeFlag(CHARACTERS_MIGRATION_KEY) }
function readVariantMigrationFlag() { return _readFlag(VARIANT_MIGRATION_KEY) }
function writeVariantMigrationFlag() { return _writeFlag(VARIANT_MIGRATION_KEY) }
function readBase64UrlMigrationFlag() { return _readFlag(BASE64_URL_MIGRATION_KEY) }
function writeBase64UrlMigrationFlag() { return _writeFlag(BASE64_URL_MIGRATION_KEY) }

export {
  readPersistedTrash,
  writePersistedTrash,
  readPersistedPurgedTrashIds,
  writePersistedPurgedTrashIds,
  readImagesMigrationFlag,
  writeImagesMigrationFlag,
  readCharactersMigrationFlag,
  writeCharactersMigrationFlag,
  readVariantMigrationFlag,
  writeVariantMigrationFlag,
  readBase64UrlMigrationFlag,
  writeBase64UrlMigrationFlag
}
