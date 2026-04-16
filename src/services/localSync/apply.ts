import { LOCAL_SYNC_API_PREFIX, LOCAL_SYNC_CHUNK_SIZE, LOCAL_SYNC_TIMEOUT } from './constants'
import { buildFileEntry, buildLocalManifest } from './protocol'
import { discoverLanDevices } from './discovery'
import { openLocalSyncSession, uploadManifest } from './session'
import { requestJson } from './transport'
import type {
  LocalSyncApplyOptions,
  LocalSyncFileEntry,
  LocalSyncManifest,
  LocalSyncTransferResult,
  RequiredFilesResponse
} from './types'

function normalizeTransferPayload<T extends Record<string, unknown>>(payload: T): T {
  if (!payload || typeof payload !== 'object') return payload

  const copy = { ...payload } as Record<string, unknown>
  delete copy.updatedAt
  delete copy.deviceId

  return stabilizeValue(copy) as T
}

function stabilizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => stabilizeValue(item))
    const canSortById = normalized.every((item) => item && typeof item === 'object' && !Array.isArray(item) && 'id' in (item as Record<string, unknown>))
    if (!canSortById) {
      return normalized
    }
    return [...normalized].sort((a, b) => {
      const left = String((a as Record<string, unknown>).id || '')
      const right = String((b as Record<string, unknown>).id || '')
      return left.localeCompare(right)
    })
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b))) {
    output[key] = stabilizeValue(input[key])
  }
  return output
}

function toBase64Chunk(raw: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(raw)))
  }

  return Buffer.from(raw, 'utf-8').toString('base64')
}

function splitText(content: string, chunkSize: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < content.length; index += chunkSize) {
    chunks.push(content.slice(index, index + chunkSize))
  }
  return chunks.length > 0 ? chunks : ['']
}

async function pushFileChunks(baseUrl: string, sessionId: string, file: LocalSyncFileEntry, content: string, missingChunks: number[]): Promise<void> {
  const chunks = splitText(content, LOCAL_SYNC_CHUNK_SIZE)
  const indexes = missingChunks.length > 0 ? missingChunks : chunks.map((_, index) => index)

  for (const index of indexes) {
    const raw = chunks[index] ?? ''
    await requestJson(baseUrl, `${LOCAL_SYNC_API_PREFIX}/chunk`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        path: file.path,
        hash: file.hash,
        index,
        totalChunks: chunks.length,
        data: toBase64Chunk(raw)
      })
    }, LOCAL_SYNC_TIMEOUT.chunkMs)
  }
}

export async function executeLocalSyncTransfer(params: {
  receiverHost: string
  receiverPort?: number
  senderDeviceId: string
  senderDeviceName?: string
  goodsData: unknown
  rechargeData: unknown
  eventData: unknown
  imagesData?: unknown
  updatedAt: string
  stableSignatures?: {
    goods?: string
    recharge?: string
    events?: string
    images?: string
  }
  options?: LocalSyncApplyOptions
}): Promise<LocalSyncTransferResult> {
  const { options } = params
  options?.onProgress?.({ stage: 'prepare', message: '正在搜索接收设备...', totalFiles: 0, completedFiles: 0 })

  const devices = await discoverLanDevices({
    seedHost: params.receiverHost,
    preferredPort: params.receiverPort
  })
  const receiver = devices[0]
  if (!receiver) {
    throw new Error('未发现可用设备。请检查双方是否在同一网络，且未开启 AP 隔离。')
  }

  const normalizedGoodsData = normalizeTransferPayload((params.goodsData || {}) as Record<string, unknown>)
  const normalizedRechargeData = normalizeTransferPayload((params.rechargeData || {}) as Record<string, unknown>)
  const normalizedEventData = normalizeTransferPayload((params.eventData || {}) as Record<string, unknown>)
  const normalizedImagesData = normalizeTransferPayload((params.imagesData || {
    version: 1,
    goodsImageFiles: {},
    eventImageFiles: {}
  }) as Record<string, unknown>)

  const payload = {
    senderDeviceName: params.senderDeviceName || '未知设备',
    updatedAt: params.updatedAt
  }
  const files = await Promise.all<LocalSyncFileEntry>([
    buildFileEntry('goods.json', normalizedGoodsData, params.updatedAt, params.stableSignatures?.goods || ''),
    buildFileEntry('recharge.json', normalizedRechargeData, params.updatedAt, params.stableSignatures?.recharge || ''),
    buildFileEntry('events.json', normalizedEventData, params.updatedAt, params.stableSignatures?.events || ''),
    buildFileEntry('lan-images.json', normalizedImagesData, params.updatedAt, params.stableSignatures?.images || '')
  ])

  const manifest: LocalSyncManifest = buildLocalManifest({
    deviceId: params.senderDeviceId,
    summary: {
      goodsCount: Array.isArray((normalizedGoodsData as { goods?: unknown[] })?.goods) ? ((normalizedGoodsData as { goods: unknown[] }).goods.length) : 0,
      trashCount: Array.isArray((normalizedGoodsData as { trash?: unknown[] })?.trash) ? ((normalizedGoodsData as { trash: unknown[] }).trash.length) : 0,
      rechargeCount: Array.isArray((normalizedRechargeData as { recharge?: unknown[] })?.recharge) ? ((normalizedRechargeData as { recharge: unknown[] }).recharge.length) : 0,
      eventCount: Array.isArray((normalizedEventData as { events?: unknown[] })?.events) ? ((normalizedEventData as { events: unknown[] }).events.length) : 0
    },
    payload,
    files
  })

  options?.onProgress?.({ stage: 'manifest', message: '正在建立同步会话...', totalFiles: files.length, completedFiles: 0 })
  const session = await openLocalSyncSession(receiver, params.senderDeviceId)
  await uploadManifest(receiver.baseUrl, session.sessionId, manifest)

  const requiredResponse = await requestJson<RequiredFilesResponse>(receiver.baseUrl, `${LOCAL_SYNC_API_PREFIX}/required-files`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId: session.sessionId,
      files
    })
  })

  const fileContentMap = new Map<string, string>([
    ['goods.json', JSON.stringify(normalizedGoodsData)],
    ['recharge.json', JSON.stringify(normalizedRechargeData)],
    ['events.json', JSON.stringify(normalizedEventData)],
    ['lan-images.json', JSON.stringify(normalizedImagesData)]
  ])

  let completedFiles = 0
  for (const file of requiredResponse.required) {
    options?.onProgress?.({
      stage: 'files',
      message: `正在传输 ${file.path}`,
      totalFiles: requiredResponse.required.length,
      completedFiles,
      currentFile: file.path
    })

    const meta = files.find((item) => item.path === file.path)
    if (!meta) continue

    const raw = fileContentMap.get(file.path) || '{}'
    await pushFileChunks(receiver.baseUrl, session.sessionId, meta, raw, file.missingChunks || [])
    completedFiles += 1
  }

  options?.onProgress?.({ stage: 'commit', message: '等待接收端确认并提交...', totalFiles: requiredResponse.required.length, completedFiles })
  const commit = await requestJson<LocalSyncTransferResult>(receiver.baseUrl, `${LOCAL_SYNC_API_PREFIX}/commit`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId: session.sessionId,
      confirm: true
    })
  }, options?.timeoutMs || LOCAL_SYNC_TIMEOUT.overallMs)

  options?.onProgress?.({ stage: 'done', message: '局域网同步完成', totalFiles: requiredResponse.required.length, completedFiles })
  return commit
}
