import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'

const app = express()
const PORT = Number(process.env.LOCAL_SYNC_PORT || 51823)
const ROOT_DIR = path.resolve(process.cwd(), '.local-sync-runtime')
const SESSION_DIR = path.join(ROOT_DIR, 'sessions')
const BLOB_DIR = path.join(ROOT_DIR, 'blobs')
const CHUNK_DIR = path.join(ROOT_DIR, 'chunks')
const SYNC_DATA_DIR = path.resolve(process.cwd(), '.sync-data')
const CURRENT_DATA_DIR = path.join(SYNC_DATA_DIR, 'current')

for (const dir of [ROOT_DIR, SESSION_DIR, BLOB_DIR, CHUNK_DIR, SYNC_DATA_DIR, CURRENT_DATA_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

app.use(express.json({ limit: '8mb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

function sessionPath(sessionId) {
  return path.join(SESSION_DIR, `${sessionId}.json`)
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

function createSessionId() {
  return `lan_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`
}

function safeChunkDir(sessionId, fileHash) {
  const safeHash = String(fileHash || '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = path.join(CHUNK_DIR, `${sessionId}_${safeHash}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function decodeChunk(base64Data) {
  return Buffer.from(base64Data || '', 'base64')
}

function buildDeviceName() {
  return process.env.LOCAL_SYNC_DEVICE_NAME || os.hostname() || 'LAN Receiver'
}

function toCurrentDataPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const safeName = normalized.split('/').filter(Boolean).join('_') || 'unknown.json'
  return path.join(CURRENT_DATA_DIR, safeName)
}

function readCurrentJsonFile(fileName) {
  const target = path.join(CURRENT_DATA_DIR, fileName)
  if (!fs.existsSync(target)) {
    return null
  }

  try {
    const raw = fs.readFileSync(target, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

app.get('/api/local-sync/discover', (req, res) => {
  res.json({
    deviceName: buildDeviceName(),
    appVersion: '1.0.0',
    now: new Date().toISOString()
  })
})

app.get('/api/local-sync/current', (req, res) => {
  const files = fs.readdirSync(CURRENT_DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(CURRENT_DATA_DIR, entry.name)
      const stat = fs.statSync(filePath)
      return {
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })

  const payload = {
    goods: readCurrentJsonFile('goods.json'),
    recharge: readCurrentJsonFile('recharge.json'),
    events: readCurrentJsonFile('events.json')
  }

  res.json({
    dir: CURRENT_DATA_DIR,
    files,
    payload
  })
})

app.get('/api/local-sync/current-content', (req, res) => {
  const payload = {
    goods: readCurrentJsonFile('goods.json'),
    recharge: readCurrentJsonFile('recharge.json'),
    events: readCurrentJsonFile('events.json')
  }

  res.json({
    updatedAt: new Date().toISOString(),
    payload
  })
})

app.post('/api/local-sync/session', (req, res) => {
  const incomingId = String(req.body?.sessionId || '').trim()
  const sessionId = incomingId || createSessionId()
  const targetPath = sessionPath(sessionId)
  const existing = readJson(targetPath)

  if (existing) {
    res.json({
      sessionId,
      receiver: {
        host: '0.0.0.0',
        port: PORT,
        baseUrl: `http://127.0.0.1:${PORT}`,
        deviceName: buildDeviceName()
      },
      resumeToken: existing.resumeToken,
      checkpoint: existing.checkpoint || { uploadedFiles: [], uploadedChunks: {} }
    })
    return
  }

  const payload = {
    sessionId,
    createdAt: new Date().toISOString(),
    senderDeviceId: String(req.body?.senderDeviceId || ''),
    role: String(req.body?.role || 'sender'),
    manifest: null,
    resumeToken: crypto.randomBytes(10).toString('hex'),
    checkpoint: {
      uploadedFiles: [],
      uploadedChunks: {}
    },
    fileState: {},
    committedAt: ''
  }

  writeJson(targetPath, payload)

  res.json({
    sessionId,
    receiver: {
      host: '0.0.0.0',
      port: PORT,
      baseUrl: `http://127.0.0.1:${PORT}`,
      deviceName: buildDeviceName()
    },
    resumeToken: payload.resumeToken,
    checkpoint: payload.checkpoint
  })
})

app.post('/api/local-sync/manifest', (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const manifest = req.body?.manifest || null
  if (!sessionId || !manifest) {
    res.status(400).json({ message: '缺少 sessionId 或 manifest' })
    return
  }

  const targetPath = sessionPath(sessionId)
  const session = readJson(targetPath)
  if (!session) {
    res.status(404).json({ message: '会话不存在，请重新建立连接' })
    return
  }

  session.manifest = manifest
  session.updatedAt = new Date().toISOString()
  writeJson(targetPath, session)

  res.json({ ok: true, sessionId, files: Array.isArray(manifest?.files) ? manifest.files.length : 0 })
})

app.post('/api/local-sync/required-files', (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const files = Array.isArray(req.body?.files) ? req.body.files : []

  if (!sessionId) {
    res.status(400).json({ message: '缺少 sessionId' })
    return
  }

  const targetPath = sessionPath(sessionId)
  const session = readJson(targetPath)
  if (!session) {
    res.status(404).json({ message: '会话不存在，请重新建立连接' })
    return
  }

  const required = []
  for (const file of files) {
    const key = `${file.path}#${file.hash}`
    const state = session.fileState[key] || {}
    const blobPath = path.join(BLOB_DIR, `${String(file.hash || '').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)

    // Reuse by content hash across sessions: existing blob means this content is already available.
    if (fs.existsSync(blobPath)) {
      continue
    }

    const totalChunks = Number(state.totalChunks || 0)
    const uploaded = new Set(Array.isArray(state.uploadedChunks) ? state.uploadedChunks : [])
    const missingChunks = []

    if (totalChunks > 0) {
      for (let index = 0; index < totalChunks; index += 1) {
        if (!uploaded.has(index)) {
          missingChunks.push(index)
        }
      }
    }

    required.push({
      path: file.path,
      hash: file.hash,
      missingChunks
    })
  }

  res.json({ required })
})

app.post('/api/local-sync/chunk', (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const filePath = String(req.body?.path || '').trim()
  const hash = String(req.body?.hash || '').trim()
  const index = Number(req.body?.index)
  const totalChunks = Number(req.body?.totalChunks)
  const data = String(req.body?.data || '')

  if (!sessionId || !filePath || !hash || !Number.isFinite(index) || !Number.isFinite(totalChunks)) {
    res.status(400).json({ message: 'chunk 参数不完整' })
    return
  }

  const targetPath = sessionPath(sessionId)
  const session = readJson(targetPath)
  if (!session) {
    res.status(404).json({ message: '会话不存在，请重新建立连接' })
    return
  }

  const key = `${filePath}#${hash}`
  const state = session.fileState[key] || {
    path: filePath,
    hash,
    totalChunks,
    uploadedChunks: [],
    committed: false,
    updatedAt: ''
  }

  const uploadedChunks = new Set(Array.isArray(state.uploadedChunks) ? state.uploadedChunks : [])
  const chunkDirectory = safeChunkDir(sessionId, hash)
  const chunkFilePath = path.join(chunkDirectory, `${index}.part`)

  if (!uploadedChunks.has(index)) {
    fs.writeFileSync(chunkFilePath, decodeChunk(data))
    uploadedChunks.add(index)
  }

  state.totalChunks = totalChunks
  state.uploadedChunks = Array.from(uploadedChunks).sort((a, b) => a - b)
  session.fileState[key] = state

  if (!session.checkpoint) {
    session.checkpoint = { uploadedFiles: [], uploadedChunks: {} }
  }
  session.checkpoint.uploadedChunks[key] = state.uploadedChunks

  writeJson(targetPath, session)
  res.json({ ok: true, uploadedChunks: state.uploadedChunks.length })
})

app.post('/api/local-sync/commit', (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim()
  const confirm = req.body?.confirm === true

  if (!sessionId) {
    res.status(400).json({ message: '缺少 sessionId' })
    return
  }

  if (!confirm) {
    res.status(400).json({ message: '需要接收端确认后才能提交' })
    return
  }

  const targetPath = sessionPath(sessionId)
  const session = readJson(targetPath)
  if (!session) {
    res.status(404).json({ message: '会话不存在，请重新建立连接' })
    return
  }

  const manifestFiles = Array.isArray(session.manifest?.files) ? session.manifest.files : []
  let acceptedFiles = 0
  let skippedFiles = 0

  for (const file of manifestFiles) {
    const key = `${file.path}#${file.hash}`
    const state = session.fileState[key]

    if (!state || !Array.isArray(state.uploadedChunks) || state.uploadedChunks.length === 0) {
      skippedFiles += 1
      continue
    }

    const chunkDirectory = safeChunkDir(sessionId, file.hash)
    const orderedChunks = [...state.uploadedChunks].sort((a, b) => a - b)
    const buffers = []
    for (const chunkIndex of orderedChunks) {
      const chunkFilePath = path.join(chunkDirectory, `${chunkIndex}.part`)
      if (fs.existsSync(chunkFilePath)) {
        buffers.push(fs.readFileSync(chunkFilePath))
      }
    }

    const merged = Buffer.concat(buffers)
    const blobPath = path.join(BLOB_DIR, `${String(file.hash || '').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
    fs.writeFileSync(blobPath, merged)
    fs.writeFileSync(toCurrentDataPath(file.path), merged)

    state.committed = true
    state.updatedAt = String(file.updatedAt || '')
    session.fileState[key] = state

    if (!session.checkpoint.uploadedFiles.includes(file.path)) {
      session.checkpoint.uploadedFiles.push(file.path)
    }

    acceptedFiles += 1
  }

  session.committedAt = new Date().toISOString()
  writeJson(targetPath, session)

  res.json({
    sessionId,
    acceptedFiles,
    skippedFiles,
    committedAt: session.committedAt
  })
})

app.listen(PORT, () => {
  console.log(`[local-sync-server] listening on http://0.0.0.0:${PORT}`)
  console.log(`[local-sync-server] runtime: ${ROOT_DIR}`)
})
