// src/config/supabase.js
// Supabase 项目配置（公开的 Publishable Key，安全靠 RLS 策略）

export const SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'
/**
 * 数据面备用反代（可选）：主站网络失败时自动切换，走自建 nginx 反代到同一 Supabase 项目。
 * 留空则禁用故障转移。OTA/APK 大文件下载与图片公链均按数据面主备顺序尝试
 * （跟随用户在同步设置里选的端点，失败再切对端）。
 * 示例：'https://api.goodsapp.de5.net'
 */
export const SUPABASE_BACKUP_URL = 'https://api.goodsapp.de5.net'
/**
 * Cloudflare Workers 数据面反代（可选）：与 VPS 反代同级，路径原样透传
 * （/rest 表读写、/auth、/storage 公链图片、ota-releases 更新包、/functions）。
 * 部署见 cloudflare/supabase-proxy。留空则不出现该端点选项。
 * 示例：'https://cf.goodsapp.de5.net'
 */
export const SUPABASE_CF_URL = 'https://cf.goodsapp.de5.net'
/**
 * 新版 Publishable Key（sb_publishable_ 前缀，2027 年初起替代 legacy anon JWT）。
 * supabase-js v2 与 REST/Auth/Storage 的 apikey 头均直接兼容，安全仍靠 RLS。
 * 保持 SUPABASE_ANON_KEY 命名：与同步设置里用户自存的 sync_supabase_anon_key 语义一致。
 */
export const SUPABASE_ANON_KEY = 'sb_publishable_YXn2nWzXZWF2OEBPcUbOWQ_5y-C6zqn'

/**
 * Auth 邮件回调用的 Web 入口覆盖（注册验证、魔法链接、OAuth；OTP 重置密码不需要）。
 * 邮件链接只能在系统浏览器打开，不能用 capacitor:// 等本地协议。
 * 留空时：http/https 页面用当前 origin；Capacitor/Tauri/file 需填公网可达的 Web 地址。
 * 原生 App 注册时会跳到 `{AUTH_WEB_ORIGIN}/auth.html?src=app` 再拉起 App，必须可公网访问。
 * 示例：'https://goodsapp.de5.net'
 */
export const AUTH_WEB_ORIGIN = 'https://goodsapp.de5.net'
