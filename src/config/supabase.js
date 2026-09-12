// src/config/supabase.js
// Supabase 项目配置（公开的 Anon Key，安全靠 RLS 策略）

export const SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2cXppY2ltb3dmcXNoZ2pzcnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjE3NzEsImV4cCI6MjA5Mzk5Nzc3MX0.AZQhPIv79WKtF1bhreMhM89CvOJ8p-1wizNiRgmnRzI'

/**
 * Auth 邮件回调用的 Web 入口覆盖（仅魔法链接 / OAuth；OTP 重置密码不需要）。
 * 邮件链接只能在系统浏览器打开，不能用 capacitor:// 等本地协议。
 * 留空时：http/https 页面用当前 origin；Capacitor/Tauri/file 需填公网可达的 Web 地址。
 * 示例：'https://your-domain.example/'
 */
export const AUTH_WEB_ORIGIN = ''
