/* ==========================================================================
   md.js — Markdown 渲染引擎
   策略：优先使用 CDN 上的 marked；若其未加载成功（离线/CDN 被拦截），
        自动回退到内置的轻量解析器，保证任何环境下页面都能正常渲染。

   安全：两条渲染路径的输出最终都会经过 sanitize() 消毒再交给 innerHTML。
        marked 与内置解析器都只负责「Markdown → HTML 字符串」，不是消毒库。
   ========================================================================== */
(function () {
  'use strict';

  const esc = window.App.escapeHtml;

  /* ======================================================================
     零、输出消毒（XSS 防护）
     ======================================================================

     为什么需要
     ----------
     marked 的定位是「Markdown → HTML 字符串」，官方明确说明它不做 XSS 消毒，
     默认放行正文里的原始 HTML。因此 <img src=x onerror=...> 会原样进入 DOM 并执行。
     内置兜底解析器虽然对文本做了转义，但对链接的 URL 协议没有白名单，
     [x](javascript:...) 会被原样输出。

     为什么不用 DOMPurify
     --------------------
     本站的既定原则是「降级优先」：任何 CDN 不可用时页面必须仍然可读、可控。
     引入外部消毒库会新增一个「CDN 挂了就失去防护」的单点，因此这里用内置实现。

     策略：定向清除，而不是全量白名单
     --------------------------------
     全量标签白名单很容易误伤合法内容（代码高亮产生的 span、表格对齐的 style、
     脚注的 id、任务列表的 input……），而本站内容由站主本人撰写，
     真正要堵的是「能让脚本执行」的那几条路径。因此这里精确清除：

       · 危险元素整棵子树移除（script / object / embed / base / form ...）
       · 所有 on* 事件属性移除          ← XSS 的主要载体
       · URL 类属性做协议白名单         ← javascript: / data: 等
       · srcdoc 移除                    ← iframe 内联 HTML 可执行脚本
       · style 中的 expression()/javascript: 清除

     副作用：无。合法正文的标签、类名、行内样式一律保留。
     ====================================================================== */

  /* 整棵子树直接移除的元素。
     注意 iframe 不在其中——视频嵌入等场景会用到，改为逐属性清洗。 */
  const DROP_TAGS = [
    'script', 'style', 'object', 'embed', 'base', 'meta', 'link',
    'title', 'noscript', 'template', 'form', 'frame', 'frameset',
    'applet', 'param', 'marquee'
  ];

  /* SVG 里能改写 href 的元素，可绕过链接协议检查：
     <a><animate attributeName="href" values="javascript:..."/></a> */
  const DROP_SVG_TAGS = ['animate', 'set', 'animateTransform', 'animateMotion', 'foreignObject'];

  /* 需要做协议检查的属性（含 SVG 的 xlink:href 与历史遗留属性） */
  const URL_ATTRS = [
    'href', 'xlink:href', 'src', 'poster', 'action', 'formaction',
    'background', 'dynsrc', 'lowsrc', 'data'
  ];

  /* iframe 上只保留这些属性。srcdoc 会把 HTML 直接注入子文档并执行脚本，必须去掉 */
  const IFRAME_ATTRS = new Set([
    'src', 'width', 'height', 'title', 'class', 'id', 'style',
    'frameborder', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'
  ]);

  /* 图片内联 data: 允许的 MIME。刻意不含 svg+xml——SVG 可携带脚本，
     放进 <iframe> 或 <object> 就能执行。 */
  const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif)[;,]/i;

  const SAFE_PROTOCOLS = /^(?:https?|mailto|tel|sms|ftp|ftps):/i;

  /**
   * 判断一个 URL 是否安全。
   * 无协议的相对路径、锚点、查询串一律放行（本站大量使用相对路径引用图片）。
   */
  function isSafeUrl(value, isImageSrc) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return false;

    /* 去掉控制字符与空白：`java\nscript:` 这类绕过写法会被拆散后识别出来 */
    const compact = v.replace(/[\u0000-\u0020\u007F\u00A0]+/g, '');
    const lower = compact.toLowerCase();

    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')
        || lower.startsWith('blob:') || lower.startsWith('filesystem:')) return false;

    if (lower.startsWith('data:')) return Boolean(isImageSrc) && SAFE_DATA_IMAGE.test(compact);

    /* 有协议头的，必须在白名单内 */
    if (/^[a-z][a-z0-9+.-]*:/i.test(compact)) return SAFE_PROTOCOLS.test(lower);

    /* 无协议：相对路径 / 锚点 / 查询串 */
    return true;
  }

  /** 清洗 style 里的表达式（老旧浏览器可借此执行脚本） */
  function sanitizeStyle(value) {
    return String(value)
      .replace(/expression\s*\(/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '');
  }

  /**
   * 把 <template> 的内容序列化成 HTML 字符串。
   *
   * 为什么不直接读 innerHTML：`template.content` 是 DocumentFragment，
   * 而 DocumentFragment **没有** innerHTML 属性（浏览器里同样没有）。
   * 也不能把它塞进一个游离的 <div> 再读 innerHTML —— 那样元素会带着
   * 攻击者给的 src 进入一个"活"的文档，可能触发一次不受控的资源请求。
   * 所以这里逐个子节点显式序列化：元素用 outerHTML，文本节点重新转义。
   */
  function serializeFragment(frag) {
    let out = '';
    Array.prototype.forEach.call(frag.childNodes, node => {
      switch (node.nodeType) {
        case 1:   // 元素
          out += node.outerHTML;
          break;
        case 3:   // 文本
          /* & < > " 都要转义回去。这既保证 innerHTML 重新解析时不走样，
             也让输出与 marked 的写法逐字节一致（marked 把双引号写成 &quot;），
             便于用「消毒前后文本完全相同」来验证没有改动渲染结果。 */
          out += node.data
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
          break;
        case 8:   // 注释
          out += '<!--' + node.data + '-->';
          break;
        default:
          break;
      }
    });
    return out;
  }

  /**
   * 对渲染结果消毒。
   * 用 <template> 承载：其内容处于惰性文档中，脚本不会执行、图片不会加载，
   * 因此解析过程本身不产生任何副作用。
   */
  function sanitize(html) {
    const source = String(html == null ? '' : html);

    /* 消毒依赖 DOM。浏览器里永远有 DOM，唯一会走到这里的是无 DOM 的 Node 环境
       （tools/selftest.js 之类）。此时**失败即封闭**：宁可把输出降级成纯文本，
       也不能返回未经消毒的 HTML。 */
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      if (window.console && console.error) {
        console.error('[md] 当前环境没有 DOM，无法消毒。为保证安全，输出已降级为纯文本。');
      }
      return esc(source);
    }

    const tpl = document.createElement('template');
    tpl.innerHTML = source;
    const root = tpl.content;

    /* 1) 危险元素整棵子树移除 */
    DROP_TAGS.forEach(tag => {
      root.querySelectorAll(tag).forEach(el => el.remove());
    });
    DROP_SVG_TAGS.forEach(tag => {
      root.querySelectorAll(tag).forEach(el => el.remove());
    });

    /* 2) 逐元素清洗属性 */
    root.querySelectorAll('*').forEach(el => {
      const tag = el.tagName.toLowerCase();

      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        /* 2.1 事件处理器：XSS 的主要载体，无条件移除 */
        if (name.startsWith('on')) { el.removeAttribute(attr.name); return; }

        /* 2.2 iframe 内联文档可执行脚本 */
        if (name === 'srcdoc') { el.removeAttribute(attr.name); return; }

        /* 2.3 iframe 只保留白名单属性 */
        if (tag === 'iframe' && !IFRAME_ATTRS.has(name)) { el.removeAttribute(attr.name); return; }

        /* 2.4 URL 类属性做协议检查 */
        if (URL_ATTRS.includes(name)) {
          if (!isSafeUrl(value, name === 'src')) el.removeAttribute(attr.name);
          return;
        }

        /* 2.5 行内样式去掉可执行表达式 */
        if (name === 'style') {
          const cleaned = sanitizeStyle(value);
          if (cleaned !== value) el.setAttribute(attr.name, cleaned);
        }
      });
    });

    return serializeFragment(root);
  }

  /* ======================================================================
     一、内置轻量 Markdown 解析器（兜底）
     ====================================================================== */

  /** 行内语法 */
  function inline(text) {
    let s = esc(text);
    const codes = [];

    // 行内代码先抽出，避免内部字符被后续规则误伤
    s = s.replace(/`([^`]+)`/g, (_, c) => {
      codes.push(c);
      return `\u0000${codes.length - 1}\u0000`;
    });

    // 图片 → 链接 → 强调 → 删除线
    // 图片：src 不安全时退化为 alt 文字（alt 已在前面的 esc() 中转义过）
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_, alt, src, title) => isSafeUrl(src, true)
        ? `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`
        : alt);

    // 链接：href 不安全时只保留链接文字，不生成可点击元素。
    // 这是 L-2 的源头修复——此前的输出会让 javascript: 直接穿透到 href。
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_, t, href, title) => isSafeUrl(href)
        ? `<a href="${href}"${title ? ` title="${title}"` : ''}>${t}</a>`
        : t);

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 裸链接自动识别（不会命中 href="..." 内部）
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

    // 还原行内代码
    s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[Number(n)]}</code>`);
    return s;
  }

  function splitRow(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map(t => t.trim());
  }

  /** 解析一组列表行（支持两级嵌套） */
  function buildList(raw, baseIndent) {
    const items = [];
    let cur = null;

    for (const line of raw) {
      if (line === '') { if (cur) cur.sub.push(''); continue; }
      const indent = line.match(/^\s*/)[0].length;
      const m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);

      if (m && indent <= baseIndent) {
        cur = { text: m[2], sub: [] };
        items.push(cur);
      } else if (cur) {
        cur.sub.push(line.slice(Math.min(indent, baseIndent + 2)));
      }
    }

    const ordered = /^\s*\d/.test(raw[0] || '');
    const body = items.map(it => {
      const inner = buildList(it.sub, 0);
      const extra = it.sub.some(l => l.trim())
        ? (inner ? inner.replace(/^<(ul|ol)>/, '\n<$1>') : `<p>${inline(it.sub.join(' '))}</p>`)
        : '';
      return `<li>${inline(it.text)}${extra}</li>`;
    }).join('');

    return ordered ? `<ol>${body}</ol>` : `<ul>${body}</ul>`;
  }

  function parseBlocks(src) {
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      /* --- 围栏代码块 --- */
      const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/);
      if (fence) {
        const mark = fence[1][0];
        const need = fence[1].length;
        const lang = fence[2] || '';
        const buf = [];
        i++;
        while (i < lines.length) {
          const closeRe = new RegExp('^\\s{0,3}' + (mark === '`' ? '`' : '~') + '{' + need + ',}\\s*$');
          if (closeRe.test(lines[i])) { i++; break; }
          buf.push(lines[i]);
          i++;
        }
        out.push(`<pre>${lang ? `<span class="code-lang">${esc(lang)}</span>` : ''}` +
          `<code${lang ? ` class="language-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }

      if (!line.trim()) { i++; continue; }

      /* --- 标题 --- */
      let m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (m) {
        out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
        i++;
        continue;
      }

      /* --- 分隔线 --- */
      if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) { out.push('<hr>'); i++; continue; }

      /* --- 引用块 --- */
      if (/^\s{0,3}>/.test(line)) {
        const buf = [];
        while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (buf.length && lines[i].trim()))) {
          buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
          i++;
        }
        out.push(`<blockquote>${parseBlocks(buf.join('\n'))}</blockquote>`);
        continue;
      }

      /* --- 表格 --- */
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
        const head = splitRow(line);
        const aligns = splitRow(lines[i + 1]).map(t => {
          if (/^:-+:$/.test(t)) return 'center';
          if (/^-+:$/.test(t)) return 'right';
          return 'left';
        });
        i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          body.push(splitRow(lines[i]));
          i++;
        }
        const style = idx => ` style="text-align:${aligns[idx] || 'left'}"`;
        out.push(
          '<table><thead><tr>' +
          head.map((h, idx) => `<th${style(idx)}>${inline(h)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map(r => '<tr>' + head.map((_, idx) => `<td${style(idx)}>${inline(r[idx] || '')}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>'
        );
        continue;
      }

      /* --- 列表 --- */
      if (/^\s{0,3}([-*+]|\d+[.)])\s+/.test(line)) {
        const baseIndent = line.match(/^\s*/)[0].length;
        const raw = [];
        while (i < lines.length) {
          const l = lines[i];
          if (!l.trim()) {
            if (lines[i + 1] && /^\s+\S/.test(lines[i + 1])) { raw.push(''); i++; continue; }
            break;
          }
          const ind = l.match(/^\s*/)[0].length;
          const isItem = /^\s*([-*+]|\d+[.)])\s+/.test(l);
          if (!isItem && ind <= baseIndent) break;
          if (ind < baseIndent) break;
          raw.push(l);
          i++;
        }
        out.push(buildList(raw, baseIndent));
        continue;
      }

      /* --- 段落 --- */
      const para = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s{0,3}(#{1,6})\s+/.test(lines[i]) &&
             !/^\s{0,3}(`{3,}|~{3,})/.test(lines[i]) &&
             !/^\s{0,3}>/.test(lines[i]) &&
             !/^\s{0,3}([-*+]|\d+[.)])\s+/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      if (para.length) out.push(`<p>${inline(para.join('\n'))}</p>`);
      else i++;
    }

    return out.join('\n');
  }

  /* ======================================================================
     二、对外接口
     ====================================================================== */

  function useMarked() {
    return !!(window.marked && typeof window.marked.parse === 'function');
  }

  /**
   * Markdown → 已消毒的 HTML
   *
   * 这是全站唯一的 Markdown 出口：post.js（文章正文）与 ai.js（AI 回答）
   * 都调用它。渲染结果在这里统一消毒，调用方可以安全地直接赋给 innerHTML。
   */
  function render(md) {
    const source = String(md || '');
    let html = null;

    if (useMarked()) {
      try {
        const opts = { gfm: true, breaks: false, async: false };
        // marked v5+：使用 marked.parse；更早版本：直接调用 marked()
        if (typeof window.marked.parse === 'function') {
          html = window.marked.parse(source, opts);
        } else if (typeof window.marked === 'function') {
          html = window.marked(source, opts);
        }
      } catch (err) {
        console.warn('[md] marked 渲染失败，回退到内置解析器', err);
        html = null;
      }
    }

    if (typeof html !== 'string' || !html.trim()) html = parseBlocks(source);
    return sanitize(html);
  }

  /** 生成稳定的标题 id（兼容中文） */
  function slugify(text, used) {
    let base = String(text).trim()
      .replace(/[\s]+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '')
      .toLowerCase() || 'section';
    let id = base, n = 2;
    while (used.has(id)) { id = `${base}-${n++}`; }
    used.add(id);
    return id;
  }

  /**
   * 渲染后处理：标题锚点、代码块增强、外链、图片懒加载
   * @returns {Array<{id:string,text:string,level:number}>} 目录数据
   */
  function enhance(root) {
    if (!root) return [];
    const used = new Set();
    const toc = [];

    // 标题 → id + 锚点
    root.querySelectorAll('h1, h2, h3, h4').forEach(h => {
      const text = h.textContent.trim();
      const id = slugify(text, used);
      h.id = id;
      if (h.tagName !== 'H1') {
        toc.push({ id, text, level: Number(h.tagName.slice(1)) });
      }
      const a = document.createElement('a');
      a.className = 'anchor';
      a.href = '#' + id;
      a.textContent = '#';
      a.setAttribute('aria-label', '锚点链接');
      h.appendChild(a);
    });

    // 代码块 → 语言标签 + 复制按钮 + 语法高亮
    root.querySelectorAll('pre > code').forEach(code => {
      const pre = code.parentElement;

      if (!pre.querySelector('.code-lang')) {
        const cls = Array.from(code.classList).find(c => c.startsWith('language-'));
        if (cls) {
          const span = document.createElement('span');
          span.className = 'code-lang';
          span.textContent = cls.slice(9);
          pre.appendChild(span);
        }
      }

      if (window.hljs && !code.dataset.highlighted) {
        try { window.hljs.highlightElement(code); } catch { /* 忽略高亮失败 */ }
      }

      if (!pre.querySelector('.copy-btn')) {
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.textContent = '复制';
        btn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(code.innerText);
            btn.textContent = '已复制';
          } catch {
            btn.textContent = '复制失败';
          }
          setTimeout(() => { btn.textContent = '复制'; }, 1600);
        });
        pre.appendChild(btn);
      }
    });

    // 外链新窗口打开
    root.querySelectorAll('a[href^="http"]').forEach(a => {
      if (a.host !== location.host) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
    });

    // 图片懒加载与失败兜底
    root.querySelectorAll('img').forEach(img => {
      img.loading = 'lazy';
      img.decoding = 'async';
    });

    return toc;
  }

  /** 从 Markdown 源中抽取 frontmatter 与正文 */
  function parseFrontmatter(raw) {
    const text = String(raw).replace(/^\uFEFF/, '');
    const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!m) return { data: {}, body: text };

    const data = {};
    let pendingKey = null;    // 正在收集块状列表的字段名
    let pendingItems = [];

    // 只有确实收到条目时才落盘，避免把 `excerpt:` 这种空值写成空数组
    const flushList = () => {
      if (pendingKey && pendingItems.length) data[pendingKey] = pendingItems;
      pendingKey = null;
      pendingItems = [];
    };

    m[1].split('\n').forEach(rawLine => {
      const line = rawLine.replace(/\s+$/, '');
      if (!line.trim()) return;

      // 块状列表项，例如：
      //   tags:
      //     - 前端
      // Decap CMS 的 list 组件就是这种写法，必须支持，否则标签会被静默丢弃。
      const item = line.match(/^\s*-\s+(.+)$/);
      if (item && pendingKey) {
        const v = item[1].trim().replace(/^['"]|['"]$/g, '');
        if (v) pendingItems.push(v);
        return;
      }

      const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!kv) return;

      flushList();                       // 遇到新字段，收束上一个列表
      const key = kv[1];
      const val = kv[2].trim();

      // 空值可能是一个块状列表的开头，挂起来观察后续行
      if (val === '') { pendingKey = key; return; }

      data[key] = coerceScalar(val);
    });

    flushList();

    return { data, body: text.slice(m[0].length) };
  }

  /** 把 frontmatter 里的标量字符串转换成合适的类型 */
  function coerceScalar(val) {
    // 行内数组：tags: [a, b]
    if (/^\[.*\]$/.test(val)) {
      return val.slice(1, -1).split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    // 带引号的字符串
    if (/^['"].*['"]$/.test(val)) return val.slice(1, -1);
    // 日期保持字符串，避免被解析成时间戳后发生时区偏移
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(val)) return val;
    // 数字
    if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
    return val;
  }

  window.MD = { render, enhance, parseFrontmatter, parseBlocks, inline, sanitize, isSafeUrl };
})();
