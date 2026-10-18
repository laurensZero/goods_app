// 清理 Supabase Storage 中带 " (1)" 后缀的重复文件
//
// 安装:  npm i @supabase/supabase-js
// 预览:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node dedupe-storage.mjs <bucket> [前缀路径]
// 真删:  加 --delete
// 仅按文件名判断(不比对内容):加 --name-only
// 额外按内容(eTag)去重(同内容不同名):加 --by-etag
//
// 默认是 dry-run,只打印不删除。

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [bucket, rootPrefix = ""] = args.filter((a) => !a.startsWith("--"));

if (!bucket) {
  console.error("用法: node dedupe-storage.mjs <bucket> [前缀路径] [--delete] [--name-only] [--by-etag]");
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("请设置环境变量 SUPABASE_URL 和 SUPABASE_SERVICE_KEY(service_role key)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const store = supabase.storage.from(bucket);

// 递归列出所有文件
async function listAll(prefix = "") {
  const files = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await store.list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        files.push(...(await listAll(path))); // 文件夹
      } else {
        files.push({ path, name: item.name, meta: item.metadata ?? {}, created: item.created_at });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return files;
}

// 匹配 "xxx (1).jpg" / "xxx(2).png" / "xxx (1)"
const DUP_RE = /^(.*?)\s*\((\d+)\)(\.[^.]+)?$/;

const files = await listAll(rootPrefix.replace(/\/$/, ""));
console.log(`共扫描到 ${files.length} 个文件`);

const byPath = new Map(files.map((f) => [f.path, f]));
const toDelete = new Map(); // path -> 原因

// 1) 文件名带 (n) 的重复
for (const f of files) {
  const m = f.name.match(DUP_RE);
  if (!m) continue;
  const [, base, , ext = ""] = m;
  const dir = f.path.slice(0, f.path.length - f.name.length);
  const original = byPath.get(`${dir}${base}${ext}`);

  if (!original) continue; // 没有原文件,可能是唯一副本,保留

  if (flags.has("--name-only")) {
    toDelete.set(f.path, `原文件 ${original.name} 存在`);
    continue;
  }
  const sameEtag = f.meta.eTag && f.meta.eTag === original.meta.eTag;
  const sameSize = f.meta.size != null && f.meta.size === original.meta.size;
  if (sameEtag || sameSize) {
    toDelete.set(f.path, `与 ${original.name} 内容相同`);
  } else {
    console.log(`跳过(大小不同,可能是不同图片): ${f.path}`);
  }
}

// 2) 可选:按内容 eTag 去重,保留最早上传的一个
if (flags.has("--by-etag")) {
  const groups = new Map();
  for (const f of files) {
    const tag = f.meta.eTag;
    if (!tag) continue;
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(f);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(a.created) - new Date(b.created));
    const [keep, ...rest] = group;
    for (const f of rest) {
      if (!toDelete.has(f.path)) toDelete.set(f.path, `内容与 ${keep.path} 相同`);
    }
  }
}

console.log(`\n待删除 ${toDelete.size} 个文件:`);
for (const [p, why] of toDelete) console.log(`  ${p}   (${why})`);

if (!flags.has("--delete")) {
  console.log("\n这是预览(dry-run)。确认无误后加 --delete 执行。");
  process.exit(0);
}

const paths = [...toDelete.keys()];
for (let i = 0; i < paths.length; i += 100) {
  const batch = paths.slice(i, i + 100);
  const { error } = await store.remove(batch);
  if (error) {
    console.error("删除失败:", error);
    process.exit(1);
  }
  console.log(`已删除 ${i + batch.length}/${paths.length}`);
}
console.log("完成");
