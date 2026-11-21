# -*- coding: utf-8 -*-
"""
米游社/HoYoLAB 装扮镜像脚本（头像挂件 + 评论气泡）
==================================================

把云端装扮表（mhy_decor_pendants / mhy_reply_bubbles）里 enabled=true 且
mirror_url 为空的行：下载原图到本地缓存 .decor-cache/ → 生成 128px 静态 webp
缩略图（动图取首帧，保留 alpha）→ 上传 Supabase Storage（桶 mhy-decor，
子路径 pendants/ 与 bubbles/）→ 回填 mirror_url / thumb_url。

背景：HoYoLAB 挂件图在海外 CDN（fastcdn.hoyoverse.com 等），国内加载慢，
所以要镜像；米游社条目走阿里 OSS（bbs-static.miyoushe.com），国内直连快且是
全分辨率原图，客户端直接取去参原图，不需要镜像。
评论气泡（mhy_reply_bubbles）只来自米游社，动图另有 gif_url 需要单独镜像
（客户端 animated 时直接用 gif 镜像地址）。

用法：
  export SUPABASE_SERVICE_ROLE_KEY='...'
  python scripts/mirror-mhy-decor.py                 # 两张表全量
  python scripts/mirror-mhy-decor.py --kind pendant  # 只挂件
  python scripts/mirror-mhy-decor.py --kind bubble   # 只气泡
  python scripts/mirror-mhy-decor.py --limit 20      # 前 20 条待办
  python scripts/mirror-mhy-decor.py --id hy:2067    # 单条调试（按表匹配）
  python scripts/mirror-mhy-decor.py --force         # 已回填的也重传

幂等 / 断点续跑：
  - mirror_url 和 thumb_url 都已存在的行直接跳过，中断后重跑自动续。
  - 原图缓存到 .decor-cache/（已 gitignore），命中缓存不重复下载。
  - 下载失败重试 2 次；单行失败只计数不中断，跑完打印统计。

Storage 路径：
  pendants/<id 冒号换下划线><实际类型 ext>      挂件原图
  pendants/<id>_thumb.webp                     挂件 128px 静态缩略图
  bubbles/<id><ext>                            气泡静态底图
  bubbles/<id>_anim.<gif|webp|png>             气泡动图（gif_url 有值时）
  bubbles/<id>_thumb.webp                      气泡 128px 静态缩略图
回填的 URL 用 https://api.goodsapp.de5.net（App 的 Supabase 客户端就配置这个域名，
见 src/config/supabase.js），客户端无需额外配置。
"""
import argparse
import io
import json
import os
import sys
import time

import requests
from PIL import Image

TABLE_PENDANT = "mhy_decor_pendants"
TABLE_BUBBLE = "mhy_reply_bubbles"
BUCKET = "mhy-decor"
DEFAULT_BASE = "https://api.goodsapp.de5.net"
THUMB_SIZE = 128
THUMB_MAX_BYTES = 15 * 1024        # 缩略图目标 <15KB，超了就降 quality 重存
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 桶限制 ≤10MB
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")
DOWNLOAD_HEADERS = {"User-Agent": UA}

# 魔数 → (扩展名, Content-Type)。桶只收 png/webp/gif/jpeg，其他类型判为失败。
MAGIC = [
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"GIF87a", "gif", "image/gif"),
    (b"GIF89a", "gif", "image/gif"),
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
]
WEBP_MAGIC = b"RIFF"
CONTENT_TYPES = {"png": "image/png", "gif": "image/gif", "jpg": "image/jpeg", "webp": "image/webp"}


