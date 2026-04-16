export type LocalSyncDiscoveryStatus = 'idle' | 'searching' | 'ready' | 'failed'

export interface LocalSyncDevice {
  host: string
  port: number
  baseUrl: string
  deviceName: string
  appVersion?: string
  latencyMs?: number
}

export interface LocalSyncFileEntry {
  path: string
  hash: string
  updatedAt: string
  size: number
}

export interface LocalSyncManifest {
  protocolVersion: string
  deviceId: string
  generatedAt: string
  summary: {
    goodsCount: number
    trashCount: number
    rechargeCount: number
    eventCount: number
  }
  files: LocalSyncFileEntry[]
  payload: Record<string, unknown>
}

export interface LocalSyncSession {
  sessionId: string
  receiver: LocalSyncDevice
  resumeToken?: string
  checkpoint?: {
    uploadedFiles: string[]
    uploadedChunks: Record<string, number[]>
  }
}

export interface RequiredFilesResponse {
  required: Array<{
    path: string
    hash: string
    missingChunks: number[]
  }>
}

export interface LocalSyncTransferProgress {
  stage: 'prepare' | 'manifest' | 'files' | 'commit' | 'done' | 'error'
  message: string
  totalFiles: number
  completedFiles: number
  currentFile?: string
}

export interface LocalSyncTransferResult {
  sessionId: string
  acceptedFiles: number
  skippedFiles: number
  committedAt: string
}

export interface LocalSyncApplyOptions {
  timeoutMs?: number
  onProgress?: (progress: LocalSyncTransferProgress) => void
  signal?: AbortSignal
}
