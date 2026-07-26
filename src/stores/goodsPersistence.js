// @ts-check
import { readPersisted, writePersisted } from '@/utils/platform/storage'
import { parseJsonArray } from '@/utils/parseJsonArray'

const TRASH_STORAGE_KEY = 'goods_trash_items'
const IMAGES_MIGRATION_KEY = 'goods_images_migrated_v1'
const CHARACTERS_MIGRATION_KEY = 'goods_characters_normalized_v1'
const VARIANT_MIGRATION_KEY = 'goods_variant_normalized_v2'
const BASE64_URL_MIGRATION_KEY = 'goods_base64_url_replaced_v1'

//  Trash persistence

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
  readImagesMigrationFlag,
  writeImagesMigrationFlag,
  readCharactersMigrationFlag,
  writeCharactersMigrationFlag,
  readVariantMigrationFlag,
  writeVariantMigrationFlag,
  readBase64UrlMigrationFlag,
  writeBase64UrlMigrationFlag
}
