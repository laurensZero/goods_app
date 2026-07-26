import { saveItems } from '@/utils/db/index'
import {
  isStorageLocationUnderPrefix,
  normalizeStorageLocationValue,
  replaceStorageLocationPrefix as replaceStorageLocationPathPrefix
} from '@/utils/storageLocations'

async function replaceStorageLocationPrefix(oldPrefix, newPrefix, list, triggerSync) {
  const normalizedOldPrefix = normalizeStorageLocationValue(oldPrefix)
  const normalizedNewPrefix = normalizeStorageLocationValue(newPrefix)
  if (!normalizedOldPrefix || normalizedOldPrefix === normalizedNewPrefix) return

  let changed = false
  const now = Date.now()
  const changedIds = []
  list.value = list.value.map((item) => {
    const nextLocation = replaceStorageLocationPathPrefix(
      item.storageLocation,
      normalizedOldPrefix,
      normalizedNewPrefix
    )

    if (nextLocation === item.storageLocation) return item
    changed = true
    changedIds.push(item.id)
    return {
      ...item,
      storageLocation: nextLocation,
      updatedAt: now
    }
  })

  if (changed) {
    const updatedItems = list.value.filter(item => isStorageLocationUnderPrefix(item.storageLocation, normalizedNewPrefix) || item.storageLocation === normalizedNewPrefix)
    await saveItems(updatedItems)
    if (typeof triggerSync === 'function') triggerSync(changedIds)
  }
}

async function clearStorageLocationPrefix(prefix, list, triggerSync) {
  const normalizedPrefix = normalizeStorageLocationValue(prefix)
  if (!normalizedPrefix) return

  let changed = false
  const now = Date.now()
  const changedIds = []
  list.value = list.value.map((item) => {
    if (!isStorageLocationUnderPrefix(item.storageLocation, normalizedPrefix)) {
      return item
    }

    changed = true
    changedIds.push(item.id)
    return {
      ...item,
      storageLocation: '',
      updatedAt: now
    }
  })

  if (changed) {
    const changedIdSet = new Set(changedIds)
    const updatedItems = list.value.filter(item => changedIdSet.has(item.id))
    await saveItems(updatedItems)
    if (typeof triggerSync === 'function') triggerSync(changedIds)
  }
}

export {
  replaceStorageLocationPrefix,
  clearStorageLocationPrefix
}
