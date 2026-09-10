import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { useGoodsStore } from './goods'
import { useGoodsGroupStore } from './goodsGroup'
import { usePresetsStore } from './presets'
import { useThemeStore } from './theme'
import { useNotifySettingsStore } from './notifySettings'
import { useRechargeStore } from './recharge'
import { useEventsStore } from './events'
import { useMediaPlayerStore } from './mediaPlayer'
import { useAuthStore } from './auth'
import { useSyncStore } from './sync'
import { useAppUpdateStore } from './appUpdate'
import { useWebUpdateStore } from './webUpdate'
import { readBudgetSettings, writeBudgetSettings } from '@/utils/goods/budget'
import { loadUserMemories } from '@/utils/ai/userMemory'
import router from '@/router'
import * as db from '@/utils/db'
import { parseCloudImageUri } from '@/utils/goods/images'
import { createMcpToolHandlers } from '@/services/mcp/tools'
import { createMoneyEnrichers } from '@/services/mcp/moneyContext'
import { createMcpWriteToolHandlers } from '@/services/mcp/writeTools'
import { MCP_TOOL_DEFINITIONS, MCP_WRITE_TOOL_DEFINITIONS } from '@/services/mcp/toolDefinitions'
import { runChatCompletion, generateChatTitle, DEFAULT_AI_CONFIG } from '@/services/ai/chatClient'
import {
  createUndoTrackingExecutor,
  applyUndoEntries,
  sanitizeUndoJournal
} from '@/services/ai/writeUndo'
import { VISION_TOOL_DEFINITIONS, createVisionToolHandlers } from '@/services/ai/visionTools'
import { ATTACHMENT_TOOL_DEFINITIONS, createAttachmentToolHandlers } from '@/services/ai/attachmentTools'
import { TABLE_TOOL_DEFINITIONS, createTableToolHandlers } from '@/services/ai/tableImportTools'
import { createLogger } from '@/utils/logger'

const log = createLogger('ai-chat')

const CONFIG_STORAGE_KEY = 'goods_ai_chat_config'
/** 发送历史时保留的原始消息上限（超出后从最早的完整轮次截断） */
const MAX_CONVO_MESSAGES = 80
/** 单条消息最多携带的视觉附件数（控制体积与 token 成本） */
const MAX_ATTACHMENTS = 3

/**
 * 系统提示词：注入当天日期（「这个月」类问题的时间基准）与工具选择规则。
 */
