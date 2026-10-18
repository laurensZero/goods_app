// 把 __fixtures__/imageRefFixtures.js 的 case 写入 supabase/supabase-migration-image-refs.sql
// 的 fixture 块，保证「JS 的 toRef」与「SQL 的 pg_temp.image_ref」用同一份规格。
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

const SQL_REL = 'supabase/supabase-migration-image-refs.sql'
const target = join(process.cwd(), SQL_REL)
const source = readFileSync(target, 'utf8').replace(/\r\n/g, '\n')

const beginIndex = source.indexOf(SQL_FIXTURE_MARKERS.begin)
const endIndex = source.indexOf(SQL_FIXTURE_MARKERS.end)
if (beginIndex < 0 || endIndex < 0 || endIndex < beginIndex) {
  console.error(`${SQL_REL} 里找不到 fixture 标记（${SQL_FIXTURE_MARKERS.begin} / ${SQL_FIXTURE_MARKERS.end}）`)
  process.exit(1)
}

const next = [
  source.slice(0, beginIndex),
  buildSqlFixtureBlock(REF_FIXTURE_ENTRIES),
  source.slice(endIndex + SQL_FIXTURE_MARKERS.end.length)
].join('')

const drift = next !== source

if (process.argv.includes('--check')) {
  if (drift) {
    console.error(`fixture 块与 ${SQL_REL} 不一致：跑 node scripts/gen-image-ref-fixtures.mjs`)
    process.exit(1)
  }
  console.log(`fixture 块一致（${REF_FIXTURE_ENTRIES.length} 条）`)
  process.exit(0)
}

if (!drift) {
  console.log(`无变化（${REF_FIXTURE_ENTRIES.length} 条）`)
  process.exit(0)
}

writeFileSync(target, next)
console.log(`已更新 ${SQL_REL}（${REF_FIXTURE_ENTRIES.length} 条）`)
