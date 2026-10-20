// 图片仓库体检：对比「Storage 里实际存在的文件」与「云端数据库引用的文件名」。
// 只读（list + select），不删不改。用途：
//   1. 确认有没有还缺的文件（引用了但不在 Storage 里 = 被孤儿回收删掉了）
//   2. 找出「在 Storage 里但没人引用」的文件 —— 下一次同步的孤儿回收会删它们
//
// 用法:
//   node scripts/check-image-storage-state.mjs                 # 体检报告
//   node scripts/check-image-storage-state.mjs --json out.json # 同时导出两份文件名清单
//   node scripts/check-image-storage-state.mjs --restore DIR   # 把 DIR 里缺失的文件补回 Storage
//
// 凭据取自 scripts/supabase-image-backup.sh（本文件不含密钥）。恢复用的备份目录形如
// <备份根>/<bucket>/<path>，与该脚本的备份布局一致。

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const URL_BASES = [
  process.env.SUPABASE_BASE_URL,
  'https://cf.goodsapp.de5.net',
  'https://zvqzicimowfqshgjsrri.supabase.co',
  'https://api.goodsapp.de5.net'
].filter(Boolean)
const BUCKETS = ['goods-images', 'event-photos', 'profile-backgrounds']
const MANAGED_PREFIXES = ['goods-image__', 'event-cover__', 'event-photo__', 'recharge__', 'batch-draft-image__', 'profile-bg__']
const TABLE_COLUMNS = {
  goods: ['images'],
  events: ['cover_image', 'cover_image_data', 'photos'],
  recharge_records: ['image'],
  batch_drafts: ['items'],
  sync_presets: ['collection_profiles']
}

function readServiceKey() {
  const candidates = ['scripts/supabase-image-backup.sh', 'scripts/supabase-backup.sh']
  for (const rel of candidates) {
    if (!existsSync(rel)) continue
    const match = readFileSync(rel, 'utf8').match(/SUPABASE_KEY='([^']+)'/)
    if (match) return match[1]
  }
  throw new Error('没找到 SUPABASE_KEY，请检查 scripts/supabase-image-backup.sh')
}

const KEY = readServiceKey()
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// 直连 *.supabase.co 在部分网络下会被掐断（ECONNRESET），逐个探测，取第一个能应答的端点。
let URL_BASE = ''
async function pickBase() {
  for (const base of URL_BASES) {
    try {
      const res = await fetch(`${base}/rest/v1/`, { headers, signal: AbortSignal.timeout(15000) })
      if ([200, 401, 404].includes(res.status)) {
        URL_BASE = base
        console.log(`端点: ${base}`)
        return
      }
      console.log(`  ${base} -> HTTP ${res.status}，换下一个`)
    } catch (error) {
      console.log(`  ${base} -> 连不上（${error.cause?.code || error.message}），换下一个`)
    }
  }
  throw new Error('所有端点都连不上，检查网络/端点配置')
}

async function listBucket(bucket, prefix = '') {
  const files = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix, limit: 1000, offset })
    })
    if (!res.ok) throw new Error(`list ${bucket}/${prefix} 失败: ${res.status} ${await res.text()}`)
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    for (const entry of page) {
      if (!entry?.name || entry.name === '.emptyFolderPlaceholder') continue
      if (entry.id === null || entry.id === undefined) {
        files.push(...await listBucket(bucket, `${prefix}${entry.name}/`))
      } else {
        files.push({ path: `${prefix}${entry.name}`, name: entry.name, createdAt: entry.created_at || entry.createdAt || '' })
      }
    }
    if (page.length < 1000) break
    offset += 1000
  }
  return files
}

