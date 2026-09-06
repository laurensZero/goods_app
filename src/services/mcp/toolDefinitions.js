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
  '出谷回血与盈亏用 sale_ledger；活动背景用 events_list；演唱会/演出曲单用 event_tracks；游戏充值用 recharge_summary（总览）与 recharge_search（按项目/游戏精确统计）；',
  'CD/专辑谷子用 goods_search（hasTracks: true）找条目、goods_detail 看曲目明细；歌词用 music_lyrics；播放歌曲用 music_play。',
  '吃谷预算用 budget_overview 看超支情况、budget_set 修改；同步用 sync_start；分享用 share_create/share_manage；账号用 account_info/account_logout；版本与更新用 app_info；页面跳转用 navigate。',
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
    description: '按 id 部分更新谷子：只传需要修改的字段，未传字段保持不变。支持基本信息、收藏状态（collectStatus，如 已拥有/在售/已出/待发货）、出售信息（sellPrice/sellPlatform/sellFee/sellDate）与逐件字段（unit* 列表需传完整数组，会整体替换）。仅限未入回收站的条目；成交流程建议用 goods_sell。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id，来自 goods_search' },
        name: { type: 'string', description: '名称' },
        collectStatus: { type: 'string', description: '收集状态，如 已拥有/在售/已出/待发货/已赠出/丢失' },
        sellPrice: { type: 'string', description: '整条成交价（字符串数字；collectStatus 为 已出/在售 时有意义）' },
        sellPlatform: { type: 'string', description: '出售/挂牌平台' },
        sellFee: { type: 'string', description: '手续费' },
        sellDate: { type: 'string', description: '成交日期 YYYY-MM-DD' },
        saleAt: { type: 'string', description: '开售日期 YYYY-MM-DD' },
        unitAcquiredAtList: { type: 'array', items: { type: 'string' }, description: '逐件入手日期（YYYY-MM-DD），整体替换' },
        unitActualPriceList: { type: 'array', items: { type: 'string' }, description: '逐件实付价，整体替换' },
        unitCharacterList: { type: 'array', items: { type: 'string' }, description: '逐件角色，整体替换' },
        unitCollectStatusList: { type: 'array', items: { type: 'string' }, description: '逐件收集状态，整体替换' },
        unitSaleInfoList: { type: 'array', description: '逐件出售信息（{price,platform,fee,date}），整体替换', items: { type: 'object' } },
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
    name: 'goods_sell',
    description: '记录谷子出售/挂牌：默认置为「已出」并写入成交价、平台、手续费、日期（成本与盈亏由 sale_ledger 自动核算）；传 status="在售" 则记为挂牌中。多件拆分出售请改用 goods_update 的 unitCollectStatusList + unitSaleInfoList。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 id，来自 goods_search' },
        price: { type: 'number', description: '成交价/挂牌价' },
        platform: { type: 'string', description: '平台，如 闲鱼/微店' },
        fee: { type: 'number', description: '手续费' },
        date: { type: 'string', description: '成交日期 YYYY-MM-DD，缺省为今天' },
        status: { type: 'string', enum: ['已出', '在售'], description: '默认 已出（成交）' }
      },
      required: ['id']
    }
  },
  {
    name: 'recharge_add',
    description: '记一笔游戏充值。',
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', description: '游戏名' },
        amount: { type: 'number', description: '充值金额' },
        itemName: { type: 'string', description: '项目名，如 648 源石 / 月卡' },
        chargedAt: { type: 'string', description: '充值日期 YYYY-MM-DD，缺省为今天' },
        note: { type: 'string', description: '备注' }
      },
      required: ['game', 'amount']
    }
  },
  {
    name: 'music_play',
    description: '在应用内拉起播放某首曲目（悬浮播放器 + 原生通知栏，队列 = 所属完整曲单）。曲目来源二选一：演出曲单（eventId，来自 event_tracks）或 CD/专辑谷子（goodsId，来自 goods_search/goods_detail）；trackId 来自对应来源的曲目明细。仅手动录入、未关联在线音源（网易云/QQ/B站）的曲目无法播放。',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '演出 id（播放演出曲单里的歌），与 goodsId 二选一' },
        goodsId: { type: 'string', description: '谷子条目 id（播放 CD/专辑里的歌），与 eventId 二选一' },
        trackId: { type: 'string', description: '曲目 id，来自 event_tracks 或 goods_detail 的曲目明细' }
      },
      required: ['trackId']
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
  },
  {
    name: 'budget_set',
    description: '设置吃谷预算（与「我的-吃谷预算」同一存储，改完统计页预算线立即生效）。monthly=月度预算，yearly=年度预算；传 0 表示清除该预算。设置前建议先用 budget_overview 看现状。',
    inputSchema: {
      type: 'object',
      properties: {
        monthly: { type: 'number', minimum: 0, description: '月度预算金额（0 = 清除）' },
        yearly: { type: 'number', minimum: 0, description: '年度预算金额（0 = 清除）' }
      }
    }
  },
  {
    name: 'sync_start',
    description: '发起一次云同步（等同「同步」页的手动同步按钮）。需要已登录且已配置同步后端；同步进行中重复调用会返回 syncing 状态。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'share_create',
    description: '发起分享：把一组谷子生成分享链接（URL+分享码）。同一组商品（名称相同）已分享过时会更新原链接为最新数据并重新启用。分享内容不含存放位置/标签等隐私字段。',
    inputSchema: {
      type: 'object',
      properties: {
        goodsIds: { type: 'array', items: { type: 'string' }, description: '要分享的谷子 id 列表（1-20 件），来自 goods_search' }
      },
      required: ['goodsIds']
    }
  },
  {
    name: 'share_manage',
    description: '分享管理：列出我的全部分享链接（action=list）、启用/禁用（toggle）、删除（delete）。需要登录。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'toggle', 'delete'], description: '操作类型，默认 list' },
        shareId: { type: 'string', description: '分享 id（toggle/delete 必填，来自 list）' },
        disabled: { type: 'boolean', description: 'toggle 时：true=禁用（默认），false=启用' }
      }
    }
  },
  {
    name: 'account_info',
    description: '查看当前登录账号信息：是否登录、邮箱、昵称。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'account_logout',
    description: '退出登录当前账号。仅在用户明确要求时调用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'navigate',
    description: '页面跳转：让应用直接打开某个页面（聊天里的一键跳转）。goods_detail/goods_edit 需要 id（来自 goods_search）；其余页面直接给 page。跳转后聊天页会被离开。',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: '页面：home/recharge/wishlist/my/events/statistics/trash/sync/shares/settings/notifications/about/ai_service/goods_add/checkout/goods_detail/goods_edit' },
        id: { type: 'string', description: '谷子 id（仅 goods_detail/goods_edit 需要）' }
      },
      required: ['page']
    }
  },
  {
    name: 'app_info',
    description: '应用信息：平台、当前版本号；传 checkUpdate: true 时联网检查是否有新版本（返回 hasUpdate/latestVersion/forceUpdate）。',
    inputSchema: {
      type: 'object',
      properties: {
        checkUpdate: { type: 'boolean', description: '是否联网检查更新' }
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
        collectionOnly: { type: 'boolean', description: '为 true 时排除愿望单条目（只返回已收藏）。回答「收藏了什么」类问题应传 true，避免混入心愿单' },
        hasTracks: { type: 'boolean', description: '为 true 时只返回带曲目列表的条目（CD/专辑等）。回答「我有哪些 CD/专辑」类问题使用；每条结果的 tracksSummary 给出曲目概况，明细拿 id 调 goods_detail' },
        acquiredAfter: { type: 'string', description: '只返回入手日期不早于该值的条目，格式 YYYY-MM-DD（含当天）' },
        acquiredBefore: { type: 'string', description: '只返回入手日期不晚于该值的条目，格式 YYYY-MM-DD（含当天）' },
        priceMin: { type: 'number', description: '价格下限（实付价优先，缺省用标价，不乘数量；未填价格视为 0）' },
        priceMax: { type: 'number', description: '价格上限（口径同 priceMin）' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: '返回条数上限' },
        offset: { type: 'integer', minimum: 0, default: 0, description: '分页偏移' }
      }
    }
  },
  {
    name: 'goods_detail',
    description: '按 id 获取单个谷子的完整信息：多件拆分（每件入手日期/价格/角色/收集状态）、出售信息、状态时间线等；CD/专辑条目额外返回专辑曲目明细（tracks，含可播状态与 trackId，可供 music_play / music_lyrics 使用）。回收站中的条目也能查到。',
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
    description: '收藏总览统计。字段口径：collectionCount=已收藏条目数（非愿望单）；wishlistCount=愿望单条目数；grandTotal=两者合计。两者相加才等于 grandTotal，不要用 grandTotal 减 wishlistCount 推算收藏数。花费估算/类别与 IP 分布/年份分布均只统计已收藏部分。回答「我收藏了什么、花了多少」类问题时优先使用。',
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
    description: '角色维度统计。字段口径（必须严格遵守）：count=已收藏条目数（不含愿望单）；wishlistCount=愿望单条目数，与 count 并列，禁止相加；quantity=已收藏件数；spend 只计已收藏。回答「我最喜欢哪个角色/角色排行/角色花费对比」类问题使用；表述时必须区分「已收藏」和「在愿望单」。',
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
    description: '查询参加过的展览/活动列表（漫展、theme events 等），含票务与现场开支合计（ticketPrice + 逐日票 + 其他开支，原币种未折算）、关联谷子数量，按开始日期倒序。回答「这次漫展花了多少」类问题使用；查某场演出/演唱会唱了哪些歌请改用 event_tracks。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    }
  },
  {
    name: 'event_tracks',
    description: '查询演出/演唱会的曲单与演出基本信息（城市/场馆/座位/票档/描述等）。默认只返回 tracksSummary 曲目概况（总数/可播数/仅手动数），不返回曲目明细——用户没明确要歌单时用一句话概括即可，禁止罗列具体曲目；用户要完整歌单、找某首歌或想播放时才传 includeTracks: true。要播放时拿 eventId + trackId 调 music_play。',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '演出 id，来自 events_list；传了 eventId 就只返回这一场（即使曲单为空）' },
        query: { type: 'string', description: '关键词：优先匹配演出名（命中返回整场曲单概况），否则匹配曲目歌名/歌手。与 eventId 二选一' },
        includeTracks: { type: 'boolean', default: false, description: '为 true 时返回具体曲目明细（含 trackId，供展示歌单或播放）；缺省只给 tracksSummary 概况' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: '返回演出场数上限' },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    }
  },
  {
    name: 'music_lyrics',
    description: '查询某首曲目的歌词（网易云/QQ 直连歌曲 ID，B 站曲目按标题跨源匹配）。曲目来源二选一：演出曲单（eventId，来自 event_tracks）或 CD/专辑谷子（goodsId，来自 goods_search/goods_detail）；trackId 来自对应来源的曲目明细。返回带时间轴的歌词行与纯文本。回答「这首歌的歌词/词是什么」类问题使用。',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '演出 id（查演出曲单里的歌），与 goodsId 二选一' },
        goodsId: { type: 'string', description: '谷子条目 id（查 CD/专辑里的歌），与 eventId 二选一' },
        trackId: { type: 'string', description: '曲目 id，来自 event_tracks 或 goods_detail 的曲目明细' }
      },
      required: ['trackId']
    }
  },
  {
    name: 'budget_overview',
    description: '吃谷预算总览：当前月度/年度预算（0=未设置）、本月/今年已花费与进度（剩余/百分比/是否超支）、今年逐月花费与超支标记、历年花费与超支标记。回答「这个月预算还剩多少」「哪个月/哪年超了」类问题必须使用本工具，花费口径与预算设置页一致。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'recharge_summary',
    description: '游戏充值记录汇总：总金额、按游戏/充值项目/年份分布、最近充值明细。总览类问题使用；查某个具体项目（如「空月祝福买了几张」）或精确检索记录请用 recharge_search。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按充值时间前缀匹配），如 2025' }
      }
    }
  },
  {
    name: 'recharge_search',
    description: '按条件检索游戏充值记录并聚合：总额、笔数、按充值项目细分（byItem，含每项 total/count）、按月分布、命中记录明细。回答「空月祝福一共买了几张」「原神去年充了多少」「648 花了多少钱」类问题必须用本工具。',
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', description: '按游戏名过滤（包含匹配，不区分大小写），如 原神' },
        itemName: { type: 'string', description: '按充值项目名过滤（包含匹配），如 空月祝福/月卡/648' },
        query: { type: 'string', description: '关键词，同时匹配游戏名/项目名/备注' },
        year: { type: 'integer', description: '只看某一年（按充值时间前缀匹配）' },
        month: { type: 'integer', minimum: 1, maximum: 12, description: '只看某月（1-12），需与 year 搭配' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: '返回记录条数上限' },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    }
  }
]

/** 外部 MCP 开启写入开关后可用的完整工具集 */
export const MCP_ALL_TOOL_DEFINITIONS = [...MCP_TOOL_DEFINITIONS, ...MCP_WRITE_TOOL_DEFINITIONS]

/** @param {boolean} allowWrites */
export function getToolDefinitions(allowWrites) {
  return allowWrites ? MCP_ALL_TOOL_DEFINITIONS : MCP_TOOL_DEFINITIONS
}
