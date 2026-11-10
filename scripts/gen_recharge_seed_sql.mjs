// 生成充值档位目录的 Supabase 建表 + 种子 SQL（可重复执行）。
//
// 用法：
//   node scripts/gen_recharge_seed_sql.mjs [输出路径]
// 缺省输出到 scripts/recharge_options_seed.sql，把内容粘贴到 Supabase SQL Editor 执行一次即可。
//
// 维护方式（之后不再需要跑本脚本）：
// - Dashboard 表编辑器里改 options：updated_at 由触发器自动置 now()，客户端增量同步能感知
// - 下线某个分组：把 deleted 置 true（同样会自动刷新 updated_at）
// - 新增游戏：插入一行 id='gameBiz::region'，label 填展示名，options 填档位数组即可，无需发版
// 数据来源：src/constants/recharge-options-distribution.json（仅作首次种子快照，App 已不再打包引用）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(thisDir, '..')
const sourcePath = path.join(workspaceRoot, 'src', 'constants', 'recharge-options-distribution.json')
const outputPath = process.argv[2] || path.join(thisDir, 'recharge_options_seed.sql')

const distribution = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlJsonb(value) {
  return `${sqlString(JSON.stringify(value))}::jsonb`
}

const lines = [
  '-- ============================================================',
  '-- 充值档位目录：recharge_options 表 + RLS + 种子数据',
  '-- 由 scripts/gen_recharge_seed_sql.mjs 生成，请勿手改',
  '-- 在 Supabase Dashboard SQL Editor 中执行（可重复执行）',
  '--',
  '-- 维护方式：',
  '-- - 改 options / 把 deleted 置 true 即可，updated_at 由触发器自动刷新',
  '-- - 新增游戏：插入 id=\'gameBiz::region\'、label=展示名、options=档位数组的行，无需发版',
  '-- - 客户端在打开添加对话框时（60s 节流）或点手动刷新后增量同步',
  '-- ============================================================',
  '',
  'create table if not exists public.recharge_options (',
  '  id text primary key,',
  '  game_biz text not null,',
  '  region text not null,',
  '  label text not null default \'\',',
  '  options jsonb not null default \'[]\'::jsonb,',
  '  deleted boolean not null default false,',
  '  updated_at timestamptz not null default now()',
  ');',
  '',
  '-- 兼容已建过表（没有 label 列）的环境',
  'alter table public.recharge_options',
  '  add column if not exists label text not null default \'\';',
  '',
  '-- 增量拉取按 updated_at 过滤',
  'create index if not exists recharge_options_updated_at_idx',
  '  on public.recharge_options (updated_at);',
  '',
  '-- 改行自动刷新 updated_at，避免 Dashboard 改完 options 忘记动时间，客户端增量拉不到',
  'create or replace function public.set_recharge_options_updated_at()',
  'returns trigger as $$',
  'begin',
  '  new.updated_at = now();',
  '  return new;',
  'end;',
  '$$ language plpgsql set search_path = public;',
  '',
  'drop trigger if exists trg_recharge_options_updated_at on public.recharge_options;',
  'create trigger trg_recharge_options_updated_at',
  '  before update on public.recharge_options',
  '  for each row execute function public.set_recharge_options_updated_at();',
  '',
  '-- 公开读：目录是全局公共数据，anon/authenticated 都可读；写入仅 service_role（Dashboard）',
  'alter table public.recharge_options enable row level security;',
  'drop policy if exists "recharge_options_public_read" on public.recharge_options;',
  'create policy "recharge_options_public_read" on public.recharge_options',
  '  for select using (true);',
  ''
]

lines.push('-- ------------------------------------------------------------', '-- 种子数据（按打包 JSON 初始化；重复执行时覆盖为 JSON 内容）', '-- ------------------------------------------------------------', '')

// 展示名跟着种子一起进库，新增游戏只要在 Dashboard 填 label 即可，不需要改客户端代码
const GAME_LABELS = {
  hk4e_cn: '原神',
  hkrpg_cn: '崩坏：星穹铁道',
  bh3_cn: '崩坏3',
  nap_cn: '绝区零'
}

let count = 0
for (const [id, entry] of Object.entries(distribution)) {
  const gameBiz = String(entry?.gameBiz || '').trim()
  const region = String(entry?.region || '').trim()
  const options = Array.isArray(entry?.options) ? entry.options : []
  if (!id || !gameBiz || options.length === 0) continue
  const label = GAME_LABELS[gameBiz] || ''

  lines.push(
    `insert into public.recharge_options (id, game_biz, region, label, options, deleted, updated_at)`,
    `values (${sqlString(id)}, ${sqlString(gameBiz)}, ${sqlString(region)}, ${sqlString(label)}, ${sqlJsonb(options)}, false, now())`,
    `on conflict (id) do update set`,
    `  game_biz = excluded.game_biz,`,
    `  region = excluded.region,`,
    `  label = excluded.label,`,
    `  options = excluded.options,`,
    `  deleted = excluded.deleted,`,
    `  updated_at = excluded.updated_at;`,
    ''
  )
  count += 1
}

lines.push(`-- 共 ${count} 个分组`, '')

fs.writeFileSync(outputPath, lines.join('\n'), 'utf8')
console.log(`已生成 ${count} 个分组的种子 SQL -> ${outputPath}`)
