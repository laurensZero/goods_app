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
  '收藏/心愿总价与页面同口径（含谷子组）：collection_overview / wishlist_overview 已返回 groups 摘要与 totalValueCNY，不要绕开套组自己加总；',
  '出谷回血与盈亏用 sale_ledger；活动背景用 events_list；活动增删改用 events_add/events_update/events_delete；演唱会/演出曲单用 event_tracks；游戏充值用 recharge_summary（总览）与 recharge_search（按项目/游戏精确统计）；',
  '分组/套组用 groups_list 总览、groups_manage 增删改与成员管理；回收站列表用 trash_list，永久清理用 goods_purge；批量改字段用 goods_update_many；',
  'CD/专辑谷子用 goods_search（hasTracks: true）找条目、goods_detail 看曲目明细；歌词用 music_lyrics；播放歌曲用 music_play。',
  '吃谷预算用 budget_overview 看超支情况、budget_set 修改；米游铺上新用 mihoyo_new_arrivals（商品/积分/满赠），要加心愿单用 goods_add（isWishlist: true，带 goodsId/price/saleAt/image）；同步用 sync_start；分享用 share_create/share_manage；账号用 account_info/account_logout；版本与更新用 app_info；页面跳转用 navigate。',
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
  category: { type: 'string', description: '类别（吧唧/立牌/手办…）' },
  ip: { type: 'string', description: 'IP/作品名' },
  characters: { type: 'array', items: { type: 'string' }, description: '角色列表' },
  tags: { type: 'array', items: { type: 'string' }, description: '标签' },
  variant: { type: 'string', description: '款式' },
  storageLocation: { type: 'string', description: '存放位置' },
  price: { type: 'string', description: '标价（数字字符串）' },
  actualPrice: { type: 'string', description: '实付价（数字字符串）' },
  currency: { type: 'string', description: '标价币种，如 CNY' },
  actualPriceCurrency: { type: 'string', description: '实付币种' },
  quantity: { type: 'integer', minimum: 1, description: '数量，默认 1' },
  acquiredAt: { type: 'string', description: '入手日期 YYYY-MM-DD' },
  saleAt: { type: 'string', description: '开售日期 YYYY-MM-DD' },
  goodsId: { type: 'string', description: '米游铺商品 ID' },
  image: { type: 'string', description: '封面 URL' },
  images: { type: 'array', items: { type: 'string' }, description: '图片 URL 列表' },
  isWishlist: { type: 'boolean', description: '是否愿望单' },
  note: { type: 'string', description: '备注' }
}

