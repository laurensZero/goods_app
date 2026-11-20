// supabase/functions/sync-mhy-decor/index.ts
// 头像挂件清单定时同步器：轮询米游社 / HoYoLAB 官方挂件列表 → 归一化 + 跨源去重 →
// upsert 到 mhy_decor_pendants → 补漏镜像 HoYoLAB 图到 Storage → 写同步状态表。
//
// 触发方式：
//   - config.toml schedule "30 1 * * *"（每天 UTC 01:30 = 北京 09:30，随 deploy 注册）
//   - 手动 GET /functions/v1/sync-mhy-decor（无鉴权，但无凭证时是空跑，无害）
//
// 依赖 secrets（按优先级，两个都配优先用 stoken；都没有就跳过该源）：
//   MIYOUSHE_STOKEN / HOYOLAB_STOKEN  长效凭证（stoken_v2 + mid [+ aid]），推荐。
//     格式：`stoken_v2=<v>; mid=<m>; aid=<uid>` —— 可直接把 scripts/mihoyo-get-stoken.mjs
//     产出的 stoken.txt 内容贴进来。stoken_v2 改密码/登出才失效，运行时换新鲜
//     cookie_token/ltoken，Cookie 过期问题就此消灭。
//   MIYOUSHE_COOKIE / HOYOLAB_COOKIE  直接登录 Cookie（短期，过期需人工换）。
//   更新方式：supabase secrets set MIYOUSHE_STOKEN='...' HOYOLAB_STOKEN='...'
//
// 设计要点（对齐 scripts/sync-mhy-decor.mjs，共用 _shared/mhy-decor-shared.js）：
//   - upsert payload 不含 enabled / mirror_url / thumb_url：不把后台手工下架的条目
//     重新启用，也不清掉已回填的镜像列。
//   - 跨源去重：米游社条目优先保留（阿里 OSS 快、支持实时缩放），HoYoLAB 重复条目
//     按 DEDUP_HY_TO_MS 静态映射 + 归一化名兜底丢弃；映射目标不存在时不丢 hy 行。
//   - 镜像补漏：Edge 里做不了缩略图（Deno 无图像库），只镜像原图（mirror_url），
//     thumb_url 由本地 scripts/mirror-mhy-decor.py 回填。按「hoyolab 且 mirror_url=''」
//     取 updated_at 最早的 40 张/轮，天然断点续跑。
//   - 每轮把源健康度写进 mhy_decor_sync_state（单行表），凭证失效一眼可见。
//   - 源里消失的条目不自动下架（enabled 不动），人工判断后台上架/下架。
//
// 依赖表：mhy_decor_pendants（清单）、mhy_decor_sync_state（健康度单行）
// 依赖 secrets：见上，service_role 平台注入

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// 归一化 / 去重 / IP 名映射唯一数据源（本地脚本与 Edge 共用，纯数据零外部依赖）
import {
  HOYOLAB_GAME_NAMES,
  KNOWN_GAMES,
  dedupeDecorItems,
  guessMiyousheGame,
  normDecorName,
  resolveHyDuplicate,
} from "../_shared/mhy-decor-shared.js";
// stoken → 新鲜 cookie 的续期链路（DS 签名 + 两端 passport API，见文件内说明）
import {
  buildHoyolabCookie,
  buildMiyousheCookie,
  parseStokenSecret,
  refreshHoyolabToken,
  refreshMiyousheToken,
} from "../_shared/mihoyo-token.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const MIYOUSHE_API = "https://bbs-api.miyoushe.com/pendant/wapi/getUserPendantList";
const MIYOUSHE_BACKPACK_API = "https://bbs-api.miyoushe.com/pendant/api/assets/getMyBackpackAssets";
const HOYOLAB_API = "https://bbs-api-os.hoyolab.com/community/pendant/wapi/pendant/list/v2";
const TABLE = "mhy_decor_pendants";
const BUBBLE_TABLE = "mhy_reply_bubbles";
const STATE_TABLE = "mhy_decor_sync_state";
const BUCKET = "mhy-decor";
const UPSERT_CHUNK = 150;
// 每轮最多镜像的张数：Edge Function 有执行时长限制，剩余留给下一轮
const MIRROR_BATCH = 40;

