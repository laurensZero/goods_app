/**
 * 头像挂件同步共享数据 —— 本地脚本与 Edge Function 共用一份。
 *
 * 消费方：
 * - scripts/sync-mhy-decor.mjs（本地手动同步，node 直接 import）
 * - supabase/functions/sync-mhy-decor/index.ts（定时自动同步，Deno 打包 ../_shared 相对导入）
 *
 * 放 supabase/functions/_shared/ 的原因：边缘函数打包器只收 supabase/ 目录内的文件
 * （跨目录相对导入会 deploy 400，见 _shared/mihoyo-shops.js 同款约束）。
 */

/**
 * 站内统一 IP 名（canonical）。客户端筛选 chips / 分组排序都以这个清单为准。
 */
export const DECOR_GAMES = [
  '原神', '崩坏：星穹铁道', '绝区零', '未定事件簿', '崩坏3', '崩坏学园2',
  '大别野', '崩坏：因缘精灵', '星布谷地', '米游社', '其他'
]

/**
 * HoYoLAB 英文 IP 名 → 站内统一中文名。
 * 米游社接口本来就叫中文名；两边分组一致，客户端才能用同一个 IP 筛选。
 */
export const HOYOLAB_GAME_NAMES = {
  'Genshin Impact': '原神',
  'Honkai: Star Rail': '崩坏：星穹铁道',
  'Honkai Star Rail': '崩坏：星穹铁道',
  'Zenless Zone Zero': '绝区零',
  'Tears of Themis': '未定事件簿',
  'Honkai Impact 3rd': '崩坏3',
  'Honkai Gakuen 2': '崩坏学园2',
  'Honkai Gakuen': '崩坏学园2',
  'HoYoLAB': '米游社',
  '默认系列': '其他'
}

export const KNOWN_GAMES = new Set(DECOR_GAMES)

/**
 * hy:<id> → ms:<id>：同一挂件两边各发一份时，保留米游社条目（阿里 OSS 国内快、
 * 支持 x-oss-process 实时缩放），丢掉 HoYoLAB 副本（fastcdn 海外 CDN，国内慢）。
 *
 * 生成方式（2026-11-19，本地素材像素对比，脚本 .tmp-probe/build_dedup_map.py 已删，
 * 再生成可从 miyoushe_assets/ 与 hoyolab_assets/ 的 by_game 目录重跑）：
 * - px   ：感知哈希 dhash 完全相等（84 对，零误报；含 3 对跨 IP 分组）
 * - name ：去掉「头像框/主题挂件」等前后缀后名字相同（含 dhash 1~8 的同款不同压缩）
 * - quoted+dhash：「」内名字相同 + dhash≤2
 * 之后官方复刻旧挂件时，新增的 hy 条目若与 ms 同名，运行时按 normDecorName() 再兜一层。
 */
