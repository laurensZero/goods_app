// @ts-check
/**
 * MCP 可写工具实现：谷子增删改 + 应用设置（预设/主题/通知）。
 *
 * 数据操作必须走 store 而不是直接写 db：store 负责内存状态、字段归一化、
 * 状态时间线与云同步推送，绕过它会让界面与云端不一致。
 * 预设改名会级联更新谷子条目（presets 改清单 + goods 批量替换）。
 *
 * 这组工具不在 MCP 外部服务的工具列表里（外部保持只读），当前只供
 * 应用内 AI 聊天窗口使用。
 */

/** goods_add / goods_update 允许透传给 store 的字段白名单 */
const WRITABLE_FIELDS = new Set([
  'name', 'category', 'ip', 'characters', 'tags', 'variant', 'storageLocation',
  'price', 'actualPrice', 'currency', 'actualPriceCurrency', 'quantity',
  'acquiredAt', 'isWishlist', 'note',
  // 收藏状态与出售信息
  'collectStatus', 'sellPrice', 'sellPlatform', 'sellFee', 'sellDate', 'saleAt',
  // 逐件字段（整体替换，需传完整数组）
  'unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList',
  'unitCollectStatusList', 'unitSaleInfoList'
])

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** notify_settings_set 允许修改的字段白名单 */
const NOTIFY_KEYS = new Set([
  'enabled', 'saleReminder', 'birthdayEgg', 'syncSuccess', 'syncError',
  'updateAvailable', 'position', 'duration', 'vibration'
])

const APPEARANCE_VALUES = new Set(['system', 'light', 'dark'])

/**
 * 兼容列表状态形状：真实 pinia store 实例上 shallowRef 已解包为数组，
 * 单测假实现可能是 { value: [...] } 的 ref 形状——两者都兼容。
 * @param {unknown} value store.list / store.trashList 的原始值
 * @returns {any[]}
 */
function listOf(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(/** @type {any} */ (value)?.value)) return /** @type {any} */ (value).value
  return []
}

/** 预设清单条目可能是字符串或 {name} 对象，统一转名称 */
function presetName(entry) {
  return String(entry?.name ?? entry ?? '').trim()
}

/** 预设增删改的公共校验 */
function presetActionArgs(args) {
  const entity = String(args?.entity || '').trim()
  const action = String(args?.action || '').trim()
  const name = String(args?.name || '').trim()
  if (!['category', 'ip', 'character', 'storage_location'].includes(entity)) {
    throw new Error('entity 需为 category/ip/character/storage_location')
  }
  if (!['add', 'remove', 'rename'].includes(action)) {
    throw new Error('action 需为 add/remove/rename')
  }
  if (action === 'rename' && entity === 'storage_location') {
    throw new Error('收纳位置暂不支持重命名，可删除后重建')
  }
  if (!name) throw new Error('name 必填')
  return { entity, action, name, newName: String(args?.newName || '').trim(), ip: String(args?.ip || '').trim() }
}

/**
 * 校验并裁剪输入：只保留白名单字段，校验 name/quantity/日期格式。
 * @param {Record<string, any>} args
 * @param {{ requireName?: boolean }} [options]
 */
function sanitizeWritable(args, options = {}) {
  /** @type {Record<string, any>} */
  const data = {}
  for (const [key, value] of Object.entries(args || {})) {
    if (!WRITABLE_FIELDS.has(key) || value === undefined) continue
    data[key] = value
  }
  if (options.requireName && !String(data.name || '').trim()) {
    throw new Error('name 必填')
  }
  if (data.quantity !== undefined) {
    const quantity = Number(data.quantity)
    if (!Number.isFinite(quantity) || quantity < 1) throw new Error('quantity 必须为不小于 1 的数字')
    data.quantity = Math.floor(quantity)
  }
  if (data.acquiredAt !== undefined && data.acquiredAt !== '' && !DATE_PATTERN.test(String(data.acquiredAt))) {
    throw new Error('acquiredAt 需为 YYYY-MM-DD 格式')
  }
  if (data.characters !== undefined && !Array.isArray(data.characters)) {
    throw new Error('characters 需为字符串数组')
  }
  if (data.tags !== undefined && !Array.isArray(data.tags)) {
    throw new Error('tags 需为字符串数组')
  }
  for (const unitKey of ['unitAcquiredAtList', 'unitActualPriceList', 'unitCharacterList', 'unitCollectStatusList', 'unitSaleInfoList']) {
    if (data[unitKey] !== undefined && !Array.isArray(data[unitKey])) {
      throw new Error(`${unitKey} 需为数组（整体替换，请传完整列表）`)
    }
  }
  if (data.sellDate !== undefined && data.sellDate !== '' && !DATE_PATTERN.test(String(data.sellDate))) {
    throw new Error('sellDate 需为 YYYY-MM-DD 格式')
  }
  if (data.saleAt !== undefined && data.saleAt !== '' && !DATE_PATTERN.test(String(data.saleAt))) {
    throw new Error('saleAt 需为 YYYY-MM-DD 格式')
  }
  return data
}

