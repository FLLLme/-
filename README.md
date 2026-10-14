# Ink & Logic · 个人博客

一个**零框架**的个人博客：纯 HTML + CSS + JavaScript 实现，文章以 Markdown 文件存储，
集成 **Twikoo** 评论系统与 **DeepSeek** AI 问答助手。

---

## 一、快速开始

```bash
# 1. 启动本地服务器（同时提供静态服务与 DeepSeek 代理）
python server.py

# 2. 浏览器打开
http://127.0.0.1:8080
```

> **为什么需要服务器？** 浏览器在 `file://` 协议下会拦截对本地 `.md` 文件的 `fetch` 请求。
> 项目已内置离线兜底（`posts/bundle.js`），直接双击 `index.html` 也能浏览，
> 但新增文章后需要重新生成数据包。
>
> **不装 Python 也行**：`npx serve .` 或 `python -m http.server 8080` 同样可以托管静态文件，
> 只是不含 AI 代理接口。

---

## 二、目录结构

```
.
├─ index.html              文章列表页
├─ post.html               文章详情页（?id=<slug>）
├─ server.py               本地服务器 + DeepSeek 同源代理
│
├─ css/
│   └─ style.css           全站样式（设计令牌 + 明暗主题 + 响应式）
│
├─ js/
│   ├─ config.js           站点集中配置 ← 改这里就够了
│   ├─ app.js              公共工具：主题、顶栏、页脚、文本处理
│   ├─ md.js               Markdown 渲染引擎（marked + 内置兜底解析器）
│   ├─ store.js            数据层：加载并解析 Markdown 文章
│   ├─ main.js             列表页逻辑：搜索、标签筛选、卡片渲染
│   ├─ post.js             详情页逻辑：目录、阅读进度、上下篇、Twikoo
│   └─ ai.js               AI 问答抽屉：流式对话、上下文注入、设置面板
│
├─ posts/
│   ├─ manifest.json       文章清单（新增文章需在此登记）
│   ├─ *.md                Markdown 源文件 ← 唯一事实来源
│   └─ bundle.js           离线数据包（由 tools/bundle.py 生成，勿手改）
│
└─ tools/
    ├─ bundle.py           从 posts/*.md 生成离线数据包
    └─ selftest.js         校验 Markdown 解析结果的命令行自检
```

---

## 三、写一篇新文章

1. 在 `posts/` 下新建 `我的文章.md`：

   ```markdown
   ---
   title: 文章标题
   date: 2026-10-14
   tags: [前端, 随笔]
   excerpt: 一句话摘要，会显示在列表页卡片上。
   ---

   正文从这里开始，支持标准 Markdown 语法。
   ```

2. 在 `posts/manifest.json` 的 `posts` 数组中登记文件名：

   ```json
   { "posts": ["我的文章.md", "hello-blog.md"] }
   ```

3. 刷新页面即可。若还需支持 `file://` 离线浏览，执行：

   ```bash
   python tools/bundle.py
   ```

**可选 Frontmatter 字段**

| 字段 | 说明 |
| --- | --- |
| `title` | 标题，缺省时用文件名 |
| `date` | 发布日期，格式 `YYYY-MM-DD`，用于排序 |
| `updated` | 更新日期，与 `date` 不同时会在详情页额外显示 |
| `tags` | 标签数组，用于筛选与聚合 |
| `excerpt` | 列表页摘要，缺省时自动截取正文前 110 字 |

---

## 四、配置 Twikoo 评论

