// @ts-check
/**
 * Dev 本地 SNTP 桥（仅 Vite serve）
 *
 * 浏览器不能发 UDP/123，dev 下自助下单需要国内 NTP 时：
 * 页面 GET /dev-ntp → 本插件用 Node 去打阿里云/腾讯云 SNTP → 返回毫秒时间。
 *
 * 按需启动：中间件注册后空闲；只有请求进来才发 UDP，不常驻探测。
 * 生产/PWA 不走此路径（见 fetchPrimaryServerTime → edge）。
 */

import dgram from 'node:dgram'

const NTP_PORT = 123
const NTP_EPOCH_OFFSET_MS = 2208988800000
const DEFAULT_SERVERS = [
  'ntp.aliyun.com',
  'ntp.tencent.com',
  'cn.ntp.org.cn',
  'time.cloudflare.com',
]

/**
 * @param {number} ms
 */
function toNtpTimestamp(ms) {
  const sec = Math.floor(ms / 1000) + NTP_EPOCH_OFFSET_MS / 1000
  const frac = Math.floor(((ms % 1000) / 1000) * 0x100000000)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(sec >>> 0, 0)
  buf.writeUInt32BE(frac >>> 0, 4)
  return buf
}

/**
 * @param {Buffer} buf
 * @param {number} offset
 */
function readNtpTimestampMs(buf, offset) {
  const seconds = buf.readUInt32BE(offset)
  const fraction = buf.readUInt32BE(offset + 4)
  if (seconds === 0) return 0
  const unixSec = seconds - NTP_EPOCH_OFFSET_MS / 1000
  return unixSec * 1000 + Math.floor((fraction * 1000) / 2 ** 32)
}

/**
 * 单次 SNTP 查询
 * @param {string} host
 * @param {number} timeoutMs
 * @returns {Promise<{source: string, offsetMs: number, delayMs: number, serverTime: number} | null>}
 */
function queryOnce(host, timeoutMs) {
  return new Promise((resolve) => {
    /** @type {import('dgram').Socket | null} */
    let socket = null
    /** @type {NodeJS.Timeout | null} */
    let timer = null
    const done = (/** @type {null | {source: string, offsetMs: number, delayMs: number, serverTime: number}} */ value) => {
      if (timer) clearTimeout(timer)
      timer = null
      try { socket?.close() } catch { /* ignore */ }
      socket = null
      resolve(value)
    }

    try {
      socket = dgram.createSocket({ type: 'udp4' })
      socket.on('error', () => done(null))
      socket.on('message', (msg) => {
        if (!msg || msg.length < 48) {
          done(null)
          return
        }
        const t3 = Date.now()
        const t1 = readNtpTimestampMs(msg, 32)
        const t2 = readNtpTimestampMs(msg, 40)
        if (t1 <= 0 || t2 <= 0) {
          done(null)
          return
        }
        // SNTP: offset = ((t1−t0)+(t2−t3))/2  →  server − localMidpoint
        const offsetMs = ((t1 - t0) + (t2 - t3)) / 2
        const delayMs = Math.max(0, (t3 - t0) - (t2 - t1))
        done({
          source: host,
          offsetMs,
          delayMs,
          serverTime: t3 + offsetMs,
        })
      })

      const t0 = Date.now()
      const packet = Buffer.alloc(48)
      packet[0] = 0x23 // LI=0 VN=4 Mode=3 client
      toNtpTimestamp(t0).copy(packet, 40)

      timer = setTimeout(() => done(null), Math.max(250, timeoutMs))
      socket.send(packet, NTP_PORT, host, (err) => {
        if (err) done(null)
      })
    } catch {
      done(null)
    }
  })
}

/**
 * 低延迟中位数（与 Android NativeTimePlugin 策略一致）
 * @returns {Promise<{serverTime: number, offsetMs: number, rttMs: number, source: string}>}
 */
async function probeNtp() {
  /** @type {{source: string, offsetMs: number, delayMs: number}[]} */
  const samples = []
  for (const server of DEFAULT_SERVERS) {
    const sample = await queryOnce(server, 800)
    if (!sample) continue
    samples.push(sample)
    if (sample.delayMs <= 120) break
  }
  if (!samples.length) {
    throw new Error('all NTP servers failed')
  }
  const lowDelay = [...samples].sort((a, b) => a.delayMs - b.delayMs).slice(0, Math.max(1, Math.min(3, samples.length)))
  const offsets = lowDelay.map((s) => s.offsetMs).sort((a, b) => a - b)
  const mid = Math.floor(offsets.length / 2)
  const offsetMs = offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2
  const best = lowDelay.reduce((a, b) => (a.delayMs <= b.delayMs ? a : b))
  return {
    serverTime: Date.now() + offsetMs,
    offsetMs,
    rttMs: best.delayMs,
    source: `dev-ntp:${best.source}`,
  }
}

/** 结果缓存：避免 UI 短时间连打把 NTP 打烦；TTL 内直接回缓存偏移 + 本地自由跑 */
const CACHE_TTL_MS = 15000
/** @type {{ at: number, offsetMs: number, rttMs: number, source: string } | null} */
let cache = null

export function ntpBridgePlugin() {
  return {
    name: 'goods-app-dev-ntp',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev-ntp', async (_req, res) => {
        try {
          const now = Date.now()
          if (cache && now - cache.at < CACHE_TTL_MS) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              serverTime: now + cache.offsetMs,
              offsetMs: cache.offsetMs,
              rttMs: cache.rttMs,
              source: cache.source,
              cached: true,
            }))
            return
          }

          const result = await probeNtp()
          cache = {
            at: Date.now(),
            offsetMs: result.offsetMs,
            rttMs: result.rttMs,
            source: result.source,
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            serverTime: Date.now() + result.offsetMs,
            offsetMs: result.offsetMs,
            rttMs: result.rttMs,
            source: result.source,
            cached: false,
          }))
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(error?.message || error) }))
        }
      })
    },
  }
}
