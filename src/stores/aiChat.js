import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { useGoodsStore } from './goods'
import { usePresetsStore } from './presets'
import { useThemeStore } from './theme'
import { useNotifySettingsStore } from './notifySettings'
import { useRechargeStore } from './recharge'
import { useEventsStore } from './events'
import { useMediaPlayerStore } from './mediaPlayer'
import * as db from '@/utils/db'
import { createMcpToolHandlers } from '@/services/mcp/tools'
import { createMoneyEnrichers } from '@/services/mcp/moneyContext'
import { createMcpWriteToolHandlers } from '@/services/mcp/writeTools'
import { MCP_TOOL_DEFINITIONS, MCP_WRITE_TOOL_DEFINITIONS } from '@/services/mcp/toolDefinitions'
import { runChatCompletion, generateChatTitle, DEFAULT_AI_CONFIG } from '@/services/ai/chatClient'
import { createLogger } from '@/utils/logger'

const log = createLogger('ai-chat')

const CONFIG_STORAGE_KEY = 'goods_ai_chat_config'
/** 发送历史时保留的原始消息上限（超出后从最早的完整轮次截断） */
const MAX_CONVO_MESSAGES = 80

/**
 * 系统提示词：注入当天日期（「这个月」类问题的时间基准）与工具选择规则。
 */
function buildSystemPrompt() {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return [
    `你是「谷子收纳」应用内置的 AI 助手，帮用户管理动漫/游戏周边（谷子）收藏。今天是 ${today}。`,
    '只读工具：goods_search（搜索）、goods_detail（详情）、collection_overview（收藏总览）、spending_summary（按月/年消费汇总）、character_leaderboard（角色统计排行）、storage_locations（收纳位置分布）、wishlist_overview（愿望单与预算）、sale_ledger（出谷回血与盈亏）、events_list（展览活动）、event_tracks（演出/演唱会曲单）、recharge_summary（充值汇总）；',
    '可写工具：goods_add（新增）、goods_update（部分更新，含收藏状态/出售信息/逐件字段）、goods_sell（记录出售或挂牌）、goods_delete（移入回收站，可恢复）、goods_restore（恢复）、recharge_add（记游戏充值）、music_play（播放演出曲单中的歌曲，eventId+trackId 来自 event_tracks）；',
    '设置工具：settings_overview（查看设置与预设清单）、presets_manage（增删改分类/IP/角色/收纳位置，改名会级联谷子）、theme_set（切换主题）、notify_settings_set（修改通知设置），改设置前先用 settings_overview 看现状，删除类操作先向用户确认;',
    '工具选择规则：',
    '- 问花了多少钱/消费/月度账单 → 必须用 spending_summary，禁止用 goods_search 拼凑花费答案；',
    '- 问角色排行/最喜欢谁 → character_leaderboard；问东西放在哪 → storage_locations；问还想买什么/愿望单 → wishlist_overview；问卖了多少/回血/盈亏 → sale_ledger；',
    '- 问收藏构成/总量/分布 → collection_overview；找具体物品 → goods_search；单件详情 → goods_detail；',
    '- 演出/演唱会：问基本情况（时间/地点/座位/花费/关联谷子）→ events_list；event_tracks 额外带曲单概况与座位/场馆信息，两者都可用于介绍演出；event_tracks 默认只返回 tracksSummary（共 X 首、可播 Y 首、仅手动 Z 首），用户没要歌单就用一两句话概括，禁止罗列曲目；用户明确要完整歌单、找某首歌或想播放时才传 includeTracks: true 拿明细，播放用 music_play（eventId+trackId）；playable 为 false 的曲目不能播放，建议用户在演出详情页导入音源；',
    '- 数量口径铁律：「收藏」与「心愿单/愿望单」是两个独立集合，严禁相加后统称为收藏；character_leaderboard 的 count 已排除愿望单，wishlistCount 要单独表述（如「已收藏 X 件，另有 Y 件在愿望单」）；搜「收藏的东西」时 goods_search 传 collectionOnly: true；',
    '- 涉及用户数据的问题必须调用工具获取实时数据，不要凭空编造；',
    '- goods_search 可能返回大量条目：回复里只做汇总概览（数量/分类统计），不要整表罗列，用户追问时再展示具体条目；',
    '- 记录出售用 goods_sell（价、平台、手续费、日期），记完可提示用 sale_ledger 查看盈亏；记充值用 recharge_add；',
    '- 新增/修改/删除等操作只做用户明确要求的事，批量或不可逆操作前先和用户确认；',
    '- 金额是用户手填的字符串，可能为空或含非数字字符；',
    '- 用用户的语言回答，简洁自然。'
  ].join('\n')
}

const SESSIONS_STORAGE_KEY = 'goods_ai_chat_sessions'
const LEGACY_HISTORY_KEY = 'goods_ai_chat_history'
/** 最多保留的会话数（超出按最近更新淘汰） */
const MAX_SESSIONS = 30
/** 每个会话持久化的 UI 消息上限（原始对话在 trimConvo 已限长） */
const MAX_PERSISTED_MESSAGES = 200
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

/** 清洗会话数据（兼容损坏/缺字段） */
function sanitizeSession(session) {
  const messages = (Array.isArray(session?.messages) ? session.messages : [])
    .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ ...m, steps: Array.isArray(m.steps) ? m.steps : [] }))
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
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {'user' | 'assistant'} role
 * @property {string} content
 * @property {Array<{ name: string, args: Record<string, any>, ok: boolean | null, error?: string }>} steps
 * @property {boolean} [pending]
 * @property {string} [error]
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

  let executorCache = null
  function getExecutor() {
    if (!executorCache) {
      const goodsStore = useGoodsStore()
      const readHandlers = createMcpToolHandlers(db, createMoneyEnrichers())
      const writeHandlers = createMcpWriteToolHandlers({
        goodsStore,
        presetsStore: usePresetsStore(),
        themeStore: useThemeStore(),
        notifyStore: useNotifySettingsStore(),
        rechargeStore: useRechargeStore(),
        eventsStore: useEventsStore(),
        mediaPlayerStore: useMediaPlayerStore()
      })
      executorCache = { ...readHandlers, ...writeHandlers }
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

    devLog('send:start', { contentLen: content.length, convoLen: rawConvo.length })
    messages.value.push({ id: uid(), role: 'user', content, steps: [] })
    // 用户消息必须同时进入模型对话（此前只进 UI 列表，模型看不到新问题，
    // 会基于旧上下文自说自话）
    rawConvo = [...rawConvo, { role: 'user', content }]
    const currentSession = activeSession()
    if (currentSession && !currentSession.title) currentSession.title = content.slice(0, 30)
    /** @type {ChatMessage} */
    // 必须 reactive：后续通过闭包引用改 content/steps/pending，
    // 普通对象的赋值绕过 Proxy 不会触发视图更新（页面停在「思考中」）
    const assistant = reactive({ id: uid(), role: 'assistant', content: '', steps: [], pending: true })
    messages.value.push(assistant)
    sending.value = true
    lastError.value = ''

    try {
      const result = await runChatCompletion({
        config: config.value,
        messages: rawConvo,
        tools: [...MCP_TOOL_DEFINITIONS, ...MCP_WRITE_TOOL_DEFINITIONS],
        executor: async (name, args) => {
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
        }
      })
      devLog('reply:resolved', { contentLen: result.content.length, steps: result.steps.length })
      assistant.content = result.content
      assistant.pending = false
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
    }
  }

  return {
    config, messages, sending, lastError,
    sessions, activeSessionId,
    updateConfig, clearMessages, send,
    newSession, switchSession, deleteSession, renameSession
  }
})
