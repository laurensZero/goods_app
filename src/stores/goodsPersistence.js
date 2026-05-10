import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { parseJsonArray } from '@/utils/parseJsonArray'

const TRASH_STORAGE_KEY = 'goods_trash_items'
const IMAGES_MIGRATION_KEY = 'goods_images_migrated_v1'
const CHARACTERS_MIGRATION_KEY = 'goods_characters_normalized_v1'
const VARIANT_MIGRATION_KEY = 'goods_variant_normalized_v2'
const IS_NATIVE = Capacitor.isNativePlatform()

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
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key: TRASH_STORAGE_KEY })
      if (value !== null) return parseJsonArray(value)
    } catch {
      // fall through
    }
  }

  return readTrashLocal()
}

async function writePersistedTrash(list) {
  writeTrashLocal(list)

  if (!IS_NATIVE) return

  try {
    await Preferences.set({
      key: TRASH_STORAGE_KEY,
      value: JSON.stringify(list)
    })
  } catch {
    // ignore
  }
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
  if (IS_NATIVE) {
    try {
      const { value } = await Preferences.get({ key })
      return value === '1'
    } catch {
      return false
    }
  }
  return _readFlagLocal(key)
}

async function _writeFlag(key) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // ignore
  }

  if (!IS_NATIVE) return

  try {
    await Preferences.set({ key, value: '1' })
  } catch {
    // ignore
  }
}

function readImagesMigrationFlag() { return _readFlag(IMAGES_MIGRATION_KEY) }
function writeImagesMigrationFlag() { return _writeFlag(IMAGES_MIGRATION_KEY) }
function readCharactersMigrationFlag() { return _readFlag(CHARACTERS_MIGRATION_KEY) }
function writeCharactersMigrationFlag() { return _writeFlag(CHARACTERS_MIGRATION_KEY) }
function readVariantMigrationFlag() { return _readFlag(VARIANT_MIGRATION_KEY) }
function writeVariantMigrationFlag() { return _writeFlag(VARIANT_MIGRATION_KEY) }

export {
  readPersistedTrash,
  writePersistedTrash,
  readImagesMigrationFlag,
  writeImagesMigrationFlag,
  readCharactersMigrationFlag,
  writeCharactersMigrationFlag,
  readVariantMigrationFlag,
  writeVariantMigrationFlag
}
