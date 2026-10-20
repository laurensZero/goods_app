// 迁移演练（只读）：在动云端数据之前，验证「迁移后的 ref 形态」能被运行时读层完整还原。
//
// 做的事：
//   1. 从云端读出当前行（旧形态：uri / cloudFileName / 公链 URL）
//   2. 用 ref.js 的迁移规则把行投影成「SQL 迁移后」的 ref 形态（含 .txt 归一化）
//   3. 用运行时真正使用的 normalize* 函数把 ref 形态读回来
//   4. 逐条对比「迁移前 vs 迁移后」指向的 Storage 对象是否一致，并对比孤儿回收的引用集合
//
// 判定：条目丢失 0、指向对象不一致 0、引用集合差集 0 → 迁移不会导致白图，也不会让孤儿回收误删。
// 不写云端、不写本地库。文件是否真实存在由 scripts/check-image-storage-state.mjs 负责。
//
// 用法:
//   npm run image:rehearsal
//   npm run image:rehearsal -- --html out.html   # 额外导出缩略图预览（用公链地址）
//
// 需要 vite-node（npm i -D vite-node）来解析 @/ 别名与 import.meta.env。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { migrateImageEntry, toRef } from '@/utils/image/ref'
import {
  normalizeEventCoverFields,
  normalizeEventPhotoList,
  normalizeGoodsImageList,
  parseCloudImageUri
} from '@/utils/goods/images'
import { collectReferencedImageState } from '@/utils/sync/shared'

const URL_BASES = [
  process.env.SUPABASE_BASE_URL,
  'https://cf.goodsapp.de5.net',
  'https://zvqzicimowfqshgjsrri.supabase.co',
  'https://api.goodsapp.de5.net'
].filter(Boolean)

function readServiceKey() {
  for (const rel of ['scripts/supabase-image-backup.sh', 'scripts/supabase-backup.sh']) {
    if (!existsSync(rel)) continue
    const match = readFileSync(rel, 'utf8').match(/SUPABASE_KEY='([^']+)'/)
    if (match) return match[1]
  }
  throw new Error('没找到 SUPABASE_KEY，请检查 scripts/supabase-image-backup.sh')
}

const KEY = readServiceKey()
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

let URL_BASE = ''
async function pickBase() {
  for (const base of URL_BASES) {
    try {
      const res = await fetch(`${base}/rest/v1/`, { headers, signal: AbortSignal.timeout(15000) })
      if ([200, 401, 404].includes(res.status)) {
        URL_BASE = base
        return
      }
    } catch {}
  }
  throw new Error('所有端点都连不上，检查网络/端点配置')
}

