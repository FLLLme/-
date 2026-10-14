/* ==========================================================================
   post.js — 文章详情页
   职责：加载指定 Markdown → 渲染正文 → 生成目录 → 阅读进度 →
        上下篇导航 → 加载 Twikoo 评论 → 注入 AI 上下文
   ========================================================================== */
(function () {
  'use strict';

  const { $, escapeHtml, formatDate, ICONS, getQuery } = window.App;
  const CFG = window.BLOG_CONFIG;

  let post = null;
  let headings = [];

  document.addEventListener('DOMContentLoaded', async () => {
    window.App.initTheme();
    window.App.renderHeader('home');
    window.App.renderFooter();

    // 静态按钮图标
    $('#copyLinkBtn').innerHTML = ICONS.copy + '<span>复制链接</span>';
    $('#askAiBtn').innerHTML = ICONS.sparkles + '<span>用 AI 提问本文</span>';
    $('#commentsTitle').innerHTML = ICONS.comment + '<span>评论</span>';

    const slug = getQuery('id');
    const posts = await window.Store.load();

    if (window.Store.source === 'none') {
      window.App.showOfflineNotice($('#offlineBanner'));
      renderMissing('文章数据未能加载', '请通过内置服务器访问本站：在项目目录执行 python server.py。');
      return;
    }

    post = slug ? window.Store.get(slug) : null;
    if (!post) {
      renderMissing('找不到这篇文章', slug
        ? `标识为「${escapeHtml(slug)}」的文章不存在，可能已被重命名或移除。`
        : '请在地址栏提供文章标识，例如 post.html?id=hello-blog。');
      return;
    }

    renderArticle(post);
    bindActions(post);
    loadComments(post);
    window.AI.setContext(post);
  });

  /* ---------------- 正文渲染 ---------------- */
  function renderArticle(p) {
    document.title = `${p.title} · ${CFG.siteName}`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', p.excerpt);

    $('#backLink').innerHTML = ICONS.back + '<span>返回文章列表</span>';

    $('#articleMeta').innerHTML = [
      `<span>${escapeHtml(formatDate(p.date))}</span>`,
      p.updated && p.updated !== p.date
        ? `<span class="sep">·</span><span>更新于 ${escapeHtml(formatDate(p.updated))}</span>` : '',
      `<span class="sep">·</span><span>${p.readingTime} 分钟阅读</span>`,
      `<span class="sep">·</span><span>${p.words} 字</span>`
    ].join('');

    $('#articleTitle').textContent = p.title;
    $('#articleTags').innerHTML = p.tags
      .map(t => `<a class="tag" href="index.html?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`)
      .join('');

    const body = $('#articleBody');
    body.innerHTML = window.MD.render(p.body);
    headings = window.MD.enhance(body);

    $('#articleColumn').hidden = false;
    renderToc();
    bindScroll();
  }

  /* ---------------- 目录 ---------------- */
  function renderToc() {
    if (!headings.length) return;
    const box = $('#tocBox');
    const list = $('#tocList');

    list.replaceChildren(...headings.map(h => {
      const li = document.createElement('li');
      li.className = 'lvl-' + h.level;
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.text;
      a.dataset.target = h.id;
      a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.getElementById(h.id);
        if (target) {
          window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
          history.replaceState(null, '', '#' + h.id);
        }
      });
      li.appendChild(a);
      return li;
    }));

    box.hidden = false;
  }

  /* ---------------- 阅读进度 + 目录高亮 ---------------- */
  function bindScroll() {
    const bar = $('#readingProgress');
    const links = Array.from(document.querySelectorAll('#tocList a'));
    const nodes = headings
      .map(h => document.getElementById(h.id))
      .filter(Boolean);

    let ticking = false;

    const update = () => {
      ticking = false;

      // 进度条
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      bar.style.width = pct + '%';

      // 当前章节：最后一个顶部已越过 120px 的标题
      let current = nodes.length ? nodes[0].id : '';
      for (const n of nodes) {
        if (n.getBoundingClientRect().top <= 120) current = n.id;
        else break;
      }
      links.forEach(a => a.classList.toggle('active', a.dataset.target === current));
    };

    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------------- 交互按钮 ---------------- */
  function bindActions(p) {
    $('#copyLinkBtn').addEventListener('click', async function () {
      const btn = this;
      try {
        await navigator.clipboard.writeText(location.href);
        btn.querySelector('span').textContent = '已复制';
      } catch {
        btn.querySelector('span').textContent = '复制失败';
      }
      setTimeout(() => { btn.querySelector('span').textContent = '复制链接'; }, 1700);
    });

    $('#topBtn').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#askAiBtn').addEventListener('click', () => {
      window.AI.setContext(p);
      window.AI.open();
    });

    // 上下篇导航
    const { prev, next } = window.Store.neighbors(p.slug);
    const nav = $('#postNav');

    const cell = (item, kind) => {
      if (!item) return `<div class="placeholder"></div>`;
      const label = kind === 'prev' ? '上一篇' : '下一篇';
      return `<a class="${kind}" href="post.html?id=${encodeURIComponent(item.slug)}">
        <div class="label">${label}</div>
        <span class="title">${escapeHtml(item.title)}</span>
      </a>`;
    };

    nav.innerHTML = cell(prev, 'prev') + cell(next, 'next');
  }

  /* ---------------- Twikoo 评论 ---------------- */
  function loadComments(p) {
    const host = $('#tcomment');
    const { envId, version, lang } = CFG.twikoo;

    if (!envId) {
      host.outerHTML = `
        <div class="twikoo-tip">
          <strong>评论组件待接入。</strong>检测到 <code>js/config.js</code> 中的
          <code>twikoo.envId</code> 尚未填写，因此评论区处于占位状态。
          <ol>
            <li>参照 <a href="https://twikoo.js.org/" target="_blank" rel="noopener">Twikoo 官方文档</a>
                完成服务端部署（腾讯云 / Vercel / Docker 均可）。</li>
            <li>将部署后得到的访问地址填入 <code>js/config.js</code> 的
                <code>twikoo.envId</code> 字段。</li>
            <li>刷新页面即可看到评论区。文章标识使用 <code>${escapeHtml(p.slug)}</code>，请勿随意改动。</li>
          </ol>
        </div>`;
      return;
    }

    host.innerHTML = '<div class="twikoo-tip">评论组件加载中…</div>';

    loadScript(`https://cdn.jsdelivr.net/npm/twikoo@${version}/dist/twikoo.min.js`)
      .then(() => {
        host.innerHTML = '';
        return window.twikoo.init({
          envId,
          el: host,
          lang: lang || 'zh-CN',
          path: p.slug,                       // 评论归属标识，上线后不可变更
          onCommentLoaded: () => { /* 评论加载完成 */ }
        });
      })
      .catch(err => {
        console.error('[twikoo]', err);
        host.outerHTML = `
          <div class="twikoo-tip">
            评论组件加载失败：${escapeHtml(err.message || '未知错误')}。
            请检查网络是否可访问 jsDelivr CDN，或改用自建资源地址。
          </div>`;
      });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const exist = document.querySelector(`script[src="${src}"]`);
      if (exist) {
        exist.dataset.loaded === '1' ? resolve() : exist.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.addEventListener('load', () => { s.dataset.loaded = '1'; resolve(); }, { once: true });
      s.addEventListener('error', () => reject(new Error('脚本加载失败：' + src)), { once: true });
      document.head.appendChild(s);
    });
  }

  /* ---------------- 异常态 ---------------- */
  function renderMissing(title, detail) {
    document.title = '文章未找到 · ' + CFG.siteName;
    $('#articleColumn').hidden = false;
    $('#articleColumn').innerHTML = `
      <a class="back-link" href="index.html">${ICONS.back}<span>返回文章列表</span></a>
      <div class="empty-state" style="margin-top:34px;">
        <strong>${escapeHtml(title)}</strong>
        ${detail}
      </div>`;
    $('#tocBox').hidden = true;
    $('#tocAside').hidden = true;
    $('#postLayout').style.gridTemplateColumns = '1fr';
  }
})();
