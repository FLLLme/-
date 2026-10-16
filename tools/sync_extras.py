#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_extras.py — 把 content/works/ 与 content/friends/ 汇总为 posts/*.json

背景
----
作品集与朋友章同样遵循「后台可编辑、静态站只读」的架构，与文章完全一致：

    content/works/*.json     Decap 后台读写（唯一事实来源）
    content/friends/*.json   同上
        │  本脚本（GitHub Actions 在推送时调用，也可本地手动执行）
        ▼
    posts/works.json         前端只读，一次 fetch 拿全
    posts/friends.json

为什么需要这一步
----------------
浏览器无法枚举服务器上的目录。让前端直接逐个读 content/works/ 下的文件，
就得再维护一份清单（文章那边是 manifest.json），多一处人会忘记更新的地方。
汇总成单个 JSON 后，前端只 fetch 一次，没有第二处真相。

容错策略（与 sync_content.py 刻意不同）
---------------------------------------
文章源目录为空是**故障**（会静默清空线上站点），所以 sync_content.py 有安全阀中止。
而作品/友链为空是**合法状态**（还没上传），因此这里的规则反过来：

  * 目录不存在，或目录里没有 .json  →  写入 []，正常发布
  * 个别文件 JSON 解析失败          →  跳过该文件并打印文件名，其余照常发布
  * 目录里有文件但**全部**解析失败  →  中止且不写盘
      （这种情况多半是脚本或批量改动出了问题，绝不能让线上作品被清空）

用法
----
    python tools/sync_extras.py             # 执行同步
    python tools/sync_extras.py --dry-run   # 只报告将要发生的改动，不写盘
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 各集合允许透传给前端的字段（白名单，挡住 Decap 或手工编辑带进来的杂项）
ALLOWED_FIELDS = {
    "works":   ["title", "image", "href", "summary", "date", "order"],
    "friends": ["title", "url", "avatar", "desc", "order"],
}

# 哪些字段是 URL，需要做协议检查
URL_FIELDS = {
    "works":   ["image", "href"],
    "friends": ["avatar", "url"],
}

# 允许的协议。无协议的相对路径（本站图片都用相对路径）另行放行。
SAFE_PROTOCOLS = re.compile(r"^(?:https?|mailto|tel|sms|ftp|ftps):", re.I)

# 明确拒绝的危险协议
DANGEROUS_PROTOCOLS = ("javascript:", "vbscript:", "data:", "blob:", "filesystem:")

# (集合名, 源目录, 输出文件)
COLLECTIONS = [
    ("works",   ROOT / "content" / "works",   ROOT / "posts" / "works.json"),
    ("friends", ROOT / "content" / "friends", ROOT / "posts" / "friends.json"),
]


def sanitize_url(value: str) -> str:
    """URL 字段的协议白名单。

    为什么要在数据侧做
    ------------------
    前端渲染用 target="_blank"，浏览器不允许在新上下文里执行 javascript:，
    因此当前不可直接触发。但这是"依赖前端行为兜底"，不该作为安全边界：
    换一种渲染方式、或在别处复用这份数据，防护就没了。

    放行：http(s): / mailto: / tel: / sms: / ftp(s):，以及无协议的相对路径。
    拒绝：javascript: / vbscript: / data: / blob: / filesystem: 及一切未知协议。
    非法值返回空字符串——输出 schema 保持不变，只是该字段为空。
    """
    v = (value or "").strip()
    if not v:
        return ""

    # 折叠掉控制字符与空白：`java\nscript:` 这类拆分写法会被还原后识别出来
    compact = re.sub(r"[\x00-\x20\x7f\u00a0]+", "", v)
    lower = compact.lower()

    if lower.startswith(DANGEROUS_PROTOCOLS):
        print(f"[extras] 已丢弃危险 URL（{v[:60]}）", file=sys.stderr)
        return ""

    # 有协议头的必须在白名单内
    if re.match(r"^[a-z][a-z0-9+.\-]*:", lower):
        if SAFE_PROTOCOLS.match(lower):
            return v
        print(f"[extras] 已丢弃未知协议的 URL（{v[:60]}）", file=sys.stderr)
        return ""

    # 无协议：相对路径 / 锚点 / 查询串，放行
    return v


def collect_sources(src: Path):
    """列出源文件。目录不存在返回 None（区别于"目录存在但为空"）。"""
    if not src.is_dir():
        return None
    return sorted(
        p for p in src.glob("*.json")
        if p.is_file() and not p.name.startswith(("_", "."))
    )


def to_int(value):
    """order 字段容错：留空 / 非法值一律视为 None，排序时排到最后。"""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def normalize(name, data, fallback_title):
    """只保留白名单字段，并把除 order 外的值统一成字符串；URL 字段过协议白名单。"""
    item = {}
    url_fields = URL_FIELDS.get(name, ())

    for key in ALLOWED_FIELDS[name]:
        raw = data.get(key)
        if key == "order":
            item[key] = to_int(raw)
            continue

        text = "" if raw is None else str(raw).strip()
        item[key] = sanitize_url(text) if key in url_fields else text

    # 后台的文件夹集合强制要求 title 作为条目标识，但保险起见再兜一次，
    # 免得渲染出没有文字的卡片
    if not item.get("title"):
        item["title"] = fallback_title
    return item


def build(name, files):
    """逐个读取源文件。返回 (条目列表, 解析失败列表)。"""
    items, broken = [], []
    for path in files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            broken.append((path.name, str(exc)))
            continue
        if not isinstance(data, dict):
            broken.append((path.name, "顶层不是 JSON 对象"))
            continue
        items.append(normalize(name, data, path.stem))
    return items, broken


def sort_items(items):
    """三级稳定排序：order 升序 → date 降序 → 标题升序。

    Python 的 sort 是稳定排序，多次排序即多级排序键；reverse=True 同样稳定，
    不会把日期相同的条目顺序打乱。这样无论后台怎么拖动，生成结果始终一致，
    git diff 干净。
    """
    items.sort(key=lambda x: x.get("title") or "")
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    items.sort(key=lambda x: 999 if x.get("order") is None else x["order"])
    return items


def write_output(path: Path, items) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        # 必须显式指定：Windows 默认把 \n 写成 \r\n，而 CI 跑在 Linux 上是 \n，
        # 两边哈希对不上会导致每次提交都产生无意义的差异。
        newline="\n",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="同步 content/works|content/friends 到 posts/")
    parser.add_argument("--dry-run", action="store_true", help="只报告改动，不写盘")
    args = parser.parse_args()

    prefix = "[extras][dry-run] " if args.dry_run else "[extras] "
    failed = False

    for name, src, out in COLLECTIONS:
        files = collect_sources(src)

        if files is None:
            print(f"{prefix}{name}：源目录 {src.relative_to(ROOT)} 不存在，按空集合发布")
            items = []
        elif not files:
            print(f"{prefix}{name}：源目录没有 .json，按空集合发布")
            items = []
        else:
            items, broken = build(name, files)
            for filename, reason in broken:
                print(
                    f"{prefix}{name}：跳过 {filename} —— {reason}",
                    file=sys.stderr,
                )
            if broken and not items:
                # 有文件却一条都读不出来：宁可不发布，也不能把线上作品清空
                print(
                    f"{prefix}{name}：{len(files)} 个文件全部解析失败，已中止，"
                    f"{out.relative_to(ROOT)} 保持原样。",
                    file=sys.stderr,
                )
                failed = True
                continue
            items = sort_items(items)

        if not args.dry_run:
            write_output(out, items)

        rel_src = src.relative_to(ROOT) if src.is_dir() else src.relative_to(ROOT)
        print(
            f"{prefix}{name}：{rel_src}  →  {out.relative_to(ROOT)}"
            f"（{len(items)} 条）"
        )

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
