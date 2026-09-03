import { saveItems } from '@/utils/db/index'
import { normalizeCharacterName } from '@/stores/presets'
import { normalizeCharacterList } from '@/stores/goodsHelpers'

async function replaceCategoryName(oldName, newName, list, trashList, triggerSync) {
  const previous = String(oldName || '').trim()
  const next = String(newName || '').trim()
  if (!previous || !next || previous === next) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()
  const changedIds = []

  list.value = list.value.map((item) => {
    if (item.category !== previous) return item
    listChanged = true
    changedIds.push(item.id)
    return { ...item, category: next, updatedAt: now }
  })

  trashList.value = trashList.value.map((item) => {
    if (item.category !== previous) return item
    trashChanged = true
    changedIds.push(item.id)
    return { ...item, category: next, updatedAt: now }
  })

  if (!listChanged && !trashChanged) return

  const updatedItems = [
    ...list.value.filter(item => item.category === next),
    ...trashList.value.filter(item => item.category === next)
  ]

  await Promise.all([
    updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve()
  ])

  if (typeof triggerSync === 'function') triggerSync(changedIds)
}

async function replaceIpName(oldName, newName, list, trashList, triggerSync) {
  const previous = String(oldName || '').trim()
  const next = String(newName || '').trim()
  if (!previous || !next || previous === next) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()
  const changedIds = []

  list.value = list.value.map((item) => {
    if (item.ip !== previous) return item
    listChanged = true
    changedIds.push(item.id)
    return { ...item, ip: next, updatedAt: now }
  })

  trashList.value = trashList.value.map((item) => {
    if (item.ip !== previous) return item
    trashChanged = true
    changedIds.push(item.id)
    return { ...item, ip: next, updatedAt: now }
  })

  if (!listChanged && !trashChanged) return

  const updatedItems = [
    ...list.value.filter(item => item.ip === next),
    ...trashList.value.filter(item => item.ip === next)
  ]

  await Promise.all([
    updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve()
  ])

  if (typeof triggerSync === 'function') triggerSync(changedIds)
}

async function replaceCharacterName(oldName, newName, list, trashList, triggerSync) {
  const previous = normalizeCharacterName(oldName)
  const next = normalizeCharacterName(newName)
  if (!previous || !next || previous === next) return

  let listChanged = false
  let trashChanged = false
  const now = Date.now()
  const changedIds = []

  list.value = list.value.map((item) => {
    if (!item.characters?.includes(previous)) return item
    listChanged = true
    changedIds.push(item.id)
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
    changedIds.push(item.id)
    return {
      ...item,
      characters: normalizeCharacterList(
        item.characters.map((character) => (character === previous ? next : character))
      ),
      updatedAt: now
    }
  })

  if (!listChanged && !trashChanged) return

  const updatedItems = [
    ...list.value.filter(item => item.characters?.includes(next)),
    ...trashList.value.filter(item => item.characters?.includes(next))
  ]

  await Promise.all([
    updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve()
  ])

  if (typeof triggerSync === 'function') triggerSync(changedIds)
}

async function syncCharacterIp(name, nextIp, previousIp, list, trashList) {
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

  if (!listChanged && !trashChanged) return

  const updatedItems = [
    ...list.value.filter(item => {
      if (!item.characters?.includes(characterName)) return false
      return item.ip === targetIp
    }),
    ...trashList.value.filter(item => {
      if (!item.characters?.includes(characterName)) return false
      return item.ip === targetIp
    })
  ]

  await Promise.all([
    updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve()
  ])
}

export {
  replaceCategoryName,
  replaceIpName,
  replaceCharacterName,
  syncCharacterIp
}
