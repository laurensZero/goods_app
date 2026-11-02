// 一次性云端数据修复：把「数量不匹配的逐件状态时间线条目」归为整批。
//
// 背景：qty=1 的商品历史上可能带 unitIndex/unitIndexes 条目（如曾经的多件商品
// 改数量为 1 后残留，或 qty<2 时走了逐件签收路径），详情页会把时间线拆成
// 「整批 + 第 1 件」两段且编辑器无法修改归属。规则：
//   - quantity <= 1：所有逐件条目去掉归属（= 整批）
//   - quantity >= 2：归属里超出 [0, quantity-1] 的件剔除；全超界则去归属
//   - 归并后出现同 status+at+归属 的重复条目时合并为一条（保留首个非空 note）
// 修复行会 bump updated_at，让各设备按增量同步拉到修正。
//
// 用法：
//   node scripts/fix-orphan-unit-timeline.mjs            # dry-run，只打印报告
//   node scripts/fix-orphan-unit-timeline.mjs --apply    # 实际写回
//
// 凭据：SB_SERVICE_KEY 环境变量（service_role，绕过 RLS），项目 URL 写死同
// scripts/supabase-backup.sh。外网访问需挂代理时自行 export https_proxy。

const SUPABASE_URL = 'https://zvqzicimowfqshgjsrri.supabase.co'
const SERVICE_KEY = process.env.SB_SERVICE_KEY || ''
const APPLY = process.argv.includes('--apply')

if (!SERVICE_KEY) {
  console.error('缺少 SB_SERVICE_KEY 环境变量（service_role key）')
  process.exit(1)
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra
  }
}

async function fetchAllGoods() {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const url = `${SUPABASE_URL}/rest/v1/goods?select=id,quantity,status_timeline,updated_at&limit=${pageSize}&offset=${from}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) throw new Error(`拉取失败 HTTP ${res.status}: ${await res.text()}`)
    const rows = await res.json()
    all.push(...rows)
    if (rows.length < pageSize) return all
  }
}

function scopeOf(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (Array.isArray(entry.unitIndexes)) {
    const uniq = [...new Set(entry.unitIndexes.map(Number).filter((n) => Number.isInteger(n) && n >= 0))]
      .sort((a, b) => a - b)
    return uniq.length > 0 ? uniq : null
  }
  const unitIndex = Number(entry.unitIndex)
  if (Number.isInteger(unitIndex) && unitIndex >= 0) return [unitIndex]
  return null
}

function stripScope(entry) {
  const { unitIndex, unitIndexes, ...rest } = entry
  return rest
}

function repairTimeline(timeline, quantity) {
  const qty = Math.max(1, Number(quantity) || 1)
  const list = Array.isArray(timeline) ? timeline.filter((e) => e && typeof e === 'object') : []

  const folded = list.map((entry) => {
    const scope = scopeOf(entry)
    if (scope === null) return entry
    if (qty <= 1) return stripScope(entry)
    const inRange = scope.filter((u) => u < qty)
    if (inRange.length === scope.length) return entry
    if (inRange.length === 0) return stripScope(entry)
    return { ...stripScope(entry), unitIndexes: inRange }
  })

  // 同 status+at+归属 去重：保留首个非空 note
  /** @type {Map<string, object>} */
  const byKey = new Map()
  const result = []
  for (const entry of folded) {
    const key = JSON.stringify([entry.status || '', entry.at || '', scopeOf(entry), ''])
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      result.push(entry)
      continue
    }
    if (!existing.note && entry.note) existing.note = entry.note
  }
  return result
}

function timelineChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after)
}

const rows = await fetchAllGoods()
console.log(`云端 goods 共 ${rows.length} 行`)

const affected = []
for (const row of rows) {
  const fixed = repairTimeline(row.status_timeline, row.quantity)
  if (timelineChanged(row.status_timeline, fixed)) {
    affected.push({ ...row, fixed })
  }
}

console.log(`受影响 ${affected.length} 行：`)
for (const row of affected) {
  const beforeUnits = (row.status_timeline || []).filter((e) => scopeOf(e) !== null).length
  console.log(`  id=${row.id} qty=${row.quantity} 条目 ${row.status_timeline?.length ?? 0}→${row.fixed.length}（逐件 ${beforeUnits} 条）`)
  console.log(`    before: ${JSON.stringify(row.status_timeline)}`)
  console.log(`    after : ${JSON.stringify(row.fixed)}`)
}

if (!APPLY) {
  console.log('\ndry-run 完成，未写回。确认无误后加 --apply 执行。')
  process.exit(0)
}

const now = new Date().toISOString()
let patched = 0
for (const row of affected) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/goods?id=eq.${row.id}`,
    {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ status_timeline: row.fixed, updated_at: now })
    }
  )
  if (!res.ok) {
    console.error(`写入失败 id=${row.id} HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  patched++
}
console.log(`\n已修复 ${patched} 行（updated_at → ${now}）`)
