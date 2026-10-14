---
title: DeepSeek API 流式对话的前端实现
date: 2026-10-02
tags: [AI, 前端, API]
excerpt: 从 SSE 协议解析、打字机效果到密钥安全，完整拆解一个可用于生产环境的流式对话组件应该如何写。
---

## 结论先行

在前端实现 DeepSeek 流式对话，需要解决三个层次的问题，按重要性排序：

1. **密钥安全** —— 决定架构，必须在写第一行代码之前想清楚。
2. **CORS 跨域** —— 决定部署方式，浏览器直连能否成立取决于服务端响应头。
3. **SSE 流解析** —— 决定实现细节，属于纯工程问题，有标准解法。

很多人从第 3 点开始写代码，然后在第 1 点推倒重来。正确的顺序是反过来的。

## 一、密钥安全的三种架构

### 方案 A：浏览器直连（仅适合本地实验）

```js
const res = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`   // ⚠️ Key 暴露在浏览器
  },
  body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true })
});
```

只要页面是公开可访问的，任何人打开 DevTools 的 Network 面板就能拿到你的 Key。**这个方案不能上线。**

### 方案 B：服务端注入密钥（推荐）

前端请求自己的同源接口，密钥只存在于服务器环境变量中：

```js
const res = await fetch('/api/chat', {          // 同源，不存在 CORS 问题
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, stream: true })
});
```

服务端在转发时补上 `Authorization` 头。这正是本站 `server.py` 采用的方式。

### 方案 C：Serverless 边缘函数

Vercel Edge Function、Cloudflare Worker 都属于这一类，本质是方案 B，只是把代理层托管了出去。适合无法自己运维服务器的场景。

## 二、CORS：为什么直连有时会失败

CORS 的判定权在**服务端响应头**，不在浏览器。`api.deepseek.com` 的跨域策略可能随时间和网关配置调整，因此工程上不应假设直连一定可用。

判断方法很简单，在控制台执行：

```js
fetch('https://api.deepseek.com/models', {
  headers: { Authorization: 'Bearer sk-xxx' }
}).then(r => console.log('OK', r.status))
  .catch(e => console.error('被拦截', e));
```

另一个容易被忽略的坑：**预检请求（OPTIONS）不允许重定向**。如果页面用 `http://` 访问而接口强制跳 `https://`，预检会直接失败，且报错信息与普通的 CORS 拦截几乎一样，很难排查。

## 三、SSE 流式解析

DeepSeek 的 `stream: true` 返回标准 SSE 格式，每个事件形如：

```
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

关键的实现要点是**按块读取，按行切分，并处理跨块的半行**：

```js
async function* readStream(response) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();            // 最后一段可能是半行，留到下一轮

    for (const line of lines) {
      const text = line.trim();
      if (!text.startsWith('data:')) continue;

      const payload = text.slice(5).trim();
      if (payload === '[DONE]') return;

      try {
        const json  = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 极少数情况下会收到心跳或空块，忽略即可
      }
    }
  }
}
```

这里有三个细节值得强调：

- `decoder.decode(value, { stream: true })` 的 `stream` 参数必须为 `true`，否则多字节的 UTF-8 汉字会被拆坏。
- `buffer = lines.pop()` 是整套逻辑的核心。少了这一行，长回复必然出现 JSON 解析失败。
- 对 `JSON.parse` 做容错。网络的切块边界不受你控制。

## 四、消费流：打字机效果

拿到增量文本后，写入 DOM 的方式直接影响性能：

```js
let answer = '';
const node = document.createElement('div');
bubble.append(node);

for await (const delta of readStream(res)) {
  answer += delta;
  node.textContent = answer;      // 纯文本阶段直接赋值，开销最低
}
node.innerHTML = renderMarkdown(answer);   // 结束后一次性渲染 Markdown
```

**流式过程中用 `textContent`，结束后再整体渲染 Markdown**，这是兼顾性能与效果的最佳平衡。如果在每个增量块上都跑一遍 Markdown 解析和语法高亮，主线程会被彻底打满，长回复会明显卡顿。

## 五、上下文注入

博客里的 AI 助手如果不知道读者在看什么，价值会大打折扣。做法是把当前文章作为 system 上下文注入：

```js
const system = [
  cfg.ai.systemPrompt,
  `\n\n以下是读者正在阅读的文章，请优先基于它回答：\n`,
  `# ${post.title}\n${post.plainText.slice(0, 6000)}`
].join('');
```

两个注意事项：

- **截断长度**。整篇文章直接塞进上下文会显著增加费用与首字延迟，建议按字符数截断（本站取 6000 字）。
- **不要注入 HTML**。传纯文本，否则模型会把标签当成内容的一部分。

## 六、错误处理清单

生产环境至少需要覆盖这些情况：

| 情况 | 表现 | 处理方式 |
| --- | --- | --- |
| Key 无效 | HTTP 401 | 引导用户到设置面板重新填写 |
| 余额不足 | HTTP 402 | 明确提示，不要重试 |
| 频率限制 | HTTP 429 | 退避重试，提示稍后再试 |
| 网络中断 | 流被截断 | 保留已生成内容，提供"重新生成"按钮 |
| 用户主动停止 | `AbortError` | 静默处理，不弹错误 |

主动中止需要 `AbortController`：

```js
const controller = new AbortController();
fetch(url, { signal: controller.signal, /* ... */ });
// 用户点击停止
controller.abort();
```

## 小结

一个可靠的流式对话组件，本质上是三件事的组合：**把密钥放到服务端**、**把 SSE 解析写正确**、**把渲染时机安排在流结束之后**。剩下的都是样式问题。
