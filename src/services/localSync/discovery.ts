import { LOCAL_SYNC_API_PREFIX, LOCAL_SYNC_DEFAULT_PORT, LOCAL_SYNC_TIMEOUT } from './constants'
import { normalizeBaseUrl, requestGet } from './transport'
import type { LocalSyncDevice } from './types'
import { discoverNativeLocalSyncPeers } from '@/utils/nativeLocalSyncBridge'

const KNOWN_HOSTS_KEY = 'local_sync_known_hosts_v1'
const COMMON_GATEWAYS = [
  '192.168.1.1',
  '192.168.0.1',
  '192.168.31.1',
  '192.168.50.1',
  '192.168.43.1',
  '192.168.137.1',
  '172.20.10.1',
  '10.0.0.1'
]

function isIpv4(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
}

function splitHostPort(rawHost = ''): string {
  return String(rawHost || '').trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]
}

function getKnownHosts(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(KNOWN_HOSTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map((item) => splitHostPort(item)).filter(Boolean) : []
  } catch {
    return []
  }
}

function rememberHost(host: string): void {
  const normalized = splitHostPort(host)
  if (!normalized) return
  try {
    if (typeof localStorage === 'undefined') return
    const existing = getKnownHosts()
    const next = [normalized, ...existing.filter((item) => item !== normalized)].slice(0, 12)
    localStorage.setItem(KNOWN_HOSTS_KEY, JSON.stringify(next))
  } catch {
    // Ignore cache failures.
  }
}

function buildNearbyCandidates(host: string): string[] {
  if (!isIpv4(host)) return []
  const segments = host.split('.')
  const prefix = `${segments[0]}.${segments[1]}.${segments[2]}`
  const tails = [1, 2, 3, 4, 5, 10, 20, 30, 50, 100, 101, 102, 150, 200]
  return tails.map((tail) => `${prefix}.${tail}`)
}

function buildSweepCandidates(): string[] {
  const prefixes = ['192.168.1', '192.168.0', '192.168.43', '192.168.137', '172.20.10']
  const tails = [
    2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110
  ]
  const all: string[] = []
  for (const prefix of prefixes) {
    for (const tail of tails) {
      all.push(`${prefix}.${tail}`)
    }
  }
  return all
}

function buildCandidateHosts(seedHost = ''): string[] {
  const set = new Set<string>()
  const cleaned = splitHostPort(seedHost)

  if (cleaned) {
    set.add(cleaned)
    buildNearbyCandidates(cleaned).forEach((host) => set.add(host))
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const webHost = splitHostPort(window.location.hostname)
    if (webHost && webHost !== 'localhost') {
      set.add(webHost)
      buildNearbyCandidates(webHost).forEach((host) => set.add(host))
    }
  }

  getKnownHosts().forEach((host) => {
    set.add(host)
    buildNearbyCandidates(host).forEach((candidate) => set.add(candidate))
  })
  COMMON_GATEWAYS.forEach((host) => set.add(host))
  return Array.from(set)
}

async function probeHost(host: string, port: number, timeoutMs = LOCAL_SYNC_TIMEOUT.discoverMs): Promise<LocalSyncDevice | null> {
  const start = Date.now()
  const baseUrl = normalizeBaseUrl(`${host}:${port}`)

  try {
    const result = await requestGet<{ deviceName?: string; appVersion?: string }>(
      baseUrl,
      `${LOCAL_SYNC_API_PREFIX}/discover`,
      timeoutMs
    )
    rememberHost(host)
    return {
      host,
      port,
      baseUrl,
      deviceName: result.deviceName || `设备 ${host}`,
      appVersion: result.appVersion,
      latencyMs: Date.now() - start
    }
  } catch {
    return null
  }
}

async function probeHostsInBatches(
  hosts: string[],
  port: number,
  options: {
    batchSize?: number
    timeoutMs?: number
    stopOnFirst?: boolean
    deadlineAt?: number
  } = {}
): Promise<LocalSyncDevice[]> {
  const batchSize = Number(options.batchSize) || 16
  const timeoutMs = Number(options.timeoutMs) || LOCAL_SYNC_TIMEOUT.discoverMs
  const stopOnFirst = options.stopOnFirst === true
  const deadlineAt = Number(options.deadlineAt) || (Date.now() + 12000)
  const found: LocalSyncDevice[] = []

  for (let offset = 0; offset < hosts.length; offset += batchSize) {
    if (Date.now() > deadlineAt) {
      break
    }
    const batch = hosts.slice(offset, offset + batchSize)
    const result = await Promise.all(batch.map((host) => probeHost(host, port, timeoutMs)))
    for (const item of result) {
      if (item) found.push(item)
    }
    if (stopOnFirst && found.length > 0) {
      break
    }
  }

  return found
}

export async function discoverLanDevices(options?: {
  seedHost?: string
  preferredPort?: number
  allowSubnetSweep?: boolean
}): Promise<LocalSyncDevice[]> {
  const port = Number(options?.preferredPort) || LOCAL_SYNC_DEFAULT_PORT
  const candidates = buildCandidateHosts(options?.seedHost)
  const deadlineAt = Date.now() + 12000
  const nativePeers = await discoverNativeLocalSyncPeers(4800)
  const nativeDevices: LocalSyncDevice[] = nativePeers
    .map((item) => {
      const host = splitHostPort(String(item?.host || ''))
      const peerPort = Number(item?.port) || port
      if (!host) return null
      return {
        host,
        port: peerPort,
        baseUrl: normalizeBaseUrl(String(item?.baseUrl || `${host}:${peerPort}`)),
        deviceName: String(item?.deviceName || `设备 ${host}`),
        latencyMs: 0
      }
    })
    .filter(Boolean) as LocalSyncDevice[]

  let resolved = [...nativeDevices, ...(await probeHostsInBatches(candidates, port, {
    batchSize: 16,
    timeoutMs: LOCAL_SYNC_TIMEOUT.discoverMs,
    stopOnFirst: false,
    deadlineAt
  }))]

  if (resolved.length === 0 && options?.allowSubnetSweep) {
    const sweepSet = new Set<string>(buildSweepCandidates())
    candidates.forEach((host) => sweepSet.delete(host))
    resolved = await probeHostsInBatches(Array.from(sweepSet), port, {
      batchSize: 24,
      timeoutMs: 700,
      stopOnFirst: true,
      deadlineAt
    })
  }

  const uniqueByUrl = new Map<string, LocalSyncDevice>()
  for (const item of resolved) {
    if (!uniqueByUrl.has(item.baseUrl)) {
      uniqueByUrl.set(item.baseUrl, item)
    }
  }

  return Array.from(uniqueByUrl.values()).sort((a, b) => (a.latencyMs || 9999) - (b.latencyMs || 9999))
}
