/* ==========================================================================
   md.js — Markdown 渲染引擎
   策略：优先使用 CDN 上的 marked；若其未加载成功（离线/CDN 被拦截），
        自动回退到内置的轻量解析器，保证任何环境下页面都能正常渲染。
   ========================================================================== */
(function () {
  'use strict';

  const esc = window.App.escapeHtml;

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
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_, alt, src, title) => `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy">`);

    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_, t, href, title) => `<a href="${href}"${title ? ` title="${title}"` : ''}>${t}</a>`);

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

  /** Markdown → HTML */
  function render(md) {
    const source = String(md || '');
    if (useMarked()) {
      try {
        const opts = { gfm: true, breaks: false, async: false };
        let html = null;
        // marked v5+：使用 marked.parse；更早版本：直接调用 marked()
        if (typeof window.marked.parse === 'function') {
          html = window.marked.parse(source, opts);
        } else if (typeof window.marked === 'function') {
          html = window.marked(source, opts);
        }
        if (typeof html === 'string' && html.trim()) return html;
      } catch (err) {
        console.warn('[md] marked 渲染失败，回退到内置解析器', err);
      }
    }
    return parseBlocks(source);
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
    m[1].split('\n').forEach(line => {
      const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!kv) return;
      const key = kv[1];
      let val = kv[2].trim();

      if (/^\[.*\]$/.test(val)) {
        // 行内数组：tags: [a, b]
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else if (/^['"].*['"]$/.test(val)) {
        val = val.slice(1, -1);
      } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(val)) {
        // 日期保持字符串，避免时区偏移
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        val = Number(val);
      }
      data[key] = val;
    });

    return { data, body: text.slice(m[0].length) };
  }

  window.MD = { render, enhance, parseFrontmatter, parseBlocks, inline };
})();
