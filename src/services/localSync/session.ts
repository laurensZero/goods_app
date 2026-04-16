import { LOCAL_SYNC_API_PREFIX } from './constants'
import { requestJson } from './transport'
import type { LocalSyncDevice, LocalSyncSession } from './types'

export async function openLocalSyncSession(device: LocalSyncDevice, senderDeviceId: string): Promise<LocalSyncSession> {
  const response = await requestJson<LocalSyncSession>(device.baseUrl, `${LOCAL_SYNC_API_PREFIX}/session`, {
    method: 'POST',
    body: JSON.stringify({
      role: 'sender',
      senderDeviceId
    })
  })

  return {
    ...response,
    receiver: device
  }
}

export async function uploadManifest(baseUrl: string, sessionId: string, manifest: unknown): Promise<void> {
  await requestJson(baseUrl, `${LOCAL_SYNC_API_PREFIX}/manifest`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, manifest })
  })
}
