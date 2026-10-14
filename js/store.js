/* ==========================================================================
   store.js — 数据层：加载并解析 Markdown 文章
   两条加载路径：
     1) HTTP 模式：fetch posts/manifest.json → 逐个 fetch posts/*.md（真实来源）
     2) 离线模式：fetch 失败时回退到 window.POST_BUNDLE（由 tools/bundle.py 生成）
   ========================================================================== */
(function () {
  'use strict';

  const CFG = window.BLOG_CONFIG;

  const Store = {
    posts: [],
    source: 'unknown',   // 'http' | 'bundle' | 'none'
    error: null,
    missing: [],         // manifest 中登记但读取失败的文件
    _promise: null,

    /** 加载全部文章（带缓存，重复调用返回同一 Promise） */
    load(force) {
      if (force) { this._promise = null; }
      if (this._promise) return this._promise;

      this._promise = (async () => {
        const raws = {};
        let files = null;

        try {
          const manifestText = await fetchText(CFG.manifest);
          const manifest = JSON.parse(manifestText);
          files = Array.isArray(manifest) ? manifest : (manifest.posts || []);
          if (!files.length) throw new Error('manifest.json 中没有任何文章');

          // 并行拉取全部文章。
          // 刻意使用 allSettled 而非 all：允许个别文件缺失（最常见的原因是删除了文章
          // 却忘记同步 manifest.json）。若用 all，单个 404 就会让整站静默退回离线数据包，
          // 表现为"删掉的文章还在、新写的文章不出现"，且没有任何报错。
          const results = await Promise.allSettled(
            files.map(f => fetchText(CFG.postsDir + f))
          );

          const missing = [];
          files.forEach((f, i) => {
            if (results[i].status === 'fulfilled') raws[f] = results[i].value;
            else missing.push(f);
          });

          if (!Object.keys(raws).length) {
            throw new Error('manifest.json 登记的文章全部无法读取');
          }

          if (missing.length) {
            this.missing = missing;
            console.warn(
              '[store] 以下文件在 manifest.json 中登记，但无法读取，已跳过：\n  ' +
              missing.join('\n  ') +
              '\n  → 如果这些文章已经被删除，请同步从 posts/manifest.json 中移除对应条目。'
            );
          }

          this.source = 'http';
        } catch (err) {
          const bundle = window.POST_BUNDLE;
          if (bundle && Object.keys(bundle).length) {
            console.warn('[store] HTTP 加载失败，回退到离线数据包：', err.message);
            this.source = 'bundle';
            files = Object.keys(bundle);
            files.forEach(f => { raws[f] = bundle[f]; });
          } else {
            this.source = 'none';
            this.error = err;
            console.error('[store] 文章加载失败：', err);
            return [];
          }
        }

        this.posts = files
          .map(f => buildPost(f, raws[f]))
          .filter(Boolean)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        return this.posts;
      })();

      return this._promise;
    },

    all() { return this.posts; },

    /** 按 slug 取文章（首次调用前请先 await load()） */
    get(slug) { return this.posts.find(p => p.slug === slug) || null; },

    /** 上一篇 / 下一篇（列表按日期倒序） */
    neighbors(slug) {
      const idx = this.posts.findIndex(p => p.slug === slug);
      if (idx < 0) return { prev: null, next: null };
      return {
        prev: this.posts[idx + 1] || null,   // 更早
        next: this.posts[idx - 1] || null    // 更新
      };
    },

    /** 标签及其出现次数，按热度倒序 */
    tags() {
      const map = new Map();
      this.posts.forEach(p => p.tags.forEach(t => map.set(t, (map.get(t) || 0) + 1)));
      return Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
    },

    totalWords() {
      return this.posts.reduce((sum, p) => sum + (p.words || 0), 0);
    },

    /** 关键词过滤：标题权重高于标签，高于正文 */
    search(list, keyword) {
      const kw = String(keyword || '').trim().toLowerCase();
      if (!kw) return list;
      return list.filter(p => {
        return p.title.toLowerCase().includes(kw)
          || p.tags.some(t => t.toLowerCase().includes(kw))
          || p.plainText.toLowerCase().includes(kw);
      });
    }
  };

  /* ---------------- 内部工具 ---------------- */

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.text();
  }

  function buildPost(file, raw) {
    if (typeof raw !== 'string') return null;
    const { data, body } = window.MD.parseFrontmatter(raw);
    const slug = String(file).replace(/\.md$/i, '');
    const plain = window.App.stripMarkdown(body);

    const tags = Array.isArray(data.tags)
      ? data.tags
      : (data.tags ? String(data.tags).split(/[,，]/).map(s => s.trim()).filter(Boolean) : []);

    return {
      slug,
      file,
      raw,
      body,
      title: data.title || slug,
      date: data.date || '',
      updated: data.updated || data.date || '',
      tags,
      excerpt: data.excerpt || (plain.slice(0, 110) + (plain.length > 110 ? '…' : '')),
      plainText: plain,
      words: plain.length,
      readingTime: window.App.readingTime(plain)
    };
  }

  window.Store = Store;
})();
