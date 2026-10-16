#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成朋友章「第一位」的花卉边框素材（三块 SVG）。

为什么用遮罩（mask）而不是彩色 SVG
----------------------------------
三块素材都画成「黑线 + 透明底」，在 CSS 里当 mask-image 使用，
颜色由元素的 background 提供。好处：
  · 一份素材同时适配明暗两种主题（颜色交给 CSS 变量）
  · 朱砂红与线稿色可以分开设置，不必出两套图
  · 花边随卡片宽度无限平铺，任何宽度都不会被拉伸变形

关于笔画宽度
------------
花边实际只渲染 18px 高，可见笔画不足 1px。所以图形要**刻意画粗、画满**，
否则在屏幕上会退化成「一根波浪线 + 几个小点」，看不出是花草。
本文件里的 stroke-width 偏大是故意的，改动前请先看预览页。

产出
----
assets/friend-frame-edge.svg     上下花边，56×18，可横向无缝平铺
assets/friend-frame-cluster.svg  花卉簇，56×56
assets/friend-frame-bloom.svg    彼岸花，36×36
"""

import math
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(parents=True, exist_ok=True)

SW = 1.15          # 主笔画宽度（见上文说明）


# ---------------------------------------------------------------- 曲线工具

def cubic(p0, p1, p2, p3, t):
    u = 1 - t
    x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
    y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
    return x, y


def tangent(p0, p1, p2, p3, t):
    u = 1 - t
    dx = 3 * u**2 * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t**2 * (p3[0] - p2[0])
    dy = 3 * u**2 * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t**2 * (p3[1] - p2[1])
    return math.degrees(math.atan2(dy, dx))


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- 基础形状

def leaf(x, y, angle, L=12.0, W=4.3, sw=None):
    """叶片：透镜形轮廓 + 中脉。长轴沿 +x，用 translate+rotate 摆放。"""
    w = SW if sw is None else sw
    d = (f"M0 0 C{n(L*0.28)} {n(-W)} {n(L*0.74)} {n(-W*0.92)} {n(L)} 0 "
         f"C{n(L*0.74)} {n(W*0.92)} {n(L*0.28)} {n(W)} 0 0 Z")
    vein = f"M{n(L*0.12)} 0 L{n(L*0.86)} 0"
    return (f'<g transform="translate({n(x)} {n(y)}) rotate({n(angle)})" stroke-width="{n(w)}">'
            f'<path d="{d}"/><path d="{vein}" stroke-width="{n(w*0.72)}"/></g>')


def bloom5(x, y, r=3.6, sw=None):
    """五瓣小花：五枚尖椭圆绕心排布，中心一点"""
    w = SW if sw is None else sw
    parts = [f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(r*0.3)}" fill="#000" stroke="none"/>']
    for i in range(5):
        a = 72 * i - 90
        parts.append(
            f'<g transform="translate({n(x)} {n(y)}) rotate({n(a)})">'
            f'<path d="M0 {n(-r*0.15)} C{n(r*0.46)} {n(-r*1.1)} {n(-r*0.46)} {n(-r*1.1)} 0 {n(-r*0.15)} Z" '
            f'stroke-width="{n(w*0.8)}"/></g>')
    return "".join(parts)


def bud(x, y, angle, scale=1.0, sw=None):
    """花苞：水滴形"""
    w = SW if sw is None else sw
    return (f'<g transform="translate({n(x)} {n(y)}) rotate({n(angle)})" stroke-width="{n(w*0.9)}">'
            f'<path d="M0 0 C{n(3.0*scale)} {n(-3.9*scale)} {n(6.2*scale)} {n(-2.8*scale)} {n(6.4*scale)} 0 '
            f'C{n(6.2*scale)} {n(2.8*scale)} {n(3.0*scale)} {n(3.9*scale)} 0 0 Z"/></g>')


def rose(cx, cy, R=8.6, sw=None):
    """线稿玫瑰：五枚花瓣绕心交叠，中心一点。

    试过两种做法，都不行：
      · 一整个螺旋  → 小尺寸下读成蜗牛壳
      · 三层同心弧、开口逐层错开 → 开口连成一条假螺旋，同样像蜗牛
    最后用「花瓣」：每枚是从花心伸出的透镜形，五枚交叠成花心，
    中心点一点收尾。这样无论在多大尺寸下都明确读作一朵花。
    """
    w = SW if sw is None else sw
    out = []
    for i in range(5):
        a = math.radians(72 * i + 18)
        ca, sa = math.cos(a), math.sin(a)
        px, py = cx + R * ca, cy + R * sa           # 花瓣尖端
        c1 = (cx + 0.55 * R * ca + 0.44 * R * (-sa), cy + 0.55 * R * sa + 0.44 * R * ca)
        c2 = (cx + 0.55 * R * ca - 0.44 * R * (-sa), cy + 0.55 * R * sa - 0.44 * R * ca)
        out.append(f'<path d="M{n(cx)} {n(cy)} Q{n(c1[0])} {n(c1[1])} {n(px)} {n(py)} '
                   f'Q{n(c2[0])} {n(c2[1])} {n(cx)} {n(cy)} Z" stroke-width="{n(w*0.9)}"/>')
    # 花心：两圈小弧，收住花瓣的交汇点
    for rr in (R * 0.42, R * 0.22):
        out.append(f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{n(rr)}" stroke-width="{n(w*0.75)}"/>')
    return "".join(out)


# ------------------------------------------------- 一、上下花边（可无缝平铺）

def make_edge(width=56, height=18):
    p0 = (0, height / 2)
    p1 = (width * 0.25, height / 2 - 4.0)
    p2 = (width * 0.75, height / 2 + 4.0)
    p3 = (width, height / 2)

    t0, t1 = tangent(p0, p1, p2, p3, 0), tangent(p0, p1, p2, p3, 1)
    assert abs(t0 - t1) < 1e-9, f"首尾切线不一致，平铺会出现折角：{t0} vs {t1}"

    body = [f'<path d="M{n(p0[0])} {n(p0[1])} C{n(p1[0])} {n(p1[1])} '
            f'{n(p2[0])} {n(p2[1])} {n(p3[0])} {n(p3[1])}"/>']

    # 叶片：沿曲线交替上下，六片，密一点才看得出是花边
    for i, t in enumerate((0.14, 0.28, 0.42, 0.58, 0.72, 0.86)):
        x, y = cubic(p0, p1, p2, p3, t)
        a = tangent(p0, p1, p2, p3, t)
        side = -1 if i % 2 == 0 else 1
        body.append(leaf(x, y, a + side * 58, L=11.5, W=4.1))

    # 两朵小花 + 两个花苞，压住中段显得饱满
    for t in (0.36, 0.64):
        x, y = cubic(p0, p1, p2, p3, t)
        body.append(bloom5(x, y, r=3.5))
    for t, side in ((0.07, -1), (0.93, 1)):
        x, y = cubic(p0, p1, p2, p3, t)
        body.append(bud(x, y - side * 4.2, side * 34, scale=0.9))

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" fill="none" stroke="#000" stroke-width="{SW}" '
        f'stroke-linecap="round" stroke-linejoin="round">' + "".join(body) + '</svg>')


def make_edge_vertical(width=56, height=18):
    """把横向花边整体旋转 90°，得到铺竖边用的 18×56 版本。

    不能让 56×18 的图去铺竖边——会被压扁成原来的三分之一。
    几何完全复用，外层套一个 rotate(90)，坐标系映射 (x,y)→(-y,x)，
    再 translate(height,0) 把结果挪回第一象限。
    """
    inner = make_edge(width, height)
    body = inner[inner.index(">") + 1: inner.rindex("</svg>")]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{height}" height="{width}" '
        f'viewBox="0 0 {height} {width}" fill="none" stroke="#000" stroke-width="{SW}" '
        f'stroke-linecap="round" stroke-linejoin="round">'
        f'<g transform="translate({height} 0) rotate(90)">{body}</g></svg>')


# ------------------------------------------------------------ 二、花卉簇

def make_cluster(size=56):
    c = size / 2
    # 主花偏左上，给右下留出叶片伸展的余地 —— 居中的话会读成「太阳」
    body = [rose(c - 3.5, c - 3.5, R=8.8)]

    # 叶片：**非对称**分布，朝同一侧铺开，长短与角度都错开。
    # 均匀放射会变成太阳光芒，所以角度刻意不规则。
    for a, dist, L, W in (
        (-138, 15.5, 15.0, 5.2),
        (-104, 17.0, 13.0, 4.6),
        (-72,  15.0, 14.5, 5.0),
        (166,  14.5, 12.5, 4.4),
        (128,  16.5, 11.5, 4.0),
        (36,   13.0, 10.0, 3.6),
    ):
        rad = math.radians(a)
        body.append(leaf(c - 3.5 + dist * math.cos(rad), c - 3.5 + dist * math.sin(rad),
                         a, L=L, W=W))

    # 一枚小花 + 两枚花苞，填补右侧空隙
    body.append(bloom5(c + 15, c - 1, r=3.0))
    body.append(bud(c + 16, c + 13, 62, scale=0.9))
    body.append(bud(c + 6, c + 17, 108, scale=0.8))

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}" fill="none" stroke="#000" stroke-width="{SW}" '
        f'stroke-linecap="round" stroke-linejoin="round">' + "".join(body) + '</svg>')


# ------------------------------------------------------------------ 三、彼岸花

def make_bloom(size=36):
    """彼岸花（曼珠沙华）：细长反卷的花瓣 + 长蕊。

    刻意比站标那版更「疏」——站标的几何在 30px 以下会挤成一团红疙瘩，
    这里把花瓣拉长、收窄、向外反卷，小尺寸下才认得出是彼岸花。
    """
    parts = []
    for i in range(5):
        a = 72 * i
        parts.append(
            f'<g transform="rotate({a} 18 18)">'
            f'<path d="M18 18 C15.0 12.6 15.6 7.6 18.6 3.6 '
            f'C20.4 5.4 20.8 11.0 20.6 18" stroke-width="1.05"/></g>')
        parts.append(
            f'<g transform="rotate({a + 36} 18 18)">'
            f'<path d="M18 18 C17.2 12.4 15.8 7.0 17.6 1.4" stroke-width="0.8"/>'
            f'<ellipse cx="17.7" cy="1.2" rx="0.85" ry="1.5" fill="#000" stroke="none"/></g>')
    parts.append('<circle cx="18" cy="18" r="1.7" fill="#000" stroke="none"/>')

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 36 36" fill="none" stroke="#000" stroke-linecap="round" '
        f'stroke-linejoin="round">' + "".join(parts) + '</svg>')


# ------------------------------------------------------------------- 输出

files = {
    "friend-frame-edge.svg": make_edge(),
    "friend-frame-edge-v.svg": make_edge_vertical(),
    "friend-frame-cluster.svg": make_cluster(),
    "friend-frame-bloom.svg": make_bloom(),
}

for name, svg in files.items():
    path = OUT / name
    path.write_text(svg + "\n", encoding="utf-8", newline="\n")
    print(f"  {name:30} {path.stat().st_size:5} 字节")
