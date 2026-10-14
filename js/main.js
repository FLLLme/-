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
    /* 导航下划线跟随滚动位置（首页 / 文章 / 作品集 / 关于） */
    window.App.bindNavSpy();
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
    /* 不 await：作品集/朋友章与文章列表互不依赖，异步加载避免拖慢首屏 */
    renderExtras();
  });

  /* ---------------- 作品集 / 朋友章 ----------------
     数据来自 CMS 后台（content/works、content/friends），
     经 tools/sync_extras.py 汇总为 posts/works.json、posts/friends.json。

     作品集为空时保留设计稿里那片图片区域的位置，用等量空灰块占位；
     朋友章为空时整块隐藏。判断依据是**加载后的真实数据**，
     所以必须等 Store.loadExtras() 回来再决定，而不是在 HTML 里预先写死。 */
  async function renderExtras() {
    const { works, friends } = await window.Store.loadExtras();
    renderWorks(works);
    renderFriends(friends);
  }

  function renderWorks(list) {
    const section = $('#worksSection');
    const grid = $('#worksGrid');
    if (!section || !grid) return;

    const placeholders = Math.max(0, Number(CFG.workPlaceholders) || 0);
    if (!list.length && !placeholders) return;

    const nodes = list.length
      ? list.map(w => {
          const cell = document.createElement(w.href ? 'a' : 'div');
          cell.className = 'work';
          if (w.href) {
            cell.href = w.href;
            cell.target = '_blank';
            cell.rel = 'noopener';
          }

          const thumb = document.createElement('div');
          thumb.className = 'work-thumb';
          if (w.image) {
            const img = document.createElement('img');
            img.src = w.image;
            img.alt = w.title || '';
            img.loading = 'lazy';
            thumb.appendChild(img);
          }

          const name = document.createElement('span');
          name.className = 'work-title';
          name.textContent = w.title || '';

          cell.append(thumb, name);

          // 简介是可选字段，只有填了才出现
          if (w.summary) {
            const desc = document.createElement('span');
            desc.className = 'work-summary';
            desc.textContent = w.summary;
            cell.insertBefore(desc, name);
          }
          return cell;
        })
      : Array.from({ length: placeholders }, () => {
          const cell = document.createElement('div');
          cell.className = 'work work-placeholder';
          const thumb = document.createElement('div');
          thumb.className = 'work-thumb';
          thumb.setAttribute('aria-hidden', 'true');
          cell.appendChild(thumb);
          return cell;
        });

    grid.replaceChildren(...nodes);
    section.hidden = false;
  }

  function renderFriends(list) {
    const section = $('#friendsSection');
    const grid = $('#friendsGrid');
    if (!section || !grid || !list.length) return;

    grid.replaceChildren(...list.map(f => {
      const li = document.createElement('li');
      li.className = 'friend';

      const avatar = document.createElement('span');
      avatar.className = 'friend-avatar';
      if (f.avatar) {
        const img = document.createElement('img');
        img.src = f.avatar;
        img.alt = '';
        img.loading = 'lazy';
        avatar.appendChild(img);
      }

      const body = document.createElement('div');
      body.className = 'friend-body';

      const name = document.createElement(f.url ? 'a' : 'span');
      name.className = 'friend-name';
      name.textContent = f.name || f.title || '';
      if (f.url) { name.href = f.url; name.target = '_blank'; name.rel = 'noopener'; }

      const desc = document.createElement('span');
      desc.className = 'friend-desc';
      desc.textContent = f.desc || '';

      body.append(name, desc);
      li.append(avatar, body);
      return li;
    }));

    section.hidden = false;
  }

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
