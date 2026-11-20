// @ts-check
/**
 * 头像挂件的客户端常量（IP 清单 + 名称归一化）。
 *
 * ⚠️ MHY_DECOR_GAMES 必须与 `supabase/functions/_shared/mhy-decor-shared.js`
 * 的 DECOR_GAMES 保持同步：那边是同步脚本 / Edge Function 的 canonical 清单
 * （云端入库按它归一 game 字段），客户端按同一份顺序排筛选 chips，
 * 改任何一边都要带上另一边。
 */

/** 站内统一 IP 名（canonical 顺序），选择器里只展示目录中实际出现的项 */
export const MHY_DECOR_GAMES = Object.freeze([
  '原神', '崩坏：星穹铁道', '绝区零', '未定事件簿', '崩坏3', '崩坏学园2',
  '大别野', '崩坏：因缘精灵', '星布谷地', '米游社', '其他'
])

/**
 * 挂件名归一化（`mhy-decor-shared.js` normDecorName 的客户端简化版）：
 * 去掉「头像框/主题/挂件」这类命名后缀和书名号等装饰符，只留核心名，
 * 用于搜索时让「温迪头像框」也能被「温迪」命中。
 * @param {string} name
 * @returns {string}
 */
export function normDecorName(name) {
  return String(name || '')
    // \u3000 = 全角空格；两侧平台名里偶尔混入，一并去掉
    .replace(/「|」|·|\u3000/g, '')
    .replace(/头像框|头像挂件|主题|挂件/g, '')
    .trim()
    .toLowerCase()
}
