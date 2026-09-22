/**
 * utils/bundleAuth.js
 * OTA / 手动资源包认证（HMAC-SHA256 + 内容清单）。
 *
 * 两种签名：
 * 1. 内容清单签名（随包内嵌 goods-bundle.auth.json）——本地 zip 侧载自证
 * 2. 发布签名（ota_releases.auth_sig）——远程历史版本安装前验签
 */
import { strFromU8, unzipSync } from 'fflate'
import {
  BUNDLE_AUTH_ALG,
  BUNDLE_AUTH_FILE_NAME,
  BUNDLE_AUTH_KEY_ID,
  BUNDLE_AUTH_MSG_CONTENT,
  BUNDLE_AUTH_MSG_PREFIX,
  BUNDLE_AUTH_MSG_RELEASE,
  BUNDLE_AUTH_SECRET,
  BUNDLE_AUTH_VERSION
} from '@/constants/bundleAuth'
import { sha256Hex } from '@/utils/platform/fileHash'

function getSecret() {
  return String(BUNDLE_AUTH_SECRET || '')
}

export function base64UrlFromBytes(bytes) {
  let binary = ''
  const chunk = 0x8000
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(value) {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4))
  const binary = atob(raw + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSign(message, secret = getSecret()) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return base64UrlFromBytes(new Uint8Array(sig))
}

