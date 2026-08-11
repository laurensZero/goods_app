import { supabaseRequest } from './supabase'

const ALL_USERS_EXCEPT = 'neq.00000000-0000-0000-0000-000000000000'

export async function loadMaintenanceMode() {
  const data = await supabaseRequest('/rest/v1/sync_manifest', {
    params: { select: 'maintenance_mode', limit: 1 }
  })
  if (Array.isArray(data) && data.length > 0 && data[0].maintenance_mode) {
    return data[0].maintenance_mode
  }
  return null
}

export async function saveMaintenanceMode(maintenanceModeData) {
  await supabaseRequest('/rest/v1/sync_manifest', {
    method: 'PATCH',
    body: { maintenance_mode: maintenanceModeData },
    params: { user_id: ALL_USERS_EXCEPT }
  })
}

export async function clearMaintenanceMode() {
  await supabaseRequest('/rest/v1/sync_manifest', {
    method: 'PATCH',
    body: { maintenance_mode: null },
    params: { user_id: ALL_USERS_EXCEPT }
  })
}