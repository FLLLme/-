#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bundle.py — 把 posts/*.md 打包成 posts/bundle.js（离线兜底数据包）

用途
----
浏览器在 file:// 协议下无法用 fetch 读取本地 .md 文件。前端加载器会先尝试
HTTP 方式读取真实的 Markdown 源文件，失败时回退到本脚本生成的 bundle.js，
从而保证直接双击 index.html 也能完整浏览站点。

Markdown 文件始终是唯一事实来源，bundle.js 只是派生产物，请勿手工编辑。

用法
----
    python tools/bundle.py
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
MANIFEST = POSTS_DIR / "manifest.json"
OUTPUT = POSTS_DIR / "bundle.js"


def load_manifest() -> list:
    if not MANIFEST.exists():
        print(f"[bundle] 找不到 {MANIFEST.relative_to(ROOT)}", file=sys.stderr)
        return []
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("posts", [])


def main() -> int:
    files = load_manifest()
    if not files:
        print("[bundle] manifest 中没有文章，已跳过。", file=sys.stderr)
        return 1

    bundle = {}
    for name in files:
        path = POSTS_DIR / name
        if not path.exists():
            print(f"[bundle] 跳过不存在的文件：{name}", file=sys.stderr)
            continue
        bundle[name] = path.read_text(encoding="utf-8")

    payload = json.dumps(bundle, ensure_ascii=False, indent=2)
    # 防止正文中出现 </script> 时提前闭合脚本标签
    payload = payload.replace("</", "<\\/")

    OUTPUT.write_text(
        "/* 本文件由 tools/bundle.py 自动生成，请勿手动编辑。\n"
        "   数据来源：posts/*.md（Markdown 是唯一事实来源）。*/\n"
        f"window.POST_BUNDLE = {payload};\n",
        encoding="utf-8",
        # 显式指定换行符，否则 Windows 会写出 CRLF 而 Linux CI 写出 LF，
        # 两边哈希不一致，每次提交都会产生无意义的差异。
        newline="\n",
    )

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"[bundle] 已生成 {OUTPUT.relative_to(ROOT)} —— {len(bundle)} 篇 / {size_kb:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
