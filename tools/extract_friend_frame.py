#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_friend_frame.py —— 从参考图里抠出朋友章的花卉边框素材

背景
----
朋友章首位的花卉边框直接取自用户提供的设计稿，而不是重画的近似品。
设计稿里那圈花边是一整幅连续的植物插画，重画很难做到同样的韵味，
所以这里把画稿本身抠出来用。

产出
----
assets/friend-frame.png   卡片底（白色圆角）+ 全部花卉线稿
assets/friend-bloom.png   只含右上角那朵朱砂红彼岸花（与上者同画布，便于对齐）

三处关键处理
------------
1. **白底转透明**：alpha = 255 - 像素暗度。于是白底自动透明、卡片内部
   成为不透明白（素材自带白色底与圆角），边框线稿保留原来的铅笔灰阶。
2. **抠掉已烧进图里的样例内容**：设计稿里带着一个头像和两行示例文字。
   用连通域分析识别——头像是一块填充率 0.73 的紧凑连通域，文字是若干小连通域。
   头像与花瓣之间有空隙、文字与花叶分处不同区域，所以能干净地删除。
3. **朱砂红单独成层**：否则深色模式靠 invert(1) 反相时，红花会变成青色。
   单独一层就可以只反相线稿、让红花保持朱红色。

体积
----
源图是 JPEG，白底带压缩噪点。直接存 RGBA 有 437KB，压不下去——因为
**PNG 对完全透明的像素仍然保存 RGB 数据**。所以：先按阈值去噪，
再把透明处的 RGB 一并清零，最后量化成 128 色调色板 → 约 64KB。

用法
----
    python tools/extract_friend_frame.py --src <参考图路径>

参考图不在仓库里（它在用户的聊天临时目录中），所以要重新生成必须先拿到它。
"""

import argparse
import pathlib
from collections import deque

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"

# 卡片外框在参考图中的位置（源图像素）。换图时需要重新测量。
CARD = dict(x0=87, x1=1191, y0=894, y1=1246)

NOISE_THRESHOLD = 8        # 暗度低于此值视为白底噪点
INK_THRESHOLD = 200        # 判定「墨迹」的暗度阈值
PALETTE_COLORS = 128       # 量化色数
RED_MIN_DIFF = 28          # 红通道比 G/B 高出多少算朱砂红
RED_MIN_LEVEL = 90


def label_components(dark):
    """8 连通的连通域标记，返回 (标签矩阵, 组件列表)。纯 numpy，不依赖 scipy。"""
    H, W = dark.shape
    lab = np.zeros((H, W), dtype=np.int32)
    comps = []
    cur = 0
    for sy in range(H):
        for sx in np.nonzero(dark[sy] & (lab[sy] == 0))[0]:
            cur += 1
            q = deque([(sy, sx)])
            lab[sy, sx] = cur
            n = 0
            minx = maxx = sx
            miny = maxy = sy
            while q:
                y, x = q.popleft()
                n += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and dark[yy, xx] and lab[yy, xx] == 0:
                            lab[yy, xx] = cur
                            q.append((yy, xx))
            comps.append(dict(id=cur, n=n, x0=minx, x1=maxx, y0=miny, y1=maxy))
    return lab, comps


def shrink_rgb_where_transparent(rgba):
    """把全透明像素的 RGB 清零。PNG 会连透明像素的颜色一起编码，
    不清零的话白底噪点会让文件大三倍以上。"""
    out = rgba.copy()
    zero = out[:, :, 3] == 0
    out[zero, 0] = 0
    out[zero, 1] = 0
    out[zero, 2] = 0
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="从参考图抠出朋友章边框素材")
    ap.add_argument("--src", required=True, help="参考图路径")
    args = ap.parse_args()

    im = Image.open(args.src).convert("RGB")
    card = np.asarray(im.crop((CARD["x0"], CARD["y0"], CARD["x1"], CARD["y1"]))).astype(np.int16)
    H, W, _ = card.shape
    print(f"卡片区域 {W}x{H}")

    L = card.min(axis=2)

    # ---- 朱砂红 ----
    R, G, B = card[:, :, 0], card[:, :, 1], card[:, :, 2]
    is_red = ((R - np.maximum(G, B)) > RED_MIN_DIFF) & (R > RED_MIN_LEVEL)
    print(f"朱砂红像素 {int(is_red.sum())}")

    # ---- 连通域：找头像与文字 ----
    lab, comps = label_components(L < INK_THRESHOLD)
    print(f"连通域 {len(comps)} 个")

    def fill_ratio(c):
        return c["n"] / ((c["x1"] - c["x0"] + 1) * (c["y1"] - c["y0"] + 1))

    avatar = max((c for c in comps if fill_ratio(c) > 0.5), key=lambda c: c["n"])
    print(f"头像 盒 x[{avatar['x0']}-{avatar['x1']}] y[{avatar['y0']}-{avatar['y1']}] "
          f"填充率 {fill_ratio(avatar):.2f}")

    # 文字只出现在中段；左右两侧是花叶，用列范围把它们排除掉
    TX0, TX1, TY0, TY1 = 250, 960, 80, 250
    text_ids = {c["id"] for c in comps
                if c["id"] != avatar["id"]
                and c["x0"] >= TX0 and c["x1"] <= TX1
                and c["y0"] >= TY0 and c["y1"] <= TY1}
    print(f"文字块 {len(text_ids)} 个")

    # ---- alpha：白底透明，墨迹保留 ----
    alpha = np.clip(255 - L, 0, 255).astype(np.uint8)
    # 去噪：把白底上的 JPEG 噪点压成完全透明
    alpha = np.clip((alpha.astype(int) - NOISE_THRESHOLD) / (255 - NOISE_THRESHOLD) * 255,
                    0, 255).astype(np.uint8)

    erase = (lab == avatar["id"])
    for i in text_ids:
        erase |= (lab == i)
    alpha[erase] = 0
    print(f"已清除 {int(erase.sum())} 像素（头像 + 文字）")

    # ---- 线稿层（去掉红花）----
    ink_alpha = alpha.copy()
    ink_alpha[is_red] = 0
    frame = np.dstack([card.astype(np.uint8), ink_alpha])
    frame = shrink_rgb_where_transparent(frame)
    frame_im = Image.fromarray(frame, "RGBA").quantize(colors=PALETTE_COLORS,
                                                      method=Image.FASTOCTREE)
    frame_im.save(OUT / "friend-frame.png", optimize=True)

    # ---- 红花层（同画布，方便与线稿层对齐）----
    bloom_alpha = alpha.copy()
    bloom_alpha[~is_red] = 0
    bloom = np.dstack([card.astype(np.uint8), bloom_alpha])
    bloom = shrink_rgb_where_transparent(bloom)
    ys, xs = np.where(bloom_alpha > 0)
    print(f"红花包围盒 x[{xs.min()}-{xs.max()}] y[{ys.min()}-{ys.max()}]")
    Image.fromarray(bloom, "RGBA").quantize(colors=32, method=Image.FASTOCTREE) \
        .save(OUT / "friend-bloom.png", optimize=True)

    for n in ("friend-frame.png", "friend-bloom.png"):
        print(f"  {n:22} {(OUT / n).stat().st_size / 1024:7.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
