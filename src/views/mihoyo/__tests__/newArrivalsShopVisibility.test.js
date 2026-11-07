import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const view = () => readFileSync(
  resolve(process.cwd(), 'src/views/mihoyo/MihoyoNewArrivalsView.vue'),
  'utf8',
)

/**
 * 上新速览页的可见店铺与推送订阅共用 user_qq_bindings.mihoyo_shops
 * （MihoyoShopPicker 编辑，即时生效）。这里钉住接线，防止有人改回
 * 页面私有配置或漏掉「全部」目录的隐藏过滤。
 */
describe('米游铺上新页可见店铺与推送订阅共用配置', () => {
  it('店铺清单来自 shops.js 唯一数据源，页面不再私有硬编码', () => {
    expect(view()).toContain("import { MIHOYO_SHOP_TABS } from '@/utils/mihoyo/shops'")
    expect(view()).toContain('const SHOPS = MIHOYO_SHOP_TABS')
  })

  it('未登录/未绑定/未勾选时回落全部店铺，配置过后严格跟随勾选', () => {
    expect(view()).toMatch(
      /if \(!qqStore\.isBound \|\| !selected\.length\) return SHOPS/,
    )
    expect(view()).toMatch(/v-for="shop in visibleShops"/)
  })

  it('「全部」目录也过滤掉已隐藏店铺的商品（无店铺信息商品保留）', () => {
    expect(view()).toMatch(
      /return list\.filter\(\(item\) => !item\.shop_code \|\| visibleShopCodes\.value\.has\(item\.shop_code\)\)/,
    )
  })

  it('选中店铺被取消勾选时回落「全部」', () => {
    expect(view()).toMatch(
      /watch\(visibleShopCodes[\s\S]*?activeShop\.value = ''/,
    )
  })

  it('编辑弹层用共享 MihoyoShopPicker，勾选写入 qqStore.toggleMihoyoShops', () => {
    expect(view()).toContain('<MihoyoShopPicker')
    expect(view()).toMatch(/@toggle="toggleShopSubscription"/)
    expect(view()).toMatch(/await qqStore\.toggleMihoyoShops\(next\)/)
  })

  it('进页幂等初始化 QQ 绑定，Tab 尽快收敛避免闪现全量', () => {
    expect(view()).toMatch(/onMounted\(\(\) => \{[\s\S]*?qqStore\.init\(\)/)
  })
})
