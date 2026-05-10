import { triggerRef } from 'vue'
import { saveItems } from '@/utils/db'
import { normalizeCharacterName } from '@/stores/presets'
import { normalizeCharacterList } from '@/stores/goodsHelpers'

async function replaceCategoryName(oldName, newName, list, trashList, persistTrash) {
  const previous = String(oldName || '').trim()
  const next = String(newName || '').trim()
  if (!previous || !next || previous === next) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()

  list.value = list.value.map((item) => {
    if (item.category !== previous) return item
    listChanged = true
    return { ...item, category: next, updatedAt: now }
  })

  trashList.value = trashList.value.map((item) => {
    if (item.category !== previous) return item
    trashChanged = true
    return { ...item, category: next, updatedAt: now }
  })

  const updatedItems = list.value.filter(item => item.category === next)

  await Promise.all([
    listChanged ? saveItems(updatedItems) : Promise.resolve(),
    trashChanged ? persistTrash() : Promise.resolve()
  ])
}

async function replaceIpName(oldName, newName, list, trashList, persistTrash) {
  const previous = String(oldName || '').trim()
  const next = String(newName || '').trim()
  if (!previous || !next || previous === next) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()

  list.value = list.value.map((item) => {
    if (item.ip !== previous) return item
    listChanged = true
    return { ...item, ip: next, updatedAt: now }
  })

  trashList.value = trashList.value.map((item) => {
    if (item.ip !== previous) return item
    trashChanged = true
    return { ...item, ip: next, updatedAt: now }
  })

  const updatedItems = list.value.filter(item => item.ip === next)

  await Promise.all([
    listChanged ? saveItems(updatedItems) : Promise.resolve(),
    trashChanged ? persistTrash() : Promise.resolve()
  ])
}

async function replaceCharacterName(oldName, newName, list, trashList, persistTrash) {
  const previous = normalizeCharacterName(oldName)
  const next = normalizeCharacterName(newName)
  if (!previous || !next || previous === next) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()

  list.value = list.value.map((item) => {
    if (!item.characters?.includes(previous)) return item
    listChanged = true
    return {
      ...item,
      characters: normalizeCharacterList(
        item.characters.map((character) => (character === previous ? next : character))
      ),
      updatedAt: now
    }
  })

  trashList.value = trashList.value.map((item) => {
    if (!item.characters?.includes(previous)) return item
    trashChanged = true
    return {
      ...item,
      characters: normalizeCharacterList(
        item.characters.map((character) => (character === previous ? next : character))
      ),
      updatedAt: now
    }
  })

  const updatedItems = list.value.filter(item => item.characters?.includes(next))

  await Promise.all([
    listChanged ? saveItems(updatedItems) : Promise.resolve(),
    trashChanged ? persistTrash() : Promise.resolve()
  ])
}

async function syncCharacterIp(name, nextIp, previousIp, list, trashList, persistTrash) {
  const characterName = normalizeCharacterName(name)
  const currentIp = String(previousIp || '').trim()
  const targetIp = String(nextIp || '').trim()
  if (!characterName || currentIp === targetIp) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()

  const shouldSyncItem = (item) => {
    if (!item.characters?.includes(characterName)) return false
    const itemIp = String(item.ip || '').trim()
    return itemIp === currentIp || (!itemIp && targetIp)
  }

  list.value = list.value.map((item) => {
    if (!shouldSyncItem(item)) return item
    listChanged = true
    return { ...item, ip: targetIp, updatedAt: now }
  })

  trashList.value = trashList.value.map((item) => {
    if (!shouldSyncItem(item)) return item
    trashChanged = true
    return { ...item, ip: targetIp, updatedAt: now }
  })

  const updatedItems = list.value.filter(item => {
    if (!item.characters?.includes(characterName)) return false
    return item.ip === targetIp
  })

  await Promise.all([
    listChanged ? saveItems(updatedItems) : Promise.resolve(),
    trashChanged ? persistTrash() : Promise.resolve()
  ])
}

export {
  replaceCategoryName,
  replaceIpName,
  replaceCharacterName,
  syncCharacterIp
}