function buildSystemPrompt() {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const lines = [
    `你是「谷子收纳」应用内置的 AI 助手，帮用户管理动漫/游戏周边（谷子）收藏。今天是 ${today}。`,
    '只读工具：goods_search（搜索，hasTracks: true 可筛带曲目列表的 CD/专辑）、goods_detail（详情，含图片 uri 与 CD/专辑曲目明细）、collection_overview（收藏总览）、spending_summary（按月/年消费汇总）、character_leaderboard（角色统计排行）、storage_locations（收纳位置分布）、wishlist_overview（愿望单与预算）、sale_ledger（出谷回血与盈亏）、events_list（展览活动）、event_tracks（演出/演唱会曲单）、music_lyrics（查曲目歌词）、recharge_summary（充值总览）、recharge_search（充值按项目/游戏精确统计）、budget_overview（吃谷预算与超支）；',
    '可写工具：goods_add（新增）、goods_update（部分更新，含收藏状态/出售信息/逐件字段）、goods_sell（记录出售或挂牌）、goods_delete（移入回收站，可恢复）、goods_restore（恢复）、recharge_add（记游戏充值）、recharge_update（部分更新充值）、recharge_delete（删充值）、events_add（新增活动）、events_update（部分更新活动）、events_delete（删除活动）、music_play（拉起播放曲目：eventId+trackId 播演出曲单，goodsId+trackId 播 CD/专辑）、budget_set（设置吃谷预算，0=清除）、sync_start（发起云同步）、share_create（生成谷子分享链接）、share_manage（分享列表/启停/删除）、account_info（账号信息）、account_logout（退出登录，需用户明确要求）、navigate（页面跳转）、app_info（版本号与更新检查）、memory_save（记住/忘记用户长期偏好）；',
    '设置工具：settings_overview（查看设置与预设清单）、presets_manage（增删改分类/IP/角色/收纳位置，改名会级联谷子）、theme_set（切换主题）、notify_settings_set（修改通知设置），改设置前先用 settings_overview 看现状，删除类操作先向用户确认;',
    '视觉工具：vision_analyze（看图；仅用户明确要求时用，见下方铁律）、attachment_apply（把聊天附件写入谷子图/活动封面/活动照片，普通写操作，不需要视觉识别）；',
    '表格工具：table_dryrun（解析 xlsx/csv/zip 附件；官方格式返回 mode=official 快速路径，非官方 mode=structure 看结构 / mode=dryrun 带映射预演，均不写库）、table_commit（官方直接标准导入，非官方按映射批量写入；需 dryRunConfirmed: true）；',
    '工具选择规则：',
    '- 问花了多少钱/消费/月度账单 → 必须用 spending_summary，禁止用 goods_search 拼凑花费答案；',
    '- 问角色排行/最喜欢谁 → character_leaderboard；问东西放在哪 → storage_locations；问还想买什么/愿望单 → wishlist_overview；问卖了多少/回血/盈亏 → sale_ledger；',
    '- 问收藏构成/总量/分布 → collection_overview；找具体物品 → goods_search；单件详情 → goods_detail；',
    '- 时间范围（这个月/上月/某段时间买的）：goods_search 用 acquiredAfter/acquiredBefore 过滤，按「任一件入手日期」命中——同一谷子上月买了几件、本月又补货时也会命中；结果里的 unitAcquiredAtList 是逐件入手日期，回答时按日期归月说明「哪几件是哪个月买的」，不要只看顶层 acquiredAt 就说没买过；',
    '- 演出/演唱会：问基本情况（时间/地点/座位/花费/关联谷子）→ events_list；event_tracks 额外带曲单概况与座位/场馆信息，两者都可用于介绍演出；event_tracks 默认只返回 tracksSummary（共 X 首、可播 Y 首、仅手动 Z 首），用户没要歌单就用一两句话概括，禁止罗列曲目；用户明确要完整歌单、找某首歌或想播放时才传 includeTracks: true 拿明细，播放用 music_play（eventId+trackId）；playable 为 false 的曲目不能播放，建议用户在详情页导入音源；',
    '- CD/专辑谷子：问有哪些 CD/专辑、某张专辑收了什么歌 → goods_search 传 hasTracks: true 找条目（结果带 tracksSummary 概况），曲目明细在 goods_detail 的 tracks 里；播放专辑里的歌用 music_play（goodsId+trackId）；',
    '- 歌词：用户要歌词/问某首歌的词 → music_lyrics（eventId 或 goodsId + trackId，曲目明细来自 event_tracks 或 goods_detail），回复时给出歌词文本；没歌词时如实说明（可能是纯音乐）；',
    '- 充值统计：问某个项目/游戏的具体充值（如「空月祝福一共买了几张」「原神去年充了多少」）→ recharge_search（按 game/itemName/year 过滤并用 byItem/byMonth 回答），不要只靠 recharge_summary 的总览猜；总览/按年分布 → recharge_summary；',
    '- 图片：用户想看某件谷子的图/在回复里展示图片时 → goods_detail 返回的 images 数组里有可直接展示的 uri，用 ![描述](uri) 嵌入回复（最多 2-3 张，coverUrl 是主图）；看演出/活动的现场照片 → event_tracks 的 photos，同样用 ![描述](uri) 嵌入；',
    '- 图片 URL 铁律：嵌入回复的图片/照片 URL 必须从工具结果里逐字符原样复制，严禁凭记忆重写、拼接或编造——URL 里任何一段文件名写错都会变成打不开的死链；',
    '- 禁止自行拼接 Supabase/Storage 公开链接（不要用项目域名、userId、文件名拼 URL）。uri 只能原样使用；若 uri 不是 http://、https://、data: 开头（例如 cloud-image:// 或本地路径），不要改写成完整外链，可直接把工具返回的 uri 放进 ![描述](uri)，或说明「请在应用内查看本机图片」；',
    '- 视觉（vision_analyze）铁律：用户消息末尾的「[附件图片: n|att:…]」只表示随消息附带了图片，绝不自动分析；只有用户明确要求查看/识别/描述/分析图片内容（如「帮我看看这张」「图上是什么角色」「识别一下包装文字」）时才调用 vision_analyze。用户只发图不说话、或问的是收藏统计/记账等问题时禁止调用。image 参数：附件图填序号（"1"、"2"…）或标记里的 att:<id>；也可以填 goods_detail/event_tracks 返回的图片 uri、http(s) 链接或 cloud-image:// 链接。question 用用户的具体问题，没有则留空由模型客观描述。vision_analyze 报错/空回复时如实告知用户「当前视觉模型无法分析这张图」，并建议在设置中更换支持图片输入的视觉模型，不要连续空转重试。',
    '- 附件应用（attachment_apply）：用户要求把聊天里上传的图片设为谷子图/活动封面/活动照片（如「把这张加到吧唧上」「设为这次漫展的封面」「加一张现场照片」）→ attachment_apply，不需要 vision_analyze。target=goods_image（id 来自 goods_search，kind 默认 primary 设主图）、event_cover / event_photo（id 来自 events_list）。先确认目标条目 id 再写入；写完后在回复里说明已挂到哪条。',
    '- 表格导入铁律：用户消息末尾的「[附件表格: n|att:…]」表示随消息附带了表格附件（xlsx/csv/zip），绝不自动分析或导入；只有用户明确要求导入表格数据时才调用 table_dryrun。' +
      ' 若 table_dryrun 返回 mode=official（应用官方导出格式，按表头识别，覆盖谷子/活动/充值/预设等）：这是快速路径——无需字段映射、无需逐列询问，只需向用户简要说明将导入的条数与类型，用户同意后直接 table_commit（dryRunConfirmed: true，可不传 mapping）。' +
      ' 若 mode=structure（非官方）：必须分步——① 提出字段映射提案，任何含义模糊、可能对应多个字段、或值格式异常的列必须先问用户，问清楚才继续 → ② table_dryrun（带 mapping）预演 → ③ 把有效条数、问题行与前几条预览展示给用户 → ④ 用户明确同意后才 table_commit（dryRunConfirmed: true）。禁止跳过询问直接导入非官方表格；禁止在用户未确认时 commit。表格附件用序号（"1"）或 att:<id> 引用。',
    '- 预算：「这个月/今年预算还剩多少」「哪个月/哪年超了」→ budget_overview（0=未设置）；用户要改预算 → budget_set（monthly/yearly，0=清除），改完可建议去统计页看预算线与超支标红；',
    '- 应用动作：同步数据 → sync_start（未登录/未配置会报错，如实转达）；分享谷子 → 先 goods_search 拿 id 再 share_create，管理链接 → share_manage；问账号 → account_info，退出登录 → account_logout（退出前跟用户确认一次）；问版本号/能否更新 → app_info（checkUpdate: true 才联网查）；',
    '- 跳转：应用绝不自动跳转页面，一律通过跳转按钮让用户自己点。需要跳转链接时 → navigate（page 必填；goods_detail/goods_edit/event_detail/event_edit 另需 id，活动 id 来自 events_list），它返回 buttonLink，你把它嵌成 [按钮文字](buttonLink)；也可以不经 navigate 直接按协议写 app://<page>（带 id 页面为 app://<page>/<id>）；',
    '- 跳转按钮：回答里提到具体页面/具体谷子/具体活动时，在回复末尾附上跳转按钮（用户点击才会跳转，不会自动跳）：markdown 链接协议为 app://<page>，page 与 navigate 工具一致（navigate 返回的 buttonLink 就是现成链接，逐字符复制即可），如 [查看出谷盈亏](app://statistics)、[查看愿望单](app://wishlist)、[查看谷子详情](app://goods_detail/<id>)、[查看演出详情](app://event_detail/<id>)；注意「谷子」指收藏品条目、「出谷」指出售谷子，两个词含义完全不同，严禁混用（没有「出谷详情」这种页面）；编辑用 [编辑](app://goods_edit/<id>) / [编辑](app://event_edit/<id>)，id 来自 goods_search/goods_detail/events_list；按内容选择最相关的 1-2 个按钮即可，用户没表达去向意图时可省略；不要用 http 链接冒充跳转按钮；按钮文案用简洁的固定句式（查看详情、查看「谷子名」、编辑、去统计页等），不要把「去看」和条目名/数量之类生拼成生硬短语；',
    '- 数量口径铁律：「收藏」与「心愿单/愿望单」是两个独立集合，严禁相加后统称为收藏；character_leaderboard 的 count 已排除愿望单，wishlistCount 要单独表述（如「已收藏 X 件，另有 Y 件在愿望单」）；搜「收藏的东西」时 goods_search 传 collectionOnly: true；',
    '- 排序类问题（最贵/最便宜/最新入手/数量最多）→ goods_search 直接用 sortBy+sortOrder+limit 拿结果（价格口径与价格过滤一致），不要拉全量再自己排序；',
    '- 金额铁律：展示金额必须带上条目/工具结果里的正确币种（看 currency 字段，不要一律写成 ¥）；不同币种禁止直接相加或混在一起比较大小；跨币种的汇总与排序用工具返回的折算 CNY 字段（如 wishlist_overview 的 expectedSpendCNY/mostExpensive.expectedCNY）；「愿望单最贵的几件」直接用 wishlist_overview 的 mostExpensive；',
    '- 涉及用户数据的问题必须调用工具获取实时数据，不要凭空编造；',
    '- goods_search 可能返回大量条目：回复里只做汇总概览（数量/分类统计），不要整表罗列，用户追问时再展示具体条目；',
    '- 记录出售用 goods_sell（价、平台、手续费、日期），记完可提示用 sale_ledger 查看盈亏；记充值用 recharge_add；',
    '- 新增/修改/删除等操作只做用户明确要求的事，批量或不可逆操作前先和用户确认；',
    '- 金额是用户手填的字符串，可能为空或含非数字字符；',
    '- 记忆（memory_save）判定铁律：只记用户明确表达的、长期有效的偏好/习惯（称呼、口味偏好如「只收吧唧」、预算习惯等），写成一条简短的第三人称陈述；收藏数据本身能通过工具查到，禁止存成记忆；一次性任务指令、本轮对话内容不存；拿不准是不是长期偏好就先问用户一句；保存后在回复里顺带告知已记住，用户要求忘记时用 remove（text 需与已存文本完全一致）；',
    '- 用用户的语言回答，简洁自然。'
  ]
  const memories = loadUserMemories()
  if (memories.length > 0) {
    lines.push('已记住的用户偏好（长期有效，回答时可参考；与工具查到的实时数据冲突时以实时数据为准）：')
    for (const memory of memories) {
      lines.push(`- ${memory.text}`)
    }
  }
  return lines.join('\n')
}

