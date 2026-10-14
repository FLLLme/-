/**
 * Cloudflare Worker —— DeepSeek API 共享代理
 * ============================================================================
 * 用途
 *   GitHub Pages 只能托管静态文件，无法运行 server.py，因此线上站点的 AI 助手
 *   只能回落到"访客自备密钥"的直连模式。部署本 Worker 后，密钥由 Worker 的环境
 *   变量持有，访客打开页面即可直接对话，无需任何配置。
 *
 * 部署步骤
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. 把本文件内容整体粘贴进编辑器，Deploy
 *   3. 进入 Settings → Variables and Secrets，添加：
 *        DEEPSEEK_API_KEY = sk-xxxxxxxx          （类型选 Secret）
 *        ALLOWED_ORIGIN   = https://www.flllme.xyz
 *      （ALLOWED_ORIGIN 不设置时默认 '*'，此时任何网站都能借用你的额度）
 *   4. 复制 Worker 地址，填入 js/config.js：
 *        ai: { proxyEndpoint: 'https://<你的>.workers.dev/api/chat' }
 *      健康检查地址会由 /api/chat 自动推导为 /api/health，无需额外配置。
 *
 * 说明
 *   · 响应体以流（ReadableStream）透传，逐字输出的体验与直连一致。
 *   · 单次请求最长约 100 秒（Cloudflare 免费版限制），足够覆盖常规问答。
 * ============================================================================
 */

const UPSTREAM = 'https://api.deepseek.com/chat/completions';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowOrigin = env.ALLOWED_ORIGIN || '*';

    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DeepSeek-Key',
      'Vary': 'Origin',
    };

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // 健康检查：前端据此判定是否启用代理模式
    if (url.pathname.endsWith('/health')) {
      return json({
        ok: true,
        service: 'blog-deepseek-proxy',
        keyConfigured: Boolean(env.DEEPSEEK_API_KEY),
        model: env.DEEPSEEK_MODEL || 'deepseek-chat',
      }, cors);
    }

    if (request.method !== 'POST') {
      return json({ error: { message: '仅支持 POST 请求' } }, cors, 405);
    }

    const apiKey = env.DEEPSEEK_API_KEY || request.headers.get('X-DeepSeek-Key') || '';
    if (!apiKey) {
      return json({
        error: { message: 'Worker 未配置 DEEPSEEK_API_KEY，请在环境变量中添加后重新部署。' },
      }, cors, 401);
    }

    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: await request.text(),
      });
    } catch (err) {
      return json({ error: { message: `无法连接上游接口：${err.message}` } }, cors, 502);
    }

    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/event-stream');
    headers.set('Cache-Control', 'no-cache, no-transform');

    // 原样透传状态码与响应体，保持 SSE 流式输出
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
