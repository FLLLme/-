/* 自检脚本：在 Node 中加载 md.js 的内置解析器，检查各文章的渲染结果
   用法：node tools/selftest.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* 各文章期望渲染出的表格数量（用于确认表格解析未漏掉） */
const EXPECT_TABLES = {
  'hello-blog.md': 1,
  'deepseek-stream-api.md': 1,
  'markdown-writing.md': 0,   // 该文用代码块演示表格语法，本身不含真实表格
  'css-modern-layout.md': 1,
  'twikoo-deploy.md': 1
};

const ctx = { console, window: {}, document: {}, setTimeout, clearTimeout };
ctx.window.App = {
  escapeHtml: s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/md.js', 'utf8'), ctx);
const MD = ctx.window.MD;

const manifest = JSON.parse(fs.readFileSync(ROOT + '/posts/manifest.json', 'utf8'));
const files = manifest.posts || manifest;

let failures = 0;
for (const f of files) {
  const raw = fs.readFileSync(`${ROOT}/posts/${f}`, 'utf8');
  const { data, body } = MD.parseFrontmatter(raw);
  const html = MD.render(body);

  const count = (re) => (html.match(re) || []).length;
  const expectTable = EXPECT_TABLES[f];
  const checks = {
    'h2':        count(/<h2>/g) >= 2,
    'ul/ol':     count(/<(ul|ol)>/g) >= 1,
    'pre>code':  count(/<pre>/g) >= 1,
    'table':     expectTable === undefined || count(/<table>/g) === expectTable,
    'no-raw-md': !/^#{2,}\s/m.test(html) && !html.includes('|---'),
    'no-bad-html': !html.includes('&lt;p&gt;') && !html.includes('undefined'),
  };
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);

  console.log(
    `${f.padEnd(24)} title="${data.title}" date=${data.date} tags=[${data.tags}] ` +
    `h2=${count(/<h2>/g)} pre=${count(/<pre>/g)} table=${count(/<table>/g)} ` +
    `bytes=${html.length} ${bad.length ? '❌ ' + bad.join(',') : '✅'}`
  );
  if (bad.length) failures++;

  // 抽查标题与正文首段，确认中文未被破坏
  const firstPara = (html.match(/<p>([\s\S]{0,60})/) || [, ''])[1];
  console.log(`  ↳ 首段: ${firstPara.replace(/\s+/g, ' ')}…`);
}

console.log(failures ? `\n${failures} 个文件存在问题` : '\n全部检查通过');
process.exit(failures ? 1 : 0);