type PendantRow = {
  id: string;
  source: "miyoushe" | "hoyolab";
  game: string;
  name: string;
  description: string;
  url: string;
  animated: boolean;
  sort: number;
};

type SourceAuth = { cookie: string; mode: "stoken" | "cookie" } | null;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 去掉 OSS 处理参数，拿原图地址 */
function stripProcess(url: string): string {
  const raw = String(url || "").trim();
  const idx = raw.indexOf("?");
  return idx === -1 ? raw : raw.slice(0, idx);
}

/**
 * 按优先级解析某源的登录凭证：stoken（运行时换新鲜 cookie）> 直接 Cookie > null。
 * stoken 路径每轮现换，所以永远拿的是新鲜凭证；Cookie 路径过期只能人工换 secret。
 */
async function resolveSourceAuth(
  stokenSecret: string,
  cookieSecret: string,
  source: "miyoushe" | "hoyolab",
  errors: string[],
): Promise<SourceAuth> {
  const auth = parseStokenSecret(stokenSecret);
  if (auth) {
    try {
      if (source === "miyoushe") {
        const refreshed = await refreshMiyousheToken(auth);
        return { cookie: buildMiyousheCookie(auth, refreshed), mode: "stoken" };
      }
      const refreshed = await refreshHoyolabToken(auth);
      return { cookie: buildHoyolabCookie(auth, refreshed), mode: "stoken" };
    } catch (e) {
      errors.push(`${source} stoken 续期失败: ${e?.message || e}`);
      return null;
    }
  }
  if (cookieSecret) return { cookie: cookieSecret, mode: "cookie" };
  return null;
}

// ---------------- 米游社 ----------------

function mapMiyoushe(it: any): PendantRow | null {
  const url = stripProcess(it?.url);
  const name = String(it?.name || "").trim();
  if (!url || !name) return null;
  return {
    id: `ms:${it.id}`,
    source: "miyoushe",
    // 推不出归属先落「其他」，人工改表（描述关键词规则见 _shared）
    game: guessMiyousheGame(it) || "其他",
    name,
    description: String(it?.description || "").trim(),
    url,
    animated: false,
    sort: Number(it?.sort) || 0,
  };
}

async function fetchMiyoushe(cookie: string): Promise<PendantRow[]> {
  const res = await fetch(MIYOUSHE_API, {
    headers: { "User-Agent": UA, Referer: "https://www.miyoushe.com/", Cookie: cookie },
  });
  const body = await res.json();
  if (body?.retcode !== 0) {
    throw new Error(`miyoushe retcode=${body?.retcode} ${body?.message || ""}`);
  }
  const list = body?.data?.list || [];
  return list.map(mapMiyoushe).filter(Boolean) as PendantRow[];
}

// ---------------- HoYoLAB ----------------

function mapHoyolab(it: any): PendantRow | null {
  const url = stripProcess(it?.url || it?.dark_url);
  const name = String(it?.title || "").trim();
  if (!url || !name) return null;
  const rawGame = String(it?.game_name || "").trim();
  return {
    id: `hy:${it.id}`,
    source: "hoyolab",
    // 中文名直接透传；英文/默认系列查映射，再按名称关键词兜底猜
    game: KNOWN_GAMES.has(rawGame)
      ? rawGame
      : (HOYOLAB_GAME_NAMES[rawGame] || guessMiyousheGame({ name }) || "其他"),
    name,
    description: "",
    url,
    animated: it?.live === true,
    sort: Number(it?.sort) || 0,
  };
}

