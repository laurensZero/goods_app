import { LOCAL_SYNC_API_PREFIX, LOCAL_SYNC_DEFAULT_PORT, LOCAL_SYNC_TIMEOUT } from './constants'
import { normalizeBaseUrl, requestGet } from './transport'
import type { LocalSyncDevice } from './types'

function buildCandidateHosts(seedHost = ''): string[] {
  const set = new Set<string>()
  const cleaned = String(seedHost || '').trim()

  if (cleaned) {
    set.add(cleaned)
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    set.add(window.location.hostname)
  }

  ;['192.168.1.1', '192.168.0.1', '10.0.0.1'].forEach((host) => set.add(host))
  return Array.from(set)
}

export async function discoverLanDevices(options?: {
  seedHost?: string
  preferredPort?: number
}): Promise<LocalSyncDevice[]> {
  const port = Number(options?.preferredPort) || LOCAL_SYNC_DEFAULT_PORT
  const candidates = buildCandidateHosts(options?.seedHost)

  const checks = candidates.map(async (host) => {
    const start = Date.now()
    const baseUrl = normalizeBaseUrl(`${host}:${port}`)

    try {
      const result = await requestGet<{ deviceName?: string; appVersion?: string }>(baseUrl, `${LOCAL_SYNC_API_PREFIX}/discover`, LOCAL_SYNC_TIMEOUT.discoverMs)
      return {
        host,
        port,
        baseUrl,
        deviceName: result.deviceName || `设备 ${host}`,
        appVersion: result.appVersion,
        latencyMs: Date.now() - start
      } as LocalSyncDevice
    } catch {
      return null
    }
  })

  const resolved = await Promise.all(checks)
  return resolved.filter((item): item is LocalSyncDevice => !!item)
}
