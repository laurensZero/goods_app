/**
 * 品类词单一数据源。
 *
 * 新增/调整固定品类只改这里，下面三份产物都由它生成：
 * - CATEGORY_KEYWORDS：米游社/淘宝导入的固定关键词表（按声明顺序优先命中）
 * - CATEGORY_RULES：编辑器建议/打分引擎的静态规则
 * - CATEGORY_TYPE_WORDS：品类词黑名单（防止被当成角色名）+ 学习词加权依据
 *
 * 字段说明：
 * - keywords：命中的文本片段；同一个类的多个写法放同一数组
 * - weight：打分权重（只有参与打分引擎时生效）
 * - decisive：明确品类词，命中后压过学习词（一锤定音）
 *
 * 顺序约定：
 * - 数组顺序 = parseCategoryFromName 的优先命中顺序
 * - 「满赠」必须在最前（带满赠字样的商品优先归满赠）
 * - 新增品类默认追加到末尾，避免改变已有品类的命中优先级
 */
export const CATEGORY_DEFINITIONS = [
  { category: '满赠', keywords: ['满赠', '赠品'], weight: 0.8 },
  { category: '手办', keywords: ['手办', '雕像'], weight: 1.0, decisive: true },
  { category: '立牌', keywords: ['立牌', '手机支架', '收藏画'], weight: 1.0, decisive: true },
  { category: '挂件', keywords: ['挂件', '挂饰', '吊件', '钥匙扣', '杯垫'], weight: 0.8, decisive: true },
  { category: '徽章', keywords: ['徽章', '吧唧', '马口铁', '铁口', '胸章', 'Pin', 'pin'], weight: 1.0, decisive: true },
  { category: '明信片', keywords: ['明信片'], weight: 1.0, decisive: true },
  {
    category: '卡片',
    keywords: ['卡片', '胶片卡', '小卡', '随机卡', '收藏卡', '可换卡', '卡组', '票卡', '卡套', '相卡', '闪卡', '镭射卡'],
    weight: 1.0,
    decisive: true,
  },
  { category: 'CD/专辑', keywords: ['CD', '专辑', '唱片', 'OST'], weight: 1.0, decisive: true },
  { category: '色纸', keywords: ['色纸', '签板', '签绘'], weight: 1.0, decisive: true },
  {
    category: '服饰',
    keywords: ['上衣', 'T恤', '衬衫', '外套', '卫衣', '服饰', '丝巾', '围巾', '披肩', '领带', '领结', '袖套', '帽子', '袜子', '手套', '口罩', '手帕', '戒指'],
    weight: 1.0,
    decisive: true,
  },
  { category: '镭射票', keywords: ['镭射票', '特典票', '门票', '纪念票'], weight: 1.0, decisive: true },

  // 原先只存在于打分规则里的品类，追加在末尾，保持既有品类的命中优先级不变
  { category: '拍立得', keywords: ['拍立得', 'pld'], weight: 1.0, decisive: true },
  { category: '摆件', keywords: ['流沙', '麻将', '摆件'], weight: 0.7 },
  { category: '画册', keywords: ['画集', '设定集', '画册', '纪念册'], weight: 1.0, decisive: true },
  { category: '毛绒', keywords: ['毛绒', '娃娃', '公仔', '抱枕', '玩偶', '娃衣'], weight: 1.0, decisive: true },
  { category: '海报', keywords: ['海报'], weight: 1.0, decisive: true },
]

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 导入链路用的固定关键词表（顺序即优先级） */
export const CATEGORY_KEYWORDS = CATEGORY_DEFINITIONS.map(({ category, keywords }) => ({
  category,
  keywords,
}))

/** 打分引擎用的静态规则 */
export const CATEGORY_RULES = CATEGORY_DEFINITIONS.map(({ category, keywords, weight = 1.0, decisive }) => ({
  key: `(${keywords.map(escapeRegExp).join('|')})`,
  value: category,
  weight,
  ...(decisive ? { decisive: true } : {}),
}))

/** 所有品类词（去重），用于角色过滤与学习词加权 */
export const CATEGORY_TYPE_WORDS = [...new Set(CATEGORY_DEFINITIONS.flatMap((item) => item.keywords))]