async function fetchHoyolab(cookie: string): Promise<PendantRow[]> {  const url = new URL(HOYOLAB_API);
  url.searchParams.set("type", "1");
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.hoyolab.com/",
      Origin: "https://www.hoyolab.com",
      Cookie: cookie,
      "x-rpc-language": "zh-cn",
      "x-rpc-client_type": "4",
      "x-rpc-app_version": "1.5.0",
    },
  });
  const body = await res.json();
  if (body?.retcode !== 0) {
    throw new Error(`hoyolab retcode=${body?.retcode} ${body?.message || ""}`);
  }
  const groups = body?.data?.list || [];
  const seen = new Set<string>();
  const out: PendantRow[] = [];
  for (const group of groups) {
    for (const it of group?.list || []) {
      if (seen.has(String(it?.id))) continue;
      seen.add(String(it?.id));
      const row = mapHoyolab(it);
      if (row) out.push(row);
    }
  }
  return out;
}

// ---------------- 评论装扮（reply_bubble）----------------

type BubbleRow = {
  id: string;
  source: "miyoushe";
  game: string;
  name: string;
  description: string;
  url: string;
  bg_color: string;
  gif_url: string;
  pag_url: string;
  animated: boolean;
  sort: number;
};

/**
 * 米游社装扮背包（App 级接口，必须 stoken 登录态——网页 Cookie 会 user not login）：
 * GET /pendant/api/assets/getMyBackpackAssets?assets_type=4
 *   assets_list = 已拥有，unowned_assets_list = 未拥有（合并 = 全量目录），
 *   resource.reply_bubble 自带 game_name（IP 分类官方直接给）。
 * assets_type=1 是头像挂件（237 条，与 getUserPendantList 重合且无 game 字段，不在这里同步）。
 */
async function fetchMiyousheBubbles(cookie: string): Promise<BubbleRow[]> {
  const res = await fetch(`${MIYOUSHE_BACKPACK_API}?assets_type=4`, {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.miyoushe.com/",
      Cookie: cookie,
      "x-rpc-app_id": "bll8iq97cem8",
      "x-rpc-client_type": "2",
    },
  });
  const body = await res.json();
  if (body?.retcode !== 0) {
    throw new Error(`backpack retcode=${body?.retcode} ${body?.message || ""}`);
  }
  const data = body?.data || {};
  const all = [...(data.assets_list || []), ...(data.unowned_assets_list || [])];
  const out: BubbleRow[] = [];
  for (const it of all) {
    const rb = it?.resource?.reply_bubble || {};
    const url = stripProcess(rb?.url || "");
    const name = String(it?.name || "").trim();
    if (!url || !name) continue;
    const gif = stripProcess(rb?.animation_effects_gif_url || "");
    const pag = stripProcess(rb?.animation_effects_pag_url || "");
    out.push({
      id: `msb:${it.assets_id}`,
      source: "miyoushe",
      game: String(rb?.game_name || "").trim() || "其他",
      name,
      description: String(it?.desc || "").trim(),
      url,
      bg_color: String(rb?.bg_color || "").trim(),
      gif_url: gif,
      pag_url: pag,
      animated: Boolean(gif || pag),
      sort: Number(it?.sort_order) || 0,
    });
  }
  return out;
}

// ---------------- 镜像补漏 ----------------

function guessExt(url: string): { ext: string; ctype: string } | null {
  const lower = stripProcess(url).toLowerCase();
  if (lower.endsWith(".webp")) return { ext: "webp", ctype: "image/webp" };
  if (lower.endsWith(".png")) return { ext: "png", ctype: "image/png" };
  if (lower.endsWith(".gif")) return { ext: "gif", ctype: "image/gif" };
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { ext: "jpg", ctype: "image/jpeg" };
  return null;
}

