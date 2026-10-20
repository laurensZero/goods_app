// 把 __fixtures__/imageRefFixtures.js 的 case 写入
// supabase/supabase-migration-image-refs.sql 与 ...-dryrun.sql 的 fixture 块，
// 保证「JS 的 toRef」与「SQL 的 pg_temp.image_ref」用同一份规格。
//
// 用法：
//   node scripts/gen-image-ref-fixtures.mjs          重新生成
//   node scripts/gen-image-ref-fixtures.mjs --check  只校验（不一致则退出码 1）
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REF_FIXTURE_ENTRIES,
  SQL_FIXTURE_MARKERS,
  buildSqlFixtureBlock
} from '../src/utils/image/__fixtures__/imageRefFixtures.js'

// 干跑脚本必须和正式迁移用同一份 fixture，否则"干跑通过、迁移出错"
const SQL_RELS = [
  'supabase/supabase-migration-image-refs.sql',
  'supabase/supabase-migration-image-refs-dryrun.sql'
]

const checkOnly = process.argv.includes('--check')
let drift = false

for (const rel of SQL_RELS) {
  const target = join(process.cwd(), rel)
  const source = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')

  const beginIndex = source.indexOf(SQL_FIXTURE_MARKERS.begin)
  const endIndex = source.indexOf(SQL_FIXTURE_MARKERS.end)
  if (beginIndex < 0 || endIndex < 0 || endIndex < beginIndex) {
    console.error(`${rel} 里找不到 fixture 标记（${SQL_FIXTURE_MARKERS.begin} / ${SQL_FIXTURE_MARKERS.end}）`)
    process.exit(1)
  }

  const next = [
    source.slice(0, beginIndex),
    buildSqlFixtureBlock(REF_FIXTURE_ENTRIES),
    source.slice(endIndex + SQL_FIXTURE_MARKERS.end.length)
  ].join('')

  if (next === source) {
    console.log(`${rel}: 无变化（${REF_FIXTURE_ENTRIES.length} 条）`)
    continue
  }

  drift = true
  if (checkOnly) {
    console.error(`${rel}: fixture 块不一致，跑 node scripts/gen-image-ref-fixtures.mjs`)
    continue
  }

  writeFileSync(target, next)
  console.log(`${rel}: 已更新（${REF_FIXTURE_ENTRIES.length} 条）`)
}

if (checkOnly && drift) process.exit(1)
if (checkOnly) console.log(`fixture 块一致（${REF_FIXTURE_ENTRIES.length} 条）`)
