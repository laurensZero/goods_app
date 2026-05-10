import { readPersisted, writePersisted } from '@/utils/platformStorage'

export async function readSyncKey(key) {
  return readPersisted(key)
}

export async function writeSyncKey(key, value) {
  await writePersisted(key, value ?? '')
}

export async function readOrCreateDeviceId(key, generateDeviceId) {
  let id = await readPersisted(key)
  if (id) return id

  id = generateDeviceId()
  await writePersisted(key, id)
  return id
}