def sniff_type(data):
    """按文件实际字节判断类型，返回 (ext, content_type)；识别不了返回 None"""
    for magic, ext, ctype in MAGIC:
        if data.startswith(magic):
            return ext, ctype
    if len(data) > 12 and data[:4] == WEBP_MAGIC and data[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


def sniff_ext(data):
    kind = sniff_type(data)
    return kind[0] if kind else None


def strip_process(url):
    """去掉 ?x-oss-process=... 之类的缩放参数，拿原图地址"""
    raw = str(url or "").strip()
    idx = raw.find("?")
    return raw if idx == -1 else raw[:idx]


def make_session():
    s = requests.Session()
    # 米哈游 CDN 与本反代域名都要求直连（挂代理反而 TLS 失败），忽略环境里的代理变量
    s.trust_env = False
    s.headers.update({"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    return s


def log(msg):
    # Windows GBK 控制台打不出 ✓/✗ 等字符，统一转 utf-8 + 替换不可编码字符
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(str(msg).encode("gbk", errors="replace").decode("gbk"), flush=True)


def retry_request(session, method, url, tries=3, **kwargs):
    """反代域名偶发读超时，统一重试兜底（指数退避）"""
    last_err = None
    for attempt in range(tries):
        try:
            resp = session.request(method, url, timeout=(10, 60), **kwargs)
            # 5xx 也重试一次
            if resp.status_code >= 500 and attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            return resp
        except requests.RequestException as e:
            last_err = e
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
    raise last_err  # type: ignore[misc]


# ---------------- 云端表 ----------------

def fetch_rows(session, table, select_fields, extra_filters=None):
    """分页拉 enabled=true 的行（Range 头分页）"""
    rows = []
    start = 0
    while True:
        end = start + 999
        params = {"enabled": "eq.true", "select": select_fields, "order": "id.asc"}
        if extra_filters:
            params.update(extra_filters)
        r = retry_request(
            session, "GET",
            f"{BASE}/rest/v1/{table}",
            params=params,
            headers={"Range": f"{start}-{end}"},
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        # content-range 可能是 `*/351`（没带 count=exact 时总数是 *），按批长判断是否拉完
        content_range = r.headers.get("content-range", "")
        tail = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
        total = int(tail) if tail.isdigit() else None
        if len(batch) < end - start + 1 or (total is not None and end + 1 >= total):
            break
        start = end + 1
    return rows


def patch_row(session, table, row_id, fields):
    r = retry_request(
        session, "PATCH",
        f"{BASE}/rest/v1/{table}",
        params={"id": f"eq.{row_id}"},
        json={**fields, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
    )
    r.raise_for_status()


# ---------------- 下载 / 缩略图 / 上传 ----------------

def download(session, url, cache_path, retries=2):
    """原图下载到缓存目录，失败重试；返回 bytes"""
    if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
        with open(cache_path, "rb") as f:
            return f.read()
    last_err = None
    for attempt in range(retries + 1):
        try:
            r = session.get(url, headers=DOWNLOAD_HEADERS, timeout=(10, 60))
            r.raise_for_status()
            data = r.content
            if not data:
                raise RuntimeError("空响应")
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            with open(cache_path, "wb") as f:
                f.write(data)
            return data
        except Exception as e:  # noqa: BLE001 单张失败不能中断整体
            last_err = e
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"下载失败(已重试{retries}次): {last_err}")


def make_thumb(data):
    """
    128px 静态 webp 缩略图。
    - 动图取首帧（PIL 会停在最后一帧，必须 seek(0)）
    - 保持 RGBA 透明底（挂件圆环/气泡贴白底会有白角），LANCZOS 缩放
    - quality 从 85 往下降直到 <15KB（128px 通常 3~8KB，一次到位居多）
    """
    im = Image.open(io.BytesIO(data))
    im.seek(0)  # 动图取首帧
    im = im.convert("RGBA")
    im.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
    for quality in (85, 70, 55):
        buf = io.BytesIO()
        im.save(buf, format="WEBP", quality=quality, method=6)
        if buf.tell() <= THUMB_MAX_BYTES:
            return buf.getvalue()
    return buf.getvalue()


def upload_object(session, path, data, content_type):
    """上传到 Storage（x-upsert 允许重复上传覆盖），失败抛异常"""
    r = retry_request(
        session, "POST",
        f"{BASE}/storage/v1/object/{BUCKET}/{path}",
        data=data,
        headers={"Content-Type": content_type, "x-upsert": "true"},
    )
    if r.status_code >= 400:
        raise RuntimeError(f"storage 上传 {path} -> {r.status_code} {r.text[:200]}")


def public_url(path):
    return f"{BASE}/storage/v1/object/public/{BUCKET}/{path}"


# ---------------- 处理单行 ----------------

def process_pendant(session, row):
    """挂件：原图 + 128px 静态 thumb，回填 mirror_url/thumb_url"""
    base_name = row["id"].replace(":", "_")
    data = download(session, strip_process(row.get("url")), os.path.join(CACHE_DIR, f"{base_name}_orig"))
    # 按实际字节判型决定扩展名（缓存文件不带后缀，防止 url 后缀与实际不符）
    kind = sniff_type(data)
    if not kind:
        raise RuntimeError("识别不了图片类型（桶只收 png/webp/gif/jpeg）")
    ext, ctype = kind
    upload_object(session, f"pendants/{base_name}.{ext}", data, ctype)
    thumb = make_thumb(data)
    upload_object(session, f"pendants/{base_name}_thumb.webp", thumb, "image/webp")
    patch_row(session, TABLE_PENDANT, row["id"], {
        "mirror_url": public_url(f"pendants/{base_name}.{ext}"),
        "thumb_url": public_url(f"pendants/{base_name}_thumb.webp"),
    })
    return f"raw {len(data)//1024}KB thumb {len(thumb)//1024}KB"


def process_bubble(session, row):
    """气泡：静态底图 + 动图（gif_url 有值时）+ 128px thumb，回填 mirror/thumb/gif"""
    base_name = row["id"].replace(":", "_")
    data = download(session, strip_process(row.get("url")), os.path.join(CACHE_DIR, f"{base_name}_orig"))
    kind = sniff_type(data)
    if not kind:
        raise RuntimeError("识别不了底图类型")
    ext, ctype = kind
    upload_object(session, f"bubbles/{base_name}.{ext}", data, ctype)

    fields = {
        "mirror_url": public_url(f"bubbles/{base_name}.{ext}"),
        "thumb_url": public_url(f"bubbles/{base_name}_thumb.webp"),
    }
    # 动图：gif_url 有值就镜像原动图（客户端 animated 时直接用 gif 镜像）
    gif_url = strip_process(row.get("gif_url") or "")
    if gif_url:
        gif_data = download(session, gif_url, os.path.join(CACHE_DIR, f"{base_name}_anim"))
        gext = sniff_ext(gif_data) or "gif"
        upload_object(session, f"bubbles/{base_name}_anim.{gext}", gif_data, CONTENT_TYPES.get(gext, "image/gif"))
        fields["gif_url"] = public_url(f"bubbles/{base_name}_anim.{gext}")

    thumb = make_thumb(data)
    upload_object(session, f"bubbles/{base_name}_thumb.webp", thumb, "image/webp")
    patch_row(session, TABLE_BUBBLE, row["id"], fields)
    extra = f" + anim {os.path.basename(gif_url).rsplit('.',1)[-1]}" if gif_url else ""
    return f"raw {len(data)//1024}KB{extra} thumb {len(thumb)//1024}KB"


# ---------------- main ----------------

def main():
    global BASE, KEY, CACHE_DIR
    parser = argparse.ArgumentParser(description="装扮镜像：下载原图 + 缩略图 + 上传 Storage + 回填表")
    parser.add_argument("--kind", choices=["pendant", "bubble", "all"], default="all",
                        help="处理哪张表（默认 all 两张都跑）")
    parser.add_argument("--limit", type=int, default=0, help="每张表只处理前 N 条（0=不限）")
    parser.add_argument("--id", dest="row_id", default="", help="只处理指定条目 id（两张表都查）")
    parser.add_argument("--force", action="store_true", help="已回填的行也重传（默认跳过）")
    args = parser.parse_args()

    BASE = os.environ.get("SUPABASE_URL", DEFAULT_BASE).rstrip("/")
    KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not KEY:
        print("缺少 SUPABASE_SERVICE_ROLE_KEY（不落盘，用环境变量传）", file=sys.stderr)
        sys.exit(1)
    CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".decor-cache")
    session = make_session()

    plans = []
    if args.kind in ("pendant", "all"):
        # 只镜像 hoyolab：米游社 OSS（bbs-static）国内本来就快且是全分辨率原图，
        # 客户端对米游社条目直接取去参原图即可，无需镜像。
        plans.append((TABLE_PENDANT, "id,url,mirror_url,thumb_url",
                      {"source": "eq.hoyolab"}, process_pendant, "pendant"))
    if args.kind in ("bubble", "all"):
        # 气泡全部来自米游社背包接口，统一镜像（含动图）
        plans.append((TABLE_BUBBLE, "id,url,gif_url,mirror_url,thumb_url", None, process_bubble, "bubble"))

    total = {"ok": 0, "failed": 0, "downloaded": 0, "uploaded": 0}
    failures = []
    for table, fields, extra, processor, label in plans:
        rows = fetch_rows(session, table, fields, extra)
        log(f"[{label}] 云端 enabled=true 共 {len(rows)} 条")
        todo = []
        for row in rows:
            if args.row_id and row["id"] != args.row_id:
                continue
            if not args.force and row.get("mirror_url") and row.get("thumb_url"):
                continue
            todo.append(row)
        if args.limit > 0:
            todo = todo[:args.limit]
        log(f"[{label}] 待处理 {len(todo)} 条（其余已回填跳过；--force 重传）")

        stats = {"ok": 0, "failed": 0, "downloaded": 0, "uploaded": 0}
        for i, row in enumerate(todo, 1):
            url = strip_process(row.get("url") or "")
            if not url:
                stats["failed"] += 1
                failures.append(f"{row['id']}: url 为空")
                continue
            try:
                info = processor(session, row)
                stats["ok"] += 1
                stats["downloaded"] += 1
                stats["uploaded"] += 2 + (1 if label == "bubble" and row.get("gif_url") else 0)
                log(f"  ✓ {row['id']}  {info}")
            except Exception as e:  # noqa: BLE001 单行失败不中断
                stats["failed"] += 1
                failures.append(f"{row['id']}: {e}")
                log(f"  ✗ {row['id']}: {e}")
            if i % 25 == 0:
                log(f"  进度 {i}/{len(todo)}")
        for k in total:
            total[k] += stats[k]
        log(f"[{label}] 本轮：{json.dumps(stats, ensure_ascii=False)}")

    log("-" * 40)
    log(json.dumps(total, ensure_ascii=False))
    if failures:
        log(f"失败明细（{len(failures)}）：")
        for f in failures[:30]:
            log(f"  {f}")
        if len(failures) > 30:
            log(f"  ...其余 {len(failures) - 30} 条略")
    log("完成" if total["failed"] == 0 else "完成（有失败，可重跑续传）")
    sys.exit(2 if total["failed"] else 0)


if __name__ == "__main__":
    main()
