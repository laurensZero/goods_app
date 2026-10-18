// supabase/functions/storage-admin/index.ts
// 图片存储管理：管理台查看 Storage 占用、计算可回收对象、手动回收。
//
// 鉴权：本函数 verify_jwt=false（config.toml），调用方必须携带
//       `Authorization: Bearer <serviceKey>`，且等于 LEGACY_SERVICE_ROLE_KEY
//       （或 SUPABASE_SERVICE_ROLE_KEY），与管理台 admin-login 下发的 serviceKey 一致。
//
// 实现要点：
//   - 对象列表通过 RPC `storage_admin_list()` 读取（storage schema 未暴露给 PostgREST，
//     不能直接 .schema('storage').from('objects')，会报 "Invalid schema: storage"）。
//   - 物理删除走 storage admin API（storage.from(bucket).remove），
//     不能用 SQL DELETE storage.objects（那只删元数据，会留物理残留）。
//   - 管理台是**手动全量回收**（与客户端同步内的自动回收不同）：
//       * 不做 48h 宽限期过滤——手动触发即视为管理员明确授权，且实体级引用校验
//         已保证「实体仍存在」的文件不会被删，不会误删正常数据。
//       * 不设单次回收数量上限——一次扫全量、一次清完（删除请求内部按批拆分，
//         避免单请求路径数过多）。
//   - 两类可回收对象：
//       1) 孤儿图：文件名内嵌的实体 id 在 goods / events / recharge_records 中都不存在
//          （保守判定，不会误删仍存在实体的文件）。用「实体级引用集」判定，
//          「单张图片从仍在的商品里移除」这类孤儿仍由客户端 per-user GC 兜底。
//       2) 重复图：同一桶同目录下存在去掉 `(n)` 后缀的基名文件、且大小一致的副本
//          （如 `xxx (1).jpg`），浏览器/手工上传重名时常见。大小不一致时可能是
//          不同图片，一律保留。
//
// 接口：
//   GET  /list      列出两桶对象数与占用字节（分桶）
//   POST /orphans   计算可回收对象（孤儿 + 重复图，dry-run，不删除）
//   POST /gc        全量回收（物理删除）
//
// 环境变量：SUPABASE_URL 由平台注入；LEGACY_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY 用于鉴权。

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

const BUCKETS = ["goods-images", "event-photos"]
const PREFIXES = ["goods-image__", "event-cover__", "event-photo__", "recharge-image__"]
// 响应里最多返回多少条样例行（只影响接口响应体积，不影响实际回收数量）
const MAX_SAMPLES = 200
// storage.remove() 单次路径数上限 1000，取 500 留余量；
// 分批只影响单请求体积，不影响「一次清完全部」的语义（中途超时可直接重试，删除幂等）
const DELETE_BATCH_SIZE = 500
// 重复图副本：`xxx (1).jpg` / `xxx(2).png` / `xxx (1)`（浏览器/手工上传重名常见）
const DUPLICATE_SUFFIX_RE = /^(.*?)\s*\((\d+)\)(\.[^./]+)?$/