async function hmacVerify(message, signature, secret = getSecret()) {
  const expected = await hmacSign(message, secret)
  const a = String(signature || '')
  const b = expected
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 规范化 zip 内路径：正斜杠、去前导 ./ */
export function normalizeBundlePath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

function isAuthFileName(path) {
  const normalized = normalizeBundlePath(path)
  return normalized === BUNDLE_AUTH_FILE_NAME || normalized.endsWith(`/${BUNDLE_AUTH_FILE_NAME}`)
}

function normalizeFilesMap(files) {
  const map = new Map()
  for (const [key, value] of Object.entries(files || {})) {
    const path = normalizeBundlePath(key)
    // 系统 zip -r 会写入目录项（`assets/`）；内容清单只认真实文件
    if (!path || path.endsWith('/')) continue
    if (isAuthFileName(path)) continue
    if (value == null) continue
    map.set(path, value)
  }
  return map
}

function compareBundlePaths(a, b) {
  // 与发布脚本一致：按 UTF-16 码元排序，不要用 localeCompare
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 内容清单哈希：按路径排序的 `path\nsha256hex\n` 拼接后再 SHA-256。
 * @param {Record<string, Uint8Array>} files 不含 goods-bundle.auth.json / 目录项
 */
export async function computeContentPayloadHash(files) {
  const map = normalizeFilesMap(files)
  const paths = [...map.keys()].sort(compareBundlePaths)
  const parts = []
  for (const path of paths) {
    const digest = await sha256Hex(map.get(path))
    parts.push(`${path}\n${digest}\n`)
  }
  return sha256Hex(new TextEncoder().encode(parts.join('')))
}

export function buildContentSignMessage({ version, issuedAt, payloadHash }) {
  return [
    BUNDLE_AUTH_MSG_PREFIX,
    BUNDLE_AUTH_KEY_ID,
    BUNDLE_AUTH_MSG_CONTENT,
    String(version || ''),
    String(issuedAt || ''),
    String(payloadHash || '')
  ].join('|')
}

export function buildReleaseSignMessage({ version, sha256 }) {
  return [
    BUNDLE_AUTH_MSG_PREFIX,
    BUNDLE_AUTH_KEY_ID,
    BUNDLE_AUTH_MSG_RELEASE,
    String(version || ''),
    String(sha256 || '').trim().toLowerCase()
  ].join('|')
}

/**
 * 为内容映射生成内嵌认证文件对象。
 * @param {Record<string, Uint8Array>} files dist 文件映射（不含 auth 文件）
 * @param {string} version
 */
export async function createBundleAuthObject(files, version, issuedAt = new Date().toISOString()) {
  const payloadHash = await computeContentPayloadHash(files)
  const message = buildContentSignMessage({ version, issuedAt, payloadHash })
  const sig = await hmacSign(message)
  return {
    v: BUNDLE_AUTH_VERSION,
    alg: BUNDLE_AUTH_ALG,
    keyId: BUNDLE_AUTH_KEY_ID,
    version: String(version || ''),
    issuedAt: String(issuedAt || ''),
    payloadHash,
    sig
  }
}

/**
 * 校验内嵌认证对象与当前文件映射是否匹配。
 * @returns {Promise<{ version: string, issuedAt: string }>}
 */
export async function verifyBundleAuthObject(auth, files) {
  if (!auth || typeof auth !== 'object') {
    throw new Error('资源包缺少认证信息。')
  }
  if (Number(auth.v) !== BUNDLE_AUTH_VERSION) {
    throw new Error(`不支持的资源包认证版本：${auth.v}`)
  }
  if (String(auth.alg || '').toUpperCase() !== BUNDLE_AUTH_ALG) {
    throw new Error(`不支持的资源包认证算法：${auth.alg}`)
  }
  if (String(auth.keyId || '') !== BUNDLE_AUTH_KEY_ID) {
    throw new Error(`未知的资源包认证密钥：${auth.keyId}`)
  }
  if (!auth.sig || !auth.payloadHash) {
    throw new Error('资源包认证字段不完整。')
  }

  const payloadHash = await computeContentPayloadHash(files)
  if (payloadHash !== String(auth.payloadHash)) {
    throw new Error('资源包内容与认证清单不一致，已拒绝安装。')
  }

  const message = buildContentSignMessage({
    version: auth.version,
    issuedAt: auth.issuedAt,
    payloadHash: auth.payloadHash
  })
  const ok = await hmacVerify(message, auth.sig)
  if (!ok) {
    throw new Error('资源包认证校验失败，已拒绝安装。')
  }

  return {
    version: String(auth.version || ''),
    issuedAt: String(auth.issuedAt || '')
  }
}

/**
 * 解压并校验本地 bundle zip 的内嵌认证。
 * @param {Uint8Array|ArrayBuffer} zipBytes
 * @returns {Promise<{ version: string, issuedAt: string, files: Record<string, Uint8Array> }>}
 */
export async function verifyBundleZipAuth(zipBytes) {
  const input = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes)
  let files
  try {
    files = unzipSync(input)
  } catch {
    throw new Error('资源包不是有效的 zip，已拒绝安装。')
  }

  const authEntry = Object.entries(files).find(([path]) => isAuthFileName(path))
  if (!authEntry) {
    throw new Error('资源包缺少认证文件，已拒绝安装。')
  }

  let auth
  try {
    auth = JSON.parse(strFromU8(authEntry[1]))
  } catch {
    throw new Error('资源包认证文件损坏，已拒绝安装。')
  }

  const meta = await verifyBundleAuthObject(auth, files)
  return { ...meta, files }
}

/** 生成发布签名（写入 ota_releases.auth_sig）。 */
export async function signReleaseAuth({ version, sha256 }) {
  const message = buildReleaseSignMessage({ version, sha256 })
  return hmacSign(message)
}

/** 校验发布签名。缺签或不匹配均抛错。 */
export async function verifyReleaseAuth({ version, sha256, authSig }) {
  const signature = String(authSig || '').trim()
  if (!signature) {
    throw new Error('该资源包未签名，无法手动安装。')
  }
  const message = buildReleaseSignMessage({ version, sha256 })
  const ok = await hmacVerify(message, signature)
  if (!ok) {
    throw new Error('资源包认证校验失败，已拒绝安装。')
  }
  return true
}

/** 生成发布签名字符串（供 Node 发布脚本使用，与 signReleaseAuth 同算法）。 */
export function buildReleaseSignMessageForScript({ version, sha256 }) {
  return buildReleaseSignMessage({ version, sha256 })
}