async function selectAll(table, columns) {
  const rows = []
  let offset = 0
  for (;;) {
    const url = `${URL_BASE}/rest/v1/${table}?select=${columns.join(',')}&limit=1000&offset=${offset}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) return { rows, skipped: true }
      throw new Error(`select ${table} 失败: ${res.status} ${await res.text()}`)
    }
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    rows.push(...page)
    if (page.length < 1000) break
    offset += 1000
  }
  return { rows, skipped: false }
}

/** 把任意字符串归约成裸文件名（与孤儿回收的比对口径一致：剥目录、剥 .txt）。 */
function toBareName(value) {
  let name = String(value || '').trim()
  if (!name) return ''
  const cloudImage = name.match(/^(?:cloud-image|gist-image):\/\/(.+)$/)
  if (cloudImage) name = cloudImage[1]
  const ref = name.match(/^(?:cloud|remote|local):(.+)$/)
  if (ref) name = ref[1]
  const storageUrl = name.match(/\/storage\/v1\/object\/public\/[^/]+\/([^?#]+)/)
  if (storageUrl) name = storageUrl[1]
  if (/^https?:\/\//i.test(name)) return ''
  name = name.split('/').pop() || ''
  if (name.endsWith('.txt')) name = name.slice(0, -4)
  return name
}

function collectFromValue(value, out) {
  if (typeof value === 'string') {
    const name = toBareName(value)
    if (name && MANAGED_PREFIXES.some((prefix) => name.startsWith(prefix))) out.add(name)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectFromValue(item, out)
  }
}

async function collectReferenced() {
  const referenced = new Set()
  const notes = []
  for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
    const { rows, skipped } = await selectAll(table, columns)
    if (skipped) {
      notes.push(`${table}: 读不到（可能没有该表/列）`)
      continue
    }
    for (const row of rows) {
      for (const column of columns) collectFromValue(row?.[column], referenced)
    }
    notes.push(`${table}: ${rows.length} 行`)
  }
  return { referenced, notes }
}

const REF_PREFIX_RE = /^(cloud|remote|local):/

/** 检查「迁移残留」：还有多少条目是 ref 形态 / 还是旧的 uri 形态 / 有没有被推成空数组。 */
async function checkFormatState() {
  const stats = { goodsRows: 0, goodsEmptyImages: 0, entries: 0, withRef: 0, withUri: 0, withCloudName: 0,
    eventCoverRef: 0, eventCoverName: 0, photoEntries: 0, photoWithRef: 0,
    rechargeRows: 0, rechargeRef: 0, draftEntries: 0, draftWithRef: 0, draftWithImageUri: 0 }

  const { rows: goodsRows } = await selectAll('goods', ['id', 'images'])
  for (const row of goodsRows) {
    stats.goodsRows++
    const images = Array.isArray(row?.images) ? row.images : []
    if (images.length === 0) stats.goodsEmptyImages++
    for (const entry of images) {
      if (!entry || typeof entry !== 'object') continue
      stats.entries++
      if (entry.ref || entry.editSourceRef) stats.withRef++
      if (entry.uri || entry.editSourceUri) stats.withUri++
      if (entry.cloudFileName || entry.editSourceCloudFileName) stats.withCloudName++
    }
  }

  const { rows: eventRows } = await selectAll('events', ['id', 'cover_image', 'cover_image_data', 'photos'])
  for (const row of eventRows) {
    if (REF_PREFIX_RE.test(String(row?.cover_image || ''))) stats.eventCoverRef++
    if (row?.cover_image_data?.cloudFileName) stats.eventCoverName++
    for (const photo of (Array.isArray(row?.photos) ? row.photos : [])) {
      stats.photoEntries++
      if (photo?.ref) stats.photoWithRef++
    }
  }

  const { rows: rechargeRows } = await selectAll('recharge_records', ['id', 'image'])
  for (const row of rechargeRows) {
    stats.rechargeRows++
    if (REF_PREFIX_RE.test(String(row?.image || ''))) stats.rechargeRef++
  }

  const { rows: draftRows } = await selectAll('batch_drafts', ['slot', 'items'])
  for (const row of draftRows) {
    for (const item of (Array.isArray(row?.items) ? row.items : [])) {
      stats.draftEntries++
      if (item?.ref) stats.draftWithRef++
      if (item?.imageUri) stats.draftWithImageUri++
    }
  }
  return stats
}

function walkLocal(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkLocal(full, out)
    else out.push(full)
  }
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : ''
  const restoreDir = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : ''

  await pickBase()

  console.log(`[1/3] 列举 Storage ...`)
  const storage = new Map()
  for (const bucket of BUCKETS) {
    const files = await listBucket(bucket)
    storage.set(bucket, files)
    console.log(`  ${bucket}: ${files.length} 个文件`)
  }

  console.log(`[2/3] 读取云端数据库 ...`)
  const { referenced, notes } = await collectReferenced()
  for (const note of notes) console.log(`  ${note}`)
  console.log(`  引用到的托管文件名: ${referenced.size}`)

  const fmt = await checkFormatState()
  console.log(`  格式状态（应为「旧格式」：ref 残留 0）:`)
  console.log(`    goods 行 ${fmt.goodsRows}，空 images ${fmt.goodsEmptyImages}；图片条目 ${fmt.entries}（ref ${fmt.withRef} / uri ${fmt.withUri} / cloudFileName ${fmt.withCloudName}）`)
  console.log(`    events cover_image 为 ref ${fmt.eventCoverRef}，cover_image_data.cloudFileName ${fmt.eventCoverName}；photos 条目 ${fmt.photoEntries}（ref ${fmt.photoWithRef}）`)
  console.log(`    recharge 行 ${fmt.rechargeRows}（image 为 ref ${fmt.rechargeRef}）；batch_drafts 条目 ${fmt.draftEntries}（ref ${fmt.draftWithRef} / imageUri ${fmt.draftWithImageUri}）`)

  const present = new Set()
  for (const files of storage.values()) {
    for (const file of files) present.add(file.name)
  }

  const missing = [...referenced].filter((name) => !present.has(name)).sort()
  const unreferenced = []
  for (const [bucket, files] of storage) {
    for (const file of files) {
      if (!MANAGED_PREFIXES.some((prefix) => file.name.startsWith(prefix))) continue
      if (referenced.has(file.name)) continue
      unreferenced.push({ bucket, name: file.name, path: file.path, createdAt: file.createdAt })
    }
  }

  console.log(`\n[3/3] 结论`)
  console.log(`  引用了但 Storage 里没有（= 被删掉、还没补回）：${missing.length}`)
  for (const name of missing.slice(0, 20)) console.log(`    - ${name}`)
  if (missing.length > 20) console.log(`    ... 还有 ${missing.length - 20} 个`)
  console.log(`  在 Storage 里但没人引用（= 下次同步会被孤儿回收删掉）：${unreferenced.length}`)
  for (const item of unreferenced.slice(0, 20)) console.log(`    - [${item.bucket}] ${item.path} (created ${item.createdAt})`)
  if (unreferenced.length > 20) console.log(`    ... 还有 ${unreferenced.length - 20} 个`)

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ missing, unreferenced, referenced: [...referenced] }, null, 2))
    console.log(`\n已导出: ${jsonOut}`)
  }

  if (restoreDir) {
    if (!existsSync(restoreDir)) throw new Error(`备份目录不存在: ${restoreDir}`)
    console.log(`\n[恢复] 从 ${restoreDir} 补回缺失文件 ...`)
    let uploaded = 0
    let skippedFiles = 0
    for (const bucket of BUCKETS) {
      const bucketDir = join(restoreDir, bucket)
      if (!existsSync(bucketDir)) {
        console.log(`  跳过 ${bucket}（备份里没有这个目录）`)
        continue
      }
      const localFiles = walkLocal(bucketDir)
      for (const localPath of localFiles) {
        const rel = relative(bucketDir, localPath).split(sep).join('/')
        const name = rel.split('/').pop()
        if (!MANAGED_PREFIXES.some((prefix) => name.startsWith(prefix))) continue
        if (present.has(name)) {
          skippedFiles++
          continue
        }
        const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${rel}`, {
          method: 'POST',
          headers: { ...headers, 'x-upsert': 'true' },
          body: readFileSync(localPath)
        })
        if (res.ok) {
          uploaded++
          console.log(`    [OK] ${bucket}/${rel}`)
        } else {
          console.log(`    [ERR ${res.status}] ${bucket}/${rel}: ${await res.text()}`)
        }
      }
    }
    console.log(`  补回 ${uploaded} 个；备份里已有对应文件而跳过 ${skippedFiles} 个`)
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
