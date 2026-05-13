import { saveItems } from '@/utils/db/index'
import {
  isStorageLocationUnderPrefix,
  normalizeStorageLocationValue,
  replaceStorageLocationPrefix as replaceStorageLocationPathPrefix
} from '@/utils/storageLocations'

async function replaceStorageLocationPrefix(oldPrefix, newPrefix, list) {
  const normalizedOldPrefix = normalizeStorageLocationValue(oldPrefix)
  const normalizedNewPrefix = normalizeStorageLocationValue(newPrefix)
  if (!normalizedOldPrefix || normalizedOldPrefix === normalizedNewPrefix) return

  let changed = false
  const now = Date.now()
  list.value = list.value.map((item) => {
    const nextLocation = replaceStorageLocationPathPrefix(
      item.storageLocation,
      normalizedOldPrefix,
      normalizedNewPrefix
    )

    if (nextLocation === item.storageLocation) return item
    changed = true
    return {
      ...item,
      storageLocation: nextLocation,
      updatedAt: now
    }
  })

  if (changed) {
    const updatedItems = list.value.filter(item => isStorageLocationUnderPrefix(item.storageLocation, normalizedNewPrefix) || item.storageLocation === normalizedNewPrefix)
    await saveItems(updatedItems)
  }
}

async function clearStorageLocationPrefix(prefix, list) {
  const normalizedPrefix = normalizeStorageLocationValue(prefix)
  if (!normalizedPrefix) return

  let changed = false
  const now = Date.now()
  list.value = list.value.map((item) => {
    if (!isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix)) {
      return item
    }

    changed = true
    return {
      ...item,
      storageLocation: '',
      updatedAt: now
    }
  })

  if (changed) {
    const updatedItems = list.value.filter(item => item.storageLocation === '' && !isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix))
    await saveItems(updatedItems)
  }
}

export {
  replaceStorageLocationPrefix,
  clearStorageLocationPrefix
}
