# -*- coding: utf-8 -*-
"""
米游社 头像挂件 / 评论装扮 提取脚本
--------------------------------
数据来源（公开接口，无需登录）：
  帖子详情  https://bbs-api.miyoushe.com/post/wapi/getPostFull?gids=2&post_id=<id>
  评论列表  https://bbs-api.miyoushe.com/post/wapi/getPostReplies?gids=2&is_hot=true&post_id=<id>&size=20
  用户信息  https://bbs-api.miyoushe.com/user/wapi/getUserFullInfo?gids=2&uid=<uid>

字段：
  pendant                              -> 头像挂件 PNG
  reply_bubble.url                     -> 评论装扮底图
  reply_bubble.bg_color                -> 评论装扮底色
  reply_bubble.animation_effects_gif_url / _pag_url  -> 动态装扮

CDN 上的图片就是普通 PNG，去掉 ?x-oss-process=... 就是原图。
"""
import argparse
import json
import os
import re
import sys

import requests

API = "https://bbs-api.miyoushe.com"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"),
    "Referer": "https://www.miyoushe.com/",
    "Origin": "https://www.miyoushe.com",
}
GIDS = "2"  # 2=原神 1=崩坏3 4=未定 5=大别野 6=崩坏:星穹铁道 8=绝区零 ...


def get(url, **params):
    r = requests.get(url, params=params, headers=HEADERS, timeout=20)
    r.raise_for_status()
    j = r.json()
    if j.get("retcode") != 0:
        raise RuntimeError(f"{url} -> {j.get('retcode')} {j.get('message')}")
    return j["data"]


def walk_replies(data):
    """遍历评论及其楼中楼"""
    for item in data.get("list") or []:
        yield item
        for sub in item.get("sub_replies") or []:
            yield sub


def collect_from_post(post_id, gids=GIDS, hot_pages=5):
    assets = {}  # key -> record, 用 assets_id/url 去重

    def add(user):
        if not user:
            return
        uid = user.get("uid")
        if user.get("pendant"):
            assets[("pendant", uid)] = {
                "type": "avatar_frame",
                "uid": uid,
                "nickname": user.get("nickname"),
                "name": None,
                "bg_color": None,
                "url": user["pendant"],
            }
        b = user.get("reply_bubble")
        if b and b.get("url"):
            assets[("bubble", b.get("assets_id"))] = {
                "type": "reply_bubble",
                "uid": uid,
                "nickname": user.get("nickname"),
                "name": b.get("name"),
                "bg_color": b.get("bg_color"),
                "url": b["url"],
                "gif": b.get("animation_effects_gif_url") or None,
                "pag": b.get("animation_effects_pag_url") or None,
            }

    # 1) 楼主
    post = get(f"{API}/post/wapi/getPostFull", gids=gids, post_id=post_id, read=1)["post"]
    add(post.get("user"))
    # 2) 评论列表（is_hot=true 才被支持，靠 last_id 翻页）
    last_id = ""
    for _ in range(hot_pages):
        data = get(f"{API}/post/wapi/getPostReplies",
                   gids=gids, post_id=post_id, size=20,
                   is_hot="true", last_id=last_id)
        for item in walk_replies(data):
            add(item.get("user"))
        last_id = str(data.get("last_id") or "")
        if data.get("is_last") or not last_id:
            break
    return list(assets.values())


def collect_from_user(uid, gids=GIDS):
    info = get(f"{API}/user/wapi/getUserFullInfo", gids=gids, uid=uid)["user_info"]
    out = []
    if info.get("pendant"):
        out.append({"type": "avatar_frame", "uid": uid, "nickname": info.get("nickname"),
                    "name": None, "bg_color": None, "url": info["pendant"]})
    return out


def safe(name):
    return re.sub(r'[\\/:*?"<>|\s]+', "_", name)[:60]


def download(records, outdir):
    os.makedirs(outdir, exist_ok=True)
    manifest = []
    for rec in records:
        base = rec["url"].split("?")[0]
        ext = os.path.splitext(base)[1] or ".png"
        label = rec.get("name") or rec["type"]
        fn = f'{rec["type"]}_{rec.get("nickname") or rec["uid"]}_{safe(str(label))}{ext}'
        path = os.path.join(outdir, fn)
        if not os.path.exists(path):
            r = requests.get(base, headers=HEADERS, timeout=60)
            r.raise_for_status()
            with open(path, "wb") as f:
                f.write(r.content)
        rec = dict(rec, file=fn)
        manifest.append(rec)
        print("saved", fn, os.path.getsize(path), "bytes")
    with open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--post", type=int, help="帖子 id（推荐，能扒到一堆人的挂件和评论装扮）")
    ap.add_argument("--uid", type=int, help="只看某个用户的头像挂件")
    ap.add_argument("--gids", default=GIDS)
    ap.add_argument("--pages", type=int, default=5)
    ap.add_argument("--out", default="miyoushe_decor")
    a = ap.parse_args()

    if a.post:
        recs = collect_from_post(a.post, a.gids, a.pages)
    elif a.uid:
        recs = collect_from_user(a.uid, a.gids)
    else:
        ap.error("需要 --post 或 --uid")

    if not recs:
        print("没找到装扮")
        sys.exit(0)
    download(recs, a.out)
    print(f"共 {len(recs)} 个装扮 -> {os.path.abspath(a.out)}")
