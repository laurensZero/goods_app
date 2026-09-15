import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SYNC_SCHEMA_VERSION } from '@/constants/syncConstants'
import {
  parseKeyArraysFromSource,
  serializeKeyArrays,
  parseSyncSchemaVersion
} from '@/services/sync/syncSpecSource'
import { normalizeGoodsInput } from '@/stores/goods/goodsHelpers'
import { normalizeEvent } from '@/stores/events'
import {
  GOODS_BUSINESS_KEYS,
  EVENT_BUSINESS_KEYS,
  EVENT_JSON_KEYS
} from '@/services/supabaseAdapter/helpers'

/**
 * 改了同步字段却忘了 bump SYNC_SCHEMA_VERSION 时自动抓红。
 *
 * 原理：找到「上次改动 SYNC_SCHEMA_VERSION 的提交」，对比当时 helpers.js 的
 * 字段集与当前工作区字段集；字段变了但版本号仍等于那次提交的值 → 红。
 * 修复：`npm run sync:bump`（只把版本 +1，无指纹表要维护）。
 *
 * 无 git / 浅克隆拿不到历史时跳过 git 检查（仍保留 normalize 一致性测试）。
 */

const HELPERS_REL = 'src/services/supabaseAdapter/helpers.js'
const CONSTANTS_REL = 'src/constants/syncConstants.js'

function tryGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 2 * 1024 * 1024
    }).trim()
  } catch {
    return null
  }
}

function currentHelpersSource() {
  return readFileSync(join(process.cwd(), HELPERS_REL), 'utf8')
}

function keySnapshot(source) {
  return serializeKeyArrays(parseKeyArraysFromSource(source))
}

describe('SYNC_SCHEMA_VERSION 与同步字段联动', () => {
  it('字段相对上次版本 bump 无变更，或已 bump 版本', () => {
    const versionBumpCommit = tryGit([
      'log', '-1',
      '-G', 'export const SYNC_SCHEMA_VERSION',
      '--format=%H',
      '--', CONSTANTS_REL
    ])
    if (!versionBumpCommit) {
      expect(SYNC_SCHEMA_VERSION).toBeGreaterThan(0)
      return
    }

    const oldConstants = tryGit(['show', `${versionBumpCommit}:${CONSTANTS_REL}`])
    const oldHelpers = tryGit(['show', `${versionBumpCommit}:${HELPERS_REL}`])
    if (oldConstants == null || oldHelpers == null) {
      expect(SYNC_SCHEMA_VERSION).toBeGreaterThan(0)
      return
    }

    const bumpedAt = parseSyncSchemaVersion(oldConstants)
    const fieldsChanged = keySnapshot(currentHelpersSource()) !== keySnapshot(oldHelpers)

    if (!fieldsChanged) {
      expect(SYNC_SCHEMA_VERSION).toBeGreaterThanOrEqual(bumpedAt)
      return
    }

    if (SYNC_SCHEMA_VERSION <= bumpedAt) {
      throw new Error(
        '同步字段（BUSINESS_KEYS / EVENT_JSON_KEYS）相对上次 SYNC_SCHEMA_VERSION 变更已修改，\n' +
        `但 SYNC_SCHEMA_VERSION 仍为 ${SYNC_SCHEMA_VERSION}（上次 bump 时也是 ${bumpedAt}）。\n` +
        '旧客户端会丢弃新字段并越过水位线。修复：npm run sync:bump\n' +
        '并在 syncConstants.js 的 vN 注释或 commit message 里写清本次字段变更。'
      )
    }
    expect(SYNC_SCHEMA_VERSION).toBeGreaterThan(bumpedAt)
  })

  it('normalize 白名单与 BUSINESS_KEYS 键集合一致（顺序可不同）', () => {
    const goodsNormalizeKeys = Object.keys(normalizeGoodsInput({})).filter(
      (key) => !['coverImage', 'updatedAt', 'trashed'].includes(key)
    )
    const eventNormalizeKeys = Object.keys(normalizeEvent({})).filter(
      (key) => !['createdAt', 'updatedAt'].includes(key)
    )
    expect([...goodsNormalizeKeys].sort()).toEqual([...GOODS_BUSINESS_KEYS].sort())
    expect([...eventNormalizeKeys].sort()).toEqual([...EVENT_BUSINESS_KEYS].sort())
    for (const key of EVENT_JSON_KEYS) {
      expect(EVENT_BUSINESS_KEYS).toContain(key)
    }
  })
})

describe('收藏品待补邮/待补款复用 saleAt（normalize 语义）', () => {
  it('待补邮/待补款保留提醒字段，其它收藏态清空', () => {
    const kept = normalizeGoodsInput({
      id: 'g1',
      isWishlist: false,
      collectStatus: '待补邮',
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [60]
    })
    expect(kept.saleAt).toBe('2026-10-01T08:00')
    expect(kept.saleReminderEnabled).toBe(true)

    const cleared = normalizeGoodsInput({
      id: 'g2',
      isWishlist: false,
      collectStatus: '已拥有',
      saleAt: '2026-10-01T08:00',
      saleReminderEnabled: true,
      saleReminderOffsets: [60]
    })
    expect(cleared.saleAt).toBe('')
    expect(cleared.saleReminderEnabled).toBe(false)
    expect(cleared.saleReminderOffsets).toEqual([])
  })
})
