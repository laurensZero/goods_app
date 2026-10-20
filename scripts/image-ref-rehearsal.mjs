// 迁移演练（只读）：在动云端数据之前，验证「迁移后的 ref 形态」能被运行时读层完整还原。
//
// 做的事：
//   1. 从云端读出当前行（旧形态：uri / cloudFileName / 公链 URL）
//   2. 用 ref.js 的迁移规则把行投影成「SQL 迁移后」的 ref 形态（含 .txt 归一化）
//   3. 用运行时真正使用的 normalize* 函数把 ref 形态读回来
//   4. 逐条对比三件事：
//        · 指向的 Storage 对象是否还是同一个
//        · 迁移后会不会读不出来（条目丢失）
//        · 本地图片缓存键（也就是拉取后写进本地库的显示 URL）是否不变 → 旧缓存还能不能命中
//   5. 对比孤儿回收的引用集合有没有变化
//
// 判定：四列全 0 才算通过。不写云端、不写本地库。文件是否真实存在由
// scripts/check-image-storage-state.mjs 负责。
//
// 用法:
//   npm run image:rehearsal
//   npm run image:rehearsal -- --html out.html   # 额外导出缩略图预览（用公链地址）
//
// 需要 vite-node（devDependency）来解析 @/ 别名与 import.meta.env。

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

// ── Storage 索引：文件名 → 真实对象路径（含用户目录前缀）──────────────────────────────────
// 用来把"迁移后该显示成什么 URL"算实，而不是只做字符串推理。
const BUCKETS = ['goods-images', 'event-photos', 'profile-backgrounds']
const BUCKET_BY_PREFIX = [
  ['event-photo__', 'event-photos'],
  ['profile-bg__', 'profile-backgrounds']
]
const storageIndex = new Map()

function bucketFor(name) {
  return BUCKET_BY_PREFIX.find(([prefix]) => name.startsWith(prefix))?.[1] || 'goods-images'
}

async function loadStorageIndex() {
  for (const bucket of BUCKETS) {
    for (const file of await listBucket(bucket)) {
      storageIndex.set(`${bucket}/${bareCloudName(file.name)}`, file.path)
    }
  }
}

// 迁移/拉取后真正交给图片缓存的 URL（与 supabaseAdapter.getImagePublicUrl 等价）
function storageUrlFor(name) {
  const storageName = bareCloudName(name)
  const bucket = bucketFor(storageName)
  const fullPath = storageIndex.get(`${bucket}/${storageName}`)
  if (!fullPath) return `missing:${bucket}/${storageName}`
  return `${URL_BASE}/storage/v1/object/public/${bucket}/${fullPath}`
}

// 本地库里最终存下来的图片地址 = 图片缓存键。cloud 类先解析成公链，其余原样。
function localDisplayUrl(image) {
  const name = String(image?.cloudFileName || parseCloudImageUri(image?.uri) || '').trim()
  if (name) return storageUrlFor(name)
  const uri = String(image?.uri || '').trim()
  // remote: 在充值 store / 各 normalize 层都会被还原成裸 URL
  const remote = uri.match(/^remote:(.+)$/i)
  const value = remote ? remote[1].trim() : uri
  return /^https?:\/\//i.test(value) ? value : ''
}

