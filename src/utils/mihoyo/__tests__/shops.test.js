import { describe, expect, it } from 'vitest'
import {
  MIHOYO_SHOPS,
  MIHOYO_NEW_ARRIVAL_SHOPS,
  MIHOYO_SHOP_IP_BY_CODE,
  MIHOYO_SHOP_CODE_BY_IP,
  MIHOYO_ROLE_SHOP_CODES,
  MIHOYO_SHOP_TABS,
} from '../shops'

/** 店铺唯一数据源：上新监控/推送/显示选择器都从这张表派生，改坏会四处联动 */
describe('mihoyo shops 店铺唯一数据源', () => {
  it('包含 7 店，新店 code 与米游铺线上一致', () => {
    expect(MIHOYO_SHOPS.map((s) => s.code)).toEqual(['ys', 'xqtd', 'bh3', 'zzz', 'bh2', 'wd', 'xbgd'])
    expect(MIHOYO_NEW_ARRIVAL_SHOPS).toEqual(['ys', 'xqtd', 'bh3', 'zzz', 'bh2', 'wd', 'xbgd'])
  })

  it('code -> IP 与订单导入店铺名映射的规范 IP 对齐', () => {
    expect(MIHOYO_SHOP_IP_BY_CODE.bh2).toBe('崩坏学园2nd')
    expect(MIHOYO_SHOP_IP_BY_CODE.wd).toBe('未定事件簿')
    expect(MIHOYO_SHOP_IP_BY_CODE.xbgd).toBe('星布谷地')
    expect(MIHOYO_SHOP_IP_BY_CODE.bh3).toBe('崩坏3')
  })

  it('角色店铺只有原神/星穹/绝区零，反向索引一致', () => {
    expect(MIHOYO_ROLE_SHOP_CODES).toEqual(['ys', 'xqtd', 'zzz'])
    expect(MIHOYO_SHOP_CODE_BY_IP).toEqual({
      '原神': 'ys',
      '崩坏：星穹铁道': 'xqtd',
      '绝区零': 'zzz',
    })
  })

  it('每个店铺都有 labelKey，且 Tab/选择器选项与清单一致', () => {
    expect(MIHOYO_SHOP_TABS).toEqual(
      MIHOYO_SHOPS.map(({ code, labelKey }) => ({ code, labelKey })),
    )
  })
})
