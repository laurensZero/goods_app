// 根据米游铺商品名与图片，为历史谷子回填 goods_id。
//
// 默认只预览不写库：POST {"dry_run": true, "limit": 100}
// 确认结果后写库：POST {"dry_run": false, "limit": 100}
// 鉴权：Authorization: Bearer <LEGACY_SERVICE_ROLE_KEY>
// 外部搜索（可选）：BING_SEARCH_API_KEY，或 GOOGLE_API_KEY + GOOGLE_CSE_ID

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MIHOYO_BASE = "https://api-mall.mihoyogift.com"
const SEARCH_PATH = "/common/homeishop/v1/search/search_goods_list"
const DETAIL_PATH = "/common/homeishop/v1/goods/get_goods_spu_detail"
const MIHOYO_IMAGE_MARKER = "act-webstatic.mihoyo.com/upload/"
const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 2000
const ROW_CONCURRENCY = 5
const DETAIL_CONCURRENCY = 5
const BING_SEARCH_API_KEY = Deno.env.get("BING_SEARCH_API_KEY") || ""
const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") || ""
const GOOGLE_CSE_ID = Deno.env.get("GOOGLE_CSE_ID") || ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const adminKey =
  Deno.env.get("LEGACY_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  ""

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || adminKey,
)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function authorized(req: Request): boolean {
  const value = req.headers.get("authorization") || ""
  const token = value.replace(/^Bearer\s+/i, "").trim()
  return Boolean(adminKey && token && token === adminKey)
}

function normalizeText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function canonicalImage(value: string): string {
  return value.trim().split(/[?#]/, 1)[0].replace(/\/+$/, "").toLowerCase()
}

function isMihoyoImage(value: string): boolean {
  return value.includes(MIHOYO_IMAGE_MARKER)
}

function collectMihoyoImages(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (isMihoyoImage(value)) result.add(canonicalImage(value))
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMihoyoImages(item, result)
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectMihoyoImages(item, result)
    }
  }
  return result
}

function rowImages(value: unknown): Set<string> {
  // images 通常是 JSONB 数组；同时兼容旧数据中保存的 JSON 字符串。
  if (typeof value === "string") {
    try {
      return collectMihoyoImages(JSON.parse(value))
    } catch {
      return collectMihoyoImages(value)
    }
  }
  return collectMihoyoImages(value)
}

function hasImageOverlap(row: Record<string, unknown>, detail: unknown): boolean {
  const saved = rowImages(row.images)
  if (!saved.size) return false
  const remote = collectMihoyoImages(detail)
  for (const image of saved) {
    if (remote.has(image)) return true
  }
  return false
}

async function mihoyoJson(path: string): Promise<Record<string, any>> {
  const response = await fetch(`${MIHOYO_BASE}${path}`, {
    headers: {
      Referer: "https://www.mihoyogift.com/",
      "x-rpc-language": "zh-cn",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`mihoyo_http_${response.status}`)
  const data = await response.json()
  if (Number(data?.retcode) !== 0) {
    throw new Error(`mihoyo_retcode_${data?.retcode || "unknown"}`)
  }
  return data
}

const searchCache = new Map<string, Array<Record<string, any>>>()
const detailCache = new Map<string, Record<string, any>>()

type WebCandidate = { goods_id: string; title: string; url: string; source: string }

function normalizeNameForCompare(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[【】\[\]（）()「」『』<>《》“”"'‘’]/g, "")
    .replace(/[：:，,。.!！？?、/\\|_—–-]/g, "")
    .replace(/米游铺|mihoyogift|原神官方/g, "")
}

function namesAreSimilar(left: unknown, right: unknown): boolean {
  const a = normalizeNameForCompare(left)
  const b = normalizeNameForCompare(right)
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)))
}

function extractGoodsIdFromMihoyoLink(value: unknown): string {
  try {
    const url = new URL(String(value || ""))
    const host = url.hostname.toLowerCase()
    if (host !== "mihoyogift.com" && !host.endsWith(".mihoyogift.com")) return ""
    const match = url.pathname.match(/^\/(?:m\/)?goods\/(\d+)\/?$/i)
    return match ? match[1] : ""
  } catch {
    return ""
  }
}

