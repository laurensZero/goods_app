import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTableToolHandlers, TABLE_TOOL_DEFINITIONS, MAPPABLE_FIELDS } from '../tableImportTools'

const CSV = '名称,类型,价格,数量,入手日期,角色\n吧唧,原神,30,2,2024-03-01,纳西妲\n立牌,,50,,2024/03/15,芙宁娜;那维莱特\n,,abc,x,bad-date,\n'

function makeGoodsStore() {
  return {
    addGoodsBatch: vi.fn(async (items) => items.map((item, i) => ({ id: `g${i + 1}`, ...item })))
  }
}

function makeHandlers(overrides = {}) {
  const goodsStore = overrides.goodsStore || makeGoodsStore()
  return {
    goodsStore,
    handlers: createTableToolHandlers({
      getAttachments: () => [{ id: 't1', type: 'table', filename: 'goods.csv', uri: '' }],
      readTableContent: async () => CSV,
      goodsStore,
      ...overrides
    })
  }
}

describe('tableImportTools', () => {
  beforeEach(() => {})

  it('导出 table_dryrun / table_commit 定义，无独立 preview', () => {
    const names = TABLE_TOOL_DEFINITIONS.map((d) => d.name)
    expect(names).toContain('table_dryrun')
    expect(names).toContain('table_commit')
    expect(names).not.toContain('table_preview')
  })

  it('MAPPABLE_FIELDS 含核心字段', () => {
    expect(MAPPABLE_FIELDS).toContain('name')
    expect(MAPPABLE_FIELDS).toContain('price')
    expect(MAPPABLE_FIELDS).toContain('acquiredAt')
  })

  it('table_dryrun 不带 mapping：返回结构与样本，不写库', async () => {
    const { handlers, goodsStore } = makeHandlers()
    const result = await handlers.table_dryrun({ table: '1' })
    expect(result.mode).toBe('structure')
    expect(result.headers).toEqual(['名称', '类型', '价格', '数量', '入手日期', '角色'])
    expect(result.rowCount).toBe(3)
    expect(result.sampleRows).toHaveLength(3)
    expect(result.mappableFields).toContain('name')
    expect(goodsStore.addGoodsBatch).not.toHaveBeenCalled()
  })

  it('table_dryrun 带 mapping：校验并转换，不写库', async () => {
    const { handlers, goodsStore } = makeHandlers()
    const result = await handlers.table_dryrun({
      table: 'att:t1',
      mapping: {
        name: '名称',
        category: '类型',
        price: '价格',
        quantity: '数量',
        acquiredAt: '入手日期',
        characters: '角色'
      }
    })
    expect(result.mode).toBe('dryrun')
    expect(result.validCount).toBe(2)
    expect(result.errorCount).toBe(1)
    expect(result.errors[0]).toMatchObject({ rowIndex: 4 })
    expect(result.preview[0].data).toMatchObject({
      name: '吧唧',
      category: '原神',
      price: '30',
      quantity: 2,
      acquiredAt: '2024-03-01',
      characters: ['纳西妲']
    })
    expect(result.preview[1].data.acquiredAt).toBe('2024-03-15')
    expect(result.preview[1].data.characters).toEqual(['芙宁娜', '那维莱特'])
    expect(goodsStore.addGoodsBatch).not.toHaveBeenCalled()
  })

  it('table_dryrun：列不存在时报错并列出可用表头', async () => {
    const { handlers } = makeHandlers()
    await expect(
      handlers.table_dryrun({ table: '1', mapping: { name: '不存在的列' } })
    ).rejects.toThrow('映射的列不存在')
  })

  it('table_dryrun：缺 name 映射时报错', async () => {
    const { handlers } = makeHandlers()
    await expect(
      handlers.table_dryrun({ table: '1', mapping: { price: '价格' } })
    ).rejects.toThrow('name')
  })

  it('table_commit：未 dryrun 时拒绝', async () => {
    const { handlers, goodsStore } = makeHandlers()
    await expect(
      handlers.table_commit({ table: '1', mapping: { name: '名称' }, dryRunConfirmed: true })
    ).rejects.toThrow('dryrun')
    expect(goodsStore.addGoodsBatch).not.toHaveBeenCalled()
  })

  it('table_commit：dryRunConfirmed 不为 true 时拒绝', async () => {
    const { handlers, goodsStore } = makeHandlers()
    await expect(
      handlers.table_commit({ table: '1', mapping: { name: '名称' }, dryRunConfirmed: false })
    ).rejects.toThrow('dryRunConfirmed')
    expect(goodsStore.addGoodsBatch).not.toHaveBeenCalled()
  })

  it('table_commit：dryrun 后且 confirmed 才写入', async () => {
    const { handlers, goodsStore } = makeHandlers()
    const mapping = { name: '名称', category: '类型', price: '价格' }
    await handlers.table_dryrun({ table: '1', mapping })
    const result = await handlers.table_commit({
      table: '1',
      mapping,
      dryRunConfirmed: true
    })
    expect(result.ok).toBe(true)
    expect(result.createdCount).toBe(2)
    expect(result.skippedCount).toBe(1)
    expect(result.ids).toEqual(['g1', 'g2'])
    expect(goodsStore.addGoodsBatch).toHaveBeenCalledTimes(1)
    expect(goodsStore.addGoodsBatch.mock.calls[0][0]).toHaveLength(2)
  })

  it('table_commit：defaults 兜底字段写入', async () => {
    const { handlers, goodsStore } = makeHandlers()
    const mapping = { name: '名称' }
    const defaults = { category: '谷子', currency: 'CNY' }
    const dry = await handlers.table_dryrun({ table: '1', mapping, defaults })
    expect(dry.preview[0].data.category).toBe('谷子')
    await handlers.table_commit({ table: '1', mapping, defaults, dryRunConfirmed: true })
    expect(goodsStore.addGoodsBatch).toHaveBeenCalledTimes(1)
  })

  it('table_commit：映射变化后旧 dryrun 失效', async () => {
    const { handlers } = makeHandlers()
    await handlers.table_dryrun({ table: '1', mapping: { name: '名称' } })
    await expect(
      handlers.table_commit({
        table: '1',
        mapping: { name: '名称', category: '类型' },
        dryRunConfirmed: true
      })
    ).rejects.toThrow('dryrun')
  })

  // ── 官方 CSV 快速路径 ──

  function makeOfficialHandlers(content, filename = 'goods.csv') {
    const goodsStore = {
      addGoodsBatch: vi.fn(async (items) => items.map((item, i) => ({ id: `g${i + 1}`, ...item }))),
      importGoodsBackup: vi.fn(async (items) => items.length),
      importTrashBackup: vi.fn(async () => 0)
    }
    const rechargeStore = { importBackup: vi.fn(async () => ({ added: 0, updated: 0 })) }
    const eventsStore = { importEventsBackup: vi.fn(async () => ({ added: 0, updated: 0 })) }
    const goodsGroupStore = { updateGroupsBackup: vi.fn(async () => {}) }
    const presetsStore = {
      addCategory: vi.fn(async () => {}),
      addIp: vi.fn(async () => {}),
      addCharacter: vi.fn(async () => {}),
      syncStorageLocationsFromPaths: vi.fn(async () => {})
    }
    return {
      goodsStore,
      rechargeStore,
      eventsStore,
      goodsGroupStore,
      presetsStore,
      handlers: createTableToolHandlers({
        getAttachments: () => [{ id: 'off1', type: 'table', filename, uri: '' }],
        readTableContent: async () => content,
        goodsStore,
        rechargeStore,
        eventsStore,
        goodsGroupStore,
        presetsStore
      })
    }
  }

  const OFFICIAL_GOODS_CSV =
    'id,name,category,ip,quantity,price,acquiredAt\n' +
    'g1,吧唧,徽章,原神,2,15,2024-03-01\n' +
    'g2,立牌,摆件,原神,1,50,2024-03-15\n'

  it('官方 goods.csv：dryrun 返回 mode=official 与计数，不写库', async () => {
    const { handlers, goodsStore } = makeOfficialHandlers(OFFICIAL_GOODS_CSV)
    const result = await handlers.table_dryrun({ table: '1' })
    expect(result.mode).toBe('official')
    expect(result.official).toBe(true)
    expect(result.totalItems).toBe(2)
    expect(result.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schema: 'goods', label: '谷子', count: 2 })
      ])
    )
    expect(result.sample[0].name).toBe('吧唧')
    expect(goodsStore.addGoodsBatch).not.toHaveBeenCalled()
    expect(goodsStore.importGoodsBackup).not.toHaveBeenCalled()
  })

  it('官方 goods.csv：commit 走 importGoodsBackup，无需 mapping', async () => {
    const { handlers, goodsStore } = makeOfficialHandlers(OFFICIAL_GOODS_CSV)
    await handlers.table_dryrun({ table: '1' })
    const result = await handlers.table_commit({ table: '1', dryRunConfirmed: true })
    expect(result.ok).toBe(true)
    expect(result.official).toBe(true)
    expect(result.goods).toBe(2)
    expect(goodsStore.importGoodsBackup).toHaveBeenCalledTimes(1)
  })

  it('官方格式 commit 未 dryrun 时拒绝', async () => {
    const { handlers, goodsStore } = makeOfficialHandlers(OFFICIAL_GOODS_CSV)
    await expect(
      handlers.table_commit({ table: '1', dryRunConfirmed: true })
    ).rejects.toThrow('dryrun')
    expect(goodsStore.importGoodsBackup).not.toHaveBeenCalled()
  })

  it('官方 recharge.csv：按 schema 识别并写入充值', async () => {
    const rechargeCsv =
      'id,game,itemName,amount,chargedAt\n' +
      'r1,原神,空月祝福,30,2024-01-01\n'
    const { handlers, rechargeStore } = makeOfficialHandlers(rechargeCsv, 'recharge.csv')
    const dry = await handlers.table_dryrun({ table: '1' })
    expect(dry.mode).toBe('official')
    expect(dry.tables).toEqual(
      expect.arrayContaining([expect.objectContaining({ schema: 'recharge', count: 1 })])
    )
    rechargeStore.importBackup.mockResolvedValueOnce({ added: 1, updated: 0 })
    await handlers.table_commit({ table: '1', dryRunConfirmed: true })
    expect(rechargeStore.importBackup).toHaveBeenCalledTimes(1)
  })

  it('非官方 CSV 仍走 structure + 映射路径', async () => {
    const { handlers } = makeHandlers()
    const dry = await handlers.table_dryrun({ table: '1' })
    expect(dry.mode).toBe('structure')
    expect(dry.official).toBe(false)
  })
})