/**
 * @typedef {Object} GoodsStoreLike
 * @property {(data: any) => Promise<any>} addGoods
 * @property {(id: string, data: any) => Promise<any>} updateGoods
 * @property {(id: string) => Promise<void>} removeGoods
 * @property {(id: string) => Promise<any>} restoreTrashItem
 * @property {any} list 条目列表（真实 store 解包为数组，单测可为 ref 形状）
 * @property {any} trashList 回收站列表（同上）
 */

/**
 * @param {{
 *  goodsStore: GoodsStoreLike,
 *  presetsStore?: any,
 *  themeStore?: any,
 *  notifyStore?: any,
 *  rechargeStore?: any,
 *  eventsStore?: any,
 *  mediaPlayerStore?: any
 * }} params
 */
export function createMcpWriteToolHandlers({ goodsStore, presetsStore, themeStore, notifyStore, rechargeStore, eventsStore, mediaPlayerStore }) {
  return {
    /**
     * @param {Record<string, any>} args
     */
    async goods_add(args) {
      const data = sanitizeWritable(args, { requireName: true })
      const created = await goodsStore.addGoods(data)
      if (!created?.id) throw new Error('新增失败')
      return {
        ok: true,
        id: created.id,
        item: {
          id: created.id,
          name: created.name,
          category: created.category,
          ip: created.ip,
          characters: created.characters,
          isWishlist: Boolean(created.isWishlist),
          quantity: created.quantity,
          acquiredAt: created.acquiredAt
        }
      }
    },

    /**
     * @param {Record<string, any>} args
     */
    async goods_update(args) {
      const { id, ...rest } = args || {}
      const targetId = String(id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!listOf(goodsStore.list).some((item) => item?.id === targetId)) {
        throw new Error(`未找到 id 为 ${targetId} 的条目（回收站中的条目请先用 goods_restore 恢复）`)
      }
      const data = sanitizeWritable(rest)
      if (Object.keys(data).length === 0) {
        throw new Error('没有可更新的字段')
      }
      await goodsStore.updateGoods(targetId, data)
      return { ok: true, id: targetId }
    },

    /**
     * @param {Record<string, any>} args
     */
    async goods_delete(args) {
      const targetId = String(args?.id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!listOf(goodsStore.list).some((item) => item?.id === targetId)) {
        throw new Error(`未找到 id 为 ${targetId} 的条目`)
      }
      await goodsStore.removeGoods(targetId)
      return { ok: true, id: targetId, note: '已移入回收站，可用 goods_restore 恢复' }
    },

    /**
     * @param {Record<string, any>} args
     */
    async goods_restore(args) {
      const targetId = String(args?.id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!listOf(goodsStore.trashList).some((item) => item?.id === targetId)) {
        throw new Error(`回收站中未找到 id 为 ${targetId} 的条目`)
      }
      await goodsStore.restoreTrashItem(targetId)
      return { ok: true, id: targetId }
    },

    /**
     * 记录出售/挂牌：整条级别（多件拆分走 goods_update 的逐件字段）。
     * @param {Record<string, any>} args
     */
    async goods_sell(args) {
      const targetId = String(args?.id || '').trim()
      if (!targetId) throw new Error('id 必填')
      if (!listOf(goodsStore.list).some((item) => item?.id === targetId)) {
        throw new Error(`未找到 id 为 ${targetId} 的条目（回收站中的条目请先恢复）`)
      }
      const status = String(args?.status || '已出').trim()
      if (!['已出', '在售'].includes(status)) {
        throw new Error('status 需为 已出/在售')
      }
      const date = String(args?.date || '').trim() || new Date().toISOString().slice(0, 10)
      if (!DATE_PATTERN.test(date)) throw new Error('date 需为 YYYY-MM-DD 格式')

      /** @type {Record<string, any>} */
      const data = { collectStatus: status, sellDate: date }
      for (const [key, argKey] of [['sellPrice', 'price'], ['sellPlatform', 'platform'], ['sellFee', 'fee']]) {
        const value = args?.[argKey]
        if (value !== undefined) data[key] = String(value)
      }
      await goodsStore.updateGoods(targetId, data)
      const price = Number(data.sellPrice) || 0
      const fee = Number(data.sellFee) || 0
      return {
        ok: true,
        id: targetId,
        status,
        price,
        fee,
        date: data.sellDate,
        note: status === '已出'
          ? '已记为成交；回血与盈亏可在 sale_ledger 查看'
          : '已记为挂牌中'
      }
    },

    /**
     * 记一笔游戏充值。
     * @param {Record<string, any>} args
     */
    async recharge_add(args) {
      if (!rechargeStore) throw new Error('充值模块不可用')
      const game = String(args?.game || '').trim()
      const amount = Number(args?.amount)
      if (!game) throw new Error('game 必填')
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount 需为大于 0 的数字')
      const chargedAt = String(args?.chargedAt || '').trim() || new Date().toISOString().slice(0, 10)
      if (!DATE_PATTERN.test(chargedAt)) throw new Error('chargedAt 需为 YYYY-MM-DD 格式')

      const record = await rechargeStore.addRecord({
        game,
        itemName: String(args?.itemName || ''),
        amount,
        chargedAt,
        note: String(args?.note || '')
      })
      if (!record) throw new Error('充值记录未通过校验（金额或日期不合法）')
      return { ok: true, id: record.id, game: record.game, amount: Number(record.amount) || 0, chargedAt: record.chargedAt }
    },

    /**
     * 查看应用设置与预设清单（修改前的现状参考）。
     */
    async settings_overview() {
      if (!presetsStore) throw new Error('预设模块不可用')
      const notify = notifyStore?.settings || {}
      return {
        theme: {
          appearancePreference: themeStore?.appearancePreference || 'system'
        },
        notifications: {
          enabled: Boolean(notify.enabled),
          saleReminder: Boolean(notify.saleReminder),
          birthdayEgg: Boolean(notify.birthdayEgg),
          syncSuccess: Boolean(notify.syncSuccess),
          syncError: Boolean(notify.syncError),
          updateAvailable: Boolean(notify.updateAvailable),
          position: notify.position,
          duration: notify.duration,
          vibration: Boolean(notify.vibration)
        },
        presets: {
          categories: (presetsStore.categories || []).slice(0, 80).map(presetName),
          ips: (presetsStore.ips || []).slice(0, 80).map(presetName),
          characters: (presetsStore.characters || []).slice(0, 80).map(presetName),
          storageLocations: (presetsStore.storageLocationPaths || []).slice(0, 80)
        }
      }
    },

    /**
     * 管理预设（分类/IP/角色/收纳位置）。改名同时级联谷子条目。
     * @param {Record<string, any>} args
     */
    async presets_manage(args) {
      if (!presetsStore) throw new Error('预设模块不可用')
      const { entity, action, name, newName, ip } = presetActionArgs(args)

      if (entity === 'storage_location') {
        if (action === 'add') {
          // 走路径创建（幂等），如 "A 柜/第二层"
          const created = await presetsStore.ensureStorageLocationPath(name)
          return { ok: true, entity, action, name, result: created ?? null }
        }
        // remove：按完整路径定位节点 id
        const nodes = Array.isArray(presetsStore.storageLocations) ? presetsStore.storageLocations : []
        let targetId = ''
        for (const node of nodes) {
          if (presetsStore.buildStorageLocationPathById(node.id) === name) {
            targetId = node.id
            break
          }
        }
        if (!targetId) throw new Error(`未找到名为 ${name} 的收纳位置`)
        await presetsStore.removeStorageLocation(targetId)
        return { ok: true, entity, action, name }
      }

      if (entity === 'category') {
        if (action === 'add') await presetsStore.addCategory(name)
        else if (action === 'remove') await presetsStore.removeCategory(name)
        else {
          if (!newName) throw new Error('rename 需要 newName')
          await presetsStore.updateCategoryName(name, newName)
          await goodsStore.replaceCategoryName(name, newName)
        }
      } else if (entity === 'ip') {
        if (action === 'add') await presetsStore.addIp(name)
        else if (action === 'remove') await presetsStore.removeIp(name)
        else {
          if (!newName) throw new Error('rename 需要 newName')
          await presetsStore.updateIpName(name, newName)
          await goodsStore.replaceIpName(name, newName)
        }
      } else {
        if (action === 'add') await presetsStore.addCharacter(name, ip)
        else if (action === 'remove') await presetsStore.removeCharacter(name)
        else {
          if (!newName) throw new Error('rename 需要 newName')
          await presetsStore.updateCharacterName(name, newName)
          await goodsStore.replaceCharacterName(name, newName)
        }
      }

      return { ok: true, entity, action, name, ...(newName ? { newName } : {}) }
    },

    /**
     * 切换主题外观偏好。
     * @param {Record<string, any>} args
     */
    async theme_set(args) {
      if (!themeStore) throw new Error('主题模块不可用')
      const appearance = String(args?.appearance || '').trim()
      if (!APPEARANCE_VALUES.has(appearance)) {
        throw new Error('appearance 需为 system/light/dark')
      }
      await themeStore.setAppearancePreference(appearance)
      return { ok: true, appearancePreference: themeStore.appearancePreference }
    },

    /**
     * 修改通知设置（白名单字段，部分更新）。
     * @param {Record<string, any>} args
     */
    async notify_settings_set(args) {
      if (!notifyStore) throw new Error('通知模块不可用')
      /** @type {Record<string, any>} */
      const patch = {}
      for (const key of NOTIFY_KEYS) {
        if (args?.[key] !== undefined) patch[key] = args[key]
      }
      if (Object.keys(patch).length === 0) {
        throw new Error('没有可修改的字段')
      }
      notifyStore.updateSettings(patch)
      return { ok: true, applied: patch }
    },

    /**
     * 拉起播放：在应用内播放演出曲单中的曲目（悬浮播放器 + 原生通知栏）。
     * 队列 = 该演出完整曲单，播完/手动切歌都在曲单内自动续播。
     * @param {Record<string, any>} args
     */
    async music_play(args) {
      if (!eventsStore || !mediaPlayerStore) throw new Error('音乐播放模块不可用')
      const eventId = String(args?.eventId || '').trim()
      const trackId = String(args?.trackId || '').trim()
      if (!eventId) throw new Error('eventId 必填（先从 event_tracks 结果里取）')
      if (!trackId) throw new Error('trackId 必填（先从 event_tracks 结果里取）')

      const events = Array.isArray(eventsStore.activeList) ? eventsStore.activeList : []
      const event = events.find((item) => item?.id === eventId)
      if (!event) throw new Error(`未找到 id 为 ${eventId} 的演出`)
      const tracks = Array.isArray(event.tracks) ? event.tracks : []
      const track = tracks.find((item) => String(item?.id || '').trim() === trackId)
      if (!track) throw new Error(`演出「${event.name || eventId}」下未找到 id 为 ${trackId} 的曲目`)

      const hasSongId = Boolean(
        String(track.neteaseSongId || '').trim() ||
        String(track.qqSongId || '').trim() ||
        String(track.bilibiliVideoId || '').trim()
      )
      if (!hasSongId) {
        throw new Error(`《${track.title || '未命名曲目'}》仅手动录入、未关联在线音源，无法直接播放；请在演出详情页的曲目编辑中为它导入音源`)
      }

      try {
        await mediaPlayerStore.playTrack(track, tracks)
      } catch (e) {
        throw new Error(`拉起播放失败：${e instanceof Error ? e.message : String(e)}`)
      }
      return {
        ok: true,
        eventId,
        event: event.name,
        playing: { trackId, title: track.title, artist: track.artist, source: track.source },
        queueSize: tracks.length,
        note: '已在应用内开始播放，队列 = 该演出曲单'
      }
    }
  }
}