export const DEDUP_HY_TO_MS = {
  'hy:1027': 'ms:107', // px d=0
  'hy:1030': 'ms:163', // px d=0
  'hy:1041': 'ms:10174', // px d=0
  'hy:1056': 'ms:10183', // px d=0
  'hy:1385': 'ms:10187', // px d=0
  'hy:146': 'ms:58', // px d=0
  'hy:1539': 'ms:10207', // px d=0
  'hy:1540': 'ms:10206', // px d=0
  'hy:1575': 'ms:128', // px d=0
  'hy:1610': 'ms:48', // px d=0
  'hy:1611': 'ms:28', // px d=0
  'hy:1612': 'ms:41', // px d=0
  'hy:1624': 'ms:10195', // px d=0
  'hy:165': 'ms:28', // px d=0
  'hy:1681': 'ms:10196', // px d=0
  'hy:1708': 'ms:10209', // px d=0
  'hy:1709': 'ms:10208', // px d=0
  'hy:1733': 'ms:154', // px d=0
  'hy:175': 'ms:68', // quoted+dhash d=1
  'hy:1764': 'ms:10213', // px d=0
  'hy:1772': 'ms:10215', // px d=0
  'hy:1775': 'ms:10212', // px d=0
  'hy:1791': 'ms:10218', // px d=0
  'hy:182': 'ms:32', // px d=0
  'hy:1849': 'ms:10220', // px d=0
  'hy:1857': 'ms:10229', // px d=0
  'hy:1858': 'ms:10226', // px d=0
  'hy:1871': 'ms:10221', // px d=0
  'hy:1920': 'ms:10231', // px d=0
  'hy:1921': 'ms:10233', // px d=0
  'hy:1927': 'ms:160', // px d=0
  'hy:1958': 'ms:10239', // name d=2
  'hy:1959': 'ms:10237', // name d=2
  'hy:2001': 'ms:10244', // px d=0
  'hy:2002': 'ms:10255', // px d=0
  'hy:2016': 'ms:10256', // name d=2
  'hy:2039': 'ms:10261', // px d=0
  'hy:2067': 'ms:10245', // px d=0
  'hy:2068': 'ms:10246', // px d=0
  'hy:2069': 'ms:10247', // px d=0
  'hy:2070': 'ms:10248', // px d=0
  'hy:2071': 'ms:10249', // px d=0
  'hy:2084': 'ms:10182', // px d=0
  'hy:2102': 'ms:10262', // name d=1
  'hy:2103': 'ms:10264', // name d=1
  'hy:2157': 'ms:10268', // name d=8
  'hy:2158': 'ms:10269', // name d=5
  'hy:2212': 'ms:10276', // px d=0
  'hy:2213': 'ms:10278', // px d=0
  'hy:2227': 'ms:10203', // px d=0
  'hy:2264': 'ms:10281', // px d=0
  'hy:2265': 'ms:10283', // px d=0
  'hy:2308': 'ms:10287', // px d=0
  'hy:2309': 'ms:10288', // px d=0
  'hy:2354': 'ms:10291', // px d=0
  'hy:2355': 'ms:10295', // name d=1
  'hy:2385': 'ms:10298', // px d=0
  'hy:2386': 'ms:10300', // px d=0
  'hy:2405': 'ms:10236', // px d=0
  'hy:2428': 'ms:10303', // name d=1
  'hy:2429': 'ms:10304', // name d=2
  'hy:2463': 'ms:10310', // px d=0
  'hy:275': 'ms:57', // px d=0
  'hy:289': 'ms:41', // px d=0
  'hy:290': 'ms:41', // px d=0
  'hy:293': 'ms:77', // px d=0
  'hy:317': 'ms:48', // px d=0
  'hy:338': 'ms:21', // px d=0
  'hy:343': 'ms:161', // px d=0
  'hy:344': 'ms:161', // px d=0
  'hy:345': 'ms:161', // px d=0
  'hy:365': 'ms:102', // px d=0
  'hy:369': 'ms:62', // px d=0
  'hy:396': 'ms:161', // px d=0
  'hy:400': 'ms:70', // px d=0
  'hy:408': 'ms:143', // px d=0
  'hy:409': 'ms:143', // px d=0
  'hy:410': 'ms:143', // px d=0
  'hy:433': 'ms:71', // px d=0
  'hy:472': 'ms:146', // px d=0
  'hy:473': 'ms:148', // px d=0
  'hy:475': 'ms:150', // px d=0
  'hy:476': 'ms:144', // px d=0
  'hy:477': 'ms:147', // px d=0
  'hy:478': 'ms:149', // px d=0
  'hy:479': 'ms:151', // px d=0
  'hy:480': 'ms:152', // px d=0
  'hy:482': 'ms:143', // px d=0
  'hy:487': 'ms:75', // px d=0
  'hy:520': 'ms:129', // px d=0
  'hy:564': 'ms:82', // quoted+dhash d=2
  'hy:605': 'ms:90', // px d=0
  'hy:787': 'ms:66', // px d=0
  'hy:788': 'ms:156', // px d=0
  'hy:858': 'ms:97', // px d=0
  'hy:946': 'ms:136', // px d=0
}

/** 挂件名归一化：去掉两侧平台的命名习惯差（头像框/主题挂件/「」等），用于运行时同名去重 */
export function normDecorName(name) {
  return String(name || '')
    .replace(/「|」|·|　/g, '')
    .replace(/头像框|头像挂件|主题|限定|专属|活动奖励|活动成就|纪念|挂件/g, '')
    .trim()
}

