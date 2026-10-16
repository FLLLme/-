#!/usr/bin/env node
/**
 * csp_hash.js — 计算页面内联脚本的 CSP 哈希
 *
 * 为什么需要它
 * ------------
 * 站点用 CSP 的 script-src 白名单，其中「内联脚本」不能用域名表示，
 * 只能用它的 SHA-256 哈希。哈希是内容敏感型的：**内联脚本改动一个空格，
 * 哈希就失效**，CSP 会拒绝执行该脚本。
 *
 * 本站内联脚本只有一处 —— 主题预设（在样式表加载前决定明暗模式，避免闪白）。
 * 改了它就必须重新算哈希并更新 Cloudflare 的响应头规则，否则**暗色模式会失效**，
 * 而且症状很隐蔽（只是闪一下白），不容易联想到 CSP。
 *
 * 用法
 * ----
 *     node tools/csp_hash.js
 *
 * 把输出里的 'sha256-...' 整段替换进响应头的 script-src 即可。
 * 详见 deploy/security-headers.md。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PAGES = ['index.html', 'post.html'];

/** 取出不带 src 的 <script> 内容（与浏览器对「内联脚本」的界定一致） */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

const sha256 = s => 'sha256-' + crypto.createHash('sha256').update(s, 'utf8').digest('base64');

console.log('内联脚本的 CSP 哈希\n');

const seen = new Map();   // 哈希 → 出现位置，用于提示"两页共用同一个脚本"

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) {
    console.log(`  ${page}：文件不存在，跳过`);
    continue;
  }
  const blocks = inlineScripts(fs.readFileSync(file, 'utf8'));
  if (!blocks.length) {
    console.log(`  ${page}：没有内联脚本`);
    continue;
  }
  console.log(`  ${page}：${blocks.length} 处`);
  blocks.forEach(code => {
    const hash = sha256(code);
    const at = seen.get(hash);
    if (at) {
      console.log(`    ${hash}   ← 与 ${at} 内容相同，只需在 CSP 里写一次`);
    } else {
      seen.set(hash, page);
      console.log(`    ${hash}   （${code.trim().slice(0, 40).replace(/\s+/g, ' ')}…）`);
    }
  });
}

if (seen.size) {
  console.log('\n填进 script-src 白名单的写法：');
  console.log("  script-src 'self' https://cdn.jsdelivr.net " +
    [...seen.keys()].map(h => `'${h}'`).join(' '));
}
