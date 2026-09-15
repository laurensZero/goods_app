// @ts-check
import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { triggerRef } from 'vue'
import { createAutoPush } from '@/stores/storeCore'
import {
  getGroups,
  getGroupItems,
  saveGroups,
  saveGroupItems,
  deleteGroups,
  deleteGroupItems
} from '@/utils/db/index'

function generateGroupId() {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function generateGroupItemId() {
  return `gi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const useGoodsGroupStore = defineStore('goodsGroup', () => {
  /** @type {import('vue').ShallowRef<import('@/types/models').GoodsGroup[]>} */
  const groupList = shallowRef([])
  /** @type {import('vue').ShallowRef<import('@/types/models').GoodsGroupItem[]>} */
  const groupItemList = shallowRef([])
  const isReady = ref(false)

  // ── Computed getters ──

  const _groupByIdMap = computed(() => new Map(groupList.value.map(g => [g.id, g])))
  const getGroupById = computed(() => (id) => _groupByIdMap.value.get(id))

  const collectionGroups = computed(() => groupList.value.filter(g => g.type === 'collection' && !g.deleted))
  const wishlistGroups = computed(() => groupList.value.filter(g => g.type === 'wishlist' && !g.deleted))

  /** 获取某个组的成员关系列表（按 sortOrder 排序） */
  const groupItemsOf = computed(() => (groupId) => {
    return groupItemList.value
      .filter(item => item.groupId === groupId && !item.deleted)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  })

  /** 反向查询：某个谷子所属的组 ID */
  const getGoodsGroupId = computed(() => (goodsId) => {
    const item = groupItemList.value.find(i => i.goodsId === goodsId && !i.deleted)
    return item ? item.groupId : null
  })

  /** 获取某个组及其成员的 goods 数据（需要传入 goodsStore.list） */
  const getGroupWithItems = computed(() => (groupId, goodsList) => {
    const group = _groupByIdMap.value.get(groupId)
    if (!group) return null
    const items = groupItemList.value
      .filter(i => i.groupId === groupId && !i.deleted)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const goodsMap = new Map(goodsList.map(g => [g.id, g]))
    const memberGoods = items
      .map(i => goodsMap.get(i.goodsId))
      .filter(Boolean)
    return { group, items, memberGoods }
  })

  const autoPush = createAutoPush('group')

  // ── Init ──

  async function init() {
    const [groupsResult, itemsResult] = await Promise.allSettled([getGroups(), getGroupItems()])

    if (groupsResult.status === 'fulfilled') {
      groupList.value = groupsResult.value
    } else {
      console.error('[goodsGroup] init: getGroups failed:', groupsResult.reason)
      groupList.value = []
    }

    if (itemsResult.status === 'fulfilled') {
      groupItemList.value = itemsResult.value
    } else {
      console.error('[goodsGroup] init: getGroupItems failed:', itemsResult.reason)
      groupItemList.value = []
    }

    isReady.value = true
  }

  // ── CRUD: Groups ──

  async function addGroup(data) {
    const now = Date.now()
    const group = {
      id: generateGroupId(),
      name: data.name || '',
      type: data.type || 'collection',
      summaryMode: data.summaryMode || 'auto',
      totalAmount: Number(data.totalAmount) || 0,
      currency: data.currency || 'CNY',
      coverMode: data.coverMode || 'auto',
      coverItemId: data.coverItemId || '',
      displayMode: data.displayMode || 'list',
      note: data.note || '',
      createdAt: now,
      updatedAt: now
    }
    groupList.value = [group, ...groupList.value]
    triggerRef(groupList)
    try {
      await saveGroups([group])
    } catch (e) {
      console.error('[goodsGroup] addGroup DB write failed:', e)
      throw e
    }
    autoPush()
    return group
  }

  async function updateGroup(id, data) {
    const idx = groupList.value.findIndex(g => g.id === id)
    if (idx === -1) return null

    const updated = {
      ...groupList.value[idx],
      ...data,
      id, // 保持 ID 不变
      updatedAt: Date.now()
    }
    groupList.value = [...groupList.value.slice(0, idx), updated, ...groupList.value.slice(idx + 1)]
    triggerRef(groupList)
    try {
      await saveGroups([updated])
    } catch (e) {
      console.error('[goodsGroup] updateGroup DB write failed:', e)
      throw e
    }
    autoPush()
    return updated
  }

  async function removeGroup(id) {
    const idx = groupList.value.findIndex(g => g.id === id)
    if (idx === -1) return
    const target = groupList.value[idx]
    if (target.deleted) return

    const now = Date.now()
    groupList.value = [
      ...groupList.value.slice(0, idx),
      { ...target, deleted: true, updatedAt: now },
      ...groupList.value.slice(idx + 1)
    ]
    // Mark all items in this group as deleted too
    groupItemList.value = groupItemList.value.map(item =>
      item.groupId === id && !item.deleted
        ? { ...item, deleted: true, updatedAt: now }
        : item
    )

    try {
      const updatedItems = groupItemList.value.filter(i => i.groupId === id && i.deleted)
      const tasks = [saveGroups([groupList.value[idx]])]
      if (updatedItems.length > 0) tasks.push(saveGroupItems(updatedItems))
      await Promise.all(tasks)
    } catch (e) {
      console.error('[goodsGroup] removeGroup DB write failed:', e)
      throw e
    }
    autoPush()
  }

  // ── CRUD: Group Items ──

  async function addItemsToGroup(groupId, goodsIds) {
    const now = Date.now()
    const existingGoodsIds = new Set(
      groupItemList.value.filter(i => i.groupId === groupId && !i.deleted).map(i => i.goodsId)
    )
    const maxSortOrder = Math.max(0, ...groupItemList.value.filter(i => i.groupId === groupId).map(i => i.sortOrder))

    const newItems = goodsIds
      .filter(gid => !existingGoodsIds.has(gid))
      .map((gid, index) => ({
        id: generateGroupItemId(),
        groupId,
        goodsId: gid,
        sortOrder: maxSortOrder + index + 1,
        createdAt: now,
        updatedAt: now
      }))

    if (newItems.length === 0) return []

    groupItemList.value = [...groupItemList.value, ...newItems]
    triggerRef(groupItemList)
    try {
      await saveGroupItems(newItems)
    } catch (e) {
      console.error('[goodsGroup] addItemsToGroup DB write failed:', e)
      throw e
    }
    autoPush()
    return newItems
  }

  async function removeItemsFromGroup(goodsIds) {
    const goodsIdSet = new Set(goodsIds)
    const now = Date.now()
    let changed = false
    groupItemList.value = groupItemList.value.map(i => {
      if (!goodsIdSet.has(i.goodsId) || i.deleted) return i
      changed = true
      return { ...i, deleted: true, updatedAt: now }
    })
    if (!changed) return

    try {
      await saveGroupItems(groupItemList.value.filter(i => goodsIdSet.has(i.goodsId) && i.deleted))
    } catch (e) {
      console.error('[goodsGroup] removeItemsFromGroup DB write failed:', e)
      throw e
    }
    autoPush()
  }

  async function updateGroupItem(id, data) {
    const idx = groupItemList.value.findIndex(i => i.id === id)
    if (idx === -1) return null

    const updated = {
      ...groupItemList.value[idx],
      ...data,
      id,
      updatedAt: Date.now()
    }
    groupItemList.value = [...groupItemList.value.slice(0, idx), updated, ...groupItemList.value.slice(idx + 1)]
    triggerRef(groupItemList)
    try {
      await saveGroupItems([updated])
    } catch (e) {
      console.error('[goodsGroup] updateGroupItem DB write failed:', e)
      throw e
    }
    autoPush()
    return updated
  }

  async function moveItemToGroup(goodsId, targetGroupId) {
    const existing = groupItemList.value.find(i => i.goodsId === goodsId && !i.deleted)
    if (existing) {
      // 已在某个组中，更新 groupId
      return updateGroupItem(existing.id, { groupId: targetGroupId })
    } else {
      // 不在任何组中，新增
      const items = await addItemsToGroup(targetGroupId, [goodsId])
      return items[0] || null
    }
  }

  async function reorderGroupItems(groupId, orderedGoodsIds) {
    const now = Date.now()
    const itemsMap = new Map(
      groupItemList.value
        .filter(i => i.groupId === groupId && !i.deleted)
        .map(i => [i.goodsId, i])
    )

    const updatedItems = []
    for (let idx = 0; idx < orderedGoodsIds.length; idx++) {
      const gid = orderedGoodsIds[idx]
      const item = itemsMap.get(gid)
      if (item && item.sortOrder !== idx) {
        updatedItems.push({ ...item, sortOrder: idx, updatedAt: now })
      }
    }

    if (updatedItems.length === 0) return

    const updatedIds = new Set(updatedItems.map(i => i.id))
    groupItemList.value = groupItemList.value.map(i =>
      updatedIds.has(i.id) ? updatedItems.find(u => u.id === i.id) : i
    )
    triggerRef(groupItemList)
    try {
      await saveGroupItems(updatedItems)
    } catch (e) {
      console.error('[goodsGroup] reorderGroupItems DB write failed:', e)
      throw e
    }
    autoPush()
  }

  // ── Sync helpers ──

  async function refreshGroupList() {
    const [groups, items] = await Promise.all([getGroups(), getGroupItems()])
    groupList.value = groups
    groupItemList.value = items
  }

  async function importGroupsBackup(groups, items) {
    if (Array.isArray(groups) && groups.length > 0) {
      groupList.value = groups
      await saveGroups(groups)
    }
    if (Array.isArray(items) && items.length > 0) {
      groupItemList.value = items
      await saveGroupItems(items)
    }
  }

  async function purgeSyncedDeleted() {
    const deletedGroupIds = groupList.value.filter(g => g.deleted).map(g => g.id)
    const deletedItemIds = groupItemList.value.filter(i => i.deleted).map(i => i.id)
    if (deletedGroupIds.length === 0 && deletedItemIds.length === 0) return 0

    try {
      const tasks = []
      if (deletedGroupIds.length > 0) tasks.push(deleteGroups(deletedGroupIds))
      if (deletedItemIds.length > 0) tasks.push(deleteGroupItems(deletedItemIds))
      await Promise.all(tasks)
      groupList.value = groupList.value.filter(g => !g.deleted)
      groupItemList.value = groupItemList.value.filter(i => !i.deleted)
      return deletedGroupIds.length + deletedItemIds.length
    } catch (e) {
      console.error('[goodsGroup] purgeSyncedDeleted failed:', e)
      throw e
    }
  }

  // LWW 合并单行：远端更新则取远端并标记变更。时间戳相等的删除态若本地已删除则
  // 视为无变化——增量拉取的时钟重叠窗口会反复拉回本机刚推送的行。
  // ⚠️ groups/groupItems 目前直通远端整行（无白名单）。若将来引入白名单裁剪字段，
  // 增删会同步的字段时必须 bump `src/constants/syncConstants.js` 的 SYNC_SCHEMA_VERSION。
  function mergeRemoteRow(local, remote, markChanged, forceReapply = false) {
    if (!remote) return local
    const remoteTs = remote.updatedAt || 0
    const localTs = local.updatedAt || 0
    if (remote.deleted && remoteTs >= localTs) {
      if (local.deleted && remoteTs === localTs) return local
      markChanged()
      return remote
    }
    if (remoteTs > localTs || (forceReapply && remoteTs === localTs)) {
      markChanged()
      return remote
    }
    return local
  }

  async function updateGroupsBackup(groups, items, { forceReapply = false } = {}) {
    if (Array.isArray(groups) && groups.length > 0) {
      const remoteMap = new Map(groups.map(g => [g.id, g]))
      let changed = false
      const markChanged = () => { changed = true }
      const merged = groupList.value.map(local => mergeRemoteRow(local, remoteMap.get(local.id), markChanged, forceReapply))
      // 添加远端有、本地没有的
      const localIds = new Set(groupList.value.map(g => g.id))
      for (const remote of groups) {
        if (!localIds.has(remote.id)) {
          merged.push(remote)
          changed = true
        }
      }
      // 无实际变化时不替换数组也不落库，避免每次拉取都触发全量重渲染 + 全表重写
      if (changed) {
        groupList.value = merged
        await saveGroups(merged)
      }
    }
    if (Array.isArray(items) && items.length > 0) {
      const remoteMap = new Map(items.map(i => [i.id, i]))
      let changed = false
      const markChanged = () => { changed = true }
      const merged = groupItemList.value.map(local => mergeRemoteRow(local, remoteMap.get(local.id), markChanged, forceReapply))
      const localIds = new Set(groupItemList.value.map(i => i.id))
      for (const remote of items) {
        if (!localIds.has(remote.id)) {
          merged.push(remote)
          changed = true
        }
      }
      if (changed) {
        groupItemList.value = merged
        await saveGroupItems(merged)
      }
    }
  }

  return {
    // State
    groupList,
    groupItemList,
    isReady,

    // Getters
    getGroupById,
    collectionGroups,
    wishlistGroups,
    groupItemsOf,
    getGoodsGroupId,
    getGroupWithItems,

    // CRUD
    init,
    addGroup,
    updateGroup,
    removeGroup,
    addItemsToGroup,
    removeItemsFromGroup,
    updateGroupItem,
    moveItemToGroup,
    reorderGroupItems,

    // Sync
    refreshGroupList,
    importGroupsBackup,
    updateGroupsBackup,
    purgeSyncedDeleted
  }
})
