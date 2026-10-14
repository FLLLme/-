---
title: CSS Grid 与 Flexbox 的选型逻辑
date: 2026-09-11
tags: [CSS, 前端, 布局]
excerpt: 两者不是新旧替代关系。用一句话概括：一维用 Flex，二维用 Grid，但真正的判断标准比这句话更细致。
---

## 一句话版本的局限

"一维用 Flexbox，二维用 Grid"——这句话流传很广，方向没错，但不足以支撑实际决策。

因为它没有回答一个关键问题：**容器里的项目数量是不确定的**（`auto-fill` 场景）时，该用哪个？以及：**同一个布局在不同断点下需要在两个方案之间切换**时，判断依据是什么？

## 判断依据：是否存在"行列关系的约束"

真正决定选型的是这一条：

> 布局中是否需要同时约束**行**和**列**的尺寸关系？

- 只需要控制**沿一个轴的排布与分配** → Flexbox
- 需要控制**项目落在第几行第几列**，或行列尺寸互相影响 → Grid

```css
/* Flex：只关心横向如何排布与分配 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* Grid：行列同时受控 */
.page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  grid-template-rows: auto 1fr auto;
  gap: 32px;
}
```

## 五个典型场景的选型

### 场景一：导航栏、工具栏、按钮组 → Flexbox

特点是**一维、项目数量固定、需要对齐和间距分配**。Grid 在这里没有任何优势，反而需要多写 `grid-auto-flow: column`。

### 场景二：卡片瀑布流 → Grid + `auto-fill`

这是最容易被误用 Flexbox 的场景：

```css
/* ❌ Flex 版本：靠 flex-basis 和 margin 凑，换行后最后一行对齐很差 */
.cards { display: flex; flex-wrap: wrap; }
.cards > * { flex: 1 1 320px; margin: 10px; }

/* ✅ Grid 版本：列数自动计算，间距严格一致 */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
```

`auto-fill` 与 `auto-fit` 的区别值得单独记住：

- `auto-fill`：**保留空轨道**。3 个卡片在能放 4 列的容器里，只占 3 列宽度，不会拉伸。
- `auto-fit`：**折叠空轨道**。3 个卡片会拉伸填满整行。

本站文章列表用的是 `auto-fill`——因为当文章只有 2 篇时，我不希望两张卡片被拉伸得又宽又扁。

### 场景三：整体页面骨架 → Grid

```css
body {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;   /* header / main / footer */
}
main { min-height: 0; }                /* 关键：允许内部滚动 */
```

用 `auto 1fr auto` 实现"页脚贴底"比 Flexbox 更直观，因为行尺寸是显式声明的。

注意 `min-height: 0`——Grid 和 Flex 的子项默认 `min-height: auto`，不加这一行，内部 `overflow` 元素会撑破容器。这是最经典的踩坑点之一。

### 场景四：居中一个元素 → 两者都行，选 Grid

```css
/* Flex */
.center { display: flex; align-items: center; justify-content: center; }

/* Grid：两行搞定 */
.center { display: grid; place-items: center; }
```

纯居中用 Grid 的 `place-items` 更短。这是 Grid 唯一一个"纯一维场景但更优"的例子。

### 场景五：交错排列（文字左图右，交替）→ Grid

```css
.feature { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
.feature:nth-child(even) .text { order: 2; }   /* 用 order 换位 */
```

Flexbox 做不到这一点，因为交错涉及"跨行跨列"的定位需求。

## 混用的正确姿势

实际项目里两者几乎总是一起用，关键在于**层级分工清晰**：

```css
.post-layout {                          /* 外层：Grid 管大局 */
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 48px;
  align-items: start;
}

.article-actions {                      /* 内层：Flex 管局部 */
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
```

原则是：**Grid 负责"区域在哪里"，Flex 负责"内容怎么排"。** 不要在 Grid 子项里再用 Grid 重建二维网格，也不要试图用嵌套 Flex 模拟表格布局。

## 一个容易忽略的细节：`minmax(0, 1fr)`

为什么写 `minmax(0, 1fr)` 而不是直接 `1fr`？

因为 `1fr` 的隐含最小值是 `auto`，等于"内容的最小尺寸"。当内容是一个很长的不换行代码块或宽表格时，这一列会被内容撑开，溢出整个容器。

```css
/* ❌ 表格很宽时会把侧栏挤出屏幕 */
grid-template-columns: 1fr 250px;

/* ✅ 强制允许收缩到 0，配合 overflow 才能正常滚动 */
grid-template-columns: minmax(0, 1fr) 250px;
```

本站正文区域就采用了这个写法，配合 `.article-body table { display: block; overflow-x: auto; }`，宽表格会自己滚动而不会破坏整体布局。

## 小结

| 维度 | Flexbox | Grid |
| --- | --- | --- |
| 控制轴 | 一维（主轴 + 交叉轴） | 二维（行 + 列） |
| 尺寸来源 | 内容驱动为主 | 容器驱动为主 |
| 项目定位 | 顺序排布 | 可显式指定行列 |
| 典型用途 | 导航、工具栏、按钮组 | 页面骨架、卡片墙、图文交错 |
| 内容溢出 | `min-width: 0` | `minmax(0, 1fr)` |

记住一句话就够了：**当你要说"第 2 个元素放在第 1 行第 2 列"时，用 Grid；当你要说"这些元素横向排开、两端对齐"时，用 Flexbox。**
