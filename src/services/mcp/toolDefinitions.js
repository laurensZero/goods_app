// @ts-check
/**
 * MCP 工具定义（纯数据，无任何 import）
 *
 * 该文件会同时被两个环境消费：
 *   - Vite dev 插件（Node 侧）：serve tools/list，并校验 tools/call 的工具名
 *   - 应用页面（WebView 侧）：tools/call 的实际执行
 * 因此必须保持零依赖、平台无关，不能引入 '@/...' 别名或浏览器 API。
 */

export const MCP_SERVER_INFO = Object.freeze({
  name: 'goods-app',
  title: '谷子收纳',
  version: '1.0.0'
})

export const MCP_SERVER_INSTRUCTIONS = [
  '这是「谷子收纳」应用的 MCP 服务，用于查询用户的动漫/游戏周边（谷子）收藏数据。',
  '数据为只读快照：收到请求时应用页面的本地 SQLite 会实时执行查询。',
  '典型用法：了解收藏构成用 collection_overview；找具体物品用 goods_search（先粗后细，配合 limit/offset 分页）；',
  '需要单件详情（含多件拆分、出售信息、状态时间线）用 goods_detail；回答花费/月度消费用 spending_summary；',
  '角色维度统计用 character_leaderboard；收纳位置分布用 storage_locations；愿望单与预算用 wishlist_overview；',
  '出谷回血与盈亏用 sale_ledger；活动背景用 events_list；游戏充值用 recharge_summary。',
  '金额字段为用户手填的字符串，可能为空或含非数字字符；花费类数字均为估算值。'
].join('\n')

/**
 * @typedef {Object} McpToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} inputSchema
 */

/** 可写工具的公共字段 schema（goods_add / goods_update 共用） */
const GOODS_MUTABLE_FIELDS = {
  category: { type: 'string', description: '类别，如 吧唧/立牌/手办' },
  ip: { type: 'string', description: 'IP（作品名）' },
  characters: { type: 'array', items: { type: 'string' }, description: '关联角色列表' },
  tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
  variant: { type: 'string', description: '款式/版本' },
  storageLocation: { type: 'string', description: '存放位置' },
  price: { type: 'string', description: '标价（字符串，数字）' },
  actualPrice: { type: 'string', description: '实付价（字符串，数字）' },
  currency: { type: 'string', description: '标价币种，如 CNY' },
  actualPriceCurrency: { type: 'string', description: '实付价币种，如 CNY' },
  quantity: { type: 'integer', minimum: 1, description: '数量，默认 1' },
  acquiredAt: { type: 'string', description: '入手日期，格式 YYYY-MM-DD' },
  isWishlist: { type: 'boolean', description: '是否为愿望单条目' },
  note: { type: 'string', description: '备注' }
}

/** @type {McpToolDefinition[]} */
export const MCP_WRITE_TOOL_DEFINITIONS = [
  {
    name: 'goods_add',
    description: '新增一条谷子（isWishlist 为 true 时加入愿望单）。name 必填，其余可选；返回新条目的 id 与关键字段。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '名称' },
        ...GOODS_MUTABLE_FIELDS
      },
      required: ['name']
    }
  },
  {
    name: 'goods_update',
    description: '按 id 部分更新谷子：只传需要修改的字段，未传字段保持不变。仅限未入回收站的条目。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id，来自 goods_search' },
        name: { type: 'string', description: '名称' },
        ...GOODS_MUTABLE_FIELDS
      },
      required: ['id']
    }
  },
  {
    name: 'goods_delete',
    description: '把谷子移入回收站（软删除，可用 goods_restore 恢复）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id' }
      },
      required: ['id']
    }
  },
  {
    name: 'goods_restore',
    description: '从回收站恢复谷子。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '回收站条目 id' }
      },
      required: ['id']
    }
  },
  {
    name: 'settings_overview',
    description: '查看应用当前设置：主题外观、通知开关、预设清单（分类/IP/角色/收纳位置的完整名称列表）。修改任何设置前先用本工具了解现状。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'presets_manage',
    description: '管理预设：新增/删除/重命名分类、IP、角色；新增收纳位置（支持 "父级/子级" 路径形式，如 "A 柜/第二层"）。删除分类/IP/角色会同时从谷子条目上移除该标注；重命名会级联更新所有相关谷子。',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['category', 'ip', 'character', 'storage_location'], description: '要操作的预设类型' },
        action: { type: 'string', enum: ['add', 'remove', 'rename'], description: '操作类型（storage_location 仅支持 add）' },
        name: { type: 'string', description: '预设名称' },
        newName: { type: 'string', description: 'rename 时的新名称' },
        ip: { type: 'string', description: 'entity=character 且 action=add 时可选，角色所属 IP' }
      },
      required: ['entity', 'action', 'name']
    }
  },
  {
    name: 'theme_set',
    description: '切换应用主题外观偏好（跟随系统/浅色/深色）。',
    inputSchema: {
      type: 'object',
      properties: {
        appearance: { type: 'string', enum: ['system', 'light', 'dark'], description: '目标外观' }
      },
      required: ['appearance']
    }
  },
  {
    name: 'notify_settings_set',
    description: '修改通知设置：只传入需要修改的字段，未传字段保持不变。',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: '通知总开关' },
        saleReminder: { type: 'boolean', description: '开售提醒' },
        birthdayEgg: { type: 'boolean', description: '角色生日彩蛋' },
        syncSuccess: { type: 'boolean', description: '同步成功通知' },
        syncError: { type: 'boolean', description: '同步失败通知' },
        updateAvailable: { type: 'boolean', description: '更新可用通知' },
        position: { type: 'string', enum: ['top-right', 'top-center', 'top-left'], description: '通知显示位置' },
        duration: { type: 'integer', minimum: 2000, maximum: 15000, description: '自动关闭时长（毫秒）' },
        vibration: { type: 'boolean', description: '震动反馈' }
      }
    }
  }
]

