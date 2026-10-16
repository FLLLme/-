#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
upload_plan.py —— 算出「本地 vs GitHub 仓库」的差异清单

为什么需要它
------------
本站的上线方式是 **GitHub 网页端逐文件上传**（本地不是 git 仓库）。网页端上传
有两个老陷阱：
  · 不指定目录就会落在根目录并静默覆盖同名文件
  · 删掉一个文件后，仓库里那份不会自己消失，必须手动删

所以每次上线都要先列清楚四类差异。**四类必须全列** —— 少列一类就会做出错误判断。
本工具就是为此而生：曾经有一版临时脚本只输出了前三类，漏掉「仓库有、本地没有」，
于是把"需要在 GitHub 上删除 5 个文件"误报成"无需删除"。

四类输出
--------
  1. 需上传 · 新增      本地有、仓库没有 → 在网页端新建
  2. 需上传 · 覆盖      两边都有但内容不同 → 在网页端覆盖
  3. 需删除            仓库有、本地没有 → 在网页端删除
  4. 保留              仓库有、本地没有，但属于「不该镜像到本地」的文件

用法
----
    python tools/upload_plan.py
"""

import argparse
import hashlib
import json
import os
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = "FLLLme/-"
BRANCH = "main"

# 只存在于仓库、不需要在本地镜像的文件。它们出现在「仓库有、本地没有」里是正常的，
# 不该被报成「需删除」，否则会误删线上素材。
REMOTE_ONLY_OK = {
    "CNAME",                                    # 自定义域名，GitHub Pages 用
    ".gitkeep",
    "static/images/uploads/生成倾斜红色彼岸花.png",   # 后台直接上传的图片
}

# 本地存在但不该上线的文件
EXCLUDE_DIRS = {".workbuddy", "design-preview", ".git", "__pycache__"}
EXCLUDE_FILES = {"server.py", "start.bat", ".DS_Store"}


def blob_sha(data: bytes) -> str:
    """Git 的 blob 哈希：sha1("blob <len>\\0" + 内容)。
    不能直接对文件内容算 sha1 —— 那样和 GitHub 返回的 sha 永远对不上。"""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def fetch_remote(prefix: str) -> dict:
    url = f"https://api.github.com/repos/{REPO}/git/trees/{BRANCH}?recursive=1"
    req = urllib.request.Request(url, headers={
        "User-Agent": "upload-plan",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        tree = json.loads(r.read())["tree"]
    return {it["path"]: it["sha"] for it in tree
            if it["type"] == "blob" and it["path"].startswith(prefix)}


def fetch_contents(prefix: str) -> dict:
    """列出目录下的文件（递归），返回 {相对仓库根的路径: 大小}。"""
    url = ("https://api.github.com/repos/%s/contents/%s?ref=%s"
           % (REPO, urllib.parse.quote(prefix), BRANCH))
    req = urllib.request.Request(url, headers={
        "User-Agent": "upload-plan",
        "Accept": "application/vnd.github+json",
    })
    out = {}
    with urllib.request.urlopen(req, timeout=30) as r:
        items = json.loads(r.read())
    for it in items:
        if it["type"] == "file":
            out[it["path"]] = it["size"]
        elif it["type"] == "dir":
            out.update(fetch_contents(it["path"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="列出需上传/需删除的文件")
    ap.add_argument("--prefix", default="", help="只看某个目录（如 assets/）")
    args = ap.parse_args()

    remote = fetch_remote(args.prefix)
    remote_size = fetch_contents(args.prefix)

    local = []
    base = ROOT / args.prefix if args.prefix else ROOT
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for f in filenames:
            if f in EXCLUDE_FILES:
                continue
            rel = os.path.relpath(os.path.join(dirpath, f), ROOT).replace("\\", "/")
            local.append(rel)

    add, mod = [], []
    for rel in sorted(local):
        data = (ROOT / rel).read_bytes()
        if rel not in remote:
            add.append(rel)
        elif remote[rel] != blob_sha(data):
            mod.append(rel)

    only_remote = sorted(set(remote) - set(local))
    keep = [p for p in only_remote
            if p in REMOTE_ONLY_OK or p.endswith("/.gitkeep") or p == ".gitkeep"]
    delete = [p for p in only_remote if p not in keep]

    def kb(p):
        f = ROOT / p
        return "%.1f KB" % (f.stat().st_size / 1024) if f.exists() else "?"

    print("【需上传 · 新增】%d 个" % len(add))
    for p in add:
        print("   + %-42s %s" % (p, kb(p)))

    print("\n【需上传 · 覆盖】%d 个" % len(mod))
    for p in mod:
        print("   ~ %-42s %s" % (p, kb(p)))

    print("\n【需在 GitHub 上删除】%d 个" % len(delete))
    for p in delete:
        size = remote_size.get(p)
        print("   - %-42s %s" % (p, ("%.1f KB" % (size / 1024)) if size else ""))

    if keep:
        print("\n【仓库有、本地无，但应保留（勿删）】")
        for p in keep:
            print("   ·", p)

    if add or mod:
        print("\n上传顺序：先传上面「新增 + 覆盖」的全部文件，"
              "确认线上正常后再删除第 3 类。顺序反了会让站点在一段时间内引不到资源。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
