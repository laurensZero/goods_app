/**
 * 米游铺店铺唯一数据源（Web 桥接）。
 *
 * 数据本体在 supabase/functions/_shared/mihoyo-shops.js：边缘函数打包器只收
 * supabase/ 目录内的文件（跨目录相对导入会 deploy 400），所以纯数据表放在那里
 * 供 scan-mihoyo 引用；这里 re-export 让 Web 侧继续用 @/utils/mihoyo/shops 别名。
 * 本文件不写任何数据，新增店铺只改 _shared 那份。
 */
export * from '../../../supabase/functions/_shared/mihoyo-shops.js'