async function mirrorPending(admin: ReturnType<typeof createClient>, bucketUrl: string, serviceKey: string) {
  // 表里有但还没镜像的 hoyolab 行，updated_at 最早优先（每轮 40 张，下轮继续）
  const { data: pending, error } = await admin
    .from(TABLE)
    .select("id, url, mirror_url, updated_at")
    .eq("source", "hoyolab")
    .eq("enabled", true)
    // 空串和 NULL 都算「还没镜像」（本地脚本回填前是默认空串）
    .or('mirror_url.is.null,mirror_url.eq.""')
    .order("updated_at", { ascending: true })
    .limit(MIRROR_BATCH);
  if (error) throw new Error(`镜像待办查询失败: ${error.message}`);

  let mirrored = 0;
  const failed: string[] = [];
  for (const row of pending || []) {
    const kind = guessExt(row.url);
    if (!kind) {
      failed.push(`${row.id}: 识别不了扩展名`);
      continue;
    }
    try {
      const res = await fetch(stripProcess(row.url), {
        headers: { "User-Agent": UA, Referer: "https://www.hoyolab.com/" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // 桶上限 10MB，超限跳过（正常挂件原图 ≤5MB）
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error(`原图 ${bytes.byteLength}B 超桶上限`);
      const objectPath = `pendants/${String(row.id).replace(":", "_")}.${kind.ext}`;
      const up = await fetch(`${bucketUrl}/object/${BUCKET}/${objectPath}`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": kind.ctype,
          "x-upsert": "true",
        },
        body: bytes,
      });
      if (!up.ok) throw new Error(`storage ${up.status}: ${(await up.text()).slice(0, 120)}`);
      const mirrorUrl = `${bucketUrl}/public/${BUCKET}/${objectPath}`;
      const { error: patchErr } = await admin
        .from(TABLE)
        .update({ mirror_url: mirrorUrl, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (patchErr) throw new Error(patchErr.message);
      mirrored++;
    } catch (e) {
      failed.push(`${row.id}: ${e?.message || e}`);
    }
  }
  return { mirrored, failed, pending: (pending || []).length };
}

// ---------------- main ----------------

serve(async () => {
  const summary: Record<string, unknown> = {
    ms: 0,
    hy: 0,
    bubbles: 0,
    deduped: 0,
    content_deduped: 0,
    upserted: 0,
    mirrored: 0,
    mirror_failed: 0,
    mirror_pending: 0,
    auth: { miyoushe: "skipped", hoyolab: "skipped" },
    ms_ok: false,
    hy_ok: false,
    bubbles_ok: false,
    errors: [] as string[],
  };
  const errors = summary.errors as string[];

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // 1) 解析凭证（stoken 运行时换新鲜 cookie > 直接 Cookie > 跳过）
  const msAuth = await resolveSourceAuth(
    Deno.env.get("MIYOUSHE_STOKEN") || "",
    Deno.env.get("MIYOUSHE_COOKIE") || "",
    "miyoushe",
    errors,
  );
  const hyAuth = await resolveSourceAuth(
    Deno.env.get("HOYOLAB_STOKEN") || "",
    Deno.env.get("HOYOLAB_COOKIE") || "",
    "hoyolab",
    errors,
  );
  (summary.auth as Record<string, string>).miyoushe = msAuth?.mode ?? "skipped";
  (summary.auth as Record<string, string>).hoyolab = hyAuth?.mode ?? "skipped";

  // 2) 拉源
  let msRows: PendantRow[] = [];
  let hyRows: PendantRow[] = [];
  if (msAuth) {
    try {
      msRows = await fetchMiyoushe(msAuth.cookie);
      summary.ms = msRows.length;
      summary.ms_ok = true;
    } catch (e) {
      errors.push(`miyoushe: ${e?.message || e}`);
    }
  }
  if (hyAuth) {
    try {
      hyRows = await fetchHoyolab(hyAuth.cookie);
      summary.hy = hyRows.length;
      summary.hy_ok = true;
    } catch (e) {
      errors.push(`hoyolab: ${e?.message || e}`);
    }
  }

  // 3) 跨源去重（米游社优先）：静态映射 + 归一化名兜底，映射目标不存在时不丢 hy 行
  if (msRows.length) {
    const msIds = new Set(msRows.map((r) => r.id));
    const msIndex = new Map<string, string>();
    for (const row of msRows) {
      const norm = normDecorName(row.name);
      const key = `${norm}|${row.game}`;
      if (norm && !msIndex.has(key)) msIndex.set(key, row.id);
    }
    const before = hyRows.length;
    hyRows = hyRows.filter((row) => {
      const dup = resolveHyDuplicate(
        row.id,
        row.game, // mapHoyolab 已归一化成统一中文名，直接按名匹配
        row.name,
        (norm, game) => msIndex.get(`${norm}|${game}`) ?? null,
      );
      return !(dup && msIds.has(dup));
    });
    summary.deduped = before - hyRows.length;
  }

  // 4) upsert（不含 enabled / mirror_url / thumb_url，见文件头说明）
  //    先按图片内容键再压一遍：官方目录会重复收录同一张图（不同 id / 不同名字）
  const merged = [...msRows, ...hyRows];
  const items = dedupeDecorItems(merged);
  summary.content_deduped = merged.length - items.length;
  for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
    const chunk = items.slice(i, i + UPSERT_CHUNK).map((row) => ({
      ...row,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from(TABLE).upsert(chunk, { onConflict: "id" });
    if (error) {
      errors.push(`upsert batch ${i}: ${error.message}`);
      break;
    }
    summary.upserted += chunk.length;
  }

  // 4.5) 评论装扮目录（背包接口，stoken 模式才可用；网页 Cookie 会 user not login）
  let bubbleRows: BubbleRow[] = [];
  if (msAuth) {
    try {
      bubbleRows = await fetchMiyousheBubbles(msAuth.cookie);
      summary.bubbles = bubbleRows.length;
      summary.bubbles_ok = true;
    } catch (e) {
      errors.push(`bubbles: ${e?.message || e}`);
    }
  }
  for (let i = 0; i < bubbleRows.length; i += UPSERT_CHUNK) {
    const chunk = bubbleRows.slice(i, i + UPSERT_CHUNK).map((row) => ({
      ...row,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from(BUBBLE_TABLE).upsert(chunk, { onConflict: "id" });
    if (error) {
      errors.push(`bubble upsert batch ${i}: ${error.message}`);
      break;
    }
  }

  // 5) 镜像补漏（原列表数据即使 upsert 失败也不阻塞镜像补漏）
  try {
    const bucketUrl = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1`;
    const mirror = await mirrorPending(admin, bucketUrl, serviceKey);
    summary.mirrored = mirror.mirrored;
    summary.mirror_pending = mirror.pending;
    summary.mirror_failed = mirror.failed.length;
    for (const f of mirror.failed.slice(0, 10)) errors.push(`mirror ${f}`);
  } catch (e) {
    errors.push(`mirror: ${e?.message || e}`);
  }

  // 6) 写同步健康度（单行 upsert；诊断凭证失效不用翻日志）
  try {
    const now = new Date().toISOString();
    await admin.from(STATE_TABLE).upsert({
      id: "default",
      last_run_at: now,
      ms_ok: summary.ms_ok,
      hy_ok: summary.hy_ok,
      bubbles_ok: summary.bubbles_ok,
      ms_auth_mode: (summary.auth as Record<string, string>).miyoushe,
      hy_auth_mode: (summary.auth as Record<string, string>).hoyolab,
      ms_last_ok_at: summary.ms_ok ? now : undefined,
      hy_last_ok_at: summary.hy_ok ? now : undefined,
      bubbles_last_ok_at: summary.bubbles_ok ? now : undefined,
      last_error: errors.slice(0, 5).join(" | ").slice(0, 900),
      updated_at: now,
    }, { onConflict: "id" });
  } catch (e) {
    errors.push(`sync state 写入失败: ${e?.message || e}`);
  }

  return json(summary);
});
