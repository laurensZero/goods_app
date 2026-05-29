/**
 * utils/cryptoManager.js
 * Gist 端到端加密管理器
 *
 * 使用 Web Crypto API 实现 AES-256-GCM 加密/解密
 * 密钥通过 HKDF-SHA256 从 GitHub token 派生
 */

/**
 * 检查当前环境是否支持 Web Crypto API
 * @returns {boolean}
 */
export function isWebCryptoAvailable () {
  return !!(globalThis.crypto && globalThis.crypto.subtle)
}

/**
 * 将 Uint8Array 编码为 base64url 字符串（URL 安全，无 +/= 字符）
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64urlEncode (bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('base64urlEncode: 输入必须为 Uint8Array')
  }
  // Chunked conversion to avoid O(n²) string concatenation
  const CHUNK = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * 将 base64url 字符串解码为 Uint8Array
 * @param {string} str
 * @returns {Uint8Array}
 */
export function base64urlDecode (str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error('base64urlDecode: 输入必须为非空字符串')
  }
  // base64url → 标准 base64 还原
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // 补齐 padding
  const pad = base64.length % 4
  if (pad === 2) {
    base64 += '=='
  } else if (pad === 3) {
    base64 += '='
  } else if (pad === 1) {
    throw new Error('base64urlDecode: 无效的 base64url 字符串长度')
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * 从 GitHub token 派生 AES-256-GCM 加密密钥
 *
 * 算法：HKDF-SHA256
 * 盐值：`goods-app-encryption:${username}`
 * 上下文信息：`gist-encryption-key`
 *
 * @param {string} token - GitHub Personal Access Token
 * @param {string} username - GitHub 用户名
 * @returns {Promise<CryptoKey>} AES-256-GCM 密钥
 */
export async function deriveKey (password, userId) {
  if (!isWebCryptoAvailable()) {
    throw new Error('deriveKey: 当前环境不支持 Web Crypto API')
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('deriveKey: password 必须为非空字符串')
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('deriveKey: userId 必须为非空字符串')
  }

  const encoder = new TextEncoder()

  // 使用 password + userId 派生密钥
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password + ':' + userId),
    'HKDF',
    false,
    ['deriveKey']
  )

  const salt = encoder.encode('goods-app-salt-v1')
  const info = encoder.encode('gist-encryption-key')

  // 通过 HKDF-SHA256 派生 AES-256-GCM 密钥
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * 使用 AES-256-GCM 加密数据
 *
 * @param {string} data - 待加密的明文字符串
 * @param {CryptoKey} key - AES-256-GCM 密钥
 * @returns {Promise<string>} 加密包 JSON 字符串
 */
export async function encrypt (data, key) {
  if (!isWebCryptoAvailable()) {
    throw new Error('encrypt: 当前环境不支持 Web Crypto API')
  }
  if (!(key instanceof CryptoKey)) {
    throw new Error('encrypt: key 必须为 CryptoKey 实例')
  }

  const encoder = new TextEncoder()
  const plaintext = encoder.encode(typeof data === 'string' ? data : JSON.stringify(data))

  // 随机生成 12 字节 nonce
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12))

  const cipherBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce
    },
    key,
    plaintext
  )

  const ciphertext = new Uint8Array(cipherBuffer)

  const encryptedPackage = {
    v: 1,
    alg: 'A256GCM',
    n: base64urlEncode(nonce),
    c: base64urlEncode(ciphertext)
  }

  return JSON.stringify(encryptedPackage)
}

/**
 * 解密 AES-256-GCM 加密数据
 *
 * @param {string} encryptedPayload - 加密包 JSON 字符串
 * @param {CryptoKey} key - AES-256-GCM 密钥
 * @returns {Promise<string>} 解密后的明文字符串
 */
export async function decrypt (encryptedPayload, key) {
  if (!isWebCryptoAvailable()) {
    throw new Error('decrypt: 当前环境不支持 Web Crypto API')
  }
  if (typeof encryptedPayload !== 'string' || encryptedPayload.length === 0) {
    throw new Error('decrypt: encryptedPayload 必须为非空字符串')
  }
  if (!(key instanceof CryptoKey)) {
    throw new Error('decrypt: key 必须为 CryptoKey 实例')
  }

  let pkg
  try {
    pkg = JSON.parse(encryptedPayload)
  } catch {
    throw new Error('decrypt: 无法解析加密包 JSON')
  }

  if (pkg.v !== 1 || pkg.alg !== 'A256GCM') {
    throw new Error('decrypt: 不支持的加密包版本或算法')
  }
  if (typeof pkg.n !== 'string' || typeof pkg.c !== 'string') {
    throw new Error('decrypt: 加密包缺少必要字段 (n, c)')
  }

  const nonce = base64urlDecode(pkg.n)
  const ciphertext = base64urlDecode(pkg.c)

  if (nonce.length !== 12) {
    throw new Error('decrypt: nonce 长度必须为 12 字节')
  }

  try {
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce
      },
      key,
      ciphertext
    )

    const decoder = new TextDecoder()
    return decoder.decode(plainBuffer)
  } catch {
    throw new Error('decrypt: 解密失败，密钥不正确或数据已损坏')
  }
}

/**
 * 检测内容是否为加密格式
 *
 * 通过解析 JSON 并检查 v/alg/n/c 字段来判断
 *
 * @param {string} content - 待检测的内容
 * @returns {boolean}
 */
export function isEncrypted (content) {
  if (typeof content !== 'string' || content.length === 0) {
    return false
  }
  try {
    const pkg = JSON.parse(content)
    return (
      pkg !== null &&
      typeof pkg === 'object' &&
      pkg.v === 1 &&
      pkg.alg === 'A256GCM' &&
      typeof pkg.n === 'string' &&
      typeof pkg.c === 'string'
    )
  } catch {
    return false
  }
}
