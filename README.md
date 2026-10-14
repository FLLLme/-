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
├─ .nojekyll               ★ GitHub Pages 必需，关闭 Jekyll（详见第九节）
├─ index.html              文章列表页
├─ post.html               文章详情页（?id=<slug>）
├─ server.py               本地服务器 + DeepSeek 同源代理
├─ start.bat               Windows 一键启动
│
├─ .github/workflows/
│   └─ sync-content.yml    ★ 把 content/posts/ 同步为 posts/ 并重建清单
│
├─ content/posts/          ★ 文章的唯一事实来源（由 CMS 后台读写）
│   └─ *.md
│
├─ posts/                  前端消费的生成目录（由工作流自动维护，勿手改）
│   ├─ *.md                从 content/posts/ 同步而来
│   ├─ manifest.json       文章清单，供前端枚举
│   └─ bundle.js           离线数据包（file:// 兜底）
│
├─ static/
│   ├─ admin/              Decap CMS 后台
│   │   ├─ index.html
│   │   └─ config.yml
│   └─ images/uploads/     后台插入的图片（首次上传时自动创建）
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
├─ deploy/
│   └─ cloudflare-worker.js  可选：线上共享代理，让访客无需自备 API Key
│
└─ tools/
    ├─ sync_content.py     content/posts → posts 同步 + 重建 manifest
    ├─ bundle.py           从 posts/*.md 生成离线数据包
    └─ selftest.js         校验 Markdown 解析结果的命令行自检
```

### 数据流向

```
你在后台写作                     GitHub Actions                  读者看到的
─────────────                  ────────────────                ──────────
Decap CMS  ──写入──▶  content/posts/*.md
                            │
                            │  推送触发 sync-content.yml
                            ▼
                      posts/*.md + manifest.json + bundle.js
                            │
                            │  提交回 main
                            ▼
                                                    ──▶  GitHub Pages 提供静态文件
```

**关键理解**：`content/posts/` 是源，`posts/` 是产物。
你只应该编辑前者——后者会在每次推送时被工作流覆盖。

---

## 三、新增 / 编辑 / 删除文章

**只操作 `content/posts/`。** 这里是文章的源，`posts/` 是工作流生成的产物，
你手改后者会在下次推送时被覆盖。

### 方式一：用后台（推荐）

打开 `https://flllme.github.io/-/static/admin/` → 用 GitHub 账号登录 →
左侧「文章」→ 新建 / 编辑 / 删除 → 保存。

保存后 Decap 会直接提交到 `main`，工作流随即把改动同步到 `posts/`，
约 1 分钟后线上生效。

### 方式二：直接改文件

在 `content/posts/` 下新建或编辑 `.md`，提交到 `main`，其余交给工作流。

```markdown
---
title: 文章标题
date: 2026-10-14
tags:
  - 前端
  - 随笔
excerpt: 一句话摘要，会显示在列表页卡片上。留空则自动截取正文前 110 字。
---

正文从这里开始，支持标准 Markdown 语法。
```

`tags` 支持两种写法，解析结果相同：

```yaml
tags: [前端, 随笔]      # 行内数组
tags:                    # 块状列表（后台保存时用这种）
  - 前端
  - 随笔
```

### 关于 manifest.json

**你不需要手工维护它。** `tools/sync_content.py` 每次都会按 `content/posts/`
的实际内容重新生成，包括删除已不存在的条目。

脚本内置了安全阀：**若 `content/posts/` 为空则中止并报错**，避免误把线上文章全部清除。

> 前端加载器也做了容错：`store.js` 用 `Promise.allSettled` 拉取文章，
> 清单里登记但读取失败的文件会被跳过并在控制台列出，**不会**导致整站回退到离线数据包。

### 重命名文章（改 URL）

文件名就是 URL 里的 `?id=`，重命名等于换了地址：

- 该文章的 Twikoo 评论会失联（评论按 slug 归属）
- 旧地址变成 404

如果确实要改，建议：改文件名 → 提交 → 在 Twikoo 后台用
「评论管理 → 迁移」把旧 slug 的评论搬到新 slug。

### 可选 Frontmatter 字段

| 字段 | 说明 |
| --- | --- |
| `title` | 标题，缺省时用文件名 |
| `date` | 发布日期，格式 `YYYY-MM-DD`，用于排序 |
| `updated` | 更新日期，与 `date` 不同时会在详情页额外显示 |
| `tags` | 标签数组，用于筛选与聚合 |
| `excerpt` | 列表页摘要，缺省时自动截取正文前 110 字 |

### 关于 `posts/bundle.js`

它是 `file://` 离线浏览的兜底数据包，由 `tools/bundle.py` 从 `posts/*.md` 生成。
**它不影响线上站点**——线上优先读取真实的 `.md` 文件，只有全部 `.md` 都读不到时才会用到它。

改动文章内容后，若要维持 `file://` 模式的内容同步，执行：

```bash
python tools/bundle.py
```

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
| **代理模式**（推荐） | 健康检查地址可访问 | 服务端环境变量 | 生产部署 |
| 直连模式 | 探测失败时回落 | 浏览器 localStorage | 本地实验、GitHub Pages |

健康检查地址由 `proxyEndpoint` 自动推导（`…/api/chat` → `…/api/health`），
因此切换代理只需改一个字段：

```js
// 本地开发（server.py）
proxyEndpoint: '/api/chat'

// 线上部署（Cloudflare Worker 等外部代理）
proxyEndpoint: 'https://your-worker.workers.dev/api/chat'
```

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

## 九、部署到 GitHub Pages

### 必须先加 `.nojekyll`

这是本项目的**必要步骤**，不是可选优化。

GitHub Pages 默认用 Jekyll 处理站点。而本项目的文章文件以 `---` 包裹的 front matter 开头，
Jekyll 会把它识别成**自己的**页面元数据，于是把 `posts/*.md` 编译成 `posts/*.html`，
原始 `.md` 文件不再被发布。结果是前端的主加载路径全部 404，只能退到离线数据包。

对照现象（部署 `.nojekyll` 前后）：

| 路径 | 无 `.nojekyll` | 有 `.nojekyll` |
| --- | --- | --- |
| `posts/hello-blog.md` | **404** | 200 |
| `posts/hello-blog.html` | 200（Jekyll 生成的冗余页面） | 404 |
| `README.md` | 200（无 front matter，被原样保留） | 200 |

**做法**：在仓库根目录放一个名为 `.nojekyll` 的**空文件**（本项目根目录已包含）。
它会让 Pages 跳过 Jekyll，所有文件按原样发布。

> 若通过 GitHub Actions 发布（`upload-pages-artifact`），`.nojekyll` 需位于上传的产物根目录。
> 若通过「Settings → Pages → Deploy from a branch」发布，放在分支根目录即可。

### 完整的部署步骤

```bash
git add .nojekyll
git commit -m "chore: 关闭 Jekyll，使 Markdown 源文件可被直接访问"
git push
```

推送后等待 Pages 重新构建（约 1 分钟），然后验证：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<用户名>.github.io/<仓库名>/posts/hello-blog.md
# 期望输出 200；若仍为 404，说明 .nojekyll 未生效
```

### 关于 AI 助手

GitHub Pages 只能托管静态文件，**无法运行 `server.py`**，因此线上站点会自动回落到直连模式。
经实测，`api.deepseek.com` 的 CORS 策略是按 Origin 回显的：

```
access-control-allow-origin: https://<用户名>.github.io
access-control-allow-methods: POST
access-control-allow-headers: authorization,content-type
```

所以直连模式在线上可以正常工作，但每位访客都需要在设置面板填入自己的 API Key
（Key 只存在访客本机浏览器，不会上传）。

**如果你希望访客开箱即用**，部署 `deploy/cloudflare-worker.js` 作为共享代理：
密钥由 Worker 环境变量持有，访客无需任何配置。该方案在 Cloudflare 免费额度内即可运行。

### 关于评论

Twikoo 的后端可以独立部署（Vercel / 腾讯云函数 / Docker），与博客托管位置无关。
部署完成后把地址填入 `js/config.js` 的 `twikoo.envId` 即可，GitHub Pages 不受影响。

---

## 十、内容管理后台与自动同步

### 为什么需要这条流水线

纯静态博客没有后端，浏览器无法枚举服务器上的目录，因此前端必须靠一份
`posts/manifest.json` 清单才知道"有哪些文章"。

而 Decap CMS 只能写内容文件，**不会维护这份清单**。于是新增的文章虽然进了仓库，
却不会出现在列表页——这是最容易踩的坑。`sync-content.yml` 就是用来补上这一环的。

### 工作流做了什么

`.github/workflows/sync-content.yml`，触发条件是**向 main 推送且 `content/posts/` 有改动**：

1. 检出仓库
2. 运行 `tools/sync_content.py` —— 把 `content/posts/*.md` 同步到 `posts/`，
   删除源中已不存在的文章，并按实际内容重建 `posts/manifest.json`
3. 运行 `tools/bundle.py` —— 重建离线数据包 `posts/bundle.js`
4. 若 `posts/` 有变化则提交并推送回 `main`（提交信息带 `[skip ci]`）

### 为什么不会无限循环

三重保险，任意一条生效都不会成环：

1. `paths` 过滤器只匹配 `content/posts/**`，而工作流只改动 `posts/**`，不会再次触发自身
2. 提交信息含 `[skip ci]`
3. GitHub 规定：用 `GITHUB_TOKEN` 推送的提交**不会**触发新的工作流运行

### 必须先开权限

`Settings → Actions → General → Workflow permissions` 选择
**Read and write permissions**。否则最后一步 `git push` 会因权限不足失败。

### 本地手动执行

工作流调用的就是普通命令行脚本，本地可随时跑：

```bash
python tools/sync_content.py --dry-run   # 只看将要发生的改动
python tools/sync_content.py             # 实际执行
python tools/bundle.py                   # 重建离线包
```

### 安全阀

`sync_content.py` 在 `content/posts/` 为空时会**中止并报错**，绝不清空 `posts/`。
这是为了防止"源目录被误删/改错路径"导致线上文章全被清掉。

筛选规则：以下划线或点开头的文件（如 `_draft.md`）视为草稿，不参与发布。

### 后台（Decap CMS）

| 项目 | 值 |
| --- | --- |
| 入口 | `https://flllme.github.io/-/static/admin/` |
| 仓库 | `FLLLme/-` |
| 分支 | `main` |
| 内容目录 | `content/posts/` |
| OAuth 代理 | `https://my-blog-oauth.flllme-one.workers.dev` |
| 字段 | 标题、日期、标签、摘要、正文 |

`base_url` 只写到根地址，Decap 会自行拼接 `/auth` 与 `/callback`；
**不要手动加 `/callback`**，否则会拼成 `/callback/callback`。

后台页面本身是公开可访问的（纯静态），但**没有通过 GitHub OAuth 授权的人无法读写任何内容**，
所有写操作都以登录者的 GitHub 权限为准。页面已加 `noindex`。

---

## 十一、技术要点

| 决策 | 理由 |
| --- | --- |
| 零框架 | 博客交互密度低，原生 DOM 足够；首屏无 hydration 成本，包体积约 40 KB（不含 CDN 库） |
| Markdown 双目录 | `content/posts/` 给 CMS 写，`posts/` 给前端读，用一次 CI 同步换取"后台可视化写作" |
| 无运行时枚举 | 静态托管无法列目录，故用清单文件；清单由 CI 自动重建，人不碰 |
| 双路径加载 | HTTP 走真实 `.md`，`file://` 走打包数据，两全其美 |
| 内置解析器兜底 | CDN 不可达时页面仍能渲染，不依赖单一外部服务 |
| 同源代理调 AI | 同时解决 CORS 与密钥安全，不牺牲流式体验 |
| front matter 兼容两种列表 | 行内数组与块状列表都能解析，否则后台写出的标签会被静默丢弃 |
