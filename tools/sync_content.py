#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_content.py — 把 content/posts/ 同步为 posts/，并重建 posts/manifest.json

设计说明
--------
content/posts/  文章的**唯一事实来源**，由 Decap CMS 后台读写
posts/          前端消费的**生成目录**：博客只读 posts/manifest.json 与 posts/*.md

为什么需要这一步
----------------
这是一个纯静态博客，没有后端。浏览器无法枚举服务器上的目录，
因此必须有一份清单文件（manifest.json）告诉前端"有哪些文章"。
而 Decap CMS 只能写内容文件，不会维护 manifest.json ——
所以在每次推送时用本脚本补齐这个缺口。

本脚本由 .github/workflows/sync-content.yml 自动调用，也可本地手动执行。

用法
----
    python tools/sync_content.py             # 执行同步
    python tools/sync_content.py --dry-run   # 只报告将要发生的改动，不写盘
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "posts"
DST = ROOT / "posts"
MANIFEST = DST / "manifest.json"


def collect_source_files():
    """收集源文章。以下划线或点开头的文件视为草稿/临时文件，不参与发布。"""
    if not SRC.is_dir():
        raise FileNotFoundError(f"源目录不存在：{SRC.relative_to(ROOT)}")
    return sorted(
        p for p in SRC.glob("*.md")
        if p.is_file() and not p.name.startswith(("_", "."))
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="同步 content/posts 到 posts")
    parser.add_argument("--dry-run", action="store_true", help="只报告改动，不写盘")
    args = parser.parse_args()

    try:
        sources = collect_source_files()
    except FileNotFoundError as exc:
        print(f"[sync] 错误：{exc}", file=sys.stderr)
        return 1

    # 安全阀：源目录为空时绝不清空 posts/，否则会误删线上全部文章
    if not sources:
        print(
            "[sync] 错误：content/posts/ 下没有任何 .md 文件，已中止。\n"
            "       这是为了防止把 posts/ 中的文章全部删除。\n"
            "       若确实要清空站点，请手动处理。",
            file=sys.stderr,
        )
        return 1

    DST.mkdir(parents=True, exist_ok=True)
    names = [p.name for p in sources]
    name_set = set(names)

    # 1) 覆盖 / 新增
    copied = []
    for src in sources:
        target = DST / src.name
        if args.dry_run:
            copied.append(src.name)
        else:
            shutil.copyfile(src, target)
            copied.append(src.name)

    # 2) 删除源中已不存在的文章（文章被删除时要能反映到线上）
    removed = []
    for existing in DST.glob("*.md"):
        if existing.name not in name_set:
            removed.append(existing.name)
            if not args.dry_run:
                existing.unlink()

    # 3) 重建清单。按文件名排序，保证每次生成结果一致、diff 干净
    if not args.dry_run:
        MANIFEST.write_text(
            json.dumps({"posts": sorted(names)}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    prefix = "[sync][dry-run] " if args.dry_run else "[sync] "
    print(f"{prefix}源目录   {SRC.relative_to(ROOT)}  （{len(sources)} 篇）")
    print(f"{prefix}目标目录 {DST.relative_to(ROOT)}")
    print(f"{prefix}已写入   {len(copied)} 篇")
    if removed:
        print(f"{prefix}已删除   {len(removed)} 篇：{', '.join(sorted(removed))}")
    else:
        print(f"{prefix}无需删除")
    print(f"{prefix}清单     {MANIFEST.relative_to(ROOT)}  （{len(names)} 条）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
