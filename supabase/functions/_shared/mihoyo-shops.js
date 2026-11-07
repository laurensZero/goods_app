/**
 * 米游铺店铺唯一数据源 —— 店铺 code / IP 名 / 文案 key 全部收敛在这张表。
 * 新增店铺：在这里加一行 + 各语言 locales 的 mihoyoNew 词条补 shop* key，其余消费方自动生效。
 *
 * 放在 supabase/functions/_shared/ 的原因：边缘函数打包器只收 supabase/ 目录内的
 * 文件（../../src 跨目录相对导入会 deploy 400，见 _shared/pay.ts 同款约束）。
 *
 * 消费方：
 * - supabase/functions/scan-mihoyo/index.ts（服务端扫描与推送过滤，../_shared 相对导入）
 * - src/utils/mihoyo/shops.js（Web 桥接 re-export，Web 侧统一走 @/utils/mihoyo/shops）：
 *   index.js（IP 回填、角色店铺搜索）、newArrivals.js（上新拉取范围）、
 *   MihoyoShopPicker.vue（订阅/显示选择器）、services/mcp/tools.js（AI 工具店铺中文名）
 *
 * 注意：本文件必须保持零依赖（无 import）。
 * roleShop：有「角色分类」、角色导入会按 IP 搜该店商品的店铺。
 * ip：谷子记录使用的规范 IP 名（bh2 与订单导入店铺名映射 SHOP_IP_KEYWORDS 的「崩坏学园2nd」对齐）。
 */
export const MIHOYO_SHOPS = [
  { code: 'ys', ip: '原神', labelKey: 'mihoyoNew.shopYs', roleShop: true },
  { code: 'xqtd', ip: '崩坏：星穹铁道', labelKey: 'mihoyoNew.shopXqtd', roleShop: true },
  { code: 'bh3', ip: '崩坏3', labelKey: 'mihoyoNew.shopBh3' },
  { code: 'zzz', ip: '绝区零', labelKey: 'mihoyoNew.shopZzz', roleShop: true },
  { code: 'bh2', ip: '崩坏学园2nd', labelKey: 'mihoyoNew.shopBh2' },
  { code: 'wd', ip: '未定事件簿', labelKey: 'mihoyoNew.shopWd' },
  { code: 'xbgd', ip: '星布谷地', labelKey: 'mihoyoNew.shopXbgd' },
]

/** 上新监控/推送覆盖的店铺 code（服务端 scan-mihoyo 扫描同一份清单） */
export const MIHOYO_NEW_ARRIVAL_SHOPS = Object.freeze(
  MIHOYO_SHOPS.map((shop) => shop.code)
)

/** 店铺 Tab / MihoyoShopPicker 选项（code + i18n labelKey） */
export const MIHOYO_SHOP_TABS = Object.freeze(
  MIHOYO_SHOPS.map(({ code, labelKey }) => ({ code, labelKey }))
)

/** shop_code -> 规范 IP 名（上新页 IP 回填等场景） */
export const MIHOYO_SHOP_IP_BY_CODE = Object.freeze(
  Object.fromEntries(MIHOYO_SHOPS.map((shop) => [shop.code, shop.ip]))
)

/** IP -> shop_code（角色导入按 IP 找店） */
export const MIHOYO_SHOP_CODE_BY_IP = Object.freeze(
  Object.fromEntries(
    MIHOYO_SHOPS.filter((shop) => shop.roleShop).map((shop) => [shop.ip, shop.code])
  )
)

/** 有角色分类、角色导入会搜索的店铺 code */
export const MIHOYO_ROLE_SHOP_CODES = Object.freeze(
  MIHOYO_SHOPS.filter((shop) => shop.roleShop).map((shop) => shop.code)
)
