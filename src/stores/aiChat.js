import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useGoodsStore } from './goods'
import { usePresetsStore } from './presets'
import { useThemeStore } from './theme'
import { useNotifySettingsStore } from './notifySettings'
import * as db from '@/utils/db'
import { createMcpToolHandlers } from '@/services/mcp/tools'
import { createMcpWriteToolHandlers } from '@/services/mcp/writeTools'
import { MCP_TOOL_DEFINITIONS, MCP_WRITE_TOOL_DEFINITIONS } from '@/services/mcp/toolDefinitions'
import { runChatCompletion, DEFAULT_AI_CONFIG } from '@/services/ai/chatClient'
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
    '只读工具：goods_search（搜索）、goods_detail（详情）、collection_overview（收藏总览）、spending_summary（按月/年消费汇总）、character_leaderboard（角色统计排行）、storage_locations（收纳位置分布）、wishlist_overview（愿望单与预算）、sale_ledger（出谷回血与盈亏）、events_list（展览活动）、recharge_summary（充值汇总）；',
    '可写工具：goods_add（新增）、goods_update（部分更新）、goods_delete（移入回收站，可恢复）、goods_restore（恢复）；',
    '设置工具：settings_overview（查看设置与预设清单）、presets_manage（增删改分类/IP/角色/收纳位置，改名会级联谷子）、theme_set（切换主题）、notify_settings_set（修改通知设置），改设置前先用 settings_overview 看现状，删除类操作先向用户确认;',
    '工具选择规则：',
    '- 问花了多少钱/消费/月度账单 → 必须用 spending_summary，禁止用 goods_search 拼凑花费答案；',
    '- 问角色排行/最喜欢谁 → character_leaderboard；问东西放在哪 → storage_locations；问还想买什么/愿望单 → wishlist_overview；问卖了多少/回血/盈亏 → sale_ledger；',
    '- 问收藏构成/总量/分布 → collection_overview；找具体物品 → goods_search；单件详情 → goods_detail；',
    '- 涉及用户数据的问题必须调用工具获取实时数据，不要凭空编造；',
    '- goods_search 可能返回大量条目：回复里只做汇总概览（数量/分类统计），不要整表罗列，用户追问时再展示具体条目；',
    '- 新增/修改/删除等操作只做用户明确要求的事，批量或不可逆操作前先和用户确认；',
    '- 金额是用户手填的字符串，可能为空或含非数字字符；',
    '- 用用户的语言回答，简洁自然。'
  ].join('\n')
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
  /** @type {import('vue').Ref<ChatMessage[]>} */
  const messages = ref([])
  const sending = ref(false)
  /** UI 提示用错误标记：no-config | request | '' */
  const lastError = ref('')

  /** 原始 OpenAI 消息数组（含 tool 消息），会话内延续上下文 */
  let rawConvo = [{ role: 'system', content: buildSystemPrompt() }]

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
    messages.value = []
    rawConvo = [{ role: 'system', content: buildSystemPrompt() }]
    lastError.value = ''
  }

  let executorCache = null
  function getExecutor() {
    if (!executorCache) {
      const goodsStore = useGoodsStore()
      const readHandlers = createMcpToolHandlers(db)
      const writeHandlers = createMcpWriteToolHandlers({
        goodsStore,
        presetsStore: usePresetsStore(),
        themeStore: useThemeStore(),
        notifyStore: useNotifySettingsStore()
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

    messages.value.push({ id: uid(), role: 'user', content, steps: [] })
    // 用户消息必须同时进入模型对话（此前只进 UI 列表，模型看不到新问题，
    // 会基于旧上下文自说自话）
    rawConvo = [...rawConvo, { role: 'user', content }]
    /** @type {ChatMessage} */
    const assistant = { id: uid(), role: 'assistant', content: '', steps: [], pending: true }
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
          const step = { name, args, ok: null }
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
      assistant.content = result.content
      assistant.pending = false
      rawConvo = trimConvo(result.convo)
      log.info('chat:done', { steps: result.steps.length })
    } catch (e) {
      assistant.pending = false
      assistant.error = e instanceof Error ? e.message : String(e)
      lastError.value = 'request'
      log.error('chat:failed', e)
    } finally {
      sending.value = false
    }
  }

  return { config, messages, sending, lastError, updateConfig, clearMessages, send }
})
