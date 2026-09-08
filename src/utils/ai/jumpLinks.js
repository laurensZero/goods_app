// @ts-check
/**
 * AI 回复内的「跳转按钮」链接：约定协议 app://<page> 或 app://goods_detail/<id>。
 * AI 在 markdown 里输出 [按钮文字](app://...)，渲染层给链接加按钮样式，
 * 用户点击后由 AiChatPanel 的事件委托解析并 router.push——不会自动跳转。
 *
 * 页面映射与 navigate 工具共用一份，改这里两边同步生效。
 */

/** navigate 工具与 app:// 跳转按钮支持的页面 → 路由名映射 */
export const NAVIGATE_PAGES = {
  home: 'home',
  recharge: 'recharge',
  wishlist: 'wishlist',
  my: 'manage',
  events: 'events',
  statistics: 'character-leaderboard',
  trash: 'trash',
  sync: 'manage-sync',
  shares: 'manage-shares',
  settings: 'manage-settings',
  notifications: 'manage-notifications',
  about: 'manage-about',
  ai_service: 'manage-mcp',
  goods_add: 'add',
  checkout: 'checkout'
}

/** 需要携带 id 的页面 → 路由名 */
export const NAVIGATE_PAGES_WITH_ID = {
  goods_detail: 'detail',
  goods_edit: 'edit',
  event_detail: 'event-detail',
  event_edit: 'event-edit'
}

/** app:// 协议前缀 */
export const JUMP_HREF_PREFIX = 'app://'

/**
 * 解析 app:// 跳转链接。
 * @param {string} href
 * @returns {{ name: string, params?: Record<string, string> } | null} router.push 参数；非跳转链接返回 null
 */
export function parseJumpHref(href) {
  if (typeof href !== 'string' || !href.startsWith(JUMP_HREF_PREFIX)) return null
  const path = href.slice(JUMP_HREF_PREFIX.length).replace(/^\/+|\/+$/g, '')
  const [pageRaw, idRaw] = path.split('/')
  const page = decodeURIComponent(String(pageRaw || '').trim())
  if (!page) return null
  if (page in NAVIGATE_PAGES_WITH_ID) {
    const id = decodeURIComponent(String(idRaw || '').trim())
    if (!id) return null
    return { name: NAVIGATE_PAGES_WITH_ID[page], params: { id } }
  }
  const routeName = NAVIGATE_PAGES[page]
  return routeName ? { name: routeName } : null
}
