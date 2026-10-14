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
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>'
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
    host.className = 'site-header';
    host.innerHTML = `
      <div class="container">
        <a class="brand" href="index.html">
          <span class="brand-mark">${escapeHtml(CFG.siteName.slice(0, 1))}</span>
          <span>${escapeHtml(CFG.siteName)}</span>
        </a>
        <nav class="nav">
          <a href="index.html"${active === 'home' ? ' class="active"' : ''}>文章</a>
          <a href="index.html#tags">标签</a>
          <a href="https://github.com" target="_blank" rel="noopener">关于</a>
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
        <div>
          © ${year} ${escapeHtml(CFG.author)} · ${escapeHtml(CFG.footerText)}
          ${CFG.icp ? `<br><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${escapeHtml(CFG.icp)}</a>` : ''}
        </div>
        <div class="footer-links">
          <a href="index.html">文章列表</a>
          <a href="index.html#tags">全部标签</a>
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

  /* ---------------- 页面间共享状态 ---------------- */
  window.App = {
    $, $$, escapeHtml, escapeAttr, stripMarkdown, readingTime,
    formatDate, formatDateShort, getQuery,
    ICONS, initTheme, setTheme, toggleTheme,
    renderHeader, renderFooter, showOfflineNotice
  };
})();
