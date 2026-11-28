/* list.js — 渲染「沙盒造物笔记」的文档目录
 *
 * 数据来自 posts/sandbox.json（由 tools/sync_extras.py 从 content/sandbox/*.json 汇总）。
 * 后台每条记录只有一个 HTML 文件路径，显示名在汇总时已从文件名推导好。
 *
 * 为什么脚本放在外部文件而不是内联：
 *   站点的 CSP 用 SHA-256 哈希放行内联脚本，把这段代码内联进 index.html 的话，
 *   每次改它都要重算哈希并同步 Cloudflare 规则 —— 一个极容易忘的维护点。
 *   放成同源外部文件走 script-src 'self' 即可，改多少次都不用碰 CSP。
 */
(function () {
  'use strict';

  var MANIFEST = '../posts/sandbox.json';

  var listEl = document.getElementById('notes');
  var stateEl = document.getElementById('state');
  var introEl = document.getElementById('intro');

  /** 只放行「站内绝对路径」与「安全相对路径」。
   *  清单是本仓库生成的，理论上已经过 sync_extras.py 的协议白名单；
   *  这里再兜一次，避免将来有人手工改 JSON 时把 javascript: 之类带进来。 */
  function safeHref(value) {
    var v = String(value || '').trim();
    if (!v) return '';
    if (/^[a-z][a-z0-9+.\-]*:/i.test(v)) return '';   // 任何带协议头的一律拒绝
    if (v.charAt(0) === '/' || v.indexOf('./') === 0 || v.indexOf('../') === 0) return v;
    return v.charAt(0) === '#' ? '' : v;
  }

  function showState(html) {
    stateEl.innerHTML = html;
    stateEl.hidden = false;
    listEl.hidden = true;
  }

  function render(items) {
    var frag = document.createDocumentFragment();
    var shown = 0;

    items.forEach(function (it) {
      var href = safeHref(it && it.file);
      if (!href) return;

      var title = String((it && it.title) || '').trim() || '未命名笔记';

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'note';
      a.href = href;

      var t = document.createElement('div');
      t.className = 't';
      t.textContent = title;                     // textContent：不解析任何标签

      var meta = document.createElement('div');
      meta.className = 'meta';

      var kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = 'HTML';

      var hint = document.createElement('span');
      hint.textContent = '点击阅读';

      var arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';

      meta.appendChild(kind);
      meta.appendChild(hint);
      meta.appendChild(arrow);
      a.appendChild(t);
      a.appendChild(meta);
      li.appendChild(a);
      frag.appendChild(li);
      shown++;
    });

    if (!shown) {
      showState('<b>还没有笔记</b>到后台「沙盒造物笔记」上传一个 HTML 文件，这里就会出现。');
      return;
    }

    listEl.replaceChildren(frag);
    listEl.hidden = false;
    stateEl.hidden = true;
    if (introEl) introEl.hidden = false;
  }

  fetch(MANIFEST, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      render(Array.isArray(data) ? data : []);
    })
    .catch(function (err) {
      // 本地用 file:// 直接打开时，fetch 会被浏览器拦掉，这条提示就是为那种情况准备的
      showState('<b>目录读取失败</b>' + err.message +
        '<br>本地预览请用服务器打开（例如 python server.py），不要直接双击 HTML。');
    });
})();