async function externalSearch(name: string): Promise<WebCandidate[]> {
  const query = `${name} 米游铺`
  const results: WebCandidate[] = []

  if (BING_SEARCH_API_KEY) {
    const url = new URL("https://api.bing.microsoft.com/v7.0/search")
    url.searchParams.set("q", query)
    url.searchParams.set("count", "10")
    url.searchParams.set("responseFilter", "Webpages")
    const response = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": BING_SEARCH_API_KEY },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) {
      const data = await response.json()
      for (const item of data?.webPages?.value || []) {
        const goodsId = extractGoodsIdFromMihoyoLink(item.url)
        if (goodsId) {
          results.push({ goods_id: goodsId, title: String(item.name || ""), url: String(item.url || ""), source: "bing" })
        }
      }
    }
  }

  if (GOOGLE_API_KEY && GOOGLE_CSE_ID) {
    const url = new URL("https://www.googleapis.com/customsearch/v1")
    url.searchParams.set("key", GOOGLE_API_KEY)
    url.searchParams.set("cx", GOOGLE_CSE_ID)
    url.searchParams.set("q", query)
    url.searchParams.set("num", "10")
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (response.ok) {
      const data = await response.json()
      for (const item of data?.items || []) {
        const goodsId = extractGoodsIdFromMihoyoLink(item.link)
        if (goodsId) {
          results.push({ goods_id: goodsId, title: String(item.title || ""), url: String(item.link || ""), source: "google" })
        }
      }
    }
  }

  return [...new Map(results.map((item) => [item.goods_id, item])).values()]
}

async function searchGoods(name: string): Promise<Array<Record<string, any>>> {
  const key = normalizeText(name)
  if (searchCache.has(key)) return searchCache.get(key) || []
  const query = new URLSearchParams({ name: key, limit: "20", page: "1" })
  const data = await mihoyoJson(`${SEARCH_PATH}?${query.toString()}`)
  const list = Array.isArray(data?.data?.list) ? data.data.list : []
  const unique = [...new Map(
    list
      .map((item: Record<string, any>) => ({
        ...item,
        goods_id: String(item.goods_id || item.goodsId || "").trim(),
      }))
      .filter((item: Record<string, any>) => item.goods_id)
      .map((item: Record<string, any>) => [item.goods_id, item]),
  ).values()]
  searchCache.set(key, unique)
  return unique
}

async function fetchDetail(goodsId: string): Promise<Record<string, any>> {
  if (detailCache.has(goodsId)) return detailCache.get(goodsId) || {}
  const data = await mihoyoJson(`${DETAIL_PATH}?goods_id=${encodeURIComponent(goodsId)}`)
  const detail = data?.data?.detail || data?.data?.goods?.detail || {}
  detailCache.set(goodsId, detail)
  return detail
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  async function runWorker() {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()))
  return results
}

type MatchResult = {
  id: string
  name: string
  status: "matched" | "unmatched" | "error"
  goods_id?: string
  reason?: string
  candidates?: string[]
}

async function resolveRow(row: Record<string, unknown>): Promise<MatchResult> {
  const id = String(row.id || "")
  const name = normalizeText(row.name)
  if (!name) return { id, name, status: "unmatched", reason: "empty_name" }

  let candidates: Array<Record<string, any>>
  try {
    candidates = await searchGoods(name)
  } catch (error) {
    return { id, name, status: "error", reason: error instanceof Error ? error.message : "search_failed" }
  }

  if (candidates.length === 1) {
    return { id, name, status: "matched", goods_id: candidates[0].goods_id }
  }
  if (!candidates.length) {
    return await resolveFromExternalSearch(row)
  }

  // 搜索结果不唯一时，逐个检查商品详情及其中所有嵌套图片（含 SKU 图片）。
  const candidateMatches = await mapWithConcurrency(candidates, DETAIL_CONCURRENCY, async (candidate) => {
    try {
      const detail = await fetchDetail(candidate.goods_id)
      return hasImageOverlap(row, detail) ? candidate.goods_id : ""
    } catch {
      // 单个详情失败不影响同一谷子的其他候选项。
      return ""
    }
  })
  const matched = candidateMatches.filter(Boolean)

  if (matched.length === 1) {
    return { id, name, status: "matched", goods_id: matched[0] }
  }

  const externalResult = await resolveFromExternalSearch(row)
  if (externalResult.status === "matched") return externalResult
  return {
    id,
    name,
    status: "unmatched",
    reason: matched.length ? "multiple_image_matches" : "no_image_match",
    candidates: candidates.map((item) => item.goods_id),
  }
}