const SESSIONS_STORAGE_KEY = 'goods_ai_chat_sessions'
const LEGACY_HISTORY_KEY = 'goods_ai_chat_history'
/** 最多保留的会话数（超出按最近更新淘汰） */
const MAX_SESSIONS = 30
/** 每个会话持久化的 UI 消息上限（原始对话在 trimConvo 已限长） */
const MAX_PERSISTED_MESSAGES = 200
/** 单条消息持久化的思维链长度上限（防止推理模型长思考撑爆 localStorage） */
const MAX_PERSISTED_REASONING = 6000
const HISTORY_PERSIST_DELAY_MS = 300

let sessionSeq = 0
function createSessionRecord() {
  sessionSeq += 1
  return {
    id: `sess-${Date.now()}-${sessionSeq}`,
    title: '',
    /** 标题来源：''=首条消息截断（缺省）| 'ai'=AI 生成 | 'custom'=用户手动改，custom 后不再被覆盖 */
    titleSource: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    convo: []
  }
}

/**
 * 视觉附件清洗：只保留可预览/可解析的字段，防止脏数据进 localStorage。
 * @param {unknown} list
 */
function sanitizeAttachments(list) {
  if (!Array.isArray(list)) return []
  return list
    .slice(0, MAX_ATTACHMENTS)
    .map((item) => {
      if (!item) return null
      if (typeof item === 'string') {
        const uri = item.trim()
        return uri ? { id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, uri, type: 'image' } : null
      }
      const uri = String(item.uri || '').trim()
      const localPath = String(item.localPath || '').trim()
      const type = item.type === 'table' ? 'table' : 'image'
      const filename = type === 'table' ? String(item.filename || '').trim() : ''
      // 表格附件内容只在内存 registry，uri 可为空；图片仍需可预览地址
      if (type === 'image' && !uri && !localPath) return null
      if (type === 'table' && !filename && !uri && !localPath) return null
      return {
        id: String(item.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        uri,
        localPath,
        type,
        ...(filename ? { filename } : {})
      }
    })
    .filter(Boolean)
}

/** 清洗会话数据（兼容损坏/缺字段） */
function sanitizeSession(session) {
  const messages = (Array.isArray(session?.messages) ? session.messages : [])
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      ...m,
      steps: Array.isArray(m.steps) ? m.steps : [],
      reasoning: typeof m.reasoning === 'string' ? m.reasoning.slice(0, MAX_PERSISTED_REASONING) : '',
      attachments: sanitizeAttachments(m.attachments),
      undoJournal: sanitizeUndoJournal(m.undoJournal) || undefined
    }))
  const convo = Array.isArray(session?.convo) ? session.convo.filter((m) => m && typeof m.role === 'string') : []
  sessionSeq += 1
  return {
    id: String(session?.id || `sess-${Date.now()}-${sessionSeq}`),
    title: String(session?.title || ''),
    titleSource: String(session?.titleSource || ''),
    createdAt: Number(session?.createdAt) || Date.now(),
    updatedAt: Number(session?.updatedAt) || Date.now(),
    messages,
    convo
  }
}