/** 米游社接口不返回 IP 归属，按名称/描述关键词推（描述文案特征明显，别删） */
export const MI_DESC_GAME_RULES = [
  ['原神', ['原神', '派蒙', '提瓦特', '尘歌壶', '七圣召唤', '史莱姆', '旅行者', '千星奇域', '丘丘人']],
  ['崩坏：星穹铁道', ['星穹铁道', '星铁', '开拓者', '令使', '帕姆']],
  ['绝区零', ['绝区零']],
  ['未定事件簿', ['未定事件簿', 'NXX']],
  ['崩坏3', ['崩坏3']],
  ['崩坏学园2', ['崩坏学园2']],
  ['大别野', ['大别野']],
  ['崩坏：因缘精灵', ['因缘精灵']],
  ['星布谷地', ['星布谷地']],
  ['米游社', ['米游社', '米游币', '米游姬', 'HoYoLAB', '创作中心', '观测枢', '同人',
    'Mproject', 'miYoSummer', '夏日双线战', '众裁', '创作学院', '百日', '年度创作评选',
    '箱庭之内', '三明治香气', '米哈游', 'Mimo']]
]

/**
 * 米游社挂件 IP 归属猜测。返回 null 表示没把握（落「其他」，人工改表）。
 * @param {{ name?: string, description?: string }} item
 */
export function guessMiyousheGame(item) {
  const text = `${item.name || ''} ${item.description || ''}`
  for (const [game, keywords] of MI_DESC_GAME_RULES) {
    if (keywords.some((kw) => text.includes(kw))) return game
  }
  return null
}

/**
 * 运行时跨源去重：先查静态映射（像素级人工核准），再按归一化名兜一层。
 * 官方复刻旧挂件时常两边同名各发一次，静态映射没来得及更新的新条目靠名字兜住。
 * @param {string} hyId  形如 'hy:2067'
 * @param {string} hyGame 归一化前的 hoyolab game_name
 * @param {string} hyName
 * @param {(normName: string, game: string) => string | null} msByName
 *   调用方按（归一化名, 统一 IP 名）查米游社条目，命中返回 'ms:<id>'，否则 null
 * @returns {string | null} 应保留的米游社条目 id；null = 不是重复
 */
export function resolveHyDuplicate(hyId, hyGame, hyName, msByName) {
  const mapped = DEDUP_HY_TO_MS[hyId]
  if (mapped) return mapped
  const normalized = normDecorName(hyName)
  if (!normalized) return null
  return msByName(normalized, HOYOLAB_GAME_NAMES[hyGame] || hyGame)
}

/**
 * 图片内容键：米哈游图床的文件名前缀是上传时的内容 hash，
 * 同一张图即使被收录成两条（不同 id / 不同名字）也必然同键。
 *
 *   例：.../e3e7851669f6a32f1de74aa83e49018d_2319976981667326517.png
 *       → e3e7851669f6a32f1de74aa83e49018d
 *
 * 取不到 hash 时退化成去参后的完整地址（只有完全相同才算重复）。
 * @param {string} url
 */
export function decorContentKey(url) {
  const base = String(url || '').trim().split("?")[0]
  if (!base) return ""
  const file = base.slice(base.lastIndexOf("/") + 1)
  const match = /^([0-9a-f]{24,})_[^.]*\./i.exec(file)
  return match ? match[1].toLowerCase() : base
}

/**
 * 按内容键去重（官方目录自己就会重复收录同一张图，HoYoLAB 尤其多）。
 * 保留优先级：能播动画 > 米游社（阿里 OSS 国内直连快）> 先出现的。
 * @param {Array<{ url?: string, source?: string, animated?: boolean }>} items
 */
export function dedupeDecorItems(items) {
  /** @type {Map<string, number>} */
  const byKey = new Map()
  /** @type {any[]} */
  const out = []
  const score = (item) => (item.animated ? 2 : 0) + (item.source === "miyoushe" ? 1 : 0)
  for (const item of Array.isArray(items) ? items : []) {
    const key = decorContentKey(item?.url)
    const index = byKey.get(key)
    if (index === undefined) {
      byKey.set(key, out.length)
      out.push(item)
      continue
    }
    if (score(item) > score(out[index])) out[index] = item
  }
  return out
}
