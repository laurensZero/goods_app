/**
 * 使用指南章节与截图声明（文案在各语言 guide.json，本文件只放结构）
 *
 * - shots 为截图键名，对应 guideShotManifest.json 里的同名条目；
 *   截图由 scripts/guide-capture.mjs 生成并上传到 Supabase `app-guide` 桶，
 *   manifest 记录图片尺寸与标注框坐标（百分比），供页面叠加序号框与图例。
 * - 标注文案键：guide.shot.<shotKey>.<label>（label 与 manifest 中 anno.label 对应）。
 * - 章节文案键：guide.s.<id>.title / .desc / .steps（数组）/ .tip，
 *   FAQ 章节另有 guide.s.faq.items（[{ q, a }]）。
 */

/** 截图云端基址：Supabase 公开读存储桶（见 supabase/supabase-migration-guide-bucket.sql） */
export const GUIDE_SHOT_BASE = 'https://zvqzicimowfqshgjsrri.supabase.co/storage/v1/object/public/app-guide/'

/** 章节线性图标（feather 风格 path，描边绘制） */
export const GUIDE_SECTIONS = [
  {
    id: 'overview',
    icon: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
    shots: ['home', 'stats-view', 'my-page']
  },
  {
    id: 'add',
    icon: ['M12 5v14', 'M5 12h14'],
    shots: ['add-sheet', 'add-form', 'add-form-more']
  },
  {
    id: 'batch',
    icon: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    shots: ['batch-queue', 'batch-item']
  },
  {
    id: 'search',
    icon: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
    shots: ['search-panel', 'toolbar-menu']
  },
  {
    id: 'detail',
    icon: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M9 15h6'],
    shots: ['goods-detail', 'goods-edit']
  },
  {
    id: 'groups',
    icon: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
    shots: ['group-detail']
  },
  {
    id: 'wishlist',
    icon: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'],
    shots: ['wishlist']
  },
  {
    id: 'trash',
    icon: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
    shots: ['trash']
  },
  {
    id: 'events',
    icon: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
    shots: ['events-list', 'event-detail']
  },
  {
    id: 'recharge',
    icon: ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
    shots: ['recharge', 'month-cards']
  },
  {
    id: 'stats',
    icon: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
    shots: ['statistics']
  },
  {
    id: 'sale',
    icon: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'],
    shots: ['sale-ledger']
  },
  {
    id: 'import',
    icon: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    shots: ['import-center', 'taobao-import']
  },
  {
    id: 'sync',
    icon: ['M21.5 2v6h-6', 'M2.5 22v-6h6', 'M2 11.5a10 10 0 0 1 18.8-4.3', 'M22 12.5a10 10 0 0 1-18.8 4.3'],
    shots: ['sync']
  },
  {
    id: 'share',
    icon: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    shots: ['shares-manage']
  },
  {
    id: 'theme',
    icon: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    shots: ['theme', 'notify']
  },
  {
    id: 'faq',
    icon: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
    shots: []
  }
]