1. 按 [Twikoo 官方文档](https://twikoo.js.org/) 部署服务端（腾讯云函数 / Vercel / Docker 均可）。
2. 打开 `js/config.js`，填入部署得到的地址：

   ```js
   twikoo: {
     version: '1.6.39',
     envId: 'https://your-twikoo.vercel.app',   // ← 这里
     lang: 'zh-CN'
   }
   ```

3. 刷新页面。

**关键说明**

- 评论以文章的 `slug`（即 `.md` 文件名去掉扩展名）作为归属标识。
  **站点上线后不要修改文章文件名**，否则历史评论会与文章脱钩。
- `envId` 留空时，评论区会显示配置引导而不是报错，不影响页面其它功能。
- 部署后请立即访问 `/admin` 完成管理员初始化。**未初始化的 Twikoo 实例任何人都能注册为管理员。**
- 生产环境建议在 Twikoo 后台开启评论审核、频率限制与数据备份。

---

## 五、配置 DeepSeek AI 问答

### 架构说明

AI 助手位于文章详情页右下角。它有两种工作模式，页面加载时自动探测：

| 模式 | 触发条件 | 密钥位置 | 适用场景 |
| --- | --- | --- | --- |
| **代理模式**（推荐） | `/api/health` 可访问 | 服务端环境变量 | 生产部署 |
| 直连模式 | 探测失败时回落 | 浏览器 localStorage | 本地实验 |

**为什么不直接用浏览器直连？** 两个原因：

1. **CORS**。`api.deepseek.com` 的跨域策略不由我们控制，直连随时可能被浏览器拦截。
2. **密钥泄露**。前端硬编码的 Key 会完整暴露在 DevTools 的 Network 面板中，等同于公开。

`server.py` 提供的 `/api/chat` 接口同时解决了这两点：请求同源、密钥只在服务端。

### 启用代理模式

```bash
# Windows PowerShell
$env:DEEPSEEK_API_KEY="sk-xxxxxxxx"
python server.py

# macOS / Linux
export DEEPSEEK_API_KEY=sk-xxxxxxxx
python server.py
```

启动后页面顶部的状态条会显示「代理模式 · 密钥由服务端提供」。

也可以不设环境变量，直接在页面右上角 ⚙ 设置面板里填写 Key——此时 Key 会通过
`X-DeepSeek-Key` 请求头传给本地代理。这只适合本机调试，**公开部署请务必使用环境变量**。

### 生产部署参考（Nginx）

```nginx
location /api/chat {
    proxy_pass https://api.deepseek.com/chat/completions;
    proxy_set_header Authorization "Bearer $DEEPSEEK_API_KEY";
    proxy_set_header Content-Type application/json;
    proxy_buffering off;          # 关键：关闭缓冲才能流式输出
    proxy_read_timeout 300s;
}
```

`proxy_buffering off` 是流式响应的必要条件，遗漏它会导致回复一次性蹦出来而不是逐字输出。

### AI 助手的能力

- **上下文注入**：自动把当前文章（截取前 6000 字）作为 system 提示，回答贴合文章内容。
- **流式输出**：SSE 逐字渲染，支持随时中止。
- **Markdown 渲染**：代码块、表格、列表正常显示，并带语法高亮。
- **多轮对话**：保留最近 12 轮上下文。
- **模型切换**：`deepseek-chat` 与 `deepseek-reasoner` 可选。

---

## 六、自定义外观

所有视觉变量集中在 `css/style.css` 顶部：

```css
:root {
  --accent: #3d5af1;      /* 主色 */
  --bg:     #f6f7f9;      /* 背景 */
  --text:   #171a21;      /* 正文色 */
  --maxw:   1140px;       /* 内容最大宽度 */
  --radius: 12px;         /* 圆角 */
}
```

深色主题对应 `[data-theme="dark"]` 区块。主题切换由 `js/app.js` 写入
`localStorage`，并在 `<head>` 中有一段内联脚本提前执行，避免首屏闪白。

站点名称、作者、页脚、备案号等文字信息统一在 `js/config.js` 顶部修改。

---

## 七、自检

```bash
node tools/selftest.js
```

该脚本用 Node 加载 `js/md.js` 的内置解析器，逐篇渲染所有 Markdown 文件，
检查标题、列表、代码块、表格是否被正确解析，并输出每篇的渲染字节数。
改动 `md.js` 或新增文章后建议运行一次。

---

## 八、常见问题

**页面显示「检测到本地文件模式」**
说明是通过 `file://` 打开的，且 `posts/bundle.js` 不存在。执行 `python server.py`，
或先运行 `python tools/bundle.py` 生成离线数据包。

**评论区一直显示「加载中」**
检查网络能否访问 jsDelivr CDN。若部署在国内环境，建议把
`https://cdn.jsdelivr.net/npm/twikoo@...` 换成自建镜像地址（在 `js/post.js` 的 `loadComments` 中）。

**AI 回复报「无法连接到接口」**
直连模式下多半是 CORS 拦截。改用 `python server.py` 启动，让前端走同源代理。

**AI 回复报 401**
Key 无效或未配置。环境变量方式请确认变量名是 `DEEPSEEK_API_KEY`。

**流式输出变成一次性输出**
反向代理开启了响应缓冲。参考上文 Nginx 配置中的 `proxy_buffering off`。

---

## 九、技术要点

| 决策 | 理由 |
| --- | --- |
| 零框架 | 博客交互密度低，原生 DOM 足够；首屏无 hydration 成本，包体积约 40 KB（不含 CDN 库） |
| Markdown 存储 | Git 友好、可迁移、无数据库、无构建步骤 |
| 双路径加载 | HTTP 走真实 `.md`，`file://` 走打包数据，两全其美 |
| 内置解析器兜底 | CDN 不可达时页面仍能渲染，不依赖单一外部服务 |
| 同源代理调 AI | 同时解决 CORS 与密钥安全，不牺牲流式体验 |
