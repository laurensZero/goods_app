import { supabaseRequest } from './supabase'
import { fetchUsersList } from './versionRules'

/**
 * 同步操作审计日志：由 sync_push / sync_pull RPC 在服务端同事务写入 sync_audit_logs。
 * 管理台用 service_role 读取与清理。
 * platform / apk / bundle / 机型不在审计表内——与设备管理页共用 devices 心跳，
 * 按 device_id 关联展示；duration_ms 无服务端来源，不展示。
 */

/**
 * 拉取同步审计日志（服务端筛选 + 用户名/设备元数据映射）。
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {string} [opts.deviceId] 精确 device_id
 * @param {string} [opts.userId] 精确 user_id
 * @param {string} [opts.direction] push | pull
 * @param {string} [opts.status] ok | error
 * @param {string} [opts.source] 触发源精确匹配
 * @param {string} [opts.since] ISO 时间，created_at >= since
 */
export async function listSyncAuditLogs({
  limit = 200,
  deviceId = '',
  userId = '',
  direction = '',
  status = '',
  source = '',
  since = ''
} = {}) {
  const params = { order: 'created_at.desc', limit }
  if (deviceId) params.device_id = `eq.${deviceId}`
  if (userId) params.user_id = `eq.${userId}`
  if (direction) params.direction = `eq.${direction}`
  if (status) params.status = `eq.${status}`
  if (source) params.source = `eq.${source}`
  if (since) params.created_at = `gte.${since}`

  const [rows, users, devices] = await Promise.all([
    supabaseRequest('/rest/v1/sync_audit_logs', { params }),
    fetchUsersList().catch(() => []),
    supabaseRequest('/rest/v1/devices', {
      params: { select: 'device_id,platform,apk_version,bundle_version,manufacturer,model' }
    }).catch(() => [])
  ])
  const userMap = {}
  for (const u of users) userMap[u.id] = u.display || u.email || u.id
  const deviceMap = {}
  for (const d of Array.isArray(devices) ? devices : []) {
    deviceMap[d.device_id] = d
  }
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const device = deviceMap[row.device_id] || {}
    return {
      ...row,
      userName: userMap[row.user_id] || row.user_id,
      platform: row.platform || device.platform || '',
      apk_version: row.apk_version || device.apk_version || '',
      bundle_version: row.bundle_version || device.bundle_version || '',
      manufacturer: device.manufacturer || '',
      model: device.model || ''
    }
  })
}

/** 删除 N 天前的审计日志，返回删除条数（PostgREST Content-Range）。 */
export async function pruneSyncAuditLogs(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return supabaseRequest(`/rest/v1/sync_audit_logs?created_at=lt.${encodeURIComponent(cutoff)}`, {
    method: 'DELETE',
    returnCount: true
  })
}