/** 读取会话列表；兼容旧版单会话格式（goods_ai_chat_history） */
function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.sessions) && parsed.sessions.length > 0) {
        const sessions = parsed.sessions.slice(0, MAX_SESSIONS).map(sanitizeSession)
        const activeId = sessions.some((s) => s.id === parsed.activeId) ? parsed.activeId : sessions[0].id
        return { sessions, activeId }
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_HISTORY_KEY)
    if (legacyRaw) {
      const legacy = sanitizeSession(JSON.parse(legacyRaw))
      localStorage.removeItem(LEGACY_HISTORY_KEY)
      if (legacy.messages.length > 0) {
        legacy.title = String(legacy.messages[0]?.content || '').slice(0, 20)
        return { sessions: [legacy], activeId: legacy.id }
      }
    }
  } catch (e) {
    console.warn('[ai-chat] failed to load sessions:', e)
  }
  return null
}

let uidCounter = 0
function uid() {
  uidCounter += 1
  return `msg-${Date.now()}-${uidCounter}`
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!saved) return { ...DEFAULT_AI_CONFIG }
    const parsed = JSON.parse(saved)
    return { ...DEFAULT_AI_CONFIG, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch (e) {
    console.warn('[ai-chat] failed to load config:', e)
    return { ...DEFAULT_AI_CONFIG }
  }
}

/**
 * 把原始对话裁剪到上限：从最早一条可截断的 user 消息处切，
 * 保证 tool 消息不会与配对的 assistant.tool_calls 断开。
 * @param {Array<Record<string, unknown>>} convo
 */
function trimConvo(convo) {
  if (convo.length <= MAX_CONVO_MESSAGES) return convo
  const keepFrom = convo.length - MAX_CONVO_MESSAGES
  for (let i = keepFrom; i < convo.length; i += 1) {
    if (convo[i].role === 'user') {
      return convo.slice(i)
    }
  }
  return convo.slice(keepFrom)
}