async function selectAll(path) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers })
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`)
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

async function listBucket(bucket, prefix = '') {
  const files = []
  let offset = 0
  for (;;) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset })
    })
    if (!res.ok) throw new Error(`list ${bucket}/${prefix} -> ${res.status} ${await res.text()}`)
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    for (const entry of page) {
      if (!entry?.name || entry.name === '.emptyFolderPlaceholder') continue
      if (entry.id === null || entry.id === undefined) files.push(...await listBucket(bucket, `${prefix}${entry.name}/`))
      else files.push({ name: entry.name, path: `${prefix}${entry.name}` })
    }
    if (page.length < 1000) break
    offset += 1000
  }
  return files
}

// ── 迁移规则投影（与 supabase-migration-image-refs.sql 对齐；差异由 ref.test.js 的夹具锁住）──────
// SQL 里 bare_cloud_name 会剥掉历史遗留的 .txt 别名，这里必须复刻，否则投影不忠实。
const bareCloudName = (name) => String(name || '').replace(/\.txt$/i, '')
const migrateEntry = (entry) => {
  const migrated = migrateImageEntry(entry)
  if (typeof migrated?.ref === 'string' && migrated.ref.startsWith('cloud:')) {
    migrated.ref = `cloud:${bareCloudName(migrated.ref.slice('cloud:'.length))}`
  }
  return migrated
}
const migrateTextValue = (value, cloudFileName = '') => {
  const ref = toRef({ uri: value || '', cloudFileName })
  if (!ref) return ''
  return ref.startsWith('cloud:') ? `cloud:${bareCloudName(ref.slice('cloud:'.length))}` : ref
}

// ── 显示身份：不同写法指向同一个 Storage 对象就算一致 ────────────────────────────────────────
// 例：公链 URL、cloud-image://name、cloud:name、name.txt → 都归一到 <bucket>/<name>
const BUCKET_BY_PREFIX = [
  ['event-photo__', 'event-photos'],
  ['profile-bg__', 'profile-backgrounds']
]
function displayIdentity(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'empty'
  const storageUrl = raw.match(/\/storage\/v1\/object\/public\/([^/]+)\/([^?#]+)/)
  if (storageUrl) {
    let path = storageUrl[2]
    try { path = decodeURIComponent(path) } catch {}
    const name = path.split('/').pop() || ''
    return `storage:${storageUrl[1]}/${name.replace(/\.txt$/i, '')}`
  }
  const cloudName = parseCloudImageUri(raw)
  if (cloudName) {
    const name = cloudName.replace(/\.txt$/i, '')
    const bucket = BUCKET_BY_PREFIX.find(([prefix]) => name.startsWith(prefix))?.[1] || 'goods-images'
    return `storage:${bucket}/${name}`
  }
  if (/^remote:/i.test(raw)) return `remote:${raw.slice('remote:'.length)}`
  // 迁移只给外链加前缀，指向的还是同一个 URL
  if (/^https?:\/\//i.test(raw)) return `remote:${raw}`
  return `raw:${raw}`
}

// ── 报告 ───────────────────────────────────────────────────────────────────────────────
const report = []
const gallery = []
let failures = 0

function checkDomain(label, beforeList, afterList, refBefore, refAfter) {
  const afterByKey = new Map(afterList.map((entry) => [entry.key, entry]))
  const dropped = []
  const mismatched = []

  for (const before of beforeList) {
    const after = afterByKey.get(before.key)
    if (!after) {
      dropped.push(before)
      continue
    }
    const beforeIdentity = displayIdentity(before.value)
    const afterIdentity = displayIdentity(after.value)
    if (beforeIdentity !== afterIdentity) {
      mismatched.push({ key: before.key, before: before.value, after: after.value, beforeIdentity, afterIdentity })
    }
  }

  const onlyBefore = [...refBefore].filter((name) => !refAfter.has(name))
  const onlyAfter = [...refAfter].filter((name) => !refBefore.has(name))
  const ok = dropped.length === 0 && mismatched.length === 0 && onlyBefore.length === 0 && onlyAfter.length === 0
  if (!ok) failures += 1

  report.push({
    label,
    entries: `${beforeList.length} → ${afterList.length}`,
    identity: mismatched.length,
    dropped: dropped.length,
    refs: `${refBefore.size} → ${refAfter.size}`,
    refDiff: onlyBefore.length + onlyAfter.length,
    ok
  })

  if (mismatched.length) {
    console.log(`\n  ⚠ ${label}: ${mismatched.length} 条指向的对象变了`)
    for (const item of mismatched.slice(0, 5)) {
      console.log(`    - ${item.key}\n      ${item.beforeIdentity}\n      → ${item.afterIdentity}`)
    }
  }
  if (dropped.length) {
    console.log(`\n  ⚠ ${label}: ${dropped.length} 条迁移后读不出来`)
    for (const item of dropped.slice(0, 5)) console.log(`    - ${item.key}: ${item.value}`)
  }
  if (onlyBefore.length || onlyAfter.length) {
    console.log(`\n  ⚠ ${label}: 孤儿回收引用集合变化（可能导致误删）`)
    for (const name of onlyBefore.slice(0, 5)) console.log(`    - 迁移后才丢失: ${name}`)
    for (const name of onlyAfter.slice(0, 5)) console.log(`    + 迁移后才出现: ${name}`)
  }
}

const normalizedRefs = (set) => new Set([...set].map((name) => String(name).replace(/\.txt$/i, '')))

async function main() {
  await pickBase()
  console.log(`端点: ${URL_BASE}\n`)

  // ── 谷子 ──
  {
    const rows = await selectAll('goods?select=id,images')
    const before = []
    const after = []
    const localBefore = []
    const localAfter = []
    for (const row of rows) {
      const rawImages = Array.isArray(row.images) ? row.images : []
      if (!rawImages.length) continue
      const normalizedBefore = normalizeGoodsImageList(rawImages)
      const normalizedAfter = normalizeGoodsImageList(rawImages.map(migrateEntry))
      for (const image of normalizedBefore) {
        before.push({ key: `${row.id}/${image.id}`, value: image.uri })
      }
      for (const image of normalizedAfter) {
        after.push({ key: `${row.id}/${image.id}`, value: image.uri })
      }
      localBefore.push({ id: row.id, images: rawImages })
      localAfter.push({ id: row.id, images: normalizedAfter })
    }
    checkDomain(
      '谷子图片',
      before,
      after,
      normalizedRefs(collectReferencedImageState({ goods: localBefore }).referencedFiles),
      normalizedRefs(collectReferencedImageState({ goods: localAfter }).referencedFiles)
    )
    for (const image of after) gallery.push({ domain: '谷子', key: image.key, value: image.value })
  }

  // ── 活动 ──
  {
    const rows = await selectAll('events?select=id,cover_image,cover_image_data,photos')
    const before = []
    const after = []
    const localBefore = []
    const localAfter = []
    for (const row of rows) {
      const coverBefore = normalizeEventCoverFields(row.cover_image, row.cover_image_data || {})
      const photosBefore = normalizeEventPhotoList(row.photos || [])

      const migratedCover = migrateTextValue(row.cover_image, row.cover_image_data?.cloudFileName)
      const coverAfter = normalizeEventCoverFields(migratedCover, migratedCover
        ? {
            mimeType: row.cover_image_data?.mimeType ?? undefined,
            fileSize: row.cover_image_data?.fileSize ?? undefined
          }
        : {})
      const photosAfter = normalizeEventPhotoList((row.photos || []).map(migrateEntry))

      const rawPhotos = Array.isArray(row.photos) ? row.photos : []
      for (const photo of photosBefore) {
        before.push({ key: `${row.id}/photo/${photo.id}`, value: photo.uri })
      }
      for (const photo of photosAfter) {
        after.push({ key: `${row.id}/photo/${photo.id}`, value: photo.uri })
      }
      if (coverBefore.coverImage) before.push({ key: `${row.id}/cover`, value: coverBefore.coverImage })
      if (coverAfter.coverImage) after.push({ key: `${row.id}/cover`, value: coverAfter.coverImage })

      localBefore.push({
        id: row.id,
        coverImage: row.cover_image,
        coverImageData: row.cover_image_data,
        photos: rawPhotos
      })
      localAfter.push({
        id: row.id,
        coverImage: coverAfter.coverImage,
        coverImageData: coverAfter.coverImageData,
        photos: photosAfter
      })
    }
    checkDomain(
      '活动封面/照片',
      before,
      after,
      normalizedRefs(collectReferencedImageState({ events: localBefore }).referencedFiles),
      normalizedRefs(collectReferencedImageState({ events: localAfter }).referencedFiles)
    )
    for (const image of after) gallery.push({ domain: '活动', key: image.key, value: image.value })
  }

  // ── 充值记录 ──
  {
    const rows = await selectAll('recharge_records?select=id,image')
    const before = []
    const after = []
    const localBefore = []
    const localAfter = []
    for (const row of rows) {
      if (!row.image) continue
      const migrated = migrateTextValue(row.image)
      before.push({ key: row.id, value: row.image })
      after.push({ key: row.id, value: migrated })
      localBefore.push({ id: row.id, image: row.image })
      localAfter.push({ id: row.id, image: migrated })
    }
    checkDomain(
      '充值图片',
      before,
      after,
      normalizedRefs(collectReferencedImageState({ recharge: localBefore }).referencedFiles),
      normalizedRefs(collectReferencedImageState({ recharge: localAfter }).referencedFiles)
    )
    for (const image of after) gallery.push({ domain: '充值', key: image.key, value: image.value })
  }

  // ── 批量草稿 ──
  {
    const rows = await selectAll('batch_drafts?select=slot,items')
    const before = []
    const after = []
    const localBefore = []
    const localAfter = []
    for (const row of rows) {
      const items = Array.isArray(row.items) ? row.items : []
      const migratedItems = items.map(migrateEntry)
      for (const item of items) before.push({ key: `${row.slot}/${item.id}`, value: item.imageUri || '' })
      for (const item of migratedItems) after.push({ key: `${row.slot}/${item.id}`, value: item.imageUri || item.ref || '' })
      localBefore.push({ id: row.slot, items })
      localAfter.push({ id: row.slot, items: migratedItems })
    }
    checkDomain(
      '草稿图片',
      before,
      after,
      normalizedRefs(collectReferencedImageState({ batchDrafts: localBefore }).referencedFiles),
      normalizedRefs(collectReferencedImageState({ batchDrafts: localAfter }).referencedFiles)
    )
  }

  // ── 汇总 ──
  console.table(report.map((row) => ({
    域: row.label,
    '条目(前→后)': row.entries,
    指向不一致: row.identity,
    迁移后丢失: row.dropped,
    '引用集(前→后)': row.refs,
    引用差集: row.refDiff,
    结论: row.ok ? 'OK' : '失败'
  })))

  if (failures > 0) {
    console.error(`\n演练失败：${failures} 个域存在差异，先别跑云端迁移。`)
    process.exitCode = 1
    return
  }
  console.log('\n演练通过：迁移前后指向同一批 Storage 对象，孤儿回收引用集合无变化。')
  console.log('下一步：确认所有设备都装了新版（会读 ref）再执行 SQL 迁移。')

  const htmlIndex = process.argv.indexOf('--html')
  if (htmlIndex >= 0 && process.argv[htmlIndex + 1]) {
    await writeGallery(process.argv[htmlIndex + 1])
  }
}

// 缩略图预览：用 Storage 列表反查真实对象路径，生成公链地址
async function writeGallery(outPath) {
  const BUCKETS = ['goods-images', 'event-photos', 'profile-backgrounds']
  const pathByName = new Map()
  for (const bucket of BUCKETS) {
    for (const file of await listBucket(bucket)) {
      pathByName.set(`${bucket}/${file.name.replace(/\.txt$/i, '')}`, file.path)
    }
  }

  const seen = new Set()
  const cards = []
  for (const item of gallery) {
    const identity = displayIdentity(item.value)
    const match = identity.match(/^storage:([^/]+)\/(.+)$/)
    let src = ''
    if (match) {
      const fullPath = pathByName.get(`${match[1]}/${match[2]}`)
      if (fullPath) src = `${URL_BASE}/storage/v1/object/public/${match[1]}/${fullPath}`
    } else if (/^https?:\/\//i.test(String(item.value))) {
      src = item.value
    }
    if (!src || seen.has(src)) continue
    seen.add(src)
    cards.push(`<figure><img loading="lazy" src="${src}" alt=""><figcaption>${item.domain} · ${item.key}</figcaption></figure>`)
  }

  const html = `<!doctype html><meta charset="utf-8"><title>迁移后图片预览</title>
<style>body{font:13px/1.5 system-ui;margin:24px;background:#111;color:#eee}h1{font-size:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
figure{margin:0;background:#1b1b1b;border-radius:8px;overflow:hidden}
img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#000}
figcaption{padding:6px;font-size:11px;color:#9a9a9a;word-break:break-all}</style>
<h1>迁移后图片预览（${cards.length} 张）—— 全部能显示才说明读层没问题</h1>
<div class="grid">${cards.join('')}</div>`
  writeFileSync(outPath, html)
  console.log(`\n缩略图预览已写入 ${outPath}（${cards.length} 张）`)
}

main().catch((error) => {
  console.error('\n演练出错：', error)
  process.exitCode = 1
})
