import { describe, it, expect, vi } from 'vitest'
import { createMcpWriteToolHandlers } from '../writeTools'

const shareMocks = vi.hoisted(() => ({
  createShare: vi.fn(),
  findMatchingShare: vi.fn(),
  updateShare: vi.fn(),
  toggleShareDisabled: vi.fn(),
  deleteShare: vi.fn(),
  listUserShares: vi.fn(),
  buildSharePayload: vi.fn(),
  generateShareId: vi.fn(),
  buildShareUrl: vi.fn()
}))

vi.mock('@/services/shareService', () => ({
  createShare: shareMocks.createShare,
  findMatchingShare: shareMocks.findMatchingShare,
  updateShare: shareMocks.updateShare,
  toggleShareDisabled: shareMocks.toggleShareDisabled,
  deleteShare: shareMocks.deleteShare,
  listUserShares: shareMocks.listUserShares
}))
vi.mock('@/utils/share/goods', () => ({
  buildSharePayload: shareMocks.buildSharePayload,
  generateShareId: shareMocks.generateShareId
}))
vi.mock('@/config/share', () => ({ buildShareUrl: shareMocks.buildShareUrl }))

function createFakeStore() {
  return {
    list: { value: [{ id: 'g1', name: '已有条目' }] },
    trashList: { value: [{ id: 't1', name: '回收站条目' }] },
    addGoods: vi.fn(async (data) => ({ id: 'new-1', name: data.name, isWishlist: Boolean(data.isWishlist), quantity: data.quantity ?? 1 })),
    updateGoods: vi.fn(async (id, data) => id + ':' + JSON.stringify(data)),
    removeGoods: vi.fn(async () => {}),
    restoreTrashItem: vi.fn(async () => {}),
    replaceCategoryName: vi.fn(async () => {}),
    replaceIpName: vi.fn(async () => {}),
    replaceCharacterName: vi.fn(async () => {})
  }
}

/** 设置类 store 的内存假实现 */
function createFakeSettingsStores() {
  return {
    presetsStore: {
      categories: ['吧唧', '立牌'],
      ips: ['原神'],
      characters: [{ name: '纳西妲', ip: '原神' }],
      storageLocations: [{ id: 'loc-1', name: 'A 柜', parentId: '' }],
      storageLocationPaths: ['A 柜'],
      addCategory: vi.fn(async () => true),
      removeCategory: vi.fn(async () => true),
      updateCategoryName: vi.fn(async () => true),
      addIp: vi.fn(async () => true),
      removeIp: vi.fn(async () => true),
      updateIpName: vi.fn(async () => true),
      addCharacter: vi.fn(async () => true),
      removeCharacter: vi.fn(async () => true),
      updateCharacterName: vi.fn(async () => true),
      ensureStorageLocationPath: vi.fn(async (path) => ({ path })),
      buildStorageLocationPathById: vi.fn((id) => (id === 'loc-1' ? 'A 柜' : ''))
    },
    themeStore: {
      appearancePreference: 'system',
      setAppearancePreference: vi.fn(async function (next) { this.appearancePreference = next })
    },
    notifyStore: {
      settings: { enabled: true, saleReminder: true, position: 'top-right', duration: 6000 },
      updateSettings: vi.fn(function (patch) { Object.assign(this.settings, patch) })
    }
  }
}

