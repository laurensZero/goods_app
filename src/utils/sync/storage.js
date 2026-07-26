import { readPersisted, writePersisted, removePersisted } from '@/utils/platform/storage'

export async function readSyncKey(key) {
  return readPersisted(key)
}

export async function writeSyncKey(key, value) {
  await writePersisted(key, value ?? '')
}

export async function removeSyncKey(key) {
  // removePersisted 会同时删除 localStorage 与 Preferences 中的副本
  await removePersisted(key)
}

export async function readOrCreateDeviceId(key, generateDeviceId) {
  let id = await readPersisted(key)
  if (id) return id

  id = generateDeviceId()
  await writePersisted(key, id)
  return id
}
