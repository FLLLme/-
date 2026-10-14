/* ==========================================================================
   app.js — 全局工具、主题、公共渲染
   ========================================================================== */
(function () {
  'use strict';

  const CFG = window.BLOG_CONFIG;

  /* ---------------- DOM 简写 ---------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- 字符串工具 ---------------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/\n/g, ' ');
  }

  /** 去掉 Markdown 标记，得到纯文本（用于摘要、阅读时长、AI 上下文） */
  function stripMarkdown(md) {
    return String(md || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`\n]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/^\s{0,3}\d+\.\s+/gm, '')
      .replace(/^\s*\|.*\|\s*$/gm, ' ')
      .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
      .replace(/[*_~]{1,3}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 估算阅读时长（分钟） */
  function readingTime(text) {
    const len = (text || '').length;
    return Math.max(1, Math.round(len / (CFG.charPerMinute || 380)));
  }

  /** 2026-09-24 → 2026年9月24日 */
  function formatDate(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return String(iso);
    return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return String(iso);
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }

  /** 取 URL 查询参数 */
  function getQuery(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  /* ---------------- 图标 ---------------- */

  /* 彼岸花站标
     参照实物照片的特征：细长的花瓣向上回卷，花蕊远长于花瓣并向外辐射，
     每根花蕊末端带一枚花药。因此全部用「细线笔触」而非填充色块绘制，
     小尺寸下靠「短花瓣 + 长花蕊」的强对比来辨认。
     形状模板：
       PETAL  —— 从花心向外，末端回卷成钩
       STAMEN —— 从花心直达外缘的长弧线，末端配一枚椭圆花药
     用循环按 360/N 均分角度并错开半格，避免手写大量路径。 */
  const FLOWER_SVG = (function () {
    const N = 5;
    const PETAL  = 'M16 16C14.1 13.2 13.7 10.2 15.5 8.3C16.5 7.5 17.4 7.9 17.5 8.9';
    const STAMEN = 'M16 16C14.9 11.2 14.7 6.6 16.4 2.9';
    const step = 360 / N;
    const parts = [];

    for (let i = 0; i < N; i++) {
      parts.push(
        `<g transform="rotate(${step * i} 16 16)">` +
          `<path d="${PETAL}" stroke-width="1.5"/>` +
        '</g>',
        `<g transform="rotate(${step * i + step / 2} 16 16)">` +
          `<path d="${STAMEN}" stroke-width="1.05"/>` +
          '<ellipse cx="16.5" cy="2.7" rx="0.78" ry="1.35" fill="currentColor" stroke="none"/>' +
        '</g>'
      );
    }

    return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" ' +
             'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
             parts.join('') +
             '<circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/>' +
           '</svg>';
  })();

  const ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    /* 站标：彼岸花，形状见上方 FLOWER_SVG */
    flower: FLOWER_SVG
  };

  /* ---------------- 主题 ---------------- */
  const THEME_KEY = 'blog.theme';

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
  }

  function setTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    // 代码高亮主题联动
    const light = document.getElementById('hljs-light');
    const dark  = document.getElementById('hljs-dark');
    if (light) light.disabled = theme === 'dark';
    if (dark)  dark.disabled  = theme !== 'dark';
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* 隐私模式忽略 */ }
    }
    const btn = $('#themeToggle');
    if (btn) {
      btn.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
      btn.setAttribute('aria-label', theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式');
    }
  }

  function initTheme() {
    const stored = getStoredTheme();
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(stored || (prefersDark ? 'dark' : 'light'), false);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
  }

  /* ---------------- 公共区块渲染 ---------------- */
  function renderHeader(active) {
    const host = $('#siteHeader');
    if (!host) return;

    /* 导航项按内容有无动态生成：
       「作品集」「友链」只在 config.js 里确实有数据时才出现，
       避免指向空区块的死链。active 传入的 key 会渲染成选中态（主色 + 下划线）。 */
    /* 顺序与页面区块的先后保持一致（作品集在文章之前），
       这样导航的视觉顺序与滚动高亮的判定顺序不会相互矛盾。 */
    const items = [
      { key: 'home',  label: '首页', href: 'index.html' },
      (CFG.works || []).length || CFG.workPlaceholders > 0
        ? { key: 'works',   label: '作品集', href: 'index.html#worksSection' } : null,
      { key: 'posts', label: '文章', href: 'index.html#latest' },
      (CFG.friends || []).length
        ? { key: 'friends', label: '友链',   href: 'index.html#friendsSection' } : null,
      { key: 'about', label: '关于', href: 'index.html#about' }
    ].filter(Boolean);

    host.className = 'site-header';
    host.innerHTML = `
      <div class="container">
        <a class="brand" href="index.html">
          <span class="brand-mark">${ICONS.flower}</span>
          <span class="brand-name">${escapeHtml(CFG.siteName)}</span>
        </a>
        <nav class="nav" aria-label="站点导航">
          ${items.map(it => `<a href="${it.href}"${active === it.key ? ' class="active" aria-current="page"' : ''}>${escapeHtml(it.label)}</a>`).join('')}
        </nav>
        <button class="icon-btn" id="themeToggle" type="button" aria-label="切换主题"></button>
      </div>`;

    const btn = $('#themeToggle');
    btn.addEventListener('click', toggleTheme);
    setTheme(document.documentElement.getAttribute('data-theme') || 'light', false);
  }

  function renderFooter() {
    const host = $('#siteFooter');
    if (!host) return;
    const year = new Date().getFullYear();
    host.className = 'site-footer';
    host.innerHTML = `
      <div class="container">
        <div class="footer-brand">
          <span class="brand-mark">${ICONS.flower}</span>
          <span>© ${year} ${escapeHtml(CFG.siteName)}</span>
        </div>
        <div class="footer-links">
          <a href="index.html">首页</a>
          <a href="index.html#latest">文章</a>
          <a href="index.html#about">关于</a>
          <a href="posts/manifest.json" target="_blank" rel="noopener">Markdown 源文件</a>
        </div>
      </div>`;
  }

  /** 离线提示条（file:// 协议下无法 fetch 本地文件时展示） */
  function showOfflineNotice(container) {
    if (!container) return;
    container.innerHTML = `
      <strong>检测到本地文件模式（file://），无法读取 Markdown 源文件。</strong>
      请通过内置服务器访问：在项目目录执行 <code>python server.py</code>，
      然后打开 <code>http://127.0.0.1:8080</code>。
      若已生成 <code>posts/bundle.js</code>，页面会自动回退到离线数据。`;
    container.classList.add('show');
  }

  /* ---------------- 导航选中态跟随滚动 ----------------
     首页 / 文章 / 作品集 / 关于 都是同一页内的锚点，
     因此需要根据当前滚动位置判断该高亮哪一项（主色文字 + 下划线），
     而不是固定挂在「首页」上。点击时也立即切换，避免等待滚动。
     仅在首页调用；详情页的选中态由 renderHeader('posts') 固定。 */
  function bindNavSpy() {
    const nav = $('#siteHeader .nav');
    if (!nav) return;

    const links = $$('a', nav);
    if (!links.length) return;

    /* 把每个导航项映射到页面上的区块：
       带 #hash 的取其元素；指向 index.html 本身（无 hash）的视为「页面顶部」 */
    const targets = links.map(link => {
      const href = link.getAttribute('href') || '';
      const hash = href.indexOf('#') > -1 ? href.split('#')[1] : '';
      const el = hash ? document.getElementById(hash) : null;
      const isTop = !hash && /index\.html$/.test(href.split('?')[0]);
      return { link, el, isTop };
    }).filter(t => t.el || t.isTop);

    if (!targets.length) return;

    /* ⚠️ 必须按「区块在页面上的先后」排序，不能沿用导航项的顺序。
       当前页面的实际顺序是：作品集 → 文章 → 关于，
       而导航里写的是：首页 / 文章 / 作品集 / 关于 —— 两者不一致，
       若按导航顺序遍历，滚动时会停在错误的区块上。 */
    const ordered = targets
      .filter(t => t.el)
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & 4 /* DOCUMENT_POSITION_FOLLOWING */
          ? -1 : 1);

    const setActive = target => links.forEach(a => a.classList.toggle('active', a === target.link));

    const update = () => {
      if (!ordered.length) return;

      /* 以视口 30% 处作为判定线：区块顶部越过它即视为「当前所在」 */
      const line = window.scrollY + window.innerHeight * 0.3;
      const firstTop = ordered[0].el.getBoundingClientRect().top + window.scrollY;

      if (line < firstTop) {
        /* 还没滚到第一个区块 → 首页 */
        const top = targets.find(t => t.isTop);
        if (top) setActive(top);
        return;
      }

      let current = ordered[0];
      for (const t of ordered) {
        if (t.el.getBoundingClientRect().top + window.scrollY <= line) current = t;
        else break;
      }
      setActive(current);
    };

    links.forEach(a => a.addEventListener('click', () => {
      const t = targets.find(x => x.link === a);
      if (t) setActive(t);
    }));

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; update(); });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------------- 页面间共享状态 ---------------- */
  window.App = {
    $, $$, escapeHtml, escapeAttr, stripMarkdown, readingTime,
    formatDate, formatDateShort, getQuery,
    ICONS, initTheme, setTheme, toggleTheme,
    renderHeader, renderFooter, showOfflineNotice, bindNavSpy
  };
})();
