#!/usr/bin/env node
/**
 * 安装 git hooks（目前仅 pre-commit：同步字段变更时自动 bump SYNC_SCHEMA_VERSION）。
 * `npm install` / `npm run prepare` 时执行。
 */
import { chmodSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hooksDir = join(root, '.git', 'hooks')
if (!existsSync(hooksDir)) {
  // 非 git 工作区（打包/CI 镜像）静默跳过
  process.exit(0)
}

const hookPath = join(hooksDir, 'pre-commit')
const hookBody = `#!/bin/sh
# goods-app: 同步字段变更时自动 bump SYNC_SCHEMA_VERSION
node "$(git rev-parse --show-toplevel)/scripts/auto-bump-sync-on-commit.mjs"
`

// 已有自定义 pre-commit 时追加而非覆盖
let existing = ''
if (existsSync(hookPath)) {
  existing = readFileSync(hookPath, 'utf8')
  if (existing.includes('auto-bump-sync-on-commit.mjs')) {
    process.exit(0)
  }
  writeFileSync(hookPath, `${existing.trimEnd()}\n\n${hookBody}`, 'utf8')
} else {
  mkdirSync(hooksDir, { recursive: true })
  writeFileSync(hookPath, hookBody, 'utf8')
}
chmodSync(hookPath, 0o755)
console.log('[git] pre-commit 已安装：同步字段变更会自动 bump SYNC_SCHEMA_VERSION')
