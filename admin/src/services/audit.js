import { getSession } from './auth'
import { supabaseRequest } from './supabase'

/**
 * 后台操作审计：向 audit_logs 表写入一条高危操作留痕。
 * 埋点失败不应阻断主操作，故吞掉错误（fire-and-forget）。
 *
 * @param {string} action 动作标识，如 publish / rollback / announcement.delete / user.delete / qq.unbind
 * @param {string} target 目标描述，如版本号 / 公告标题 / 用户邮箱
 * @param {object|null} detail 附加上下文（可选）
 */
export function logAudit(action, target = '', detail = null) {
  const s = getSession()
  const actor = s?.admin?.username || s?.admin?.id || 'unknown'
  return supabaseRequest('/rest/v1/audit_logs', {
    method: 'POST',
    body: { actor, action, target: String(target || ''), detail }
  }).catch(() => {})
}