function displayIdentity(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'empty'
  const storageUrl = raw.match(/\/storage\/v1\/object\/public\/([^/]+)\/([^?#]+)/)
  if (storageUrl) {
    let path = storageUrl[2]
    try { path = decodeURIComponent(path) } catch {}
    return `storage:${storageUrl[1]}/${bareCloudName(path.split('/').pop() || '')}`
  }
  const cloudName = parseCloudImageUri(raw)
  if (cloudName) {
    const name = bareCloudName(cloudName)
    return `storage:${bucketFor(name)}/${name}`
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
  const cacheChanged = []
  const hostRebased = []
  const unresolved = []

  for (const before of beforeList) {
    const after = afterByKey.get(before.key)
    if (!after) {
      dropped.push(before)
      continue
    }
    const beforeIdentity = displayIdentity(before.image?.uri)
    const afterIdentity = displayIdentity(after.image?.uri)
    const sameObject = beforeIdentity === afterIdentity
    if (!sameObject) {
      mismatched.push({ key: before.key, before: before.image?.uri, after: after.image?.uri, beforeIdentity, afterIdentity })
    }
    const beforeUrl = localDisplayUrl(before.image)
    const afterUrl = localDisplayUrl(after.image)
    if (beforeUrl && !afterUrl) {
      unresolved.push({ key: before.key, beforeUrl })
    } else if (beforeUrl && afterUrl && beforeUrl !== afterUrl) {
      // 同一个 Storage 对象、只是换了域名 → 一次性重新下载，不是坏图
      if (sameObject) hostRebased.push({ key: before.key, beforeUrl, afterUrl })
      else cacheChanged.push({ key: before.key, beforeUrl, afterUrl })
    }
  }

  const onlyBefore = [...refBefore].filter((name) => !refAfter.has(name))
  const onlyAfter = [...refAfter].filter((name) => !refBefore.has(name))
  const ok = dropped.length === 0
    && mismatched.length === 0
    && cacheChanged.length === 0
    && unresolved.length === 0
    && onlyBefore.length === 0
    && onlyAfter.length === 0
  if (!ok) failures += 1

  report.push({
    label,
    entries: `${beforeList.length} → ${afterList.length}`,
    identity: mismatched.length,
    dropped: dropped.length,
    cache: cacheChanged.length,
    rebased: hostRebased.length,
    refs: `${refBefore.size} → ${refAfter.size}`,
    refDiff: onlyBefore.length + onlyAfter.length,
    ok
  })

  if (cacheChanged.length) {
    console.log(`\n  ⚠ ${label}: ${cacheChanged.length} 条缓存键会变（旧缓存命中不了，需要重新下载）`)
    for (const item of cacheChanged.slice(0, 5)) {
      console.log(`    - ${item.key}\n      ${item.beforeUrl}\n      → ${item.afterUrl}`)
    }
  }
  if (unresolved.length) {
    console.log(`\n  ⚠ ${label}: ${unresolved.length} 条迁移后算不出显示地址（会白图）`)
    for (const item of unresolved.slice(0, 5)) console.log(`    - ${item.key}: ${item.beforeUrl}`)
  }
  if (mismatched.length) {
    console.log(`\n  ⚠ ${label}: ${mismatched.length} 条指向的对象变了`)
    for (const item of mismatched.slice(0, 5)) {
      console.log(`    - ${item.key}\n      ${item.beforeIdentity}\n      → ${item.afterIdentity}`)
    }
  }
  if (dropped.length) {
    console.log(`\n  ⚠ ${label}: ${dropped.length} 条迁移后读不出来`)
    for (const item of dropped.slice(0, 5)) console.log(`    - ${item.key}: ${item.image?.uri}`)
  }
  if (onlyBefore.length || onlyAfter.length) {
    console.log(`\n  ⚠ ${label}: 孤儿回收引用集合变化（可能导致误删）`)
    for (const name of onlyBefore.slice(0, 5)) console.log(`    - 迁移后才丢失: ${name}`)
    for (const name of onlyAfter.slice(0, 5)) console.log(`    + 迁移后才出现: ${name}`)
  }
}

const normalizedRefs = (set) => new Set([...set].map((name) => bareCloudName(name)))

async function main() {
  await pickBase()
  console.log(`端点: ${URL_BASE}`)
  await loadStorageIndex()
  console.log(`Storage 索引: ${storageIndex.size} 个文件\n`)

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
      for (const image of normalizedBefore) before.push({ key: `${row.id}/${image.id}`, image })
      for (const image of normalizedAfter) after.push({ key: `${row.id}/${image.id}`, image })
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
    for (const entry of after) gallery.push({ domain: '谷子', key: entry.key, image: entry.image })
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

      for (const photo of photosBefore) before.push({ key: `${row.id}/photo/${photo.id}`, image: photo })
      for (const photo of photosAfter) after.push({ key: `${row.id}/photo/${photo.id}`, image: photo })
      if (coverBefore.coverImage) {
        before.push({
          key: `${row.id}/cover`,
          image: { uri: coverBefore.coverImage, cloudFileName: coverBefore.coverImageData?.cloudFileName }
        })
      }
      if (coverAfter.coverImage) {
        after.push({
          key: `${row.id}/cover`,
          image: { uri: coverAfter.coverImage, cloudFileName: coverAfter.coverImageData?.cloudFileName }
        })
      }

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
    for (const entry of after) gallery.push({ domain: '活动', key: entry.key, image: entry.image })
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
      before.push({ key: row.id, image: { uri: row.image } })
      after.push({ key: row.id, image: { uri: migrated } })
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
    for (const entry of after) gallery.push({ domain: '充值', key: entry.key, image: entry.image })
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
      for (const item of items) {
        before.push({ key: `${row.slot}/${item.id}`, image: { uri: item.imageUri, cloudFileName: item.cloudFileName } })
      }
      for (const item of migratedItems) {
        after.push({
          key: `${row.slot}/${item.id}`,
          image: { uri: item.imageUri || item.ref, cloudFileName: item.cloudFileName }
        })
      }
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
    缓存键变化: row.cache,
    '换域名(需重下)': row.rebased,
    '引用集(前→后)': row.refs,
    引用差集: row.refDiff,
    结论: row.ok ? 'OK' : '失败'
  })))

  const rebasedTotal = report.reduce((sum, row) => sum + row.rebased, 0)
  if (rebasedTotal > 0) {
    console.log(`\n说明：${rebasedTotal} 条图片迁移后从旧直连域名切到当前数据面域名（同一个 Storage 对象，`)
    console.log('缓存键随之变化，会重新下载一次；图片不会白，也不会占双份空间（旧缓存按容量淘汰）。')
  }

  if (failures > 0) {
    console.error(`\n演练失败：${failures} 个域存在差异，先别跑云端迁移。`)
    process.exitCode = 1
    return
  }
  console.log('\n演练通过：指向同一批 Storage 对象、缓存键除换域名外不变、孤儿回收引用集合无变化。')
  console.log('下一步：确认所有设备都装了新版（会读 ref）再执行 SQL 迁移。')

  const htmlIndex = process.argv.indexOf('--html')
  if (htmlIndex >= 0 && process.argv[htmlIndex + 1]) {
    await writeGallery(process.argv[htmlIndex + 1])
  }
}

// 缩略图预览：直接把迁移后会显示的 URL 渲染出来，人眼过一遍
async function writeGallery(outPath) {
  const seen = new Set()
  const cards = []
  for (const item of gallery) {
    const src = localDisplayUrl(item.image)
    if (!src || src.startsWith('missing:') || seen.has(src)) continue
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
