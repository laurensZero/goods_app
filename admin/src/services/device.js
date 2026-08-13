import { supabaseRequest } from './supabase'
import { fetchUsersList } from './versionRules'

/**
 * 设备管理服务：设备心跳清单（devices 表）+ 按设备强制重同步。
 */

/** 设备列表（含用户名映射），按最后活跃倒序。 */
export async function listDevices() {
  const [rows, users] = await Promise.all([
    supabaseRequest('/rest/v1/devices', {
      params: { order: 'last_seen_at.desc', limit: 500 }
    }),
    fetchUsersList().catch(() => [])
  ])
  const userMap = {}
  for (const u of users) userMap[u.id] = u.display
  return (rows || []).map((d) => ({
    ...d,
    userName: userMap[d.user_id] || d.user_id
  }))
}

/** 触发某设备强制重同步（RPC，设 force_resync_at = 服务端 now()）。 */
export function forceDeviceResync(deviceId) {
  return supabaseRequest('/rest/v1/rpc/force_device_resync', {
    method: 'POST',
    body: { p_device_id: deviceId }
  })
}