describe('mcp write tool handlers', () => {
  it('goods_add 只透传白名单字段并返回新条目 id', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_add({
      name: '初音 吧唧',
      category: '吧唧',
      characters: ['初音未来'],
      quantity: 2,
      acquiredAt: '2026-01-01',
      isWishlist: false,
      // 白名单外字段应被剥离
      images: ['x.png'],
      trashed: true,
      id: 'hack'
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('new-1')
    expect(store.addGoods).toHaveBeenCalledWith({
      name: '初音 吧唧',
      category: '吧唧',
      characters: ['初音未来'],
      quantity: 2,
      acquiredAt: '2026-01-01',
      isWishlist: false
    })
  })

  it('goods_update 兼容真实 store 的解包数组 list（回归：pinia shallowRef 解包后 list.value 为 undefined）', async () => {
    const store = createFakeStore()
    // 真实 pinia store 实例上 list 是解包后的数组，而非 { value: [...] }
    store.list = [{ id: 'g1', name: '已有条目' }]
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_update({ id: 'g1', note: '补个备注' })
    expect(result).toEqual({ ok: true, id: 'g1' })
    await expect(handlers.goods_update({ id: 'nope', note: 'x' })).rejects.toThrow('未找到')
  })

  it('goods_add 缺少 name 时报错', async () => {
    const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore() })
    await expect(handlers.goods_add({ category: '吧唧' })).rejects.toThrow('name 必填')
  })

  it('goods_add 校验 quantity 与 acquiredAt 格式', async () => {
    const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore() })
    await expect(handlers.goods_add({ name: 'x', quantity: 0 })).rejects.toThrow('quantity')
    await expect(handlers.goods_add({ name: 'x', acquiredAt: '2026/01/01' })).rejects.toThrow('acquiredAt')
  })

  it('goods_update 部分更新：校验 id 存在、拒绝空更新', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_update({ id: 'g1', note: '补个备注', storageLocation: 'A 柜' })
    expect(result).toEqual({ ok: true, id: 'g1' })
    expect(store.updateGoods).toHaveBeenCalledWith('g1', { note: '补个备注', storageLocation: 'A 柜' })

    // 出售信息与逐件字段在白名单内（整体替换）
    await handlers.goods_update({
      id: 'g1',
      collectStatus: '在售',
      sellPrice: '45',
      unitCollectStatusList: ['在售', '已拥有']
    })
    expect(store.updateGoods).toHaveBeenCalledWith('g1', {
      collectStatus: '在售',
      sellPrice: '45',
      unitCollectStatusList: ['在售', '已拥有']
    })
    await expect(handlers.goods_update({ id: 'g1', unitSaleInfoList: 'not-array' })).rejects.toThrow('unitSaleInfoList')
    await expect(handlers.goods_update({ id: 'g1', sellDate: '2026/1/1' })).rejects.toThrow('sellDate')

    await expect(handlers.goods_update({ id: 'nope', note: 'x' })).rejects.toThrow('未找到')
    await expect(handlers.goods_update({ id: 'g1' })).rejects.toThrow('没有可更新的字段')
    await expect(handlers.goods_update({ note: 'x' })).rejects.toThrow('id 必填')
  })

  it('goods_delete 移入回收站并提示可恢复', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_delete({ id: 'g1' })
    expect(result).toEqual({ ok: true, id: 'g1', note: '已移入回收站，可用 goods_restore 恢复' })
    expect(store.removeGoods).toHaveBeenCalledWith('g1')

    await expect(handlers.goods_delete({ id: 'nope' })).rejects.toThrow('未找到')
  })

  it('goods_sell 记录成交并写入出售信息', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    const result = await handlers.goods_sell({
      id: 'g1', price: 30, platform: '闲鱼', fee: 2, date: '2026-09-06'
    })
    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ id: 'g1', status: '已出', price: 30, fee: 2 })
    expect(store.updateGoods).toHaveBeenCalledWith('g1', {
      collectStatus: '已出',
      sellPrice: '30',
      sellPlatform: '闲鱼',
      sellFee: '2',
      sellDate: '2026-09-06'
    })

    // 挂牌模式 + 缺省日期落到今天
    const listing = await handlers.goods_sell({ id: 'g1', price: 25, status: '在售' })
    expect(listing.status).toBe('在售')
    expect(listing.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    await expect(handlers.goods_sell({ id: 'nope' })).rejects.toThrow('未找到')
    await expect(handlers.goods_sell({ id: 'g1', status: '丢回收站' })).rejects.toThrow('status')
    await expect(handlers.goods_sell({ id: 'g1', date: '2026/09/06' })).rejects.toThrow('date')
  })

  it('recharge_add 走充值 store 并校验金额/日期', async () => {
    const store = createFakeStore()
    const rechargeStore = {
      addRecord: vi.fn(async (data) => ({ id: 'r-new', ...data }))
    }
    const handlers = createMcpWriteToolHandlers({ goodsStore: store, rechargeStore })

    const result = await handlers.recharge_add({ game: '原神', amount: 648, itemName: '648 源石' })
    expect(result.ok).toBe(true)
    expect(result.amount).toBe(648)
    const data = rechargeStore.addRecord.mock.calls[0][0]
    expect(data.chargedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/) // 缺省今天

    await expect(handlers.recharge_add({ game: '原神', amount: 0 })).rejects.toThrow('amount')
    await expect(handlers.recharge_add({ amount: 100 })).rejects.toThrow('game')
    await expect(handlers.recharge_add({ game: 'x', amount: 10, chargedAt: 'bad' })).rejects.toThrow('chargedAt')
  })

  it('goods_restore 只允许恢复回收站条目', async () => {
    const store = createFakeStore()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store })

    expect((await handlers.goods_restore({ id: 't1' })).ok).toBe(true)
    await expect(handlers.goods_restore({ id: 'g1' })).rejects.toThrow('回收站中未找到')
  })

  it('settings_overview 返回主题/通知/预设清单', async () => {
    const store = createFakeStore()
    const { presetsStore, themeStore, notifyStore } = createFakeSettingsStores()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store, presetsStore, themeStore, notifyStore })

    const overview = await handlers.settings_overview()
    expect(overview.theme).toEqual({ appearancePreference: 'system' })
    expect(overview.notifications.enabled).toBe(true)
    expect(overview.presets.categories).toEqual(['吧唧', '立牌'])
    expect(overview.presets.storageLocations).toEqual(['A 柜'])
  })

  it('presets_manage 支持分类增删与级联改名', async () => {
    const store = createFakeStore()
    const { presetsStore } = createFakeSettingsStores()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store, presetsStore })

    expect((await handlers.presets_manage({ entity: 'category', action: 'add', name: '色纸' })).ok).toBe(true)
    expect(presetsStore.addCategory).toHaveBeenCalledWith('色纸')

    expect((await handlers.presets_manage({ entity: 'category', action: 'remove', name: '立牌' })).ok).toBe(true)
    expect(presetsStore.removeCategory).toHaveBeenCalledWith('立牌')

    const rename = await handlers.presets_manage({ entity: 'category', action: 'rename', name: '吧唧', newName: '徽章' })
    expect(rename.ok).toBe(true)
    expect(presetsStore.updateCategoryName).toHaveBeenCalledWith('吧唧', '徽章')
    expect(store.replaceCategoryName).toHaveBeenCalledWith('吧唧', '徽章')

    await expect(handlers.presets_manage({ entity: 'category', action: 'rename', name: '吧唧' })).rejects.toThrow('newName')
    await expect(handlers.presets_manage({ entity: 'storage_location', action: 'rename', name: 'A 柜' })).rejects.toThrow('暂不支持')
    await expect(handlers.presets_manage({ entity: 'nope', action: 'add', name: 'x' })).rejects.toThrow('entity')
  })

  it('presets_manage 收纳位置新增走路径创建，删除按路径定位', async () => {
    const store = createFakeStore()
    const { presetsStore } = createFakeSettingsStores()
    presetsStore.removeStorageLocation = vi.fn(async () => true)
    const handlers = createMcpWriteToolHandlers({ goodsStore: store, presetsStore })

    const added = await handlers.presets_manage({ entity: 'storage_location', action: 'add', name: 'A 柜/第二层' })
    expect(added.ok).toBe(true)
    expect(presetsStore.ensureStorageLocationPath).toHaveBeenCalledWith('A 柜/第二层')

    await expect(handlers.presets_manage({ entity: 'storage_location', action: 'remove', name: '不存在的柜子' })).rejects.toThrow('未找到')
  })

  it('theme_set 校验取值并写入', async () => {
    const store = createFakeStore()
    const { themeStore } = createFakeSettingsStores()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store, themeStore })

    expect((await handlers.theme_set({ appearance: 'dark' })).appearancePreference).toBe('dark')
    expect(themeStore.setAppearancePreference).toHaveBeenCalledWith('dark')
    await expect(handlers.theme_set({ appearance: 'blue' })).rejects.toThrow('appearance')
  })

  it('notify_settings_set 只应用白名单字段', async () => {
    const store = createFakeStore()
    const { notifyStore } = createFakeSettingsStores()
    const handlers = createMcpWriteToolHandlers({ goodsStore: store, notifyStore })

    const result = await handlers.notify_settings_set({ saleReminder: false, duration: 8000, evilKey: 'x' })
    expect(result.applied).toEqual({ saleReminder: false, duration: 8000 })
    expect(notifyStore.updateSettings).toHaveBeenCalledWith({ saleReminder: false, duration: 8000 })

    await expect(handlers.notify_settings_set({})).rejects.toThrow('没有可修改的字段')
  })

  describe('music_play', () => {
    const TRACKS = [
      { id: 't1', title: 'Melt', artist: '初音未来', source: 'netease', neteaseSongId: 'n1', qqSongId: '', bilibiliVideoId: '' },
      { id: 't2', title: '手写曲', artist: '', source: 'manual', neteaseSongId: '', qqSongId: '', bilibiliVideoId: '' }
    ]
    const EVENTS = [{ id: 'e1', name: 'CP 春季展', tracks: TRACKS }]

    function createFakeMusicStores() {
      return {
        eventsStore: { activeList: EVENTS },
        mediaPlayerStore: { playTrack: vi.fn(async () => {}) }
      }
    }

    it('按 eventId+trackId 拉起播放，队列为整场曲单', async () => {
      const { eventsStore, mediaPlayerStore } = createFakeMusicStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), eventsStore, mediaPlayerStore })

      const result = await handlers.music_play({ eventId: 'e1', trackId: 't1' })
      expect(result.ok).toBe(true)
      expect(result.playing).toMatchObject({ trackId: 't1', title: 'Melt' })
      expect(mediaPlayerStore.playTrack).toHaveBeenCalledWith(TRACKS[0], TRACKS)
      expect(result.queueSize).toBe(2)
    })

    it('未关联音源的曲目与未知演出/曲目报错', async () => {
      const { eventsStore, mediaPlayerStore } = createFakeMusicStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), eventsStore, mediaPlayerStore })

      await expect(handlers.music_play({ eventId: 'e1', trackId: 't2' })).rejects.toThrow('未关联在线音源')
      await expect(handlers.music_play({ eventId: 'nope', trackId: 't1' })).rejects.toThrow('未找到')
      await expect(handlers.music_play({ eventId: 'e1', trackId: 'nope' })).rejects.toThrow('未找到')
      expect(mediaPlayerStore.playTrack).not.toHaveBeenCalled()
    })

    it('playTrack 抛错（如版权限制）时转译为可读错误', async () => {
      const { eventsStore, mediaPlayerStore } = createFakeMusicStores()
      mediaPlayerStore.playTrack.mockRejectedValue(new Error('URL 解析失败'))
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), eventsStore, mediaPlayerStore })

      await expect(handlers.music_play({ eventId: 'e1', trackId: 't1' })).rejects.toThrow('拉起播放失败：URL 解析失败')
    })

    it('缺模块或缺参数给出引导性错误', async () => {
      const { eventsStore, mediaPlayerStore } = createFakeMusicStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore() })
      await expect(handlers.music_play({ eventId: 'e1', trackId: 't1' })).rejects.toThrow('音乐播放模块不可用')

      const okHandlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), eventsStore, mediaPlayerStore })
      await expect(okHandlers.music_play({ trackId: 't1' })).rejects.toThrow('eventId（演出曲单）或 goodsId（CD/专辑谷子）必填')
      await expect(okHandlers.music_play({ eventId: 'e1' })).rejects.toThrow('trackId 必填')
    })

    it('music_play 支持 goodsId 播放 CD/专辑谷子曲目', async () => {
      const store = createFakeStore()
      const albumTrack = { id: 'a1', title: '专辑曲 A', source: 'netease', neteaseSongId: 'n1', qqSongId: '', bilibiliVideoId: '' }
      // 真实 store 形状（shallowRef 已解包为数组）
      store.list = [{ id: 'cd1', name: '初音专辑', tracks: [albumTrack] }]
      const { eventsStore, mediaPlayerStore } = createFakeMusicStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: store, eventsStore, mediaPlayerStore })

      const result = await handlers.music_play({ goodsId: 'cd1', trackId: 'a1' })
      expect(result.ok).toBe(true)
      expect(result.from).toBe('goods')
      expect(result.name).toBe('初音专辑')
      expect(result.playing).toMatchObject({ trackId: 'a1', title: '专辑曲 A' })
      expect(mediaPlayerStore.playTrack).toHaveBeenCalledWith(albumTrack, [albumTrack])

      await expect(handlers.music_play({ eventId: 'e1', goodsId: 'cd1', trackId: 'a1' })).rejects.toThrow('二选一')
      await expect(handlers.music_play({ goodsId: 'nope', trackId: 'a1' })).rejects.toThrow('未找到')
    })
  })

  describe('应用动作工具', () => {
    /** @returns {any} */
    function createFakeActionStores() {
      return {
        authStore: {
          isLoggedIn: true,
          user: { id: 'u1' },
          userEmail: 'a@b.c',
          userDisplayName: '谷友',
          logout: vi.fn(async () => {})
        },
        syncStore: {
          isConfigured: true,
          isSyncing: false,
          lastSyncedAt: '2026-09-01T00:00:00Z',
          deviceId: 'dev1',
          sync: vi.fn(async () => ({ action: 'synced' })),
          autoPushGoods: vi.fn()
        },
        appUpdateStore: {
          currentVersion: '1.2.0',
          hasUpdate: true,
          latestVersion: '1.3.0',
          isForceUpdate: false,
          checkForUpdates: vi.fn(async () => ({ status: 'ok' }))
        },
        budgetApi: { write: vi.fn(async () => ({ monthly: 0, yearly: 0 })) },
        router: { push: vi.fn(async () => {}) }
      }
    }

    it('budget_set 校验并写入预算，随后触发同步推送', async () => {
      const stores = createFakeActionStores()
      stores.budgetApi.write.mockResolvedValue({ monthly: 200, yearly: 2400 })
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...stores })

      const result = await handlers.budget_set({ monthly: 200 })
      expect(stores.budgetApi.write).toHaveBeenCalledWith({ monthly: 200 })
      expect(result.budget).toEqual({ monthly: 200, yearly: 2400 })
      expect(stores.syncStore.autoPushGoods).toHaveBeenCalledWith('budget')

      await expect(handlers.budget_set({})).rejects.toThrow('没有可修改的字段')
      await expect(handlers.budget_set({ monthly: -5 })).rejects.toThrow('monthly')
    })

    it('sync_start 校验登录/配置并发起同步', async () => {
      const stores = createFakeActionStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...stores })

      const result = await handlers.sync_start()
      expect(stores.syncStore.sync).toHaveBeenCalled()
      expect(result.status).toBe('done')
      expect(result.lastSyncedAt).toBe('2026-09-01T00:00:00Z')

      const loggedOut = createFakeActionStores()
      loggedOut.authStore.isLoggedIn = false
      const h2 = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...loggedOut })
      await expect(h2.sync_start()).rejects.toThrow('请先登录')

      const syncing = createFakeActionStores()
      syncing.syncStore.isSyncing = true
      const h3 = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...syncing })
      expect((await h3.sync_start()).status).toBe('syncing')
    })

    it('share_create 复用同组分享并返回链接', async () => {
      shareMocks.buildSharePayload.mockResolvedValue({ goods: [{ name: '初音 吧唧' }] })
      shareMocks.findMatchingShare.mockResolvedValue({ shareId: 'ABC123', disabled: true })
      shareMocks.buildShareUrl.mockReturnValue('https://share.example/?s=ABC123')

      const store = createFakeStore()
      store.list = [{ id: 'g1', name: '初音 吧唧' }]
      const stores = createFakeActionStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: store, ...stores })

      const result = await handlers.share_create({ goodsIds: ['g1'] })
      expect(result).toMatchObject({ ok: true, shareId: 'ABC123', reused: true, url: 'https://share.example/?s=ABC123' })
      expect(shareMocks.updateShare).toHaveBeenCalledWith('ABC123', { goods: [{ name: '初音 吧唧' }] })
      expect(shareMocks.toggleShareDisabled).toHaveBeenCalledWith('ABC123', false)

      await expect(handlers.share_create({ goodsIds: [] })).rejects.toThrow('goodsIds 必填')
      await expect(handlers.share_create({ goodsIds: ['nope'] })).rejects.toThrow('未找到这些条目')

      const loggedOut = createFakeActionStores()
      loggedOut.authStore.isLoggedIn = false
      const h2 = createMcpWriteToolHandlers({ goodsStore: store, ...loggedOut })
      await expect(h2.share_create({ goodsIds: ['g1'] })).rejects.toThrow('请先登录')
    })

    it('share_manage 支持 list/toggle/delete', async () => {
      shareMocks.listUserShares.mockResolvedValue([
        { share_id: 'ABC123', payload: { goods: [{ name: 'x' }] }, created_at: '2026-01-01', disabled: false }
      ])
      const stores = createFakeActionStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...stores })

      const list = await handlers.share_manage({ action: 'list' })
      expect(list.total).toBe(1)
      expect(list.shares[0]).toMatchObject({ shareId: 'ABC123', goodsCount: 1, disabled: false })

      const toggled = await handlers.share_manage({ action: 'toggle', shareId: 'ABC123' })
      expect(toggled.disabled).toBe(true)
      expect(shareMocks.toggleShareDisabled).toHaveBeenLastCalledWith('ABC123', true)

      const enabled = await handlers.share_manage({ action: 'toggle', shareId: 'ABC123', disabled: false })
      expect(enabled.disabled).toBe(false)

      const removed = await handlers.share_manage({ action: 'delete', shareId: 'ABC123' })
      expect(removed.ok).toBe(true)
      expect(shareMocks.deleteShare).toHaveBeenCalledWith('ABC123')

      await expect(handlers.share_manage({ action: 'toggle' })).rejects.toThrow('shareId 必填')
      await expect(handlers.share_manage({ action: 'nope' })).rejects.toThrow('action')
    })

    it('navigate 映射路由并要求详情页 id', async () => {
      const stores = createFakeActionStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...stores })

      const result = await handlers.navigate({ page: 'statistics' })
      expect(stores.router.push).toHaveBeenCalledWith({ name: 'character-leaderboard' })
      expect(result.ok).toBe(true)

      await handlers.navigate({ page: 'goods_detail', id: 'g1' })
      expect(stores.router.push).toHaveBeenLastCalledWith({ name: 'detail', params: { id: 'g1' } })

      await expect(handlers.navigate({ page: 'goods_detail' })).rejects.toThrow('需要 id')
      await expect(handlers.navigate({ page: 'nope' })).rejects.toThrow('未知页面')
    })

    it('account_info/account_logout 与 app_info', async () => {
      const stores = createFakeActionStores()
      const handlers = createMcpWriteToolHandlers({ goodsStore: createFakeStore(), ...stores })

      const info = await handlers.account_info()
      expect(info).toMatchObject({ isLoggedIn: true, email: 'a@b.c', displayName: '谷友' })

      const loggedOut = await handlers.account_logout()
      expect(loggedOut.ok).toBe(true)
      expect(stores.authStore.logout).toHaveBeenCalled()

      const appInfo = await handlers.app_info({})
      expect(appInfo).toMatchObject({ platform: 'web', currentVersion: '1.2.0' })
      expect(appInfo.update.checked).toBe(false)

      const checked = await handlers.app_info({ checkUpdate: true })
      expect(checked.update).toMatchObject({ checked: true, hasUpdate: true, latestVersion: '1.3.0' })
      expect(stores.appUpdateStore.checkForUpdates).toHaveBeenCalled()
    })
  })
})
