// supabase/functions/storage-admin/index.ts
// 图片存储管理：管理台查看 Storage 占用、计算孤儿图、手动回收。
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
//   - 孤儿判定复刻客户端 collectSupabaseOrphanImageFiles 的安全护栏：
//     4 前缀过滤、跳过 .txt 别名、48h 宽限、单次上限 200。
//     但用「实体级引用集」做保守判定（文件名内嵌的实体 id 是否仍存在于 goods/events/recharge_records），
//     不会误删仍存在实体的文件；「单张图片从仍在的商品里移除」这类孤儿仍由客户端 per-user GC 兜底。
//
// 接口：
//   GET  /list      列出两桶对象数与占用字节（分桶）
//   POST /orphans   计算孤儿（dry-run，不删除）
//   POST /gc        回收孤儿（物理删除，48h + 200 上限）
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
const GRACE_MS = 48 * 60 * 60 * 1000 // 48h 宽限
const MAX_ORPHANS = 200 // 单次上限

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

// 计算孤儿（dry-run），返回孤儿对象列表
async function computeOrphans(
  objects: StorageObject[],
  entityIds: Set<string>,
  now: number,
): Promise<StorageObject[]> {
  const orphans: StorageObject[] = []
  for (const obj of objects) {
    if (orphans.length >= MAX_ORPHANS) break
    const name = basename(obj.name)
    if (name.endsWith(".txt")) continue // 别名占位
    if (!isImageFile(name)) continue
    if (isReferenced(name, entityIds)) continue
    const createdMs = obj.createdAt ? Date.parse(obj.createdAt) : NaN
    if (!Number.isFinite(createdMs) || now - createdMs < GRACE_MS) continue
    orphans.push(obj)
  }
  return orphans
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

    // 计算孤儿（dry-run）
    if (path === "orphans" && req.method === "POST") {
      const objects = await listAllObjects(client)
      const entityIds = new Set<string>()
      for (const table of ["goods", "events", "recharge_records"]) {
        for (const id of await fetchEntityIds(client, table)) entityIds.add(id)
      }
      const orphans = await computeOrphans(objects, entityIds, Date.now())
      return json({
        ok: true,
        count: orphans.length,
        bytes: orphans.reduce((s, o) => s + o.size, 0),
        samples: orphans.map((o) => ({
          name: basename(o.name),
          path: o.name,
          bucket: o.bucket,
          size: o.size,
          created_at: o.createdAt,
        })),
        truncated: orphans.length >= MAX_ORPHANS,
      })
    }

    // 回收孤儿（物理删除）
    if (path === "gc" && req.method === "POST") {
      const objects = await listAllObjects(client)
      const entityIds = new Set<string>()
      for (const table of ["goods", "events", "recharge_records"]) {
        for (const id of await fetchEntityIds(client, table)) entityIds.add(id)
      }
      const orphans = await computeOrphans(objects, entityIds, Date.now())

      let deleted = 0
      let deletedBytes = 0
      if (orphans.length) {
        const byBucket = new Map<string, string[]>()
        for (const o of orphans) {
          if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, [])
          byBucket.get(o.bucket)!.push(o.name)
        }
        for (const [bucket, paths] of byBucket) {
          const { error: err } = await client.storage.from(bucket).remove(paths)
          if (err) throw new Error(`删除 ${bucket} 孤儿失败：${err.message}`)
          for (const p of paths) {
            const obj = orphans.find((o) => o.name === p)
            if (obj) deletedBytes += obj.size
          }
          deleted += paths.length
        }
      }
      return json({ ok: true, deleted, bytes: deletedBytes, truncated: orphans.length >= MAX_ORPHANS })
    }

    return error("not_found", `未知接口: ${req.method} /${path}`, 404)
  } catch (e) {
    console.error("storage-admin:error", e)
    return error("server_error", e instanceof Error ? e.message : "内部错误", 500)
  }
})
