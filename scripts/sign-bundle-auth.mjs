/**
 * 发布前为 dist/ 写入 goods-bundle.auth.json，并输出发布签名材料。
 *
 * 用法：
 *   node scripts/sign-bundle-auth.mjs --version 1.6.0.1 --dist dist
 *   node scripts/sign-bundle-auth.mjs --version 1.6.0.1 --dist dist --zip bundle.zip
 *
 * 输出（stdout，供 CI 读取）：
 *   payloadHash=...
 *   auth_sig=...          # version|zipSha256 的 HMAC（--zip 时才有）
 *   auth_json=...         # 内嵌认证 JSON
 */
import { createHmac } from 'node:crypto'
import { readdirSync, writeFileSync, statSync, createReadStream } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { BUNDLE_AUTH_ALG, BUNDLE_AUTH_FILE_NAME, BUNDLE_AUTH_KEY_ID, BUNDLE_AUTH_MSG_CONTENT, BUNDLE_AUTH_MSG_PREFIX, BUNDLE_AUTH_MSG_RELEASE, BUNDLE_AUTH_SECRET, BUNDLE_AUTH_VERSION } from '../src/constants/bundleAuth.js'

function parseArgs(argv) {
  const args = {
    version: '',
    dist: 'dist',
    zip: '',
    issuedAt: new Date().toISOString(),
    releaseOnly: false
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--version') args.version = String(argv[++i] || '')
    else if (key === '--dist') args.dist = String(argv[++i] || 'dist')
    else if (key === '--zip') args.zip = String(argv[++i] || '')
    else if (key === '--issued-at') args.issuedAt = String(argv[++i] || args.issuedAt)
    else if (key === '--release-only') args.releaseOnly = true
  }
  return args
}

function getSecret() {
  return String(process.env.BUNDLE_AUTH_SECRET || BUNDLE_AUTH_SECRET || '')
}

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

function normalizeRel(abs, distRoot) {
  return relative(distRoot, abs).split(sep).join('/')
}

function hmacBase64Url(message) {
  const mac = createHmac('sha256', getSecret())
  mac.update(message, 'utf8')
  return mac.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sha256HexBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

async function sha256HexFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function buildContentSignMessage({ version, issuedAt, payloadHash }) {
  return [
    BUNDLE_AUTH_MSG_PREFIX,
    BUNDLE_AUTH_KEY_ID,
    BUNDLE_AUTH_MSG_CONTENT,
    String(version || ''),
    String(issuedAt || ''),
    String(payloadHash || '')
  ].join('|')
}

function buildReleaseSignMessage({ version, sha256 }) {
  return [
    BUNDLE_AUTH_MSG_PREFIX,
    BUNDLE_AUTH_KEY_ID,
    BUNDLE_AUTH_MSG_RELEASE,
    String(version || ''),
    String(sha256 || '').trim().toLowerCase()
  ].join('|')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.version) {
    console.error('缺少 --version')
    process.exit(1)
  }

  // 只根据已打好的 zip 计算发布签名（不重写 dist 内嵌认证）
  if (args.releaseOnly) {
    if (!args.zip) {
      console.error('--release-only 需要 --zip')
      process.exit(1)
    }
    const zipSha256 = await sha256HexFile(args.zip)
    const releaseMessage = buildReleaseSignMessage({ version: args.version, sha256: zipSha256 })
    const authSig = hmacBase64Url(releaseMessage)
    console.log(`zip_sha256=${zipSha256}`)
    console.log(`auth_sig=${authSig}`)
    return
  }

  const distRoot = args.dist
  const absFiles = walkFiles(distRoot)
    .filter((abs) => normalizeRel(abs, distRoot) !== BUNDLE_AUTH_FILE_NAME)

  const parts = []
  for (const abs of absFiles.sort((a, b) => normalizeRel(a, distRoot).localeCompare(normalizeRel(b, distRoot)))) {
    const rel = normalizeRel(abs, distRoot)
    const digest = await sha256HexFile(abs)
    parts.push(`${rel}\n${digest}\n`)
  }
  const payloadHash = sha256HexBuffer(Buffer.from(parts.join(''), 'utf8'))
  const issuedAt = args.issuedAt
  const message = buildContentSignMessage({ version: args.version, issuedAt, payloadHash })
  const sig = hmacBase64Url(message)

  const auth = {
    v: BUNDLE_AUTH_VERSION,
    alg: BUNDLE_AUTH_ALG,
    keyId: BUNDLE_AUTH_KEY_ID,
    version: args.version,
    issuedAt,
    payloadHash,
    sig
  }
  const authPath = join(distRoot, BUNDLE_AUTH_FILE_NAME)
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, 'utf8')

  console.log(`payloadHash=${payloadHash}`)
  console.log(`auth_json=${JSON.stringify(auth)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
