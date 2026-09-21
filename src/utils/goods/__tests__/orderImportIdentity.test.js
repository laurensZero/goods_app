import { describe, expect, it } from 'vitest'
import {
  buildOrderImportIdentity,
  buildOrderImportImportedKeys,
  canUseOrderImportIdentity,
  extractMihoyoOrderNo,
  isOrderItemImported,
} from '../identity'

const collectionItem = {
  name: '星铁LIVE系列亚克力挂件',
  acquiredAt: '2024-05-31',
  goodsId: '2028896191427241840818',
  variant: '知更鸟',
  characters: ['知更鸟'],
  note: '来自米游铺订单 #9035103802302197771481',
}

describe('订单导入已导入判定（goodsId 优先）', () => {
  it('从备注提取米游铺订单号', () => {
    expect(extractMihoyoOrderNo(collectionItem)).toBe('9035103802302197771481')
    expect(extractMihoyoOrderNo({ _orderNo: 'ORD9', note: '' })).toBe('ORD9')
    expect(extractMihoyoOrderNo({ note: '手工添加' })).toBe('')
  })

  it('同订单 + 同 goodsId + 同款式 → 已导入', () => {
    const imported = buildOrderImportImportedKeys([collectionItem])
    const orderLine = {
      name: '星铁LIVE系列亚克力挂件',
      goodsId: '2028896191427241840818',
      acquiredAt: '2024-05-31',
      variant: '知更鸟',
      _orderNo: '9035103802302197771481',
    }
    expect(isOrderItemImported(orderLine, imported)).toBe(true)
  })

  it('SKU 文案与收藏款式名不一致时，靠角色/包含关系软匹配', () => {
    const collection = [{
      ...collectionItem,
      name: '光锥系列马口铁徽章',
      goodsId: '2028608292404570628096',
      variant: '夜色流光溢彩',
      characters: ['知更鸟'],
    }]
    const imported = buildOrderImportImportedKeys(collection)
    const orderLine = {
      name: '光锥系列马口铁徽章',
      goodsId: '2028608292404570628096',
      acquiredAt: '2024-05-31',
      variant: '知更鸟',
      _orderNo: '9035103802302197771481',
    }
    expect(isOrderItemImported(orderLine, imported)).toBe(true)
  })

  it('同 goodsId 不同支付日 → 未导入', () => {
    const imported = buildOrderImportImportedKeys([collectionItem])
    const otherDay = {
      goodsId: collectionItem.goodsId,
      acquiredAt: '2024-07-10',
      variant: '知更鸟',
      _orderNo: '9324241649192335361481',
    }
    expect(isOrderItemImported(otherDay, imported)).toBe(false)
  })

  it('同订单同 goodsId 但款式完全不同 → 未导入（不同 SKU）', () => {
    const collection = [{
      ...collectionItem,
      variant: '花火',
      characters: ['花火'],
    }]
    const imported = buildOrderImportImportedKeys(collection)
    const orderLine = {
      goodsId: collectionItem.goodsId,
      acquiredAt: '2024-05-31',
      variant: '流萤',
      characters: ['流萤'],
      _orderNo: '9035103802302197771481',
    }
    expect(isOrderItemImported(orderLine, imported)).toBe(false)
  })

  it('同名不同 goodsId 不会误标', () => {
    const imported = buildOrderImportImportedKeys([collectionItem])
    const otherGoods = {
      name: collectionItem.name,
      goodsId: '999',
      acquiredAt: '2024-05-31',
      variant: '知更鸟',
      _orderNo: '9035103802302197771481',
    }
    expect(isOrderItemImported(otherGoods, imported)).toBe(false)
  })

  it('订单行无 goodsId 时回退名称别名', () => {
    const collection = [{ name: '亚克力立牌', variant: '流萤', acquiredAt: '', goodsId: '' }]
    const imported = buildOrderImportImportedKeys(collection)
    const incomplete = { name: '亚克力立牌', variant: '流萤', goodsId: '' }
    expect(canUseOrderImportIdentity(incomplete)).toBe(false)
    expect(isOrderItemImported(incomplete, imported)).toBe(true)
  })

  it('buildOrderImportIdentity 优先订单号通道', () => {
    expect(buildOrderImportIdentity(collectionItem)).toBe(
      'ord|9035103802302197771481|2028896191427241840818|知更鸟'
    )
  })
})
