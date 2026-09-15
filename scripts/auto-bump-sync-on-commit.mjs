#!/usr/bin/env node
/**
 * pre-commit：若暂存区/工作区的 helpers.js 字段相对「上次 SYNC_SCHEMA_VERSION 变更提交」
 * 发生变化，而版本号未 bump，则自动 +1 并 stage syncConstants.js。
 * 无需开发者手动跑脚本。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseKeyArraysFromSource,
  serializeKeyArrays,
  parseSyncSchemaVersion
} from '../src/services/sync/syncSpecSource.js'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
  cwd: process.cwd()
}).trim()

const HELPERS = 'src/services/supabaseAdapter/helpers.js'
const CONSTANTS = 'src/constants/syncConstants.js'

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 2 * 1024 * 1024
  }).trim()
}

function tryGit(args) {
  try {
    return git(args)
  } catch {
    return null
  }
}

const helpersPath = join(root, HELPERS)
const constantsPath = join(root, CONSTANTS)

// 当前工作区字段（含未 stage 的改动——提交前修字段是常态）
const currentHelpers = readFileSync(helpersPath, 'utf8')
const currentConstants = readFileSync(constantsPath, 'utf8')
const currentKeys = serializeKeyArrays(parseKeyArraysFromSource(currentHelpers))
const currentVersion = parseSyncSchemaVersion(currentConstants)
if (currentVersion == null) {
  console.error('[sync-bump] 无法解析 SYNC_SCHEMA_VERSION')
  process.exit(1)
}

const lastBumpCommit = tryGit([
  'log', '-1',
  '-G', 'export const SYNC_SCHEMA_VERSION',
  '--format=%H',
  '--', CONSTANTS
])

if (!lastBumpCommit) {
  process.exit(0)
}

const oldConstants = tryGit(['show', `${lastBumpCommit}:${CONSTANTS}`])
const oldHelpers = tryGit(['show', `${lastBumpCommit}:${HELPERS}`])
if (oldConstants == null || oldHelpers == null) {
  process.exit(0)
}

const bumpedAt = parseSyncSchemaVersion(oldConstants)
const fieldsChanged = currentKeys !== serializeKeyArrays(parseKeyArraysFromSource(oldHelpers))

if (!fieldsChanged || currentVersion > bumpedAt) {
  process.exit(0)
}

// 需要 bump：改常量并纳入本次提交
const next = currentVersion + 1
let out = currentConstants.replace(
  /export const SYNC_SCHEMA_VERSION\s*=\s*\d+/,
  `export const SYNC_SCHEMA_VERSION = ${next}`
)
if (!out.includes(`// v${next}:`)) {
  // vN 注释可能跨多行，直接插在 export 行前
  out = out.replace(
    /export const SYNC_SCHEMA_VERSION/,
    `// v${next}: 同步字段变更（pre-commit 自动 bump）\nexport const SYNC_SCHEMA_VERSION`
  )
}
writeFileSync(constantsPath, out, 'utf8')
git(['add', CONSTANTS])
console.log(`[sync-bump] 检测到同步字段变更，SYNC_SCHEMA_VERSION ${currentVersion} → ${next}`)
