/* ==========================================================================
   ai.js — DeepSeek AI 问答助手
   - 自动探测接口模式：同源代理（推荐） / 浏览器直连
   - 流式输出（SSE），支持中止
   - 上下文注入：把当前文章作为 system 提示传给模型
   - 设置面板：API Key / 接口地址 / 模型 / 温度，持久化于 localStorage
   ========================================================================== */
(function () {
  'use strict';

  const CFG = window.BLOG_CONFIG;
  const { escapeHtml, ICONS } = window.App;

  /* ---------------- 会话状态 ---------------- */
  const S = {
    context: null,        // { slug, title, plainText }
    messages: [],         // [{role:'user'|'assistant', content}]
    streaming: false,
    controller: null,
    mode: 'unknown',      // 'proxy' | 'direct'
    proxyKeyAvailable: false,
    greeted: false
  };

  const defaults = () => ({
    apiKey: '',
    endpoint: CFG.ai.endpoint || '',
    model: CFG.ai.model || 'deepseek-chat',
    temperature: typeof CFG.ai.temperature === 'number' ? CFG.ai.temperature : 0.7
  });

  let settings = defaults();

  function loadSettings() {
    try {
      const raw = localStorage.getItem(CFG.ai.storageKey);
      if (raw) settings = Object.assign(defaults(), JSON.parse(raw));
    } catch { /* 忽略损坏的本地数据 */ }
  }

  function saveSettings() {
    try { localStorage.setItem(CFG.ai.storageKey, JSON.stringify(settings)); } catch { /* 忽略 */ }
  }

  /* ---------------- DOM 构建 ---------------- */
  let el = {};

  function buildUI() {
    const fab = document.createElement('button');
    fab.className = 'ai-fab';
    fab.id = 'aiFab';
    fab.type = 'button';
    fab.innerHTML = `${ICONS.sparkles}<span>问 AI</span><i class="ping"></i>`;
    fab.addEventListener('click', toggle);

    const drawer = document.createElement('section');
    drawer.className = 'ai-drawer';
    drawer.id = 'aiDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'AI 问答助手');
    drawer.innerHTML = `
      <div class="ai-head">
        <div class="ai-avatar">AI</div>
        <div class="ai-head-info">
          <b>AI 问答助手</b>
          <span id="aiModelLabel">DeepSeek</span>
        </div>
        <button class="icon-btn" id="aiSettingsBtn" type="button" title="设置" aria-label="设置">${ICONS.cog}</button>
        <button class="icon-btn" id="aiClearBtn" type="button" title="清空对话" aria-label="清空对话">${ICONS.trash}</button>
        <button class="icon-btn" id="aiCloseBtn" type="button" title="关闭" aria-label="关闭">${ICONS.close}</button>
      </div>

      <div class="ai-status" id="aiStatus">正在检测接口…</div>

      <div class="ai-messages" id="aiMessages"></div>
      <div class="ai-quick" id="aiQuick"></div>

      <div class="ai-input-wrap">
        <div class="ai-input-row">
          <textarea id="aiInput" rows="1" placeholder="就本文提问，Enter 发送 / Shift + Enter 换行"></textarea>
          <button class="ai-send" id="aiSend" type="button" title="发送" aria-label="发送">${ICONS.send}</button>
        </div>
        <div class="ai-foot-hint">
          <span>内容由 AI 生成，请自行核实</span>
          <span id="aiCounter"></span>
        </div>
      </div>

      <div class="ai-settings" id="aiSettings">
        <h4>AI 接口设置</h4>
        <p class="hint">
          推荐使用随项目提供的同源代理（<code>python server.py</code>），
          由服务端注入密钥，既规避浏览器 CORS 限制，也不会把 Key 暴露给访客。
          浏览器直连模式仅建议在本地实验时使用。
        </p>

        <div class="field">
          <label for="aiKey">DeepSeek API Key</label>
          <input type="password" id="aiKey" placeholder="sk-…" autocomplete="off">
          <div class="sub">仅在直连模式或服务端未配置密钥时使用。保存在本机 localStorage，不会上传到任何第三方。</div>
        </div>

        <div class="field">
          <label for="aiEndpoint">接口地址</label>
          <input type="text" id="aiEndpoint" placeholder="/api/chat">
          <div class="sub">留空自动选择：代理可用时用 <code>/api/chat</code>，否则直连官方接口。</div>
        </div>

        <div class="field">
          <label for="aiModel">模型</label>
          <select id="aiModel">
            <option value="deepseek-chat">deepseek-chat（通用对话，速度快）</option>
            <option value="deepseek-reasoner">deepseek-reasoner（深度推理，更慢）</option>
          </select>
        </div>

        <div class="field">
          <label for="aiTemp">温度：<span id="aiTempVal">0.7</span></label>
          <input type="range" id="aiTemp" min="0" max="1.5" step="0.1">
          <div class="sub">越低越稳定，越高越发散。技术问答建议 0.3 ~ 0.8。</div>
        </div>

        <div class="ai-settings-actions">
          <button class="btn btn-primary" id="aiSaveBtn" type="button">保存并关闭</button>
          <button class="btn" id="aiResetBtn" type="button">恢复默认</button>
        </div>
      </div>`;

    document.body.append(fab, drawer);

    el = {
      fab,
      drawer,
      status:    drawer.querySelector('#aiStatus'),
      messages:  drawer.querySelector('#aiMessages'),
      quick:     drawer.querySelector('#aiQuick'),
      input:     drawer.querySelector('#aiInput'),
      send:      drawer.querySelector('#aiSend'),
      counter:   drawer.querySelector('#aiCounter'),
      modelLabel:drawer.querySelector('#aiModelLabel'),
      settings:  drawer.querySelector('#aiSettings'),
      keyInput:  drawer.querySelector('#aiKey'),
      epInput:   drawer.querySelector('#aiEndpoint'),
      modelSel:  drawer.querySelector('#aiModel'),
      tempInput: drawer.querySelector('#aiTemp'),
      tempVal:   drawer.querySelector('#aiTempVal')
    };

    /* 事件绑定 */
    drawer.querySelector('#aiCloseBtn').addEventListener('click', close);
    drawer.querySelector('#aiSettingsBtn').addEventListener('click', () => openSettings(true));
    drawer.querySelector('#aiClearBtn').addEventListener('click', clearChat);
    el.send.addEventListener('click', () => S.streaming ? abort() : submit());

    el.input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    el.input.addEventListener('input', () => {
      el.input.style.height = 'auto';
      el.input.style.height = Math.min(el.input.scrollHeight, 130) + 'px';
    });

    el.tempInput.addEventListener('input', () => { el.tempVal.textContent = el.tempInput.value; });
    drawer.querySelector('#aiSaveBtn').addEventListener('click', () => {
      settings.apiKey = el.keyInput.value.trim();
      settings.endpoint = el.epInput.value.trim();
      settings.model = el.modelSel.value;
      settings.temperature = Number(el.tempInput.value);
      saveSettings();
      openSettings(false);
      renderStatus();
      renderQuick();
    });
    drawer.querySelector('#aiResetBtn').addEventListener('click', () => {
      settings = defaults();
      saveSettings();
      fillSettingsForm();
      openSettings(false);
      renderStatus();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.drawer.classList.contains('open')) close();
    });
  }

  function fillSettingsForm() {
    el.keyInput.value = settings.apiKey || '';
    el.epInput.value = settings.endpoint || '';
    el.modelSel.value = settings.model;
    el.tempInput.value = settings.temperature;
    el.tempVal.textContent = String(settings.temperature);
  }

  function openSettings(open) {
    if (open) fillSettingsForm();
    el.settings.classList.toggle('open', !!open);
  }

  /* ---------------- 开关 / 清空 ---------------- */
  function open() {
    el.drawer.classList.add('open');
    el.fab.style.display = 'none';
    if (!S.greeted) { greet(); S.greeted = true; }
    setTimeout(() => el.input.focus(), 120);
  }

  function close() {
    el.drawer.classList.remove('open');
    el.fab.style.display = '';
    openSettings(false);
  }

  function toggle() {
    el.drawer.classList.contains('open') ? close() : open();
  }

  function clearChat() {
    S.messages = [];
    el.messages.replaceChildren();
    S.greeted = false;
    greet();
    S.greeted = true;
  }

  function greet() {
    if (!el.messages) return;
    const text = S.context
      ? `已加载《${S.context.title}》作为上下文（约 ${S.context.plainText.length} 字）。你可以直接提问，也可以点击下方快捷问题开始。`
      : '你好，我是基于 DeepSeek 的问答助手。你可以问我关于本站文章的任何问题。';
    addBubble('assistant', text, true);
  }

  /* ---------------- 状态提示 ---------------- */
  function renderStatus() {
    if (!el.status) return;
    let cls = 'warn', text = '';

    if (S.mode === 'unknown') {
      text = '正在检测接口…';
    } else if (S.mode === 'proxy') {
      if (S.proxyKeyAvailable) {
        cls = 'ok';
        text = '代理模式 · 密钥由服务端提供';
      } else if (settings.apiKey) {
        cls = 'ok';
        text = '代理模式 · 使用本机保存的 Key';
      } else {
        text = '代理已连接，但未检测到服务端密钥，请在设置中填写 API Key';
      }
    } else {
      cls = settings.apiKey ? 'ok' : 'warn';
      text = settings.apiKey
        ? '直连模式 · 浏览器直接请求官方接口'
        : '直连模式 · 尚未配置 API Key（点击右上角 ⚙ 设置）';
    }

    el.status.className = 'ai-status ' + cls;
    el.status.innerHTML = `${escapeHtml(text)}<span class="tag">${escapeHtml(settings.model)}</span>`;
    el.modelLabel.textContent = S.mode === 'proxy' ? 'DeepSeek · 代理模式' : 'DeepSeek · 直连模式';
  }

  function renderQuick() {
    if (!el.quick) return;
    const items = S.context
      ? ['用三句话总结本文', '解释文中的核心概念', '文中的代码在做什么', '有哪些容易踩的坑']
      : ['这个博客是怎么实现的', 'DeepSeek 流式对话怎么写', '如何选择 Grid 与 Flexbox'];

    el.quick.replaceChildren(...items.map(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      b.addEventListener('click', () => { el.input.value = t; submit(); });
      return b;
    }));

    el.counter.textContent = S.context ? `上下文 ${S.context.plainText.length} 字` : '';
  }

  /* ---------------- 消息渲染 ---------------- */
  function addBubble(role, content, asMarkdown) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;

    const dot = document.createElement('div');
    dot.className = 'role-dot';
    dot.textContent = role === 'user' ? '我' : 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (asMarkdown) bubble.innerHTML = window.MD.render(content);
    else bubble.textContent = content;

    wrap.append(dot, bubble);
    el.messages.append(wrap);
    scrollToBottom();
    return bubble;
  }

  function scrollToBottom() {
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  /* ---------------- 发送 ---------------- */
  async function submit() {
    const text = el.input.value.trim();
    if (!text || S.streaming) return;

    const needKey = (S.mode === 'direct' && !settings.apiKey)
      || (S.mode === 'proxy' && !S.proxyKeyAvailable && !settings.apiKey);
    if (needKey) {
      openSettings(true);
      return;
    }

    el.input.value = '';
    el.input.style.height = 'auto';
    addBubble('user', text, false);
    S.messages.push({ role: 'user', content: text });

    const bubble = addBubble('assistant', '', false);
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    bubble.append(cursor);

    setStreaming(true);

    let answer = '';
    let reasoning = '';
    const controller = new AbortController();
    S.controller = controller;

    try {
      await streamChat(
        buildPayload(),
        (piece, kind) => {
          if (kind === 'reasoning') { reasoning += piece; return; }
          answer += piece;
          bubble.textContent = answer;
          bubble.append(cursor);
          scrollToBottom();
        },
        controller.signal
      );

      cursor.remove();
      if (!answer.trim()) {
        answer = '（未收到有效回复，请检查网络或稍后重试）';
      }
      bubble.innerHTML = window.MD.render(answer);
      window.MD.enhance(bubble);
      S.messages.push({ role: 'assistant', content: answer });

    } catch (err) {
      cursor.remove();
      if (err && err.name === 'AbortError') {
        if (answer.trim()) {
          bubble.innerHTML = window.MD.render(answer);
          window.MD.enhance(bubble);
          S.messages.push({ role: 'assistant', content: answer });
        } else {
          bubble.textContent = '（已停止生成）';
        }
      } else {
        bubble.textContent = '';
        const box = document.createElement('div');
        box.className = 'callout';
        box.style.cssText = 'margin:0;border-left-color:var(--danger);background:color-mix(in srgb, var(--danger) 8%, transparent);';
        box.textContent = describeError(err);
        bubble.appendChild(box);
        // 已生成的部分内容予以保留
        if (answer.trim()) {
          const rest = document.createElement('div');
          rest.style.marginTop = '8px';
          rest.innerHTML = window.MD.render(answer);
          bubble.appendChild(rest);
        }
        console.error('[ai]', err);
      }
    } finally {
      S.controller = null;
      setStreaming(false);
    }
  }

  function abort() {
    if (S.controller) S.controller.abort();
  }

  function setStreaming(on) {
    S.streaming = on;
    el.send.disabled = false;
    el.send.innerHTML = on ? ICONS.close : ICONS.send;
    el.send.title = on ? '停止生成' : '发送';
    el.input.placeholder = on
      ? '正在生成，按停止可中断…'
      : '就本文提问，Enter 发送 / Shift + Enter 换行';
  }

  /* ---------------- 请求组装 ---------------- */
  function buildPayload() {
    const system = [CFG.ai.systemPrompt];

    if (S.context) {
      system.push(
        `\n\n以下是读者正在阅读的文章，请优先基于它回答问题：\n`,
        `# ${S.context.title}\n\n`,
        S.context.plainText.slice(0, 6000)
      );
    }

    const history = S.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));

    return {
      model: settings.model,
      stream: true,
      temperature: settings.temperature,
      max_tokens: CFG.ai.maxTokens,
      messages: [{ role: 'system', content: system.join('') }, ...history]
    };
  }

  function resolveUrl() {
    if (settings.endpoint) return settings.endpoint;
    return S.mode === 'proxy' ? CFG.ai.proxyEndpoint : CFG.ai.directEndpoint;
  }

  /** 发起流式请求并按 SSE 协议解析增量 */
  async function streamChat(payload, onDelta, signal) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };

    if (S.mode === 'direct') {
      headers['Authorization'] = 'Bearer ' + settings.apiKey;
    } else if (settings.apiKey) {
      // 代理模式下允许用本机 Key 覆盖服务端密钥
      headers['X-DeepSeek-Key'] = settings.apiKey;
    }

    let res;
    try {
      res = await fetch(resolveUrl(), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error('NETWORK');
    }

    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = (j.error && j.error.message) || j.message || '';
      } catch {
        try { detail = (await res.text()).slice(0, 240); } catch { /* 忽略 */ }
      }
      const e = new Error(detail || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    if (!res.body) throw new Error('当前浏览器不支持流式读取，请更换现代浏览器。');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();   // 末段可能是半行，留待下一轮拼接

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const delta = json.choices && json.choices[0] && json.choices[0].delta;
          if (!delta) continue;
          if (delta.reasoning_content) onDelta(delta.reasoning_content, 'reasoning');
          if (delta.content) onDelta(delta.content, 'content');
        } catch { /* 心跳或空块，忽略 */ }
      }
    }
  }

  function describeError(err) {
    const msg = err && err.message ? err.message : '未知错误';
    if (msg === 'NETWORK') {
      return '无法连接到接口。若使用直连模式，通常是浏览器 CORS 限制所致；' +
             '请改用随项目提供的代理服务（在项目目录执行 python server.py）。';
    }
    switch (err && err.status) {
      case 400: return `请求参数有误（400）：${msg}`;
      case 401: return 'API Key 无效或已失效（401），请在设置中重新填写。';
      case 402: return '账户余额不足（402），请前往 DeepSeek 开放平台充值后重试。';
      case 403: return `请求被拒绝（403）：${msg}`;
      case 404: return `接口地址不存在（404）：${msg}。请检查设置中的接口地址。`;
      case 429: return '请求过于频繁（429），请稍候再试。';
      default:
        if (err && err.status >= 500) return `服务端错误（${err.status}），请稍后重试。`;
        return msg;
    }
  }

  /* ---------------- 模式探测 ---------------- */
  async function detectMode() {
    try {
      const res = await fetch(CFG.ai.healthEndpoint, { cache: 'no-store' });
      if (!res.ok) throw new Error('no proxy');
      const info = await res.json().catch(() => ({}));
      S.mode = 'proxy';
      S.proxyKeyAvailable = !!info.keyConfigured;
      if (info.model && !settings.endpoint) settings.model = settings.model || info.model;
    } catch {
      S.mode = 'direct';
    }
    renderStatus();
    renderQuick();
  }

  /* ---------------- 对外接口 ---------------- */
  window.AI = {
    /** 注入当前文章上下文 */
    setContext(post) {
      if (!post) {
        S.context = null;
        return;
      }
      S.context = { slug: post.slug, title: post.title, plainText: post.plainText };
      if (el.counter) renderQuick();
    },
    open, close, toggle,
    refreshStatus() { renderStatus(); }
  };

  /* ---------------- 初始化 ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    buildUI();
    renderStatus();
    detectMode();
  });
})();
