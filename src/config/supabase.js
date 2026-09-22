// src/config/supabase.js
// Supabase 项目配置（公开的 Anon Key，安全靠 RLS 策略）

export const SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'
/**
 * 数据面备用反代（可选）：主站网络失败时自动切换，走自建 nginx 反代到同一 Supabase 项目。
 * 留空则禁用故障转移。图片公链仍固定用 SUPABASE_URL，避免展示流量吃 VPS 带宽。
 * 示例：'https://api.goodsapp.de5.net'
 */
export const SUPABASE_BACKUP_URL = 'https://api.goodsapp.de5.net'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cXppY2ltb3dmcXNoZ2pzcnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE3NzEsImV4cCI6MjA5Mzk5Nzc3MX0.AZQhPIv79WKtF1bhreMhM89CvOJ8p-1wizNiRgmnRzI'

/**
 * Auth 邮件回调用的 Web 入口覆盖（注册验证、魔法链接、OAuth；OTP 重置密码不需要）。
 * 邮件链接只能在系统浏览器打开，不能用 capacitor:// 等本地协议。
 * 留空时：http/https 页面用当前 origin；Capacitor/Tauri/file 需填公网可达的 Web 地址。
 * 原生 App 注册时会跳到 `{AUTH_WEB_ORIGIN}/auth.html?src=app` 再拉起 App，必须可公网访问。
 * 示例：'https://goodsapp.de5.net'
 */
export const AUTH_WEB_ORIGIN = 'https://goodsapp.de5.net'
