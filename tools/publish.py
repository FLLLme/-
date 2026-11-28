#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
publish.py —— 一条命令把本地改动发布到线上

为什么现在需要 git
------------------
项目已经改成 **git 仓库直连 GitHub**，不再依赖网页端逐文件上传。
网页端上传有两处老陷阱：不指定目录会落在根目录并静默覆盖同名文件；
删掉文件后仓库里那份不会自己消失。换成 git 之后这两类问题都不会再出现 ——
`git status` 会如实告诉你哪些是新增、修改、删除。

所以 tools/upload_plan.py 那套「四类差异」清单也随之退休了。

用法
----
    python tools/publish.py                    # 看有哪些改动，不提交
    python tools/publish.py "改了什么"          # 提交并推送
    python tools/publish.py "改了什么" --dry    # 只看将要提交什么

提交信息建议写成「范围: 做了什么」，例如：
    样式: 朋友章首位改用设计稿边框
    修复: OAuth Worker 的回传目标 origin
"""

import argparse
import subprocess
import sys


def run(args, check=True):
    """跑一条 git 命令，返回 (退出码, 输出)。"""
    p = subprocess.run(["git"] + args, capture_output=True, text=True, encoding="utf-8")
    if check and p.returncode != 0:
        print(f"  git {' '.join(args)} 失败：", file=sys.stderr)
        print((p.stderr or p.stdout).strip(), file=sys.stderr)
        raise SystemExit(1)
    return p.returncode, (p.stdout + p.stderr).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="提交并推送本地改动")
    ap.add_argument("message", nargs="?", help="提交信息；不给则只显示改动")
    ap.add_argument("--dry", action="store_true", help="只显示将要提交的内容")
    args = ap.parse_args()

    # 分支与远端
    _, branch = run(["branch", "--show-current"])
    _, remote = run(["config", "--get", "remote.origin.url"])
    print(f"分支 {branch}   远端 {remote}\n")

    # 先看看有没有改动
    _, status = run(["status", "--porcelain"])
    if not status:
        print("工作区干净，没有需要发布的内容。")
        return 0

    # 分类汇总：按 git status 的首两列判断
    added, modified, deleted = [], [], []
    for line in status.splitlines():
        code, path = line[:2], line[3:].strip()
        if code.strip() == "??" or "A" in code:
            added.append(path)
        elif "D" in code:
            deleted.append(path)
        else:
            modified.append(path)

    for label, items, mark in (("新增", added, "+"),
                               ("修改", modified, "~"),
                               ("删除", deleted, "-")):
        if items:
            print(f"{label} {len(items)} 个")
            for p in items:
                print(f"  {mark} {p}")
            print()

    if not args.message:
        print("未给提交信息，仅显示改动。确认后执行：")
        print('  python tools/publish.py "改了什么"')
        return 0

    if args.dry:
        print("--dry：不会提交。")
        return 0

    run(["add", "-A"])
    run(["commit", "-m", args.message])
    print("已提交，正在推送…")
    code, out = run(["push", "origin", branch], check=False)
    if code != 0:
        print(out, file=sys.stderr)
        print("\n推送失败。常见原因：\n"
              "  · 首次推送需要授权 —— 在弹出的窗口里登录 GitHub（凭据会存进"
              " Windows 凭据管理器，之后不再询问）\n"
              "  · 远端有本地没有的提交 —— 先 git pull --rebase\n"
              "    （后台 CMS 写作会自动产生提交，所以这种情况是正常的）")
        return 1

    print(out)
    print("\n已推送。GitHub Pages 通常在半分钟内生效；")
    print("若改的是 css/ 或 js/，浏览器还受 Cloudflare 的 4 小时缓存影响，"
          "验证时记得 Ctrl+F5。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
