#!/usr/bin/env node
/**
 * SYNC_SCHEMA_VERSION +1（无指纹表）。
 * 用法：改完同步字段后 `npm run sync:bump`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSyncSchemaVersion } from '../src/services/sync/syncSpecSource.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const constantsPath = join(root, 'src/constants/syncConstants.js')
const src = readFileSync(constantsPath, 'utf8')
const current = parseSyncSchemaVersion(src)
if (current == null) {
  console.error('无法解析 SYNC_SCHEMA_VERSION')
  process.exit(1)
}

const next = current + 1
let out = src.replace(
  /export const SYNC_SCHEMA_VERSION\s*=\s*\d+/,
  `export const SYNC_SCHEMA_VERSION = ${next}`
)

if (!out.includes(`// v${next}:`)) {
  out = out.replace(
    /export const SYNC_SCHEMA_VERSION/,
    `// v${next}: 同步字段变更（细节见 commit message）\nexport const SYNC_SCHEMA_VERSION`
  )
}

writeFileSync(constantsPath, out, 'utf8')
console.log(`SYNC_SCHEMA_VERSION: ${current} → ${next}`)