/** @type {McpToolDefinition[]} */
export const MCP_WRITE_TOOL_DEFINITIONS = [
  {
    name: 'goods_add',
    description: '新增谷子；isWishlist:true=加愿望单。name 必填。上新加心愿单：字段从 mihoyo_new_arrivals 原样带入。',
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
    description: '按 id 部分更新谷子（未传字段不变）。含收藏状态/出售信息/逐件 unit*（整表替换）。回收站条目不可改；成交用 goods_sell。',
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
    description: '记录出售/挂牌。默认已出；status=在售 为挂牌。多件拆分用 goods_update 的 unit* 字段。',
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
    name: 'recharge_update',
    description: '按 id 部分更新充值（未传字段不变）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '充值记录 id' },
        game: { type: 'string', description: '游戏名' },
        amount: { type: 'number', description: '金额' },
        itemName: { type: 'string', description: '项目名' },
        chargedAt: { type: 'string', description: '充值日期 YYYY-MM-DD' },
        note: { type: 'string', description: '备注' }
      },
      required: ['id']
    }
  },
  {
    name: 'recharge_delete',
    description: '删除一笔充值记录（软删除）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '充值记录 id，来自 recharge_search 或 recharge_summary' }
      },
      required: ['id']
    }
  },
  {
    name: 'events_add',
    description: '新增活动/展览/演唱会。name 必填。location 填场馆全称可地图打点。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '活动名称' },
        type: { type: 'string', description: '类型，如 漫展/演唱会' },
        startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
        endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
        city: { type: 'string', description: '城市' },
        location: { type: 'string', description: '场地/场馆全称（如「上海新国际博览中心」），便于地图打点' },
        ticketPrice: { type: 'string', description: '票价（字符串数字）' },
        ticketType: { type: 'string', description: '票种' },
        seatInfo: { type: 'string', description: '座位信息' },
        description: { type: 'string', description: '备注/描述' },
        linkedGoodsIds: { type: 'array', items: { type: 'string' }, description: '关联谷子 id 列表' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' }
      },
      required: ['name']
    }
  },
  {
    name: 'events_update',
    description: '按 id 部分更新活动（未传字段不变）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '活动 id，来自 events_list' },
        name: { type: 'string', description: '活动名称' },
        type: { type: 'string', description: '类型' },
        startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
        endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
        city: { type: 'string', description: '城市' },
        location: { type: 'string', description: '场地/场馆' },
        ticketPrice: { type: 'string', description: '票价' },
        ticketType: { type: 'string', description: '票种' },
        seatInfo: { type: 'string', description: '座位信息' },
        description: { type: 'string', description: '描述' },
        linkedGoodsIds: { type: 'array', items: { type: 'string' }, description: '关联谷子 id（整体替换）' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签（整体替换）' }
      },
      required: ['id']
    }
  },
  {
    name: 'events_delete',
    description: '删除活动（软删除，可撤回）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '活动 id，来自 events_list' }
      },
      required: ['id']
    }
  },
  {
    name: 'event_tracks_manage',
    description: '曲单增删：action=add 追加（tracks 每首 title 必填，coverUrl/音源 id 从 music_search 原样带入）、remove 删单曲（trackId 来自 includeTracks 明细）。不覆盖整单。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'], description: 'add=追加曲目；remove=删除单曲' },
        eventId: { type: 'string', description: '活动 id，来自 events_list / event_tracks' },
        tracks: {
          type: 'array',
          description: 'add 的曲目数组：{ title, artist?, album?, source?, coverUrl?, neteaseSongId?, qqSongId?, bilibiliVideoId?, durationMs? }',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '歌名（必填）' },
              artist: { type: 'string', description: '歌手' },
              album: { type: 'string', description: '专辑名' },
              source: { type: 'string', enum: ['netease', 'qq', 'bilibili', 'manual'], description: '音源，默认 manual（仅手动录入，不可在线播放）' },
              coverUrl: { type: 'string', description: '封面图 URL，从 music_search 结果原样复制' },
              neteaseSongId: { type: 'string', description: '网易云歌曲 id（source=netease 时提供，可在线播放）' },
              qqSongId: { type: 'string', description: 'QQ 音乐歌曲 id（source=qq 时提供）' },
              bilibiliVideoId: { type: 'string', description: 'B 站视频 id（source=bilibili 时提供）' },
              durationMs: { type: 'number', description: '时长（毫秒）' }
            },
            required: ['title']
          }
        },
        trackId: { type: 'string', description: '仅 action=remove：要删除的曲目 id' }
      },
      required: ['action', 'eventId']
    }
  },
  {
    name: 'music_play',
    description: '应用内播放曲目。eventId+trackId=演出曲单，goodsId+trackId=专辑。仅在线音源可播，manual 不可。',
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
    name: 'goods_update_many',
    description:
      '批量部分更新多条谷子：ids 一次最多 50 个，其余字段与 goods_update 相同，只传需要修改的字段，未传字段保持不变。' +
      '适用于「把所有 IP=原神 的吧唧改成收纳到 A 柜」这类批量整理；先用 goods_search 拿 id 再调用。不可用于回收站条目。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 50,
          description: '要更新的谷子 id 列表，来自 goods_search'
        },
        name: { type: 'string', description: '名称（一般不批量改）' },
        category: { type: 'string', description: '类别' },
        ip: { type: 'string', description: 'IP（作品名）' },
        characters: { type: 'array', items: { type: 'string' }, description: '关联角色列表' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        variant: { type: 'string', description: '款式/版本' },
        storageLocation: { type: 'string', description: '存放位置' },
        price: { type: 'string', description: '标价（字符串数字）' },
        actualPrice: { type: 'string', description: '实付价（字符串数字）' },
        currency: { type: 'string', description: '标价币种' },
        actualPriceCurrency: { type: 'string', description: '实付价币种' },
        quantity: { type: 'integer', minimum: 1, description: '数量' },
        acquiredAt: { type: 'string', description: '入手日期 YYYY-MM-DD' },
        isWishlist: { type: 'boolean', description: '是否愿望单' },
        note: { type: 'string', description: '备注' },
        collectStatus: { type: 'string', description: '收集状态' }
      },
      required: ['ids']
    }
  },
  {
    name: 'goods_purge',
    description:
      '永久删除回收站中的谷子（不可恢复，没有一键撤回）。ids 指定条目，或 emptyTrash: true 清空整个回收站。' +
      '禁止在用户未明确确认时调用；确认时优先用 ask_user。',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: '要永久删除的回收站条目 id（来自 trash_list）；与 emptyTrash 二选一'
        },
        emptyTrash: { type: 'boolean', description: '为 true 时清空整个回收站（需用户明确确认）' }
      }
    }
  },
  {
    name: 'groups_manage',
    description: '分组增删改与成员管理：create/update/remove/add_members/remove_members/move_member。删组前确认；只删组关系，谷子不进回收站。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'remove', 'add_members', 'remove_members', 'move_member'],
          description: '操作类型'
        },
        groupId: { type: 'string', description: '分组 id（update/remove/add_members/move_member 必填，来自 groups_list）' },
        name: { type: 'string', description: '分组名称（create 必填；update 可改）' },
        type: { type: 'string', enum: ['collection', 'wishlist'], description: 'create 时：collection=收藏套组，wishlist=心愿单组，默认 collection' },
        summaryMode: { type: 'string', enum: ['auto', 'manual'], description: '汇总方式：auto=按成员合计，manual=用 totalAmount 手写' },
        totalAmount: { type: 'number', description: 'summaryMode=manual 时的手写总额' },
        currency: { type: 'string', description: '手写总额币种，默认 CNY' },
        note: { type: 'string', description: '备注' },
        goodsIds: { type: 'array', items: { type: 'string' }, description: 'add_members / remove_members 的谷子 id 列表（来自 goods_search）' },
        goodsId: { type: 'string', description: 'move_member 时要挪动的单件谷子 id' }
      },
      required: ['action']
    }
  },
  {
    name: 'settings_overview',
    description: '查看主题/通知/预设清单现状。改设置前先调用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'presets_manage',
    description: '预设增删改（分类/IP/角色/活动类型/收纳位置）。改名会级联更新条目；activity_type 可 set_show_tracks。',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['category', 'ip', 'character', 'storage_location', 'event_type'], description: '要操作的预设类型' },
        action: { type: 'string', enum: ['add', 'remove', 'rename', 'set_show_tracks'], description: '操作类型；storage_location 仅支持 add；set_show_tracks 仅 event_type' },
        name: { type: 'string', description: '预设名称' },
        newName: { type: 'string', description: 'rename 时的新名称' },
        ip: { type: 'string', description: 'entity=character 且 action=add 时可选，角色所属 IP' },
        showTracks: { type: 'boolean', description: 'entity=event_type 时：add 可选是否开启曲目展示；set_show_tracks 必填目标开关值' }
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
    description: '设置吃谷预算。monthly/yearly，0=清除。',
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
    description: '发起云同步。需已登录并配置后端。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'share_create',
    description: '把一组谷子生成分享链接（不含隐私字段）。同名组会更新原链接。',
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
    description: '分享管理：list / toggle / delete。需登录。',
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
    name: 'ask_user',
    description: '弹选项按钮问用户（2-6 项），返回所选 label。选歌时 options 带 neteaseSongId/qqSongId/bilibiliVideoId（勿写 songId）以便试听。开放问题不要用。',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题（简洁明确）' },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          description:
            '2-6 个选项对象。每项至少 label；选歌时务必带上对应音源 id 字段名：neteaseSongId / qqSongId / bilibiliVideoId（禁止写成 songId）。示例：{ "label": "离去之原 · Hanser · 网易云", "title": "离去之原", "artist": "Hanser", "source": "netease", "neteaseSongId": "30569747", "coverUrl": "https://…", "durationMs": 267000 }',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '选项展示文案（必填）；用户点击后返回给模型的就是这个字符串' },
              title: { type: 'string', description: '歌名（试听用）' },
              artist: { type: 'string', description: '歌手（试听用）' },
              album: { type: 'string', description: '专辑名（可选）' },
              coverUrl: { type: 'string', description: '封面 URL，从 music_search 原样复制（可选）' },
              durationMs: { type: 'number', description: '时长毫秒（可选）' },
              source: { type: 'string', enum: ['netease', 'qq', 'bilibili', 'manual'], description: '音源' },
              neteaseSongId: { type: 'string', description: '网易云 id（有则可试听）' },
              qqSongId: { type: 'string', description: 'QQ 音乐 id（有则可试听）' },
              bilibiliVideoId: { type: 'string', description: 'B 站 BV 号（有则可试听）' }
            },
            required: ['label']
          }
        }
      },
      required: ['question', 'options']
    }
  },
  {
    name: 'account_logout',
    description: '退出登录。仅用户明确要求时调用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'navigate',
    description: '生成跳转按钮 buttonLink（app://，不自动跳）。带 id 页面需 id。上新页=mihoyo_new_arrivals。',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'home/recharge/wishlist/my/events/event_map/statistics/trash/sync/shares/settings/notifications/about/ai_service/goods_add/checkout/mihoyo_new_arrivals 或带 id 的 group_detail/goods_detail/goods_edit/event_detail/event_edit' },
        id: { type: 'string', description: '目标 id（goods_detail/goods_edit 传谷子 id，event_detail/event_edit 传活动 id，group_detail 传分组 id）' }
      },
      required: ['page']
    }
  },
  {
    name: 'memory_save',
    description: '记住/忘记用户长期偏好。只记明确长期偏好；收藏数据禁止入记忆。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'remove'], description: 'add=记住（默认），remove=忘记' },
        text: { type: 'string', description: '一条简短的第三人称记忆（如「用户只收吧唧类谷子」）；remove 时需与已保存文本完全一致' }
      },
      required: ['text']
    }
  },
  {
    name: 'app_info',
    description: '应用版本与可选更新检查（checkUpdate:true）。',
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
      description: '搜谷子（默认含收藏+愿望单）。关键词模糊匹配 + 多维过滤/排序。详情用 goods_detail。价格口径：实付优先回退标价，不乘数量。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词（名称/IP/角色/标签/类别/款式/位置/备注）' },
        category: { type: 'string', description: '类别精确过滤' },
        ip: { type: 'string', description: 'IP 精确过滤' },
        character: { type: 'string', description: '角色过滤' },
        storageLocation: { type: 'string', description: '存放位置精确过滤' },
        wishlistOnly: { type: 'boolean', description: '只看愿望单' },
        collectionOnly: { type: 'boolean', description: '只看收藏（问「收藏了什么」必传 true）' },
        hasTracks: { type: 'boolean', description: '只要带曲目的 CD/专辑' },
        acquiredAfter: { type: 'string', description: '任一件入手日期 ≥ YYYY-MM-DD' },
        acquiredBefore: { type: 'string', description: '任一件入手日期 ≤ YYYY-MM-DD' },
        priceMin: { type: 'number', description: '价格下限' },
        priceMax: { type: 'number', description: '价格上限' },
        sortBy: { type: 'string', enum: ['updatedAt', 'acquiredAt', 'saleAt', 'price', 'actualPrice', 'quantity'], default: 'updatedAt', description: '排序字段；最贵/最新等用它，勿全量自排' },
        sortOrder: { type: 'string', enum: ['desc', 'asc'], default: 'desc', description: 'asc/desc' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: '条数上限' },
        offset: { type: 'integer', minimum: 0, default: 0, description: '分页偏移' }
      }
    }
  },
  {
    name: 'goods_detail',
    description: '按 id 查谷子完整信息（多件拆分/出售/时间线；专辑含 tracks）。回收站也可查。',
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
    description: '收藏总览：collectionCount/wishlistCount/grandTotal、totalValueCNY（与收藏页总价同口径，含套组）、套组摘要。问收藏构成/总价用它。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'spending_summary',
    description: '按月汇总谷子花费与充值。问「花了多少钱」必用，勿用 goods_search 拼。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按日期前缀匹配），如 2026；不传则统计全部年份' }
      }
    }
  },
  {
    name: 'character_leaderboard',
    description: '角色排行/花费。count=已收藏（不含愿望单），wishlistCount 单独列，禁止相加。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15, description: '返回条数上限' }
      }
    }
  },
  {
    name: 'storage_locations',
    description: '收纳位置分布（条目数/花费/示例）。问「放在哪」用它。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'wishlist_overview',
    description: '愿望单概览：条目数/expectedSpendCNY（与愿望单页同口径，含套组）/分布/最贵。问愿望单用它。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'sale_ledger',
    description: '出谷账本：回血/挂牌/盈亏与明细。问卖了多少用它。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按成交日期前缀匹配），如 2026；不传则统计全部' }
      }
    }
  },
  {
    name: 'events_list',
    description: '活动列表（票务/开支/坐标/地图链接）。问活动/场馆坐标先读本地，勿 web_search。曲目用 event_tracks。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 },
        city: { type: 'string', description: '按城市/场馆关键词过滤，如「上海」「新国际博览」' }
      }
    }
  },
  {
    name: 'event_tracks',
    description: '查演出信息与曲单概况（含照片）。默认只给 tracksSummary；要完整歌单/播放才 includeTracks:true，长曲单用 trackOffset 翻页取全。',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '演出 id，来自 events_list；传了 eventId 就只返回这一场（即使曲单为空）' },
        query: { type: 'string', description: '关键词：优先匹配演出名（命中返回整场曲单概况），否则匹配曲目歌名/歌手。与 eventId 二选一' },
        includeTracks: { type: 'boolean', default: false, description: '为 true 时返回具体曲目明细（含 trackId，供展示歌单或播放）；缺省只给 tracksSummary 概况' },
        trackOffset: { type: 'integer', minimum: 0, default: 0, description: '曲目分页偏移（配合 includeTracks）。trackHasMore 为 true 时递增翻页取完整歌单' },
        trackLimit: { type: 'integer', minimum: 1, maximum: 200, default: 100, description: '单次返回曲目条数' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: '返回演出场数上限' },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    }
  },
  {
    name: 'music_lyrics',
    description: '查歌词。eventId 或 goodsId + trackId（曲目来自 event_tracks / goods_detail）。',
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
    name: 'music_search',
    description: '在线搜歌（网易云/QQ/B站）。返回歌名/歌手/封面/音源 id。纯搜歌给试听链接 [▶…](app://play_music/<source>/<id>)；要加演出再 ask_user 选一首。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词：歌名，可加歌手名提高准确度，如「melt 宫野真守」' },
        source: {
          type: 'string',
          enum: ['netease', 'qq', 'bilibili', 'all'],
          default: 'all',
          description: '搜索来源；缺省 all=三源并搜，合并返回'
        },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 8, description: '每源返回条数上限' }
      },
      required: ['keyword']
    }
  },
  {
    name: 'groups_list',
    description: '列分组/套组。改分组用 groups_manage。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['collection', 'wishlist'], description: '只看某类分组；缺省两类都返回' },
        query: { type: 'string', description: '按分组名关键词过滤' },
        includeMembers: { type: 'boolean', default: false, description: '为 true 时附带成员谷子 id/名称列表（上限 20）' }
      }
    }
  },
  {
    name: 'trash_list',
    description: '回收站列表。恢复 goods_restore；永久删除 goods_purge（需确认）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，匹配名称/IP/角色/类别/备注' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    }
  },
  {
    name: 'budget_overview',
    description: '吃谷预算与超支。问「预算还剩多少」必用。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'recharge_summary',
    description: '充值总览。精确到项目（空月祝福等）用 recharge_search。',
    inputSchema: {
      type: 'object',
      properties: {
        year: { type: 'integer', description: '只统计某一年（按充值时间前缀匹配），如 2025' }
      }
    }
  },
  {
    name: 'recharge_search',
    description: '按游戏/项目/时间检索充值并聚合。问「XX买了几张/花了多少」必用。',
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
  },
  {
    name: 'mihoyo_new_arrivals',
    description: '米游铺上新（shop/point/gift）。问上新/新品/积分/满赠用它。加心愿单：字段原样进 goods_add（isWishlist:true）。浏览页 navigate mihoyo_new_arrivals。',
    inputSchema: {
      type: 'object',
      properties: {
        catalog: {
          type: 'string',
          enum: ['shop', 'point', 'gift', 'all'],
          default: 'shop',
          description: '目录：shop=商品上新（默认）、point=积分兑换、gift=满赠、all=三类全查（较慢）'
        },
        shopCode: {
          type: 'string',
          enum: ['ys', 'xqtd', 'bh3', 'zzz'],
          description: '只看某店铺：ys=原神、xqtd=星穹铁道、bh3=崩坏3、zzz=绝区零；缺省四店'
        },
        query: { type: 'string', description: '按商品名关键词过滤（包含匹配）' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: '返回条数上限' }
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
