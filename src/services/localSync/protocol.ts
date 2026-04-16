import { LOCAL_SYNC_PROTOCOL_VERSION } from './constants'
import type { LocalSyncFileEntry, LocalSyncManifest } from './types'

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function hashText(content: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(content)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return toHex(digest)
  }

  // Fallback hash keeps protocol deterministic on older runtimes.
  let hash = 5381
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(index)
  }
  return `legacy_${Math.abs(hash >>> 0).toString(16)}`
}

export async function buildFileEntry(path: string, payload: unknown, updatedAt: string, hashOverride = ''): Promise<LocalSyncFileEntry> {
  const raw = JSON.stringify(payload)
  const resolvedHash = String(hashOverride || '').trim()
  const normalizedOverride = resolvedHash
    ? await hashText(resolvedHash)
    : ''
  return {
    path,
    hash: normalizedOverride || await hashText(raw),
    updatedAt,
    size: raw.length
  }
}

export function buildLocalManifest(params: {
  deviceId: string
  summary: LocalSyncManifest['summary']
  payload: LocalSyncManifest['payload']
  files: LocalSyncFileEntry[]
}): LocalSyncManifest {
  return {
    protocolVersion: LOCAL_SYNC_PROTOCOL_VERSION,
    deviceId: params.deviceId,
    generatedAt: new Date().toISOString(),
    summary: params.summary,
    payload: params.payload,
    files: params.files
  }
}
