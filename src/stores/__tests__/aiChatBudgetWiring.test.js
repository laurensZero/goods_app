import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * 回归：getExecutor 创建读工具时必须注入 budgetApi。
 * 此前误传 null，budget_overview 永远把预算当成未设置（AI 查不到预算）。
 */

const {
  createMcpToolHandlersMock,
  createMcpWriteToolHandlersMock,
  createVisionToolHandlersMock,
  createAttachmentToolHandlersMock,
  createTableToolHandlersMock,
  createWebSearchToolHandlersMock,
  runChatCompletionMock,
  generateChatTitleMock
} = vi.hoisted(() => ({
  createMcpToolHandlersMock: vi.fn(() => ({})),
  createMcpWriteToolHandlersMock: vi.fn(() => ({})),
  createVisionToolHandlersMock: vi.fn(() => ({})),
  createAttachmentToolHandlersMock: vi.fn(() => ({})),
  createTableToolHandlersMock: vi.fn(() => ({})),
  createWebSearchToolHandlersMock: vi.fn(() => ({})),
  runChatCompletionMock: vi.fn(),
  generateChatTitleMock: vi.fn()
}))

vi.mock('@/services/mcp/tools', () => ({
  createMcpToolHandlers: createMcpToolHandlersMock
}))
vi.mock('@/services/mcp/writeTools', () => ({
  createMcpWriteToolHandlers: createMcpWriteToolHandlersMock
}))
vi.mock('@/services/mcp/moneyContext', () => ({
  createMoneyEnrichers: () => ({ convertToCNY: (/** @type {number} */ n) => n })
}))
vi.mock('@/services/ai/visionTools', () => ({
  VISION_TOOL_DEFINITIONS: [],
  createVisionToolHandlers: createVisionToolHandlersMock
}))
vi.mock('@/services/ai/attachmentTools', () => ({
  ATTACHMENT_TOOL_DEFINITIONS: [],
  createAttachmentToolHandlers: createAttachmentToolHandlersMock
}))
vi.mock('@/services/ai/tableImportTools', () => ({
  TABLE_TOOL_DEFINITIONS: [],
  createTableToolHandlers: createTableToolHandlersMock
}))
vi.mock('@/services/ai/webSearchTools', () => ({
  WEB_SEARCH_TOOL_DEFINITIONS: [],
  createWebSearchToolHandlers: createWebSearchToolHandlersMock
}))
vi.mock('@/services/ai/chatClient', () => ({
  runChatCompletion: runChatCompletionMock,
  generateChatTitle: generateChatTitleMock,
  DEFAULT_AI_CONFIG: { baseUrl: 'https://api.x.com/v1', model: 'm', apiKey: '' }
}))
vi.mock('@/services/mcp/toolDefinitions', () => ({
  MCP_TOOL_DEFINITIONS: [],
  MCP_WRITE_TOOL_DEFINITIONS: []
}))

// getExecutor 会实例化一组 store；全部换成轻量假实现，避免牵动真实 store 依赖
vi.mock('../goods', () => ({ useGoodsStore: vi.fn(() => ({})) }))
vi.mock('../goods/goodsGroup', () => ({ useGoodsGroupStore: vi.fn(() => ({})) }))
vi.mock('../presets', () => ({ usePresetsStore: vi.fn(() => ({})) }))
vi.mock('../theme', () => ({ useThemeStore: vi.fn(() => ({})) }))
vi.mock('../notifySettings', () => ({ useNotifySettingsStore: vi.fn(() => ({})) }))
vi.mock('../recharge', () => ({ useRechargeStore: vi.fn(() => ({})) }))
vi.mock('../events', () => ({ useEventsStore: vi.fn(() => ({})) }))
vi.mock('../mediaPlayer', () => ({ useMediaPlayerStore: vi.fn(() => ({})) }))
vi.mock('../auth', () => ({
  useAuthStore: vi.fn(() => ({ isLoggedIn: false, user: null, userEmail: '', userDisplayName: '', logout: vi.fn() }))
}))
vi.mock('../sync', () => ({
  useSyncStore: vi.fn(() => ({
    autoPushGoods: vi.fn(),
    sync: vi.fn(),
    isConfigured: true,
    isSyncing: false,
    lastSyncedAt: '',
    deviceId: '',
    getPublicImageURL: vi.fn()
  }))
}))
vi.mock('../appUpdate', () => ({
  useAppUpdateStore: vi.fn(() => ({ currentVersion: '0.0.0', hasUpdate: false, latestVersion: '', isForceUpdate: false, checkForUpdates: vi.fn() }))
}))
vi.mock('../webUpdate', () => ({
  useWebUpdateStore: vi.fn(() => ({ supported: false, currentVersion: '', hasUpdate: false, latestVersion: '', isForceUpdate: false, checkForUpdates: vi.fn() }))
}))

import { useAiChatStore } from '../aiChat'

const FULL_CONFIG = { baseUrl: 'https://api.x.com/v1', model: 'test-model', apiKey: 'sk-test' }

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  createMcpToolHandlersMock.mockClear()
  createMcpWriteToolHandlersMock.mockClear()
  generateChatTitleMock.mockReset()
  generateChatTitleMock.mockRejectedValue(new Error('no title'))
  runChatCompletionMock.mockReset()
  // 通过 executor 触发 getExecutor（真实业务里模型 tool_call 会走到这里）
  runChatCompletionMock.mockImplementation(async ({ messages, executor }) => {
    await executor('budget_overview', {})
    return {
      content: '好的',
      steps: [],
      convo: [...messages, { role: 'assistant', content: '好的' }]
    }
  })
})

describe('aiChat budget wiring', () => {
  it('getExecutor 创建读工具时注入 budgetApi.read（回归：传 null 导致 AI 查不到预算）', async () => {
    const store = useAiChatStore()
    store.updateConfig({ ...FULL_CONFIG })

    await store.send('预算还剩多少？')

    expect(createMcpToolHandlersMock).toHaveBeenCalledTimes(1)
    const budgetApi = createMcpToolHandlersMock.mock.calls[0][2]
    expect(budgetApi).toBeTruthy()
    expect(typeof budgetApi?.read).toBe('function')

    // 写工具路径同样要能读写预算（budget_set）
    expect(createMcpWriteToolHandlersMock).toHaveBeenCalledTimes(1)
    const writeBudgetApi = createMcpWriteToolHandlersMock.mock.calls[0][0]?.budgetApi
    expect(typeof writeBudgetApi?.read).toBe('function')
    expect(typeof writeBudgetApi?.write).toBe('function')
  })
})
