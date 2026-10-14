/* ==========================================================================
   main.js — 文章列表页
   ========================================================================== */
(function () {
  'use strict';

  const { $, escapeHtml, formatDate, ICONS } = window.App;
  const CFG = window.BLOG_CONFIG;

  const state = {
    keyword: window.App.getQuery('q'),
    tag: window.App.getQuery('tag'),
    posts: []
  };

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    window.App.initTheme();
    window.App.renderHeader('home');
    window.App.renderFooter();
    document.title = `${CFG.siteName} · ${CFG.siteDesc}`;

    const searchInput = $('#searchInput');
    searchInput.value = state.keyword;
    searchInput.addEventListener('input', debounce(() => {
      state.keyword = searchInput.value;
      syncUrl();
      render();
    }, 160));

    const posts = await window.Store.load();

    if (window.Store.source === 'none') {
      window.App.showOfflineNotice($('#offlineBanner'));
      $('#postGrid').innerHTML =
        `<div class="empty-state"><strong>文章未能加载</strong>
         请确认 posts/ 目录下的 Markdown 文件与 manifest.json 均可访问。</div>`;
      return;
    }

    state.posts = posts;
    renderStats();
    renderTagFilter();
    render();
  });

  /* ---------------- 顶部统计 ---------------- */
  function renderStats() {
    const tags = window.Store.tags();
    const words = window.Store.totalWords();
    const minutes = window.Store.posts.reduce((s, p) => s + p.readingTime, 0);

    $('#heroStats').innerHTML = [
      { value: state.posts.length, label: '篇文章' },
      { value: tags.length, label: '个标签' },
      { value: formatCount(words), label: '字正文' },
      { value: minutes + ' 分钟', label: '总阅读时长' }
    ].map(s => `<div class="hero-stat"><b>${escapeHtml(String(s.value))}</b><span>${escapeHtml(s.label)}</span></div>`).join('');
  }

  function formatCount(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /* ---------------- 标签筛选 ---------------- */
  function renderTagFilter() {
    const host = $('#tagFilter');
    const tags = window.Store.tags();
    const items = [{ name: '', label: '全部' }]
      .concat(tags.map(t => ({ name: t.name, label: `${t.name} ${t.count}` })));

    host.replaceChildren(...items.map(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-chip' + (state.tag === t.name ? ' active' : '');
      btn.textContent = t.label;
      btn.dataset.tag = t.name;
      btn.addEventListener('click', () => {
        state.tag = t.name;
        syncUrl();
        renderTagFilter();
        render();
      });
      return btn;
    }));
  }

  /* ---------------- 列表渲染 ---------------- */
  function render() {
    const grid = $('#postGrid');
    const hint = $('#resultHint');

    let list = state.posts;
    if (state.tag) list = list.filter(p => p.tags.includes(state.tag));
    list = window.Store.search(list, state.keyword);

    const filters = [];
    if (state.tag) filters.push(`标签「${escapeHtml(state.tag)}」`);
    if (state.keyword) filters.push(`关键词「${escapeHtml(state.keyword)}」`);
    hint.innerHTML = filters.length
      ? `已筛选 ${list.length} / ${state.posts.length} 篇 · ${filters.join(' + ')}`
      : `共 ${state.posts.length} 篇文章`;

    if (!list.length) {
      grid.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<strong>没有匹配的文章</strong>试试更换关键词，或点击「全部」清除筛选条件。`;
      grid.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(p => frag.appendChild(createCard(p)));
    grid.replaceChildren(frag);
  }

  function createCard(post) {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML = `
      <div class="post-cover"></div>
      <div class="post-card-body">
        <div class="post-meta">
          <span>${escapeHtml(formatDate(post.date))}</span>
          <span class="sep">·</span>
          <span>${post.readingTime} 分钟阅读</span>
        </div>
        <h2><a href="post.html?id=${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h2>
        <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
        <div class="post-tags">
          ${post.tags.map(t => `<span class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>`;

    // 整卡可点击；点击标签则就地筛选
    card.addEventListener('click', e => {
      const tagEl = e.target.closest('.tag');
      if (tagEl) {
        e.preventDefault();
        state.tag = tagEl.dataset.tag;
        syncUrl();
        renderTagFilter();
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (e.target.closest('a')) return;
      location.href = `post.html?id=${encodeURIComponent(post.slug)}`;
    });

    return card;
  }

  /* ---------------- 工具 ---------------- */
  function syncUrl() {
    const params = new URLSearchParams();
    if (state.keyword) params.set('q', state.keyword);
    if (state.tag) params.set('tag', state.tag);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }
})();