const ADMIN_KEY =
  Deno.env.get("LEGACY_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  ""

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function error(code: string, message: string, status = 400): Response {
  return json({ error: code, message }, status)
}

function isAuthorized(req: Request): boolean {
  const header = req.headers.get("authorization") || ""
  const key = header.replace(/^Bearer\s+/i, "").trim()
  return ADMIN_KEY !== "" && key !== "" && key === ADMIN_KEY
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, ADMIN_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function sanitizeId(s: unknown): string {
  return (
    String(s ?? "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  )
}

// 取文件名（去目录前缀）
function basename(name: string): string {
  return name.split("/").pop() || name
}

function dirname(name: string): string {
  const base = basename(name)
  return name.slice(0, name.length - base.length)
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(0, i) : name
}

function isImageFile(name: string): boolean {
  return PREFIXES.some((p) => name.startsWith(p))
}

// 判断文件名内嵌的实体 id 是否仍存在（逐段重拼，兼容含 __ 的 id）
function isReferenced(name: string, entityIds: Set<string>): boolean {
  for (const prefix of PREFIXES) {
    if (!name.startsWith(prefix)) continue
    const rest = stripExt(name.slice(prefix.length))
    const segs = rest.split("__")
    let acc = ""
    for (const seg of segs) {
      acc = acc ? `${acc}__${seg}` : seg
      if (entityIds.has(acc)) return true
    }
    return false // 命中前缀但无实体 → 孤儿候选
  }
  return true // 非图片文件 → 视为被引用，跳过
}

interface StorageObject {
  name: string
  bucket: string
  size: number
  createdAt: string | null
}

interface CleanupCandidate extends StorageObject {
  reason: "orphan" | "duplicate"
}

function objectKey(bucket: string, name: string): string {
  return `${bucket}\u0000${name}`
}

// 分页读取两桶全部对象（经 RPC，含完整路径与大小）
async function listAllObjects(client: ReturnType<typeof createClient>): Promise<StorageObject[]> {
  const out: StorageObject[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: err } = await client.rpc("storage_admin_list", {
      p_offset: offset,
      p_limit: pageSize,
    })
    if (err) throw new Error(`读取存储对象失败：${err.message}`)
    const rows = (data || []) as Array<{
      bucket_id?: string
      name?: string
      size?: number | string
      created_at?: string | null
    }>
    for (const r of rows) {
      if (!r.name) continue
      out.push({
        name: r.name,
        bucket: r.bucket_id || "",
        size: Number(r.size) || 0,
        createdAt: r.created_at || null,
      })
    }
    if (rows.length < pageSize) break
  }
  return out
}

// 分页读取一张表全部 id（含 sanitize 后的别名）
async function fetchEntityIds(
  client: ReturnType<typeof createClient>,
  table: string,
): Promise<Set<string>> {
  const ids = new Set<string>()
  const pageSize = 1000
  for (let i = 0; ; i += pageSize) {
    const { data, error: err } = await client
      .from(table)
      .select("id")
      .range(i, i + pageSize - 1)
    if (err) throw new Error(`读取 ${table} 失败：${err.message}`)
    const rows = (data || []) as Array<{ id?: unknown }>
    for (const row of rows) {
      if (row.id == null) continue
      ids.add(String(row.id))
      ids.add(sanitizeId(row.id))
    }
    if (rows.length < pageSize) break
  }
  return ids
}

// 孤儿图：命中图片前缀、但文件名内嵌实体 id 已不存在（全量扫描，不看创建时间）
function collectOrphanObjects(
  objects: StorageObject[],
  entityIds: Set<string>,
): StorageObject[] {
  const orphans: StorageObject[] = []
  for (const obj of objects) {
    const name = basename(obj.name)
    if (name.endsWith(".txt")) continue // 别名占位
    if (!isImageFile(name)) continue
    if (isReferenced(name, entityIds)) continue
    orphans.push(obj)
  }
  return orphans
}

// 重复图：同桶同目录下存在去掉 `(n)` 后缀的基名文件，且大小一致 → 副本可删。
// 大小不一致（可能是重名但内容不同的图）或元数据缺失（size 0）一律保留，避免误删。
function collectDuplicateObjects(objects: StorageObject[]): StorageObject[] {
  const byPath = new Map<string, StorageObject>()
  for (const obj of objects) {
    const name = basename(obj.name)
    if (name.endsWith(".emptyFolderPlaceholder")) continue
    byPath.set(objectKey(obj.bucket, obj.name), obj)
  }

  const duplicates: StorageObject[] = []
  for (const obj of objects) {
    const name = basename(obj.name)
    if (name.endsWith(".txt")) continue // 别名占位
    if (name.endsWith(".emptyFolderPlaceholder")) continue
    const matched = DUPLICATE_SUFFIX_RE.exec(name)
    if (!matched) continue
    const [, base, , ext = ""] = matched
    if (!base) continue
    const baseObj = byPath.get(objectKey(obj.bucket, `${dirname(obj.name)}${base}${ext}`))
    if (!baseObj) continue // 基名文件已不在：可能是唯一副本，保留
    if (!(obj.size > 0) || obj.size !== baseObj.size) continue
    duplicates.push(obj)
  }
  return duplicates
}

// 全量可回收清单：先算孤儿，再从重复图里排除已计入孤儿的文件（避免重复统计/重复删除）
function buildCleanupPlan(
  objects: StorageObject[],
  entityIds: Set<string>,
): CleanupCandidate[] {
  const orphans = collectOrphanObjects(objects, entityIds)
  const orphanKeys = new Set(orphans.map((o) => objectKey(o.bucket, o.name)))
  const duplicates = collectDuplicateObjects(objects)
    .filter((o) => !orphanKeys.has(objectKey(o.bucket, o.name)))

  return [
    ...orphans.map((o) => ({ ...o, reason: "orphan" as const })),
    ...duplicates.map((o) => ({ ...o, reason: "duplicate" as const })),
  ]
}

function sumBytes(items: Array<{ size: number }>): number {
  return items.reduce((sum, item) => sum + item.size, 0)
}

async function loadEntityIds(client: ReturnType<typeof createClient>): Promise<Set<string>> {
  const entityIds = new Set<string>()
  for (const table of ["goods", "events", "recharge_records"]) {
    for (const id of await fetchEntityIds(client, table)) entityIds.add(id)
  }
  return entityIds
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const url = new URL(req.url)
  let path = url.pathname
  path = path.replace(/^\/functions\/v1\/[^/]+/, "")
  path = path.replace(/^\/storage-admin/, "")
  path = path.replace(/^\/+/, "")

  if (!isAuthorized(req)) {
    return error("unauthorized", "缺少有效管理凭据", 401)
  }

  try {
    const client = adminClient()

    // 存储占用（分桶）
    if (path === "list" && req.method === "GET") {
      const objects = await listAllObjects(client)
      const buckets = BUCKETS.map((b) => ({ bucket: b, objects: 0, bytes: 0 }))
      let totalObjects = 0
      let totalBytes = 0
      for (const o of objects) {
        totalObjects += 1
        totalBytes += o.size
        const idx = BUCKETS.indexOf(o.bucket)
        if (idx >= 0) {
          buckets[idx].objects += 1
          buckets[idx].bytes += o.size
        }
      }
      return json({ ok: true, total_objects: totalObjects, total_bytes: totalBytes, buckets })
    }

    // 计算可回收对象（dry-run，全量，不删除）
    if (path === "orphans" && req.method === "POST") {
      const objects = await listAllObjects(client)
      const plan = buildCleanupPlan(objects, await loadEntityIds(client))
      const orphans = plan.filter((c) => c.reason === "orphan")
      const duplicates = plan.filter((c) => c.reason === "duplicate")
      return json({
        ok: true,
        count: plan.length,
        bytes: sumBytes(plan),
        orphans: { count: orphans.length, bytes: sumBytes(orphans) },
        duplicates: { count: duplicates.length, bytes: sumBytes(duplicates) },
        samples: plan.slice(0, MAX_SAMPLES).map((o) => ({
          name: basename(o.name),
          path: o.name,
          bucket: o.bucket,
          size: o.size,
          created_at: o.createdAt,
          reason: o.reason,
        })),
        samples_truncated: plan.length > MAX_SAMPLES,
      })
    }

    // 全量回收（物理删除）
    if (path === "gc" && req.method === "POST") {
      const objects = await listAllObjects(client)
      const plan = buildCleanupPlan(objects, await loadEntityIds(client))

      let deleted = 0
      let deletedBytes = 0
      let orphansDeleted = 0
      let duplicatesDeleted = 0

      const byBucket = new Map<string, CleanupCandidate[]>()
      for (const item of plan) {
        if (!byBucket.has(item.bucket)) byBucket.set(item.bucket, [])
        byBucket.get(item.bucket)!.push(item)
      }

      for (const [bucket, items] of byBucket) {
        const metaByPath = new Map<string, CleanupCandidate>()
        for (const item of items) metaByPath.set(item.name, item)
        for (let i = 0; i < items.length; i += DELETE_BATCH_SIZE) {
          const batch = items.slice(i, i + DELETE_BATCH_SIZE)
          const paths = batch.map((item) => item.name)
          const { error: err } = await client.storage.from(bucket).remove(paths)
          if (err) throw new Error(`删除 ${bucket} 可回收对象失败：${err.message}`)
          for (const p of paths) {
            const meta = metaByPath.get(p)
            if (!meta) continue
            deletedBytes += meta.size
            if (meta.reason === "orphan") orphansDeleted += 1
            else duplicatesDeleted += 1
          }
          deleted += paths.length
        }
      }

      return json({
        ok: true,
        deleted,
        bytes: deletedBytes,
        orphans_deleted: orphansDeleted,
        duplicates_deleted: duplicatesDeleted,
      })
    }

    return error("not_found", `未知接口: ${req.method} /${path}`, 404)
  } catch (e) {
    console.error("storage-admin:error", e)
    return error("server_error", e instanceof Error ? e.message : "内部错误", 500)
  }
})
