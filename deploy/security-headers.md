# Cloudflare 响应头配置（安全响应头）

## 为什么需要这一步

GitHub Pages 不支持自定义响应头，所以站点目前只下发了
`strict-transport-security`（那是 Cloudflare 加的），
`Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options`、
`Referrer-Policy` 一个都没有。

后果有两层：

1. 一旦出现 XSS，没有任何「方案 B」可以兜底 —— CSP 本来能在脚本执行前拦下它；
2. 后台页面可以被 iframe 嵌套套壳（点击劫持）。

Cloudflare 的 **Transform Rules → 修改响应头** 可以补上这一层，免费版有 10 条额度，
本站只需 1 条。

---

## 规则内容（两条规则）

> ⚠️ **为什么要两条**：后台页面位于 `www.flllme.xyz/admin/`，与博客**同一个主机名**，
> 所以按主机名匹配的规则**会连后台一起套上 CSP**。CSP 打在 Decap（React 应用）
> 身上风险不可预测，因此必须按**路径**把 `/admin` 排除掉。
>
> 实测确认过：只写 `(http.host eq "www.flllme.xyz")` 时，`/admin/index.html`
> 的响应里确实带上了 CSP。

### 规则 1：博客（4 个响应头）

**规则名称**：`博客安全响应头`

**匹配表达式** —— 排除 `/admin` 开头的路径：

```
(http.host eq "www.flllme.xyz" and not starts_with(http.request.uri.path, "/admin"))
```

**然后 → 修改响应头 → 设置静态**，添加下面 4 条：

| 响应头名称 | 值 |
| --- | --- |
| `Content-Security-Policy-Report-Only` | 见下方 CSP 字符串 |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### 规则 2：后台（3 个响应头，不含 CSP）

**规则名称**：`后台安全响应头`

**匹配表达式**：

```
(http.host eq "www.flllme.xyz" and starts_with(http.request.uri.path, "/admin"))
```

**然后 → 修改响应头 → 设置静态**，只加这三个（不要加 CSP）：

| 响应头名称 | 值 |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

后台加上 `X-Frame-Options: DENY` 是有实际意义的：没有它，攻击者可以把
`/admin/` 嵌进自己的页面做点击劫持（诱导你点到"保存"）。
`X-Frame-Options` 只限制"本页被别人嵌"，**不影响 Decap 自己在编辑器里创建的
预览 iframe**，所以对 Decap 无副作用。

> 先写 `-Report-Only` 版本。它**只报告、不拦截**，配错了零影响。
> 观察几天确认无误伤后，再把头名改成 `Content-Security-Policy`（值不变）。

### CSP 字符串（Report-Only 版，先上这条）

```
default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net 'sha256-a2F4FRh92HJH9yw9o8WsxwtwgraYT57/rRdZAmi2VSY='; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.flllme.xyz https://api.deepseek.com https://cdn.jsdelivr.net; manifest-src 'self'
```

### CSP 字符串（强制版，观察期结束后用）

头名改为 `Content-Security-Policy`，**值完全相同**。

---

## 每个源为什么在里面

| 指令 | 值 | 原因 |
| --- | --- | --- |
| `default-src` | `'self'` | 其余未列出的类型一律只允许同源 |
| `script-src` | `'self'` + `cdn.jsdelivr.net` + 哈希 | jsDelivr 提供 marked、highlight.js、Twikoo；哈希对应**主题预设**那段内联脚本 |
| `style-src` | `'self'` + `'unsafe-inline'` + `cdn.jsdelivr.net` | jsDelivr 提供代码高亮主题；**`'unsafe-inline'` 不可去掉**（见下） |
| `img-src` | `'self'` + `data:` + `https:` | favicon 是 data URI；友链头像域名不固定，只能放开 `https:` |
| `font-src` | `'self'` | 全站只用系统字体，没有 `@font-face` |
| `connect-src` | `'self'` + `api.flllme.xyz` + `api.deepseek.com` | 前者是 OAuth 代理与 AI 代理，后者是 AI 直连模式的官方接口 |
| `frame-ancestors` | `'none'` | 防套壳。**只能靠响应头生效**，写在 `<meta>` 里无效 |
| `object-src` / `base-uri` | `'none'` | 站点不使用 `<object>` / `<embed>`，也不使用 `<base>` |
| `form-action` | `'self'` | 防表单被劫持到外部地址 |

### 两点必须说明

**1. 没有 `'unsafe-eval'`。** 已确认全站 `js/` 与 HTML 里没有 `eval()`、
`new Function()`、`new Worker()`。所以不需要放开，CSP 的执行控制是完整的。

**2. `style-src` 的 `'unsafe-inline'` 去不掉。** 内置 Markdown 解析器渲染表格时
会输出 `style="text-align:center"`，`js/main.js` 与 `js/post.js` 也会生成内联
style 属性。不放开的话这些样式会被静默忽略，表格对齐会坏掉。
样式的注入风险远低于脚本，这是通行做法。

---

## ⚠️ 维护陷阱：改了内联脚本就要更新哈希

`script-src` 里那段 `'sha256-a2F4FRh92HJH9yw9o8WsxwtwgraYT57/rRdZAmi2VSY='`
对应的是 `index.html` 与 `post.html` **共用的**主题预设脚本
（在样式表加载前读 localStorage 决定明暗模式，避免闪白）。