async function resolveFromExternalSearch(row: Record<string, unknown>): Promise<MatchResult> {
  const id = String(row.id || "")
  const name = normalizeText(row.name)
  if (!BING_SEARCH_API_KEY && !(GOOGLE_API_KEY && GOOGLE_CSE_ID)) {
    return { id, name, status: "unmatched", reason: "external_search_not_configured" }
  }

  let webCandidates: WebCandidate[]
  try {
    webCandidates = await externalSearch(name)
  } catch (error) {
    return { id, name, status: "error", reason: error instanceof Error ? error.message : "external_search_failed" }
  }

  const candidateMatches = await mapWithConcurrency(webCandidates, DETAIL_CONCURRENCY, async (candidate) => {
    try {
      const detail = await fetchDetail(candidate.goods_id)
      const remoteName = detail?.name || detail?.goods_name || ""
      if (namesAreSimilar(name, remoteName) && hasImageOverlap(row, detail)) {
        return candidate.goods_id
      }
    } catch {
      // 单个外部候选详情失败时继续检查其他候选。
    }
    return ""
  })
  const matched = candidateMatches.filter(Boolean)

  if (matched.length === 1) {
    return { id, name, status: "matched", goods_id: matched[0] }
  }
  return {
    id,
    name,
    status: "unmatched",
    reason: matched.length ? "multiple_external_image_matches" : "external_no_name_image_match",
    candidates: webCandidates.map((item) => item.goods_id),
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
  if (!authorized(req)) return json({ error: "unauthorized" }, 401)

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body?.dry_run !== false
    const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    const cursor = normalizeText(body?.cursor)

    let query = supabase
      .from("goods")
      .select("id, name, images, goods_id")
      .or("goods_id.is.null,goods_id.eq.")
      .order("id", { ascending: true })
      .limit(limit * 3)
    if (cursor) query = query.gt("id", cursor)
    const { data: rows, error: selectError } = await query

    if (selectError) return json({ error: "select_failed", message: selectError.message }, 500)

    const candidates = (rows || [])
      // 双重保险：即使数据库过滤器对 NULL/空字符串的 OR 解析存在差异，
      // 已经有 goods_id 的记录也绝不参与匹配或更新。
      .filter((row: Record<string, unknown>) => !normalizeText(row.goods_id))
      .filter((row: Record<string, unknown>) => rowImages(row.images).size > 0)
      .slice(0, limit)

    const results = await mapWithConcurrency(
      candidates as Record<string, unknown>[],
      ROW_CONCURRENCY,
      resolveRow,
    )
    let updated = 0
    if (!dryRun) {
      for (const result of results) {
        if (result.status === "matched" && result.goods_id) {
          const { error } = await supabase
            .from("goods")
            .update({ goods_id: result.goods_id, updated_at: new Date().toISOString() })
            .eq("id", result.id)
            .or("goods_id.is.null,goods_id.eq.")
          if (error) {
            result.status = "error"
            result.reason = `update_failed:${error.message}`
          } else {
            updated++
          }
        }
      }
    }

    const pageSize = limit * 3
    const nextCursor = rows && rows.length >= pageSize
      ? String((candidates.length >= limit ? candidates[limit - 1] : rows[rows.length - 1]).id || "")
      : ""

    return json({
      dry_run: dryRun,
      scanned: candidates.length,
      matched: results.filter((item) => item.status === "matched").length,
      updated,
      unmatched: results.filter((item) => item.status === "unmatched"),
      errors: results.filter((item) => item.status === "error"),
      external_search: Boolean(BING_SEARCH_API_KEY || (GOOGLE_API_KEY && GOOGLE_CSE_ID)),
      next_cursor: nextCursor,
      note: nextCursor ? "还有符合条件的数据，请把 next_cursor 传入下一次调用。" : "",
    })
  } catch (error) {
    return json({ error: "backfill_failed", message: error instanceof Error ? error.message : String(error) }, 500)
  }
})
