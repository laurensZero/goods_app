# -*- coding: utf-8 -*-
"""
装扮目录相似度回填脚本
======================
为 mhy_decor_pendants / mhy_reply_bubbles 两表回填：
  content_key  URL 内容键（CDN 文件名 hash 前缀；无本地素材也能算）
  pixel_hash   感知哈希 dhash（优先用本地素材 miyoushe_assets / hoyolab_assets
               的 by_game 文件，缺的从 CDN 下载到 .decor-cache 后计算）

两列供管理台「装扮管理」标注同图组、供人工排查重复；客户端与同步不读。
可重复运行：两列都已一致的行自动跳过。

用法：
  export SUPABASE_SERVICE_ROLE_KEY='...'
  python scripts/decor-similarity.py                # 两张表全量
  python scripts/decor-similarity.py --kind pendant # 只挂件
  python scripts/decor-similarity.py --table-diff   # 只打印差异不写库
"""
import argparse
import hashlib
import os
import re
import sys
import time

import requests
from PIL import Image

BASE = os.environ.get('SUPABASE_URL', 'https://api.goodsapp.de5.net').rstrip('/')
TABLES = {
    'pendant': 'mhy_decor_pendants',
    'bubble': 'mhy_reply_bubbles',
}
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36'
CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.decor-cache')

# 本地素材索引根目录（与 scripts/miyoushe_decor.py 的下载结构一致）
ASSET_ROOTS = {
    'miyoushe': 'miyoushe_assets',
    'hoyolab': 'hoyolab_assets',
}


def log(msg):
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(str(msg).encode('gbk', errors='replace').decode('gbk'), flush=True)


def norm_key(url):
    """URL 内容键：CDN 文件名里的长 hash 前缀；取不到退化为去参完整地址"""
    base = str(url or '').strip().split('?')[0]
    if not base:
        return ''
    file = base[base.rfind('/') + 1:]
    m = re.match(r'^([0-9a-f]{24,})_[^.]*\.', file, re.I)
    return m.group(1).lower() if m else base


def dhash(path):
    im = Image.open(path)
    im.load()
    rgba = im.convert('RGBA')
    bg = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    bg.alpha_composite(rgba)
    g = bg.convert('L').resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return f'{bits:016x}'


def build_local_index():
    """(source, id) → 本地素材文件路径"""
    index = {}
    for source, root in ASSET_ROOTS.items():
        base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), root, 'by_game')
        for dirpath, _dirs, files in os.walk(base_dir):
            for f in files:
                m = re.match(r'^\d+_(\d+)_', f)
                if m and f.rsplit('.', 1)[-1].lower() in ('png', 'webp', 'jpg', 'jpeg', 'gif'):
                    index[(source, m.group(1))] = os.path.join(dirpath, f)
    return index


def main():
    parser = argparse.ArgumentParser(description='装扮目录相似度回填（content_key + pixel_hash）')
    parser.add_argument('--kind', choices=['pendant', 'bubble', 'all'], default='all')
    parser.add_argument('--table-diff', action='store_true', help='只打印差异，不写库')
    args = ap = parser.parse_args()

    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not key:
        print('缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量', file=sys.stderr)
        sys.exit(1)
    s = requests.Session()
    s.trust_env = False  # 反代与米哈游 CDN 都直连
    s.headers.update({'apikey': key, 'Authorization': f'Bearer {key}', 'User-Agent': UA})

    local_index = build_local_index()
    log(f'本地素材索引: {len(local_index)} 个文件')

    kinds = [args.kind] if args.kind != 'all' else ['pendant', 'bubble']
    for kind in kinds:
        table = TABLES[kind]
        rows, start = [], 0
        while True:
            rr = s.get(f'{BASE}/rest/v1/{table}',
                       params={'select': 'id,url,source,enabled', 'order': 'id.asc'},
                       headers={'Range': f'{start}-{start+999}'}, timeout=45)
            rr.raise_for_status()
            batch = rr.json()
            rows.extend(batch)
            if len(batch) < 1000:
                break
            start += 1000
        log(f'[{table}] {len(rows)} 行')

        patch = []
        for row in rows:
            want_key = norm_key(row.get('url'))
            want_hash = ''
            source, pid = row.get('source', ''), str(row['id']).split(':')[-1]
            local = local_index.get((source, pid))
            path = local
            if not path:
                safe = str(row['id']).replace(':', '_')
                cache = os.path.join(CACHE, f'{safe}_img')
                if os.path.exists(cache) and os.path.getsize(cache) > 0:
                    path = cache
                else:
                    url = str(row.get('url') or '').split('?')[0]
                    if url:
                        try:
                            data = s.get(url, headers={'Referer': 'https://www.miyoushe.com/'}, timeout=60).content
                            os.makedirs(CACHE, exist_ok=True)
                            with open(cache, 'wb') as f:
                                f.write(data)
                            path = cache
                        except Exception as e:  # noqa: BLE001 单张失败不阻塞
                            log(f'  ✗ {row["id"]}: 下载失败 {e}')
                            path = None
            if path:
                try:
                    want_hash = dhash(path)
                except Exception as e:  # noqa: BLE001
                    log(f'  ✗ {row["id"]}: 哈希失败 {e}')

            if row.get('content_key') == want_key and row.get('pixel_hash') == want_hash:
                continue
            patch.append({'id': row['id'], 'content_key': want_key, 'pixel_hash': want_hash})

        log(f'[{table}] 需回填 {len(patch)} 行')
        if args.table_diff:
            for p in patch[:15]:
                log(f'  {p["id"]} key={p["content_key"][:14]} px={p["pixel_hash"]}')
            continue
        ok = fail = 0
        for p in patch:
            rr = s.patch(f'{BASE}/rest/v1/{table}', params={'id': f'eq.{p["id"]}'},
                         json={'content_key': p['content_key'], 'pixel_hash': p['pixel_hash'],
                               'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, timeout=45)
            if rr.status_code in (200, 204):
                ok += 1
            else:
                fail += 1
                log(f'  PATCH FAIL {p["id"]} {rr.status_code} {rr.text[:100]}')
            time.sleep(0.1)
        log(f'[{table}] 回填完成 ok={ok} fail={fail}')

    log('全部完成')


if __name__ == '__main__':
    main()