哈希是内容敏感型的：**脚本改动一个空格，哈希就失效**，CSP 会拒绝执行它。
症状很隐蔽 —— 只是暗色模式下闪一下白，不容易联想到 CSP。

**改过那段脚本后，务必重新算哈希并更新 Cloudflare 规则：**

```bash
node tools/csp_hash.js
```

它会把当前所有内联脚本的哈希打出来，并给出可直接粘贴的 `script-src` 写法。

（在强制模式下此事才会导致脚本被拦；Report-Only 阶段只会打印违规报告。）

---

## 将来启用 Twikoo 评论时要补的源

`js/config.js` 的 `twikoo.envId` 目前是空的，评论未启用。启用后需要按实际部署补：

| 情况 | 要追加的指令 |
| --- | --- |
| Twikoo 自建域名（如 `https://twikoo.example.com`） | `connect-src` 加上该域名 |
| 启用图形验证码（hCaptcha / reCAPTCHA） | `frame-src` 与 `script-src` 加上验证码服务商的域名 |

Twikoo 本身从 jsDelivr 加载，已在 `script-src` 内，无需额外添加。

---

## 操作步骤

1. 打开 Cloudflare 控制台，选中域名 **`flllme.xyz`**
2. 左侧 **规则 / Rules** → **转换规则 / Transform Rules**
3. 切到 **响应头转换 / Response Header Transform** 标签页
   （⚠️ 不是「请求头转换」，那个作用于发往源站的请求，方向相反）
4. 点 **创建规则**，按上面「规则 1」填，部署
5. 再点 **创建规则**，按上面「规则 2」填，部署

在「当传入请求匹配时」这一步，可以用可视化构造器，也可以点「编辑表达式」
切到文本模式直接粘贴。**用构造器时注意字段要选对**——它的默认字段是
`URI 完整`（URI Full），而这里需要的是：

| 字段 | 运算符 | 值 |
| --- | --- | --- |
| `主机名` | 等于 | `www.flllme.xyz` |
| （点 And）`URI 路径` | 开头不是 | `/admin` |

构造出来的表达式应与上面「规则 1」完全一致，界面上会显示表达式预览，可对照检查。

### 验证

```bash
curl -s -D - -o /dev/null https://www.flllme.xyz/ | grep -iE "content-security|x-frame|x-content-type|referrer"
```

博客页应出现 4 条；再验证后台被排除：

```bash
curl -s -D - -o /dev/null https://www.flllme.xyz/admin/index.html | grep -iE "content-security|x-frame"
```

应只出现 `X-Frame-Options`，**没有** `Content-Security-Policy`。

### 观察期

Report-Only 阶段，用浏览器打开首页与一篇文章页，按 F12 看 Console。
如果出现 `[Report Only] Refused to ...` 的提示，说明还有未列出的源，
把提示里的来源补进对应指令即可。

确认 Console 干净后，把头名从 `Content-Security-Policy-Report-Only`
改成 `Content-Security-Policy` 完成收紧。

---

## 回滚

页面若有异常，编辑该规则：

- 最轻：把头名改回 `Content-Security-Policy-Report-Only`（立即恢复不拦截）
- 彻底：删除该规则

两种都是秒级生效、无需重新部署站点。

---

## 为什么后台不打 CSP

后台是 `www.flllme.xyz/admin/`，**与博客同主机名**，所以规则必须按路径排除它
（见上面的两条规则）。原因：`admin/index.html` 跑的是 Decap CMS（一个 React 应用），
它可能在运行时动态创建内联脚本、构建授权弹窗页面等。CSP 打在它身上风险不可预测，
而这一层的目的是给**博客**加纵深，没必要让后台承担不确定性。

后台保留另外三个头，其中 `X-Frame-Options: DENY` 能防点击劫持，是实打实的收益。

将来后台迁到 `admin.flllme.xyz` 之后，两条规则可以合并：按主机名区分即可，
博客主机上 CSP，admin 主机上不打。

---

## 实测记录（2026-10-16）

部署后从外部验证的结果，供以后回归时对照：

| 检查 | 结果 |
| --- | --- |
| CSP 头长度 | 415 字符（完整，未截断） |
| 指令名合法性 | 11 条指令全部合法 |
| `script-src` 是否含 `'unsafe-inline'` | 否 ✓ |
| `script-src` 是否含 `'unsafe-eval'` | 否 ✓ |
| `frame-ancestors` / `base-uri` / `object-src` | 均为 `'none'` ✓ |
| 覆盖路径 | `/`、`/index.html`、`/post.html`、`/css/*`、`/js/*`、`/posts/*.json` 全部带上 |
| **缓存资源的响应**（`cf-cache-status: HIT`） | **同样带上了头** —— Transform Rules 对命中缓存的响应同样生效 |
| `api.flllme.xyz` | 未受影响（0 个安全头）✓ |
| `/admin/index.html` | ⚠️ 也带上了 CSP —— 这正是需要按路径排除的原因 |

**一个重要的推论**：既然头部是随响应一起下发的，**将来把头名改成
`Content-Security-Policy` 后立即生效，不需要清 Cloudflare 缓存，也不需要重新部署站点**。
