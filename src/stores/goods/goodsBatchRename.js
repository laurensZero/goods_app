import { saveItems } from '@/utils/db/index'
import { normalizeCharacterName } from '@/stores/presets'
import { normalizeCharacterList } from '@/stores/goods/goodsHelpers'

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

/**
 * 角色改名 → 同步改写商品上的角色名。
 * @param {string} [scopeIp] 传入时只改该 IP 下的商品（角色身份是 (ip, name)，
 *   不同 IP 下的同名角色必须各自独立改名）；不传则维持旧的「按名字全局改」。
 */
async function replaceCharacterName(oldName, newName, scopeIp, list, trashList, triggerSync) {
  const previous = normalizeCharacterName(oldName)
  const next = normalizeCharacterName(newName)
  if (!previous || !next || previous === next) return

  const scoped = typeof scopeIp === 'string'
  const targetIp = String(scopeIp || '').trim()
  const matches = (item) => item.characters?.includes(previous)
    && (!scoped || String(item.ip || '').trim() === targetIp)

  let listChanged = false
  let trashChanged = false
  const now = Date.now()
  const changedIds = []

  list.value = list.value.map((item) => {
    if (!matches(item)) return item
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
    if (!matches(item)) return item
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
    ...list.value.filter((item) => item.characters?.includes(next) && (!scoped || String(item.ip || '').trim() === targetIp)),
    ...trashList.value.filter((item) => item.characters?.includes(next) && (!scoped || String(item.ip || '').trim() === targetIp))
  ]

  await Promise.all([
    updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve()
  ])

  if (typeof triggerSync === 'function') triggerSync(changedIds)
}

// ── 自定义字段值维护 ──
// 字段定义（presets）与字段值（goods.customFields）分开存在，所以「删字段 / 选项改名」
// 必须显式改写 goods 行，否则各设备仍留着旧值（孤儿键不展示但会一直同步）。
// mutateCustomFieldValues(defId, mutator)：mutator 返回新值，返回 null/'' 表示删除该键。
async function mutateCustomFieldValues(defId, mutator, list, trashList, triggerSync) {
  const targetId = String(defId || '').trim()
  if (!targetId || typeof mutator !== 'function') return

  let listChanged = false
  let trashChanged = false
  const changedIds = []
  const now = Date.now()

  const applyTo = (item, markChanged) => {
    const current = item?.customFields
    if (!current || typeof current !== 'object' || Array.isArray(current)) return item
    if (!Object.prototype.hasOwnProperty.call(current, targetId)) return item

    const nextValue = mutator(current[targetId])
    if (nextValue === undefined) return item

    const nextFields = { ...current }
    if (nextValue === null || nextValue === '') delete nextFields[targetId]
    else nextFields[targetId] = String(nextValue)

    markChanged()
    changedIds.push(item.id)
    return { ...item, customFields: nextFields, updatedAt: now }
  }

  list.value = list.value.map((item) => applyTo(item, () => { listChanged = true }))
  trashList.value = trashList.value.map((item) => applyTo(item, () => { trashChanged = true }))

  if (!listChanged && !trashChanged) return

  const changedIdSet = new Set(changedIds)
  const updatedItems = [
    ...list.value.filter((item) => changedIdSet.has(item.id)),
    ...trashList.value.filter((item) => changedIdSet.has(item.id))
  ]

  await Promise.all([
    updatedItems.length > 0 ? saveItems(updatedItems) : Promise.resolve()
  ])

  if (typeof triggerSync === 'function') triggerSync(changedIds)
}

/**
 * 清除某个自定义字段的值。
 * @param {string} defId 字段定义 id
 * @param {string|null} onlyValue 只清除等于该值的项；null = 清除该字段所有值
 */
async function clearCustomFieldValues(defId, onlyValue, list, trashList, triggerSync) {
  const filterValue = onlyValue == null ? null : String(onlyValue)
  return mutateCustomFieldValues(defId, (value) => {
    if (filterValue != null && String(value) !== filterValue) return undefined
    return null
  }, list, trashList, triggerSync)
}

/** select 选项改名级联更新已填值 */
async function renameCustomFieldOptionValue(defId, oldValue, newValue, list, trashList, triggerSync) {
  const from = String(oldValue == null ? '' : oldValue).trim()
  const to = String(newValue == null ? '' : newValue).trim()
  if (!from || !to || from === to) return
  return mutateCustomFieldValues(defId, (value) => (String(value) === from ? to : undefined), list, trashList, triggerSync)
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
  syncCharacterIp,
  clearCustomFieldValues,
  renameCustomFieldOptionValue
}