/**
 * @typedef {Object} ChatAttachment
 * @property {string} id
 * @property {string} uri 预览与解析用地址（data:/file/cloud-image/http 等）
 * @property {string} [localPath] 原生端相对路径（可选，便于回读）
 * @property {'image'|'table'} [type] 缺省视为 image
 * @property {string} [filename] 表格附件原始文件名（type=table 时使用）
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {'user' | 'assistant'} role
 * @property {string} content
 * @property {Array<{ name: string, args: Record<string, any>, ok: boolean | null, error?: string }>} steps
 * @property {string} [reasoning] 模型思维链（reasoning_content / reasoning），折叠展示
 * @property {boolean} [pending]
 * @property {string} [error]
 * @property {ChatAttachment[]} [attachments] 用户消息附带的图片（仅展示；视觉分析须用户点名）
 * @property {{ entries: Array<Record<string, any>>, undone: boolean }} [undoJournal] 本回合写操作撤回日志
 */

export const useAiChatStore = defineStore('aiChat', () => {
  const config = ref(loadConfig())
  const loadedSessions = loadSessions()
  /** @type {import('vue').Ref<any[]>} */
  const sessions = ref(loadedSessions?.sessions || [])
  const activeSessionId = ref(loadedSessions?.activeId || '')
  /** @type {import('vue').Ref<ChatMessage[]>} */
  const messages = ref([])
  const sending = ref(false)
  /** UI 提示用错误标记：no-config | request | '' */
  const lastError = ref('')
  /** 待发送的视觉附件：随下一条用户消息进入会话；不自动触发 vision_analyze */
  /** @type {import('vue').Ref<ChatAttachment[]>} */
  const attachments = ref([])
  /**
   * 会话内附件注册表：id → 图源，供追问「再看看刚才那张」时
   * vision_analyze 按 att:<id> 取图（本会话内有效）。
   * @type {Map<string, ChatAttachment>}
   */
  const attachmentRegistry = new Map()

  /** 原始 OpenAI 消息数组（含 tool 消息），随会话切换；系统提示词始终用最新版 */
  let rawConvo = []

  function buildFreshConvo() {
    return [{ role: 'system', content: buildSystemPrompt() }]
  }

  function activeSession() {
    return sessions.value.find((s) => s.id === activeSessionId.value) || null
  }

  /** 激活会话：messages 指向该会话的消息数组（保持同一引用），并重建模型上下文 */
  function activateSession(session) {
    activeSessionId.value = session.id
    messages.value = session.messages
    rawConvo = [
      { role: 'system', content: buildSystemPrompt() },
      ...session.convo.filter((m) => m.role !== 'system')
    ]
    lastError.value = ''
    // 重建附件注册表：仅当前会话消息里的附件可被 vision_analyze 按 att:<id> 引用
    attachmentRegistry.clear()
    for (const msg of session.messages) {
      for (const att of sanitizeAttachments(msg.attachments)) {
        attachmentRegistry.set(att.id, att)
      }
    }
  }

  if (sessions.value.length === 0) {
    sessions.value = [createSessionRecord()]
  }
  activateSession(sessions.value.find((s) => s.id === activeSessionId.value) || sessions.value[0])

  let persistTimer = null
  function persistSessionsNow() {
    const session = activeSession()
    if (session) session.updatedAt = Date.now()
    try {
      let list = sessions.value
      if (list.length > MAX_SESSIONS) {
        list = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS)
        sessions.value = list
        if (!list.some((s) => s.id === activeSessionId.value)) activateSession(list[0])
      }
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify({
        sessions: list.map((s) => ({
          ...s,
          messages: s.messages.slice(-MAX_PERSISTED_MESSAGES)
        })),
        activeId: activeSessionId.value
      }))
    } catch (e) {
      console.warn('[ai-chat] failed to persist sessions:', e)
    }
  }

  function schedulePersist() {
    if (persistTimer !== null) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistSessionsNow()
    }, HISTORY_PERSIST_DELAY_MS)
  }

  watch(messages, schedulePersist, { deep: true })

  function newSession() {
    const session = createSessionRecord()
    sessions.value = [session, ...sessions.value]
    activateSession(session)
    persistSessionsNow()
  }

  function switchSession(id) {
    if (id === activeSessionId.value) return false
    const target = sessions.value.find((s) => s.id === id)
    if (!target) return false
    activateSession(target)
    persistSessionsNow()
    return true
  }

  function deleteSession(id) {
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (activeSessionId.value === id) {
      if (sessions.value.length === 0) sessions.value = [createSessionRecord()]
      activateSession(sessions.value[0])
    }
    persistSessionsNow()
  }

  /** 手动重命名会话：标记 custom 后，AI 起名不再覆盖它 */
  function renameSession(id, title) {
    const target = sessions.value.find((s) => s.id === id)
    const next = String(title || '').trim()
    if (!target || !next) return false
    target.title = next.slice(0, 50)
    target.titleSource = 'custom'
    persistSessionsNow()
    return true
  }

  /** 正在生成标题的会话 id，防止同一会话并发重复请求 */
  const titleGeneratingIds = new Set()

  /**
   * 首轮回复后让 AI 给会话起个简短标题（fire-and-forget，失败静默保留截断标题）。
   * 用户已手动重命名（custom）的会话不再覆盖。
   * @param {{ id: string, title: string, titleSource: string }} session
   * @param {string} userText
   * @param {string} replyText
   */
  async function maybeGenerateTitle(session, userText, replyText) {
    if (!session || session.titleSource === 'ai' || session.titleSource === 'custom') return
    if (titleGeneratingIds.has(session.id)) return
    const { baseUrl, model, apiKey } = config.value
    if (!baseUrl || !model || !apiKey) return
    titleGeneratingIds.add(session.id)
    try {
      const title = await generateChatTitle(config.value, userText, replyText)
      if (session.titleSource !== 'custom') {
        session.title = title
        session.titleSource = 'ai'
        schedulePersist()
      }
    } catch (e) {
      devLog('title:generate:failed', e instanceof Error ? e.message : String(e))
    } finally {
      titleGeneratingIds.delete(session.id)
    }
  }

  // 排查日志：dev 控制台可见，观察消息从「工具完成 → 回复写入 → 视图感知」的全链路
  function devLog(event, payload) {
    if (import.meta.env.DEV) console.debug(`[ai-chat] ${event}`, payload ?? '')
    log.info(event, payload)
  }

  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config.value))
    } catch (e) {
      console.warn('[ai-chat] failed to save config:', e)
    }
  }

  function updateConfig(patch) {
    config.value = { ...config.value, ...patch }
    saveConfig()
  }

  function clearMessages() {
    // splice 保持数组引用（session.messages 与 messages.value 同源）
    messages.value.splice(0, messages.value.length)
    const session = activeSession()
    if (session) {
      session.convo = []
      session.updatedAt = Date.now()
    }
    rawConvo = buildFreshConvo()
    lastError.value = ''
    persistSessionsNow()
  }

  /**
   * 附件清单注入用户消息文本（不塞 data URL，避免撑爆上下文）。
   * 序号用于本轮 vision_analyze / table_dryrun；att:<id> 供同会话后续追问引用。
   * @param {string} text
   * @param {ChatAttachment[]} list
   */
  function withAttachmentMarkers(text, list) {
    if (!list?.length) return text
    const markers = list
      .map((att, index) => {
        const label = att.type === 'table' ? '附件表格' : '附件图片'
        return `[${label}: ${index + 1}|att:${att.id}]`
      })
      .join(' ')
    return `${text}\n\n${markers}`
  }

  /** 发送中的附件快照：send 期间 vision_analyze / table_dryrun 按序号取件；结束后清空 */
  let activeSendAttachments = []

  /**
   * 表格附件内容注册表：id → ArrayBuffer|string（仅内存，不进 localStorage）。
   * 会话切换/发送时填充；工具通过 readTableContent 回读。
   * @type {Map<string, ArrayBuffer|string>}
   */
  const tableContentRegistry = new Map()

  /**
   * 供 table_* 工具读取表格内容。
   * @param {string} attachmentId
   * @returns {Promise<ArrayBuffer|string|null>}
   */
  async function readTableContent(attachmentId) {
    return tableContentRegistry.get(String(attachmentId)) ?? null
  }

  /** 当前可分析附件（优先本轮发送快照，其次待发区） */
  function listAttachments() {
    if (activeSendAttachments.length > 0) return activeSendAttachments
    return attachments.value
  }

  /**
   * vision_analyze 取图：序号 → 本轮附件；att:<id> → 注册表；其余当 URI。
   * @param {string} token
   */
  function resolveVisionAttachment(token) {
    const raw = String(token || '').trim()
    if (!raw) throw new Error('image 必填')
    if (raw.startsWith('att:')) {
      const hit = attachmentRegistry.get(raw.slice(4).trim())
      if (!hit) throw new Error('附件已不在当前会话中')
      return hit
    }
    if (/^\d+$/.test(raw)) {
      const index = Number(raw) - 1
      const list = listAttachments()
      const hit = list[index]
      if (!hit) throw new Error(`附件 #${raw} 不存在（当前共 ${list.length} 张）`)
      return hit
    }
    return { uri: raw }
  }

  /**
   * 追加附件（图片或表格；仅缓存，不触发工具调用）。
   * @param {Array<{ uri?: string, localPath?: string, id?: string, type?: string, filename?: string, content?: ArrayBuffer|string }>} items
   */
  function addAttachments(items) {
    if (!Array.isArray(items) || items.length === 0) return attachments.value
    /** @type {ChatAttachment[]} */
    const incoming = []
    for (const item of items) {
      if (!item) continue
      const type = item.type === 'table' ? 'table' : 'image'
      const id = String(item.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      const filename = type === 'table' ? String(item.filename || '').trim() : ''
      const uri = String(item.uri || '').trim()
      const localPath = String(item.localPath || '').trim()
      if (type === 'table') {
        if (item.content != null) tableContentRegistry.set(id, item.content)
        incoming.push({ id, uri, localPath, type: 'table', ...(filename ? { filename } : {}) })
      } else {
        if (!uri && !localPath) continue
        incoming.push({ id, uri, localPath, type: 'image' })
      }
    }
    if (incoming.length === 0) return attachments.value
    const room = MAX_ATTACHMENTS - attachments.value.length
    if (room <= 0) return attachments.value
    attachments.value = [...attachments.value, ...incoming].slice(0, MAX_ATTACHMENTS)
    return attachments.value
  }

  /**
   * @param {string} id
   */
  function removeAttachment(id) {
    attachments.value = attachments.value.filter((a) => a.id !== id)
  }

  function clearAttachments() {
    attachments.value = []
  }

  let executorCache = null
  /** 本轮 send 的撤回依赖（store 实例），在 getExecutor 时创建缓存 */
  let undoDeps = null
  function ensureStores() {
    if (!undoDeps) {
      undoDeps = {
        goodsStore: useGoodsStore(),
        rechargeStore: useRechargeStore(),
        eventsStore: useEventsStore()
      }
    }
    return undoDeps
  }

  function getExecutor() {
    if (!executorCache) {
      const goodsStore = useGoodsStore()
      const readHandlers = createMcpToolHandlers(db, createMoneyEnrichers(), null, {
        // cloud-image:// → 公开可访问 URL（先热缓存解析真实存储路径，避免拼出 404）
        resolveDisplayUri: async (uri) => {
          const value = String(uri || '').trim()
          if (!value) return value
          if (value.startsWith('cloud-image://') || value.startsWith('gist-image://')) {
            const fileName = parseCloudImageUri(value)
            if (!fileName) return value
            const publicUrl = await useSyncStore().getPublicImageURL(fileName)
            return publicUrl || value
          }
          return value
        }
      })
      const writeHandlers = createMcpWriteToolHandlers({
        goodsStore,
        presetsStore: usePresetsStore(),
        themeStore: useThemeStore(),
        notifyStore: useNotifySettingsStore(),
        rechargeStore: useRechargeStore(),
        eventsStore: useEventsStore(),
        mediaPlayerStore: useMediaPlayerStore(),
        authStore: useAuthStore(),
        syncStore: useSyncStore(),
        appUpdateStore: useAppUpdateStore(),
        webUpdateStore: useWebUpdateStore(),
        budgetApi: { read: readBudgetSettings, write: writeBudgetSettings },
        router
      })
      const visionHandlers = createVisionToolHandlers({
        getConfig: () => config.value,
        getAttachments: () => listAttachments(),
        resolveSource: resolveVisionAttachment,
        restoreCloud: async (cloudFileName) => {
          try {
            return await useSyncStore().restoreImageFromCloud(cloudFileName)
          } catch {
            return null
          }
        }
      })
      const attachmentHandlers = createAttachmentToolHandlers({
        getAttachments: () => listAttachments(),
        resolveSource: resolveVisionAttachment,
        goodsStore,
        eventsStore: useEventsStore()
      })
      const tableHandlers = createTableToolHandlers({
        getAttachments: () => listAttachments(),
        resolveSource: resolveVisionAttachment,
        readTableContent,
        goodsStore,
        rechargeStore: useRechargeStore(),
        eventsStore: useEventsStore(),
        goodsGroupStore: useGoodsGroupStore(),
        presetsStore: usePresetsStore()
      })
      executorCache = {
        ...readHandlers,
        ...writeHandlers,
        ...visionHandlers,
        ...attachmentHandlers,
        ...tableHandlers
      }
    }
    return (name, args) => {
      const handler = executorCache[name]
      if (!handler) throw new Error(`未知工具: ${name}`)
      return handler(args)
    }
  }

  /**
   * 发送一条用户消息并跑完整工具循环；过程中的工具调用实时写入 assistant.steps。
   * @param {string} text
   */
  async function send(text) {
    const content = String(text || '').trim()
    if (!content || sending.value) return
    if (!config.value.baseUrl || !config.value.model || !config.value.apiKey) {
      lastError.value = 'no-config'
      return
    }

    const pendingAttachments = attachments.value.map((a) => ({ ...a }))
    activeSendAttachments = pendingAttachments
    const modelText = withAttachmentMarkers(content, pendingAttachments)

    devLog('send:start', {
      contentLen: content.length,
      convoLen: rawConvo.length,
      attachments: pendingAttachments.length
    })
    // system 消息按最新构建（当天日期/记忆清单），本轮新增的记忆立即生效
    rawConvo[0] = { role: 'system', content: buildSystemPrompt() }
    messages.value.push({
      id: uid(),
      role: 'user',
      content,
      steps: [],
      attachments: pendingAttachments
    })
    // 用户消息必须同时进入模型对话（此前只进 UI 列表，模型看不到新问题，
    // 会基于旧上下文自说自话）。附件只以序号标记注入，不塞图片本体；
    // 视觉分析由模型在用户明确要求时调用 vision_analyze 完成。
    rawConvo = [...rawConvo, { role: 'user', content: modelText }]
    // 待发区清空；工具循环期间由 activeSendAttachments 供 vision_analyze 取图
    attachments.value = []
    for (const att of pendingAttachments) {
      attachmentRegistry.set(att.id, att)
    }
    const currentSession = activeSession()
    if (currentSession && !currentSession.title) currentSession.title = content.slice(0, 30)
    /** @type {ChatMessage} */
    // 必须 reactive：后续通过闭包引用改 content/steps/pending，
    // 普通对象的赋值绕过 Proxy 不会触发视图更新（页面停在「思考中」）
    const assistant = reactive({ id: uid(), role: 'assistant', content: '', steps: [], reasoning: '', pending: true })
    messages.value.push(assistant)
    sending.value = true
    lastError.value = ''
    /** 本轮写操作的撤回条目（成功后挂到 assistant.undoJournal） */
    const turnUndoEntries = []

    try {
      const result = await runChatCompletion({
        config: config.value,
        messages: rawConvo,
        tools: [
          ...MCP_TOOL_DEFINITIONS,
          ...MCP_WRITE_TOOL_DEFINITIONS,
          ...VISION_TOOL_DEFINITIONS,
          ...ATTACHMENT_TOOL_DEFINITIONS,
          ...TABLE_TOOL_DEFINITIONS
        ],
        // 流式增量：思维链/正文边生成边写入消息（最终以 result 为准整体覆盖）
        onDelta: (delta) => {
          if (delta.reset) {
            assistant.content = ''
            assistant.reasoning = ''
            return
          }
          if (delta.reasoning) assistant.reasoning += delta.reasoning
          if (delta.content) assistant.content += delta.content
        },
        executor: createUndoTrackingExecutor(
          async (name, args) => {
            /** @type {ChatMessage['steps'][number]} */
            const step = reactive({ name, args, ok: null })
            assistant.steps.push(step)
            try {
              const result = await getExecutor()(name, args)
              step.ok = true
              return result
            } catch (e) {
              step.ok = false
              step.error = e instanceof Error ? e.message : String(e)
              throw e
            }
          },
          // lazy：仅写工具真正执行时才拉起 recharge/events store，避免纯聊天路径加载 DB 模块
          () => ensureStores(),
          turnUndoEntries
        )
      })
      devLog('reply:resolved', { contentLen: result.content.length, steps: result.steps.length, reasoningLen: result.reasoning?.length || 0 })
      assistant.content = result.content
      assistant.reasoning = result.reasoning || ''
      assistant.pending = false
      if (turnUndoEntries.length > 0) {
        assistant.undoJournal = { entries: turnUndoEntries, undone: false }
      }
      rawConvo = trimConvo(result.convo)
      // 立即回写到会话对象：切走再切回时上下文才不丢（不能只靠防抖持久化）
      const doneSession = activeSession()
      if (doneSession) {
        doneSession.convo = rawConvo
        // 首轮回复结束后让 AI 给会话起名（异步、不阻塞返回）
        void maybeGenerateTitle(doneSession, content, result.content)
      }
      devLog('reply:applied', { pending: assistant.pending, contentLen: assistant.content.length })
    } catch (e) {
      assistant.pending = false
      assistant.error = e instanceof Error ? e.message : String(e)
      lastError.value = 'request'
      devLog('reply:failed', { error: assistant.error })
    } finally {
      sending.value = false
      activeSendAttachments = []
    }
  }

  /**
   * 撤回某条助手消息里的全部写操作（按逆序）。
   * @param {string} messageId
   * @returns {Promise<{ ok: boolean, undone?: number, error?: string }>}
   */
  async function undoWrite(messageId) {
    const msg = messages.value.find((m) => m.id === messageId && m.role === 'assistant')
    if (!msg) return { ok: false, error: 'message-not-found' }
    const journal = msg.undoJournal
    if (!journal || journal.undone || !Array.isArray(journal.entries) || journal.entries.length === 0) {
      return { ok: false, error: 'nothing-to-undo' }
    }
    if (sending.value) return { ok: false, error: 'sending' }
    try {
      const result = await applyUndoEntries(journal.entries, ensureStores())
      // 只要有条目成功就标记整轮已撤回（部分失败的错误信息仍返回给 UI 提示）
      if (result.undone > 0) {
        journal.undone = true
        persistSessionsNow()
      }
      if (!result.ok) {
        return { ok: false, undone: result.undone, error: result.errors.join('；') || 'undo-partial' }
      }
      devLog('undo:done', { messageId, undone: result.undone })
      return { ok: true, undone: result.undone }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      devLog('undo:failed', { messageId, error })
      return { ok: false, error }
    }
  }

  return {
    config, messages, sending, lastError,
    sessions, activeSessionId, attachments,
    updateConfig, clearMessages, send, undoWrite,
    addAttachments, removeAttachment, clearAttachments,
    newSession, switchSession, deleteSession, renameSession
  }
})