/** @type {McpToolDefinition[]} */
export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'goods_search',
    description: [
      '搜索谷子收藏条目（默认同时包含已拥有与愿望单，按更新时间倒序）。',
      '支持关键词模糊匹配（名称/IP/角色/标签/类别/款式/存放位置/备注）与多维度精确过滤。',
      '返回精简字段列表；需要完整信息（多件拆分、出售信息、状态时间线等）时拿 id 调 goods_detail。'
    ].join(''),
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，对名称/IP/角色/标签/类别/款式/存放位置/备注做不区分大小写的包含匹配' },
        category: { type: 'string', description: '按类别精确过滤，如 吧唧/立牌/手办' },
        ip: { type: 'string', description: '按 IP（作品名）精确过滤' },
        character: { type: 'string', description: '按角色名过滤（匹配角色列表中的成员，不区分大小写）' },
        storageLocation: { type: 'string', description: '按存放位置精确过滤' },
        wishlistOnly: { type: 'boolean', description: '为 true 时只返回愿望单条目' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: '返回条数上限' },
        offset: { type: 'integer', minimum: 0, default: 0, description: '分页偏移' }
      }
    }
  },
  {
    name: 'goods_detail',
    description: '按 id 获取单个谷子的完整信息：多件拆分（每件入手日期/价格/角色/收集状态）、出售信息、状态时间线等。回收站中的条目也能查到。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id，来自 goods_search' }
      },
      required: ['id']
    }
  },
  {
    name: 'collection_overview',
    description: '收藏总览统计：总数/愿望单数、按币种估算的花费、类别与 IP 分布 Top10、按入手年份分布、入手时间跨度。回答「我收藏了什么、花了多少」类问题时优先使用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'spending_summary',
    description: '按月汇总消费：谷子入手花费（估算）与游戏充值分别按月列出总额与笔数，可按年份过滤。回答「这个月/某年花了多少钱」类问题必须使用本工具，不要用 goods_search 拼凑花费答案。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按日期前缀匹配），如 2026；不传则统计全部年份' }
      }
    }
  },
  {
    name: 'character_leaderboard',
    description: '角色维度统计：每个角色的持有条目数、数量、估算花费、已出件数与愿望单件数，按条目数倒序。回答「我最喜欢哪个角色/角色排行/角色花费对比」类问题使用。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15, description: '返回条数上限' }
      }
    }
  },
  {
    name: 'storage_locations',
    description: '收纳位置分布：每个存放位置的条目数、数量、估算花费与示例条目，未填写位置的归为「未收纳」。回答「东西都放在哪/某个柜子放了什么」类问题使用；查某位置的具体条目可配合 goods_search 的 storageLocation 参数。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'wishlist_overview',
    description: '愿望单概览：条目数、按币种的期望花费合计（标价×数量）、IP 与类别分布 Top5、最近加入的条目。回答「我还想买什么/愿望单要花多少钱」类问题使用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'sale_ledger',
    description: '出谷账本：已售回血总额（成交价-手续费）、挂牌中金额、总盈亏（成交价-手续费-入手成本），及最近成交与在售挂牌明细。回答「卖了多少/回血多少/盈亏」类问题使用。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按成交日期前缀匹配），如 2026；不传则统计全部' }
      }
    }
  },
  {
    name: 'events_list',
    description: '查询参加过的展览/活动列表（漫展、theme events 等），含票务价格与关联谷子数量，按开始日期倒序。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    }
  },
  {
    name: 'recharge_summary',
    description: '游戏充值记录汇总：总金额、按游戏/年份分布、最近充值明细。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按充值时间前缀匹配），如 2025' }
      }
    }
  }
]
