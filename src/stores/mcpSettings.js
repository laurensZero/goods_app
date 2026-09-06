import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'goods_mcp_settings'

export const MCP_DEFAULT_PORT = 8726

const DEFAULT_SETTINGS = {
  // MCP 服务总开关。Web 开发环境默认开启（配合 Vite 插件即可联调），
  // 原生端默认关闭（服务暴露 HTTP 端口，由用户显式开启）
  enabled: import.meta.env.DEV && !import.meta.env.SSR,
  // 原生端 HTTP 监听端口
  port: MCP_DEFAULT_PORT,
  // 原生端访问令牌；首次启用时自动生成并持久化
  token: '',
  // 允许外部 MCP 客户端（电脑端 AI）执行写入工具；默认只读
  allowExternalWrites: false
}

function readSavedSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return {}
    const parsed = JSON.parse(saved)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    console.warn('[mcp] failed to load settings:', e)
    return {}
  }
}

/** 生成 128 位随机十六进制令牌（原生端首次启用用） */
export function generateMcpToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const useMcpSettingsStore = defineStore('mcpSettings', () => {
  const settings = ref({ ...DEFAULT_SETTINGS, ...readSavedSettings() })

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('[mcp] failed to save settings:', e)
    }
  }

  function updateSetting(key, value) {
    if (!(key in settings.value)) return
    settings.value[key] = value
    persist()
  }

  return { settings, updateSetting }
})
